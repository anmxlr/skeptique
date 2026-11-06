import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import "@nomicfoundation/hardhat-ethers";
import { ethers, network } from "hardhat";
import { createRoundAgent, FileRoundStateStore, type RoundAgentContract } from "../../apps/critic/src/round-agent";
import { commitmentHash, commitmentVector, EventSchemas } from "../../packages/shared/src/index";

async function reverted(operation: Promise<unknown>, reason: string) {
  try {
    await operation;
  } catch (error) {
    assert(String(error).includes(reason), `expected revert containing ${reason}, got ${String(error)}`);
    return;
  }
  assert.fail(`expected revert containing ${reason}`);
}

describe("RoundManager", () => {
  let manager: any;
  let signers: Awaited<ReturnType<typeof ethers.getSigners>>;
  let temporaryDirectory: string;
  let roundId: bigint;
  let criticRegistry: any;
  const salt = `0x${"11".repeat(32)}` as `0x${string}`;
  const evidenceHash = `0x${"22".repeat(32)}` as `0x${string}`;

  beforeEach(async () => {
    signers = await ethers.getSigners();
    criticRegistry = await (await ethers.getContractFactory("MockCriticRegistry")).deploy();
    await criticRegistry.waitForDeployment();
    for (const signer of signers.slice(1, 6)) await criticRegistry.setStake(await signer.getAddress(), 5);
    const factory = await ethers.getContractFactory("RoundManager");
    manager = await factory.deploy(10, 10, 1, 7, await criticRegistry.getAddress(), 10, 2000);
    await manager.waitForDeployment();
    temporaryDirectory = await mkdtemp(join(tmpdir(), "skeptique-round-"));
    roundId = await manager.nextRoundId();
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("matches the shared Solidity ABI commitment vector", async () => {
    assert.equal(commitmentHash(commitmentVector.input), commitmentVector.expected);
    const vectorCommit = await manager.commitmentFor(
      commitmentVector.input.score,
      commitmentVector.input.salt,
      commitmentVector.input.evidenceHash,
      commitmentVector.input.critic,
    );
    assert.equal(vectorCommit, commitmentVector.expected);
  });

  it("rejects service zero instead of creating an unusable open round", async () => {
    await reverted(manager.openRound(0), "InvalidService");
    assert.equal(await manager.nextRoundId(), roundId);
  });

  it("opens, commits, reveals and finalizes a round with validated events", async () => {
    const opened = await manager.openRound(1);
    const openReceipt = await opened.wait();
    const openEvent = openReceipt!.logs
      .map((log: any) => {
        try {
          return manager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event: any) => event?.name === "RoundOpened");
    assert(openEvent);
    assert.equal(openEvent.args.roundId, roundId);
    EventSchemas.RoundOpened.parse({
      roundId: Number(openEvent.args.roundId),
      serviceId: Number(openEvent.args.serviceId),
      commitEnd: Number(openEvent.args.commitEnd),
      revealEnd: Number(openEvent.args.revealEnd),
    });

    const critic = signers[1]!;
    const commitment = commitmentHash({ score: 73, salt, evidenceHash, critic: await critic.getAddress() });
    const commitReceipt = await (await manager.connect(critic).commit(roundId, commitment)).wait();
    const committedEvent = commitReceipt!.logs
      .map((log: any) => {
        try {
          return manager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event: any) => event?.name === "CriticCommitted");
    assert(committedEvent);
    EventSchemas.CriticCommitted.parse({
      roundId: Number(committedEvent.args.roundId),
      critic: committedEvent.args.critic,
    });
    await reverted(manager.connect(critic).commit(roundId, commitment), "AlreadyCommitted");
    await reverted(manager.connect(critic).reveal(roundId, 73, salt, evidenceHash, 0), "CommitPhaseActive");

    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await reverted(
      manager.connect(critic).reveal(roundId, 73, `0x${"33".repeat(32)}`, evidenceHash, 0),
      "CommitmentMismatch",
    );
    const revealReceipt = await (await manager.connect(critic).reveal(roundId, 73, salt, evidenceHash, 0)).wait();
    const revealedEvent = revealReceipt!.logs
      .map((log: any) => {
        try {
          return manager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event: any) => event?.name === "CriticRevealed");
    assert(revealedEvent);
    EventSchemas.CriticRevealed.parse({
      roundId: Number(revealedEvent.args.roundId),
      critic: revealedEvent.args.critic,
      score: Number(revealedEvent.args.score),
      evidenceHash: revealedEvent.args.evidenceHash,
    });
    await reverted(manager.finalize(roundId), "RevealPhaseActive");
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    const finalized = await manager.finalize(roundId);
    const receipt = await finalized.wait();
    const event = receipt!.logs
      .map((log: any) => {
        try {
          return manager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "RoundFinalized");
    assert(event);
    assert.equal(event.args.median, 73n);
    EventSchemas.RoundFinalized.parse({
      roundId: Number(event.args.roundId),
      serviceId: Number(event.args.serviceId),
      median: Number(event.args.median),
      nReveals: Number(event.args.nReveals),
      void: event.args.isVoid,
    });
  });

  it("rejects wrong salts, double commits, early finalization, and late reveals", async () => {
    await manager.openRound(1);
    const critic = signers[1]!;
    await manager
      .connect(critic)
      .commit(roundId, commitmentHash({ score: 73, salt, evidenceHash, critic: await critic.getAddress() }));
    await reverted(manager.finalize(roundId), "RevealPhaseActive");
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await reverted(
      manager.connect(critic).reveal(roundId, 73, `0x${"33".repeat(32)}`, evidenceHash, 0),
      "CommitmentMismatch",
    );
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await reverted(manager.connect(critic).reveal(roundId, 73, salt, evidenceHash, 0), "RevealWindowClosed");
  });

  it("recovers a committed critic after a process restart", async () => {
    await manager.openRound(1);
    const critic = signers[2]!;
    const client: RoundAgentContract = {
      commit: async (id, hash) => (await manager.connect(critic).commit(id, hash)).hash,
      reveal: async (id, score, revealSalt, hash, cost) =>
        (await manager.connect(critic).reveal(id, score, revealSalt, hash, cost)).hash,
      waitForReceipt: async (hash) => {
        const receipt = await (await ethers.provider.getTransaction(hash))?.wait();
        return { status: receipt?.status === 1 ? "success" : "reverted" };
      },
      isCommitted: async (id, address) => manager.hasCommitted(id, address),
      isRevealed: async (id, address) => manager.hasRevealed(id, address),
    };
    const path = join(temporaryDirectory, "critic-state.json");
    const firstProcess = createRoundAgent({
      critic: await critic.getAddress(),
      contract: client,
      store: new FileRoundStateStore(path),
      saltFactory: () => salt,
    });
    await firstProcess.commit({ roundId: Number(roundId), score: 82, evidenceHash, claimedCost: "0" });
    const restartedProcess = createRoundAgent({
      critic: await critic.getAddress(),
      contract: client,
      store: new FileRoundStateStore(path),
      saltFactory: () => {
        throw new Error("must reuse persisted salt");
      },
    });
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await restartedProcess.reveal(Number(roundId));
    assert.equal(await manager.hasRevealed(roundId, await critic.getAddress()), true);
  });
  it("opens round 1 when a service is listed, and only reopens after it finalises", async () => {
    const registry = await (await ethers.getContractFactory("ServiceRegistry")).deploy(100);
    await registry.waitForDeployment();
    await registry.setRoundManager(await manager.getAddress());
    await manager.setServiceRegistry(await registry.getAddress());
    const specHash = `0x${"aa".repeat(32)}`;
    await registry.listService(specHash, "http://svc.test/call", 1, `0x${"00".repeat(32)}`, { value: 100 });
    const round = await manager.getRound(roundId);
    assert.equal(round.serviceId, 1n);
    await reverted(manager.openRound(1), "RoundAlreadyOpen");
    await reverted(manager.openRound(2), "InvalidService");
    await reverted(registry.setRoundManager(await manager.getAddress()), "AlreadySet");

    const critic = signers[1]!;
    await manager
      .connect(critic)
      .commit(roundId, commitmentHash({ score: 60, salt, evidenceHash, critic: await critic.getAddress() }));
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await manager.connect(critic).reveal(roundId, 60, salt, evidenceHash, 0);
    await network.provider.send("evm_increaseTime", [11]);
    await network.provider.send("evm_mine");
    await manager.finalize(roundId);
    assert.equal((await manager.getRound(roundId)).median, 60n);
    await manager.openRound(1);
    assert.equal(await manager.nextRoundId(), roundId + 2n);
  });
});
