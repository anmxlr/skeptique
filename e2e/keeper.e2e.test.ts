import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createKeeper } from "../apps/relayer/src/keeper";
import { demoServices } from "../apps/services/catalog";
import { roundManagerAbi } from "../packages/shared/abi/RoundManager";
import { commitmentHash } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http, zeroHash } = contractsRequire("viem") as typeof import("viem");
// Hardhat's well-known dev account #9 is the attestor deployLocal trusts. Test fixture only.
const ATTESTOR = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

describe("keeper", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ round: { K_MIN: 3 } });
  }, 60_000);
  afterAll(async () => {
    await stack?.stop();
  });

  it("keeper finalises rounds past their window once, opens one at a time and reviews every service", async () => {
    const transport = http(stack.rpcUrl);
    const client = createPublicClient({ transport });
    const wallet = createWalletClient({ transport });
    const accounts = await wallet.getAddresses();
    const critics = accounts.slice(1, 4);
    const names = demoServices.map((service) => service.name);
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller: accounts[6]!,
      origins: Object.fromEntries(names.map((name) => [name, "http://127.0.0.1:1"])),
    });
    for (const [index, critic] of critics.entries())
      await registerDemoCritic({
        rpcUrl: stack.rpcUrl,
        registry: stack.contracts.CriticRegistry,
        critic,
        nullifier: `0x${(index + 1).toString(16).padStart(64, "0")}`,
        attestorKey: ATTESTOR,
      });

    const lines: string[] = [];
    const keeper = createKeeper({
      client: client as never,
      wallet: createWalletClient({ account: accounts[0]!, transport }) as never,
      roundManager: stack.contracts.RoundManager as `0x${string}`,
      serviceRegistry: stack.contracts.ServiceRegistry as `0x${string}`,
      criticRegistry: stack.contracts.CriticRegistry as `0x${string}`,
      log: (line) => lines.push(line),
    });

    const read = (functionName: "getRound" | "nextRoundId", args: readonly unknown[] = []) =>
      client.readContract({
        address: stack.contracts.RoundManager as `0x${string}`,
        abi: roundManagerAbi,
        functionName,
        args: args as never,
      }) as Promise<never>;
    const rounds = async () => {
      const next = (await read("nextRoundId")) as bigint;
      const all = [];
      for (let id = 1n; id < next; id++) all.push({ id, ...((await read("getRound", [id])) as unknown as RoundTuple) });
      return all;
    };
    const warpTo = async (timestamp: bigint) => {
      await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(timestamp)] as never });
      await client.request({ method: "evm_mine" as never });
    };
    const write = async (functionName: "commit" | "reveal", args: readonly unknown[], account: `0x${string}`) => {
      const hash = await wallet.writeContract({
        address: stack.contracts.RoundManager as `0x${string}`,
        abi: roundManagerAbi,
        functionName,
        args: args as never,
        account,
        chain: null,
      });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success");
    };
    const finalizedEvents = async () =>
      (
        await client.getContractEvents({
          address: stack.contracts.RoundManager as `0x${string}`,
          abi: roundManagerAbi,
          eventName: "RoundFinalized",
          fromBlock: 0n,
        })
      ).map((event) => event.args as { roundId: bigint; serviceId: bigint; isVoid: boolean });

    // Listing opened round 1..5 (one per service). Nobody commits, so all five are due once the window ends.
    const initial = await rounds();
    expect(initial).toHaveLength(5);
    await warpTo(initial.reduce((latest, round) => (round.revealEnd > latest ? round.revealEnd : latest), 0n));

    await keeper.tick();
    let events = await finalizedEvents();
    expect(events.map((event) => event.roundId).sort()).toEqual([1n, 2n, 3n, 4n, 5n]);
    expect(events.every((event) => event.isVoid)).toBe(true);
    // Five services have bounty and no open round, but 3 critics at K_MIN 3 fill only one round.
    let all = await rounds();
    expect(all.filter((round) => !round.finalized)).toHaveLength(1);

    // A second pass finalises nothing twice and opens nothing more.
    await keeper.tick();
    expect(await finalizedEvents()).toHaveLength(5);
    expect((await rounds()).filter((round) => !round.finalized)).toHaveLength(1);

    // Void round with committers who never reveal: the keeper finalises it and moves on to the next service.
    const salt = (index: number, round: bigint) =>
      `0x${(Number(round) * 10 + index + 1).toString(16).padStart(64, "0")}` as const;
    const open = all.find((round) => !round.finalized)!;
    for (const [index, critic] of critics.entries())
      await write(
        "commit",
        [open.id, commitmentHash({ score: 50, salt: salt(index, open.id), evidenceHash: zeroHash, critic })],
        critic,
      );
    await warpTo(open.revealEnd);
    await keeper.tick();
    events = await finalizedEvents();
    expect(events.filter((event) => event.roundId === open.id)).toEqual([
      expect.objectContaining({ isVoid: true, serviceId: open.serviceId }),
    ]);
    expect((await rounds()).filter((round) => !round.finalized)).toHaveLength(1);

    // Critics now review each round the keeper opens. Never more than one is open; every service gets a valid score.
    const reviewed = new Set<bigint>();
    for (let guard = 0; guard < 12 && reviewed.size < 5; guard++) {
      all = await rounds();
      const unfinished = all.filter((round) => !round.finalized);
      expect(unfinished).toHaveLength(1);
      const round = unfinished[0]!;
      for (const [index, critic] of critics.entries())
        await write(
          "commit",
          [round.id, commitmentHash({ score: 70, salt: salt(index, round.id), evidenceHash: zeroHash, critic })],
          critic,
        );
      await warpTo(round.commitEnd);
      for (const [index, critic] of critics.entries())
        await write("reveal", [round.id, 70, salt(index, round.id), zeroHash, 0n], critic);
      await warpTo(round.revealEnd);
      await keeper.tick();
      reviewed.add(round.serviceId);
    }
    expect([...reviewed].sort()).toEqual([1n, 2n, 3n, 4n, 5n]);
    expect((await finalizedEvents()).filter((event) => !event.isVoid).length).toBeGreaterThanOrEqual(5);
    expect(lines.filter((line) => line.includes("finalize") && line.includes("skipped"))).toEqual([]);
  }, 180_000);
});

type RoundTuple = { serviceId: bigint; commitEnd: bigint; revealEnd: bigint; finalized: boolean };
