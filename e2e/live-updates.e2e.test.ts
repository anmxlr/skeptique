import { createRequire } from "node:module";
import { type Stack, startStack } from "@skeptique/harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roundManagerAbi } from "../packages/shared/abi/RoundManager";
import { commitmentHash, EventSchemas } from "../packages/shared/src/index";
import { listDemoServices } from "../scripts/demo/list-services";
import { registerDemoCritic } from "../scripts/demo/register-critic";

const contractsRequire = createRequire(new URL("../contracts/package.json", import.meta.url));
const { createPublicClient, createWalletClient, http } = contractsRequire("viem") as typeof import("viem");

// Hardhat's well-known dev account #9: the local attestor deployLocal trusts. A test fixture, never a product value.
const ATTESTOR = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

type ChainEvent = { type: string; data: Record<string, unknown> };

/** Reads `GET /events` (server-sent events) until `count` events arrived, or fails after `timeoutMs`. */
async function readEvents(apiUrl: string, until: (events: ChainEvent[]) => boolean, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const events: ChainEvent[] = [];
  try {
    const res = await fetch(`${apiUrl}/events`, { signal: controller.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = (res.body as ReadableStream<Uint8Array>).pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (!until(events)) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const type = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (type && data) events.push({ type, data: JSON.parse(data) });
      }
    }
    return events;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

describe("live updates", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  }, 60_000);
  afterAll(async () => {
    await stack?.stop();
  });

  it("streams round events as they happen and replays earlier ones to a new subscriber", async () => {
    const transport = http(stack.rpcUrl);
    const client = createPublicClient({ transport });
    const wallet = createWalletClient({ transport });
    const accounts = await wallet.getAddresses();
    const critic = accounts[1] as `0x${string}`;
    await listDemoServices({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.ServiceRegistry,
      seller: accounts[6] as `0x${string}`,
      origins: { "unit-convert": "http://127.0.0.1:1" },
    });
    await registerDemoCritic({
      rpcUrl: stack.rpcUrl,
      registry: stack.contracts.CriticRegistry,
      critic,
      nullifier: `0x${"01".padStart(64, "0")}`,
      attestorKey: ATTESTOR,
    });
    const write = async (functionName: "openRound" | "commit", args: readonly unknown[], account: `0x${string}`) => {
      const hash = await wallet.writeContract({
        address: stack.contracts.RoundManager,
        abi: roundManagerAbi,
        functionName,
        args: args as never,
        account,
        chain: null,
      });
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success");
    };

    // The listing opened round 1; replay it, then stream a fresh commit on the same connection.
    const live = readEvents(stack.apiUrl, (events) => events.some((e) => e.type === "CriticCommitted"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    const commitment = commitmentHash({
      score: 80,
      salt: `0x${"22".repeat(32)}`,
      evidenceHash: `0x${"33".repeat(32)}`,
      critic,
    });
    await write("commit", [1n, commitment], critic);

    const streamed = await live;
    const opened = streamed.find((e) => e.type === "RoundOpened");
    expect(EventSchemas.RoundOpened.parse(opened?.data)).toMatchObject({ roundId: 1, serviceId: 1 });
    const committed = streamed.find((e) => e.type === "CriticCommitted");
    const commitEvent = EventSchemas.CriticCommitted.parse(committed?.data);
    expect(commitEvent).toMatchObject({ roundId: 1 });
    expect(commitEvent.critic.toLowerCase()).toBe(critic.toLowerCase());

    // A page opened later learns the same history from the replay.
    const replayed = await readEvents(stack.apiUrl, (events) => events.length >= 2);
    expect(replayed.map((e) => e.type)).toEqual(["RoundOpened", "CriticCommitted"]);
  }, 60_000);
});
