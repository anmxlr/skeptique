import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import "@nomicfoundation/hardhat-ethers";
import Ajv from "ajv";
import canonicalize from "canonicalize";
import type { ContractTransactionResponse } from "ethers";
import { ethers, network } from "hardhat";
import { z } from "zod";
import { recordedProbeCases } from "../../apps/critic/src/probe-fixtures";
import { createRoundAgent, FileRoundStateStore, type RoundAgentContract } from "../../apps/critic/src/round-agent";
import { suiteGamerSuite } from "../../apps/services/suite-gamer/src/index";
import { unitConvertSuite } from "../../apps/services/unit-convert/src/index";
import { type CaseResult, EvidenceSchema, suiteHash, type TestCase } from "../../packages/shared/src/index";

const artifactSchema = z.object({
  mode: z.literal("LOCAL_ONLY"),
  sponsorNetworkEvidence: z.literal(false),
  transactionIds: z.array(z.never()),
  judge: z.literal("local-fixture/unit-conversion-oracle"),
  services: z
    .array(
      z.object({
        serviceId: z.number().int().positive(),
        roundId: z.number().int().positive(),
        serviceName: z.enum(["unit-convert", "suite-gamer"]),
        specHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        reviews: z
          .array(
            z.object({
              critic: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
              suitePass: z.number().min(0).max(100),
              probePass: z.number().min(0).max(100),
              score: z.number().int().min(0).max(100),
              evidenceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
              rawEvidence: z.unknown(),
            }),
          )
          .length(3),
      }),
    )
    .length(2),
});

const ajv = new Ajv({ strict: false });

// This independent oracle only accepts the fixed local conversion fixture cases.
function expectedPass(testCase: TestCase, output: unknown): boolean {
  switch (testCase.expect.kind) {
    case "exact":
      return isDeepStrictEqual(output, testCase.expect.value);
    case "schema":
      return ajv.validate(testCase.expect.schema, output) === true;
    case "regex":
      return typeof output === "string" && new RegExp(testCase.expect.pattern).test(output);
    case "judge": {
      assert.equal(testCase.id, "kelvin-judge", "No independent oracle for this judge case");
      if (!output || typeof output !== "object") return false;
      const value = output as { result?: unknown; unit?: unknown };
      return typeof value.result === "number" && Math.abs(value.result) <= 1e-8 && value.unit === "C";
    }
  }
}

function independentRate(cases: TestCase[], results: CaseResult[]): number {
  assert.equal(results.length, cases.length, "Incomplete local test evidence");
  const maxWeight = Math.max(...cases.map((testCase) => testCase.weight));
  let passedWeight = 0;
  let totalWeight = 0;
  for (const [index, testCase] of cases.entries()) {
    const result = results[index]!;
    assert.equal(result.caseId, testCase.id);
    assert.equal(result.weight, testCase.weight);
    assert.equal(result.error, undefined, "Successful local flow must retain every response");
    assert(Object.hasOwn(result, "output"), "Raw service output is missing");
    const passed = expectedPass(testCase, result.output);
    assert.equal(result.passed, passed, `Reported result disagrees with raw output for ${testCase.id}`);
    const weight = testCase.weight / maxWeight;
    totalWeight += weight;
    if (passed) passedWeight += weight;
  }
  return (100 * passedWeight) / totalWeight;
}

async function main(): Promise<void> {
  assert.equal(network.name, "hardhat", "This validation script only runs on the in-process Hardhat network");
  assert.equal((await ethers.provider.getNetwork()).chainId, 31337n, "Expected the local Hardhat chain");
  const inputPath = process.env.DEV2_EVIDENCE_PATH;
  const outputPath = process.env.DEV2_SETTLEMENT_PATH;
  assert(inputPath, "DEV2_EVIDENCE_PATH is required");
  assert(outputPath, "DEV2_SETTLEMENT_PATH is required");
  const artifact = artifactSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  assert.equal(artifact.transactionIds.length, 0, "Local HTTP calls must not claim payment transactions");
  const signers = await ethers.getSigners();
  const critics = signers.slice(1, 4);
  assert.equal(critics.length, 3);
  const criticAddresses = await Promise.all(critics.map((critic) => critic.getAddress()));
  const expectedSuites = [unitConvertSuite, suiteGamerSuite];

  // Validate every hash, identity and score before sending any local transaction.
  const services = artifact.services.map((service, index) => {
    const suite = expectedSuites[index]!;
    assert.equal(service.serviceId, index + 1);
    assert.equal(service.roundId, index + 1);
    assert.equal(service.serviceName, suite.serviceName);
    assert.equal(service.specHash.toLowerCase(), suiteHash(suite));
    const reviews = service.reviews.map((review, criticIndex) => {
      const canonical = canonicalize(review.rawEvidence);
      assert.equal(typeof canonical, "string", "Raw evidence is not canonical JSON");
      const hash = `0x${createHash("sha256").update(canonical!).digest("hex")}`;
      assert.equal(review.evidenceHash.toLowerCase(), hash, "Evidence hash mismatch");
      const evidence = EvidenceSchema.parse(review.rawEvidence);
      assert.deepEqual(evidence, review.rawEvidence, "Raw evidence differs from its validated schema");
      assert.equal(
        review.critic.toLowerCase(),
        criticAddresses[criticIndex]!.toLowerCase(),
        "Review critic does not match local signer",
      );
      assert.equal(evidence.critic.toLowerCase(), review.critic.toLowerCase());
      assert.equal(evidence.roundId, service.roundId);
      assert.equal(evidence.claimedCost, "0");
      assert.equal(evidence.x402Txs.length, 0);
      assert.equal(evidence.model, artifact.judge);
      assert.deepEqual(
        evidence.probes.map((probe) => probe.case),
        recordedProbeCases,
      );
      const suitePass = independentRate(suite.cases, evidence.suite);
      const probePass = independentRate(recordedProbeCases, evidence.probes);
      const score = Math.round(0.4 * suitePass + 0.6 * probePass);
      assert.equal(review.suitePass, suitePass);
      assert.equal(review.probePass, probePass);
      assert.equal(review.score, score);
      assert.equal(evidence.score, score);
      assert.equal(score, index === 0 ? 100 : 40);
      return { ...review, evidence, score, evidenceHash: hash as `0x${string}` };
    });
    return { ...service, reviews };
  });

  const transactions: Array<{ label: string; hash: string; blockNumber: number; gasUsed: string }> = [];
  const recordReceipt = async (transaction: ContractTransactionResponse, label: string) => {
    const receipt = await transaction.wait();
    assert(receipt, "Missing local transaction receipt");
    assert.equal(receipt.status, 1, `${label} reverted`);
    transactions.push({
      label,
      hash: transaction.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
    return receipt;
  };
  const registry = await (await ethers.getContractFactory("MockCriticRegistry")).deploy();
  await registry.waitForDeployment();
  await recordReceipt(registry.deploymentTransaction()!, "deploy:mock-registry");
  const manager = await (await ethers.getContractFactory("RoundManager")).deploy(
    100,
    100,
    3,
    7,
    await registry.getAddress(),
    10,
    2000,
  );
  await manager.waitForDeployment();
  await recordReceipt(manager.deploymentTransaction()!, "deploy:round-manager");
  for (const address of criticAddresses)
    await recordReceipt(await registry.getFunction("setStake")(address, 5), `mock-stake:${address}`);

  const directory = await mkdtemp(join(tmpdir(), "skeptique-local-settlement-"));
  const rounds = [];
  try {
    const stores = critics.map(
      (_critic, index) => new FileRoundStateStore(join(directory, `critic-${index + 1}.json`)),
    );
    const adapters = critics.map((critic, criticIndex): RoundAgentContract => {
      const connected = manager.connect(critic);
      const submitted = new Map<string, { transaction: ContractTransactionResponse; label: string }>();
      return {
        async commit(roundId, commitment) {
          const transaction: ContractTransactionResponse = await connected.getFunction("commit")(roundId, commitment);
          submitted.set(transaction.hash, { transaction, label: `commit:${roundId}:${criticAddresses[criticIndex]}` });
          return transaction.hash as `0x${string}`;
        },
        async reveal(roundId, score, salt, evidenceHash, claimedCost) {
          const transaction: ContractTransactionResponse = await connected.getFunction("reveal")(
            roundId,
            score,
            salt,
            evidenceHash,
            claimedCost,
          );
          submitted.set(transaction.hash, { transaction, label: `reveal:${roundId}:${criticAddresses[criticIndex]}` });
          return transaction.hash as `0x${string}`;
        },
        async waitForReceipt(hash) {
          const entry = submitted.get(hash);
          assert(entry, "Unknown local round transaction");
          const receipt = await recordReceipt(entry.transaction, entry.label);
          return { status: receipt.status === 1 ? "success" : "reverted" };
        },
        isCommitted: async (roundId, address) => Boolean(await manager.getFunction("hasCommitted")(roundId, address)),
        isRevealed: async (roundId, address) => Boolean(await manager.getFunction("hasRevealed")(roundId, address)),
      };
    });
    const agents = critics.map((_critic, index) =>
      createRoundAgent({ critic: criticAddresses[index]!, contract: adapters[index]!, store: stores[index]! }),
    );

    for (const service of services) {
      assert.equal(Number(await manager.getFunction("nextRoundId")()), service.roundId);
      await recordReceipt(await manager.getFunction("openRound")(service.serviceId), `open:${service.roundId}`);
      const round = await manager.getFunction("getRound")(service.roundId);
      for (const [index, review] of service.reviews.entries()) {
        await agents[index]!.commit({
          roundId: service.roundId,
          score: review.score,
          evidenceHash: review.evidenceHash,
          claimedCost: "0",
        });
        assert.equal((await stores[index]!.get(service.roundId))?.evidenceHash, review.evidenceHash);
        assert.equal(await manager.getFunction("hasCommitted")(service.roundId, review.critic), true);
      }
      await network.provider.send("evm_setNextBlockTimestamp", [Number(round.commitEnd)]);
      await network.provider.send("evm_mine");
      for (const [index, review] of service.reviews.entries()) {
        // Recreate the store and agent to exercise recovery from the persisted reveal.
        const restoredStore = new FileRoundStateStore(join(directory, `critic-${index + 1}.json`));
        const restoredAgent = createRoundAgent({
          critic: criticAddresses[index]!,
          contract: adapters[index]!,
          store: restoredStore,
        });
        await restoredAgent.reveal(service.roundId);
        assert.equal(await restoredStore.get(service.roundId), undefined);
        assert.equal(await manager.getFunction("hasRevealed")(service.roundId, review.critic), true);
      }
      await network.provider.send("evm_setNextBlockTimestamp", [Number(round.revealEnd)]);
      await network.provider.send("evm_mine");
      const finalization = (await manager.getFunction("finalize")(service.roundId)) as ContractTransactionResponse;
      await recordReceipt(finalization, `finalize:${service.roundId}`);
      const finalized = await manager.getFunction("getRound")(service.roundId);
      // Every mock stake is 5, so the independent weighted median is the middle score.
      const expectedMedian = service.reviews.map((review) => review.score).sort((a, b) => a - b)[1]!;
      assert.equal(finalized.finalized, true);
      assert.equal(Number(finalized.nReveals), 3);
      assert.equal(Number(finalized.median), expectedMedian);
      assert.equal(expectedMedian, service.serviceId === 1 ? 100 : 40);
      for (const address of criticAddresses) {
        assert.equal(await manager.getFunction("isHonest")(service.roundId, address), true);
        assert.equal(await registry.getFunction("stakeOf")(address), 5n);
      }
      rounds.push({
        serviceId: service.serviceId,
        roundId: service.roundId,
        serviceName: service.serviceName,
        nReveals: 3,
        median: expectedMedian,
        finalizationTransactionHash: finalization.hash,
        reviews: service.reviews.map((review) => ({
          critic: review.critic,
          score: review.score,
          evidenceHash: review.evidenceHash,
        })),
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        mode: "LOCAL_ONLY",
        sponsorNetworkEvidence: false,
        network: network.name,
        chainId: "31337",
        mockStakeAccounting: true,
        stakeUnit: "mock counter, not HBAR",
        stakePerCritic: "5",
        registryAddress: await registry.getAddress(),
        roundManagerAddress: await manager.getAddress(),
        persistedRevealRecovery: true,
        rounds,
        localTransactions: transactions,
      },
      null,
      2,
    ),
  );
  console.log(
    `LOCAL ONLY: verified six HTTP review hashes and settled two 3-critic rounds (medians ${rounds.map((round) => round.median).join(", ")}).`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
