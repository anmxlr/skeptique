import { serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { createSepoliaScoreReader, readEnsScore } from "@skeptique/shared/ens";
import { type Address, createPublicClient, http, namehash, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createEnsTarget } from "./ens-target";
import { createScoreRelayer } from "./scores";

const required = [
  "SEPOLIA_RPC_URL",
  "SEPOLIA_RELAYER_PRIVATE_KEY",
  "ENS_PARENT_NAME",
  "ENS_SCORE_TEST_NAME",
  "HEDERA_RPC_URL",
  "HEDERA_ROUND_MANAGER_ADDRESS",
  "HEDERA_SERVICE_REGISTRY_ADDRESS",
  "ENS_SCORE_TEST_FROM_BLOCK",
  "ENS_SCORE_TEST_ROUND_ID",
];
describe.skipIf(required.some((key) => !process.env[key]))("live ENS scores", () => {
  it("score written to ENS from a real finalized Hedera event reads back on Sepolia", async () => {
    const source = createPublicClient({ transport: http(process.env.HEDERA_RPC_URL) });
    expect(await source.getChainId()).toBe(296);
    const logs = await source.getLogs({
      address: process.env.HEDERA_ROUND_MANAGER_ADDRESS as Address,
      event: parseAbi([
        "event RoundFinalized(uint256 indexed roundId, uint256 indexed serviceId, uint8 median, uint8 nReveals, bool isVoid)",
      ])[0],
      args: { roundId: BigInt(process.env.ENS_SCORE_TEST_ROUND_ID as string) },
      fromBlock: BigInt(process.env.ENS_SCORE_TEST_FROM_BLOCK as string),
      toBlock: "latest",
      strict: true,
    });
    expect(logs).toHaveLength(1);
    const event = logs[0];
    expect(event.args.isVoid).toBe(false);
    const name = process.env.ENS_SCORE_TEST_NAME as string;
    const parentName = process.env.ENS_PARENT_NAME as string;
    const service = await source.readContract({
      address: process.env.HEDERA_SERVICE_REGISTRY_ADDRESS as Address,
      abi: serviceRegistryAbi,
      functionName: "getService",
      args: [event.args.serviceId],
      blockNumber: event.blockNumber,
    });
    expect(service.ensNode.toLowerCase()).toBe(namehash(name).toLowerCase());
    const target = createEnsTarget({
      transport: http(process.env.SEPOLIA_RPC_URL),
      account: privateKeyToAccount(process.env.SEPOLIA_RELAYER_PRIVATE_KEY as `0x${string}`),
      parentName,
    }).target;
    const relayer = createScoreRelayer({ target, parentName });
    const finalized = {
      name,
      roundId: event.args.roundId.toString(),
      score: event.args.median,
      nReveals: event.args.nReveals,
      hederaTx: event.transactionHash,
    };
    const result = await relayer.finalize(finalized);
    expect(result.status).not.toBe("superseded");
    expect((await relayer.finalize(finalized)).status).toBe("unchanged");
    const snapshot = await readEnsScore(createSepoliaScoreReader(process.env.SEPOLIA_RPC_URL as string), {
      name,
      parentName,
    });
    expect(snapshot).toMatchObject({
      score: event.args.median,
      confidence: Math.min(1, event.args.nReveals / 5),
      round: finalized.roundId,
      hederaTx: event.transactionHash,
    });
  });
});
