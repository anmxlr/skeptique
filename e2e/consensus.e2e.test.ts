import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, expect, it } from "vitest";
import { scorePersona } from "../apps/critic/src/personas";
import { CriticsView } from "../apps/web/components/critics";
import { RoundDetailsView } from "../apps/web/components/round-details";
import { criticRegistryAbi } from "../packages/shared/abi/CriticRegistry";
import { roundManagerAbi } from "../packages/shared/abi/RoundManager";
import { commitmentHash, type RoundView } from "../packages/shared/src/index";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http, zeroHash } = contractsRequire("viem") as typeof import("viem");
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");
const ATTESTOR = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
let stack: Stack;
beforeAll(async () => { stack = await startStack(); }, 60_000);
afterAll(async () => { await stack?.stop(); });

it("lazy and bribed critics slashed: actual registered stakes, retained funds, API and pages agree", async () => {
  expect(stack.contracts.RoundManager).toBeDefined();
  const transport = http(stack.rpcUrl);
  const client = createPublicClient({ transport });
  const admin = createWalletClient({ transport });
  const accounts = await admin.getAddresses();
  const critics = accounts.slice(1, 6);
  for (const [index, critic] of critics.entries()) {
    await registerDemoCritic({ rpcUrl: stack.rpcUrl, registry: stack.contracts.CriticRegistry, critic,
      nullifier: `0x${(index + 1).toString(16).padStart(64, "0")}`, attestorKey: ATTESTOR });
  }
  const write = async (functionName: "openRound" | "commit" | "reveal" | "finalize", args: readonly unknown[], account = accounts[0]) => {
    const hash = await admin.writeContract({ address: stack.contracts.RoundManager, abi: roundManagerAbi,
      functionName, args: args as never, account, chain: null });
    const receipt = await client.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
  };
  await write("openRound", [1n]);
  const scores = [68, 72, 76, scorePersona("lazy-copier", 72, { lazyScore: 20 }).score, scorePersona("bribed", 72).score];
  const salts = critics.map((_, index) => `0x${(index + 10).toString(16).padStart(64, "0")}` as const);
  for (const [index, critic] of critics.entries()) {
    await write("commit", [1n, commitmentHash({ score: scores[index]!, salt: salts[index]!, evidenceHash: zeroHash, critic })], critic);
  }
  const round = await client.readContract({ address: stack.contracts.RoundManager, abi: roundManagerAbi, functionName: "getRound", args: [1n] });
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.commitEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  for (const [index, critic] of critics.entries()) await write("reveal", [1n, scores[index]!, salts[index]!, zeroHash, 0n], critic);
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.revealEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  await write("finalize", [1n]);
  const expectedStake = [500000000n, 500000000n, 500000000n, 400000000n, 400000000n];
  for (const [index, critic] of critics.entries()) {
    expect(await client.readContract({ address: stack.contracts.CriticRegistry, abi: criticRegistryAbi,
      functionName: "stakeOf", args: [critic] })).toBe(expectedStake[index]);
  }
  expect(await client.readContract({ address: stack.contracts.CriticRegistry, abi: criticRegistryAbi,
    functionName: "slashedFunds", args: [1n] })).toBe(200000000n);
  expect(await client.getBalance({ address: stack.contracts.CriticRegistry })).toBe(2500000000n);
  const apiRound = await (await fetch(`${stack.apiUrl}/rounds/1`)).json() as RoundView;
  expect(apiRound).toMatchObject({ phase: "finalized", median: 72 });
  expect(apiRound.reveals.map(reveal => reveal.honest)).toEqual([true, true, true, false, false]);
  const apiCritics = await (await fetch(`${stack.apiUrl}/critics`)).json();
  expect(apiCritics.map((critic: { verdict: string }) => critic.verdict)).toEqual(["honest", "honest", "honest", "slashed", "slashed"]);
  const criticHtml = renderToString(createElement(CriticsView, { state: { status: "ready", critics: apiCritics } }));
  const roundHtml = renderToString(createElement(RoundDetailsView, { round: apiRound }));
  for (const html of [criticHtml, roundHtml]) { expect(html).toContain("Honest"); expect(html).toContain("Slashed"); }
});
