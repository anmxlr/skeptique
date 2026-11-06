import { createRequire } from "node:module";
import { type ServiceStarter, type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceByName } from "../apps/services/catalog";
import { startService } from "../apps/services/common/server";
import { MarketplaceView } from "../apps/web/components/marketplace";
import type { deployLocal } from "../contracts/deploy/local";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { createElement } = webRequire("react") as typeof import("react");
const { renderToString } = webRequire("react-dom/server") as typeof import("react-dom/server");
// Public Hardhat development account #9, trusted by the local deployment only.
const attestorKey = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";
const salt = `0x${"11".repeat(32)}` as const;
const evidence = `0x${"22".repeat(32)}` as const;

const serve =
  (name: string): ServiceStarter =>
  async () => {
    const definition = serviceByName(name);
    if (!definition) throw new Error(`Unknown demo service ${name}`);
    const { server, url } = await startService(definition, 0);
    return { url, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  };

describe("marketplace ranks services", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({
      services: {
        "unit-convert": serve("unit-convert"),
        "csv-clean": serve("csv-clean"),
        "flaky-fx": serve("flaky-fx"),
      },
    });
  }, 60_000);
  afterAll(async () => {
    await stack?.stop();
  });

  it("ranks real finalized rounds by confidence and shows an unreviewed listing in probation", async () => {
    const hre = contractsRequire("hardhat") as Parameters<typeof deployLocal>[0];
    const wallets = await hre.viem.getWalletClients();
    const client = await hre.viem.getPublicClient();
    const listed = await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller: wallets[1].account.address,
      origins: {
        "unit-convert": stack.services["unit-convert"],
        "csv-clean": stack.services["csv-clean"],
        "flaky-fx": stack.services["flaky-fx"],
      },
    });
    expect(listed).toHaveLength(3);
    for (let i = 2; i < 7; i++) {
      await registerDemoCritic({
        rpcUrl: stack.rpcUrl,
        registry: stack.contracts.CriticRegistry,
        critic: wallets[i].account.address,
        nullifier: `0x${i.toString(16).padStart(64, "0")}`,
        attestorKey,
      });
    }
    const manager = await hre.viem.getContractAt("RoundManager", stack.contracts.RoundManager);
    const moveTo = async (timestamp: bigint) => {
      await hre.network.provider.request({ method: "evm_setNextBlockTimestamp", params: [Number(timestamp)] });
      await hre.network.provider.request({ method: "evm_mine", params: [] });
    };
    // Same score, different sample sizes: listing order is deliberately opposite confidence order.
    for (const [serviceId, count] of [
      [1n, 3],
      [2n, 5],
    ] as const) {
      const roundId = await manager.read.nextRoundId();
      await manager.write.openRound([serviceId]);
      const round = await manager.read.getRound([roundId]);
      for (let i = 2; i < count + 2; i++) {
        const commitment = await manager.read.commitmentFor([80, salt, evidence, wallets[i].account.address]);
        await manager.write.commit([roundId, commitment], { account: wallets[i].account });
      }
      await moveTo(round.commitEnd);
      for (let i = 2; i < count + 2; i++) {
        await manager.write.reveal([roundId, 80, salt, evidence, 0n], { account: wallets[i].account });
      }
      await moveTo(round.revealEnd);
      await client.waitForTransactionReceipt({ hash: await manager.write.finalize([roundId]) });
    }
    const response = await fetch(`${stack.apiUrl}/services`);
    expect(response.status).toBe(200);
    const services = await response.json();
    expect(services.map((service: { id: number }) => service.id)).toEqual([2, 1, 3]);
    expect(services[0]).toMatchObject({ median: 80, nRounds: 1 });
    expect(services[0].confidence).toBeGreaterThan(services[1].confidence);
    expect(services[0].rank).toBeGreaterThan(services[1].rank);
    expect(services[2]).toMatchObject({ median: null, nRounds: 0, confidence: 0 });
    const html = renderToString(createElement(MarketplaceView, { state: { status: "ready", services } }));
    expect(html).toContain("<meter");
    expect(html).toContain("Probation");
    expect(html).toContain("/services/2");
  }, 60_000);
});
