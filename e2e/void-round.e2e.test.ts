import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criticRegistryAbi } from "../packages/shared/abi/CriticRegistry";
import { roundManagerAbi } from "../packages/shared/abi/RoundManager";
import { commitmentHash, type RoundView } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http, zeroHash } = contractsRequire("viem") as typeof import("viem");
const ATTESTOR = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
let stack: Stack;
beforeAll(async () => {
  stack = await startStack();
}, 60_000);
afterAll(async () => {
  await stack?.stop();
});

it("void round: too few reveals publishes no score, slashes the non-revealers and frees everyone", async () => {
  const transport = http(stack.rpcUrl);
  const client = createPublicClient({ transport });
  const admin = createWalletClient({ transport });
  const accounts = await admin.getAddresses();
  const critics = accounts.slice(1, 4);
  await listDemoServices({
    rpcUrl: stack.rpcUrl,
    registry: stack.contracts.ServiceRegistry,
    seller: accounts[6]!,
    origins: { "unit-convert": "http://127.0.0.1:1" },
  });
  for (const [index, critic] of critics.entries()) {
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier: `0x${(index + 1).toString(16).padStart(64, "0")}`,
      attestorKey: ATTESTOR,
    });
  }
  const write = async (
    functionName: "openRound" | "commit" | "reveal" | "finalize",
    args: readonly unknown[],
    account = accounts[0],
  ) => {
    const hash = await admin.writeContract({
      address: stack.contracts.RoundManager,
      abi: roundManagerAbi,
      functionName,
      args: args as never,
      account,
      chain: null,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  };
  const readStake = (critic: `0x${string}`) =>
    client.readContract({
      address: stack.contracts.CriticRegistry,
      abi: criticRegistryAbi,
      functionName: "stakeOf",
      args: [critic],
    });
  const stakeBefore = await Promise.all(critics.map(readStake));
  const salt = (index: number) => `0x${(index + 10).toString(16).padStart(64, "0")}` as const;
  const scores = [70, 72, 74];
  for (const [index, critic] of critics.entries())
    await write(
      "commit",
      [1n, commitmentHash({ score: scores[index]!, salt: salt(index), evidenceHash: zeroHash, critic })],
      critic,
    );
  const round = await client.readContract({
    address: stack.contracts.RoundManager,
    abi: roundManagerAbi,
    functionName: "getRound",
    args: [1n],
  });
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.commitEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.revealEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  await write("finalize", [1n]);

  const noRevealBps = BigInt(
    await client.readContract({
      address: stack.contracts.RoundManager,
      abi: roundManagerAbi,
      functionName: "NOREVEAL_SLASH_BPS",
    }),
  );
  for (const index of [0, 1, 2])
    expect(await readStake(critics[index]!)).toBe(stakeBefore[index]! - (stakeBefore[index]! * noRevealBps) / 10_000n);
  expect(
    await client.readContract({
      address: stack.contracts.CriticRegistry,
      abi: criticRegistryAbi,
      functionName: "slashedFunds",
      args: [1n],
    }),
  ).toBe(((stakeBefore[0]! + stakeBefore[1]! + stakeBefore[2]!) * noRevealBps) / 10_000n);

  const apiRound = (await (await fetch(`${stack.apiUrl}/rounds/1`)).json()) as RoundView;
  expect(apiRound).toMatchObject({ phase: "void", median: null });

  // The service opens its next round and every committer can commit again.
  // Local stack runs K_MIN=1, so a round with zero reveals is the void case.
  await write("openRound", [1n]);
  for (const [index, critic] of critics.entries())
    await write(
      "commit",
      [2n, commitmentHash({ score: 60, salt: salt(index + 5), evidenceHash: zeroHash, critic })],
      critic,
    );
}, 120_000);
