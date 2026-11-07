import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, expect, it } from "vitest";
import { CriticsView } from "../apps/web/components/critics";
import type { CriticView } from "../apps/web/lib/api";
import { roundManagerAbi } from "../packages/shared/abi/RoundManager";
import { serviceRegistryAbi } from "../packages/shared/abi/ServiceRegistry";
import { commitmentHash } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http, zeroHash } = contractsRequire("viem") as typeof import("viem");
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");
const ATTESTOR = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
let stack: Stack;
beforeAll(async () => {
  stack = await startStack();
}, 60_000);
afterAll(async () => {
  await stack?.stop();
});

it("honest critics paid: rewards accrue on finalize, critics claim, and the dashboard drops to zero", async () => {
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
      nullifier: `0x${(index + 21).toString(16).padStart(64, "0")}`,
      attestorKey: ATTESTOR,
    });
  }
  const write = async (
    functionName: "commit" | "reveal" | "finalize" | "claim",
    args: readonly unknown[],
    account = accounts[0]!,
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
    return receipt;
  };
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({
      address: stack.contracts.RoundManager,
      abi: roundManagerAbi,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;
  const bountyBefore = (
    await client.readContract({
      address: stack.contracts.ServiceRegistry,
      abi: serviceRegistryAbi,
      functionName: "getService",
      args: [1n],
    })
  ).bounty;
  const minListingFee = await client.readContract({
    address: stack.contracts.ServiceRegistry,
    abi: serviceRegistryAbi,
    functionName: "minListingFee",
  });
  // A round spends at most one listing fee of the bounty.
  const budget = bountyBefore < minListingFee ? bountyBefore : minListingFee;
  const costCap = await read<bigint>("COST_CAP");
  const scores = [70, 72, 74];
  const costs = [costCap / 2n, costCap * 3n, 0n];
  const salt = (index: number) => `0x${(index + 40).toString(16).padStart(64, "0")}` as const;
  for (const [index, critic] of critics.entries())
    await write(
      "commit",
      [1n, commitmentHash({ score: scores[index]!, salt: salt(index), evidenceHash: zeroHash, critic })],
      critic,
    );
  const round = await read<{ commitEnd: bigint; revealEnd: bigint }>("getRound", [1n]);
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.commitEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  for (const [index, critic] of critics.entries())
    await write("reveal", [1n, scores[index]!, salt(index), zeroHash, costs[index]!], critic);
  await client.request({ method: "evm_setNextBlockTimestamp" as never, params: [Number(round.revealEnd)] as never });
  await client.request({ method: "evm_mine" as never });
  await write("finalize", [1n]);

  const dashboard = async () => {
    const all = (await (await fetch(`${stack.apiUrl}/critics`)).json()) as CriticView[];
    const ours = critics.map((critic) => all.find((item) => item.address.toLowerCase() === critic.toLowerCase())!);
    return {
      critics: ours,
      html: renderToString(createElement(CriticsView, { state: { status: "ready", critics: ours } })),
    };
  };

  // Equal stakes: each gets its capped test cost plus an equal share of what is left of the bounty.
  const before = await dashboard();
  const pending = before.critics.map((critic) => BigInt(critic.pendingRewards ?? "0"));
  const reimbursed = [costCap / 2n, costCap, 0n];
  const share = (budget - reimbursed.reduce((sum, cost) => sum + cost, 0n)) / 3n;
  expect(pending).toEqual(reimbursed.map((cost) => cost + share));
  for (const critic of before.critics) expect(critic).toMatchObject({ honestRounds: 1, slashes: 0 });
  expect(before.html).toContain("Pending rewards");
  expect(before.html.match(/<button[^>]*>Claim<\/button>/g)).toHaveLength(3);

  for (const [index, critic] of critics.entries()) {
    const balanceBefore = await client.getBalance({ address: critic });
    const receipt = await write("claim", [], critic);
    const balanceAfter = await client.getBalance({ address: critic });
    expect(balanceAfter - balanceBefore + receipt.gasUsed * receipt.effectiveGasPrice).toBe(pending[index]);
  }

  const after = await dashboard();
  for (const critic of after.critics) expect(critic.pendingRewards).toBe("0");
  expect(after.html).not.toContain(">Claim</button>");
  expect(after.html).toContain("0 HBAR");
}, 120_000);
