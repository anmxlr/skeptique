import { describe, expect, it, vi } from "vitest";
import { createScoreRelayer, type TextTarget } from "./scores";

const name = "converter.svc.skeptique.eth";
const event = { name, roundId: "12", score: 87, nReveals: 3, hederaTx: `0x${"ab".repeat(32)}` };

function target() {
  const records = new Map<string, string>();
  const write = vi.fn(async (_name: string, changes: Record<string, string>) => {
    for (const [key, value] of Object.entries(changes)) records.set(key, value);
    return `0x${"cd".repeat(32)}` as const;
  });
  const fake: TextTarget = {
    read: async (_name, keys) => Object.fromEntries(keys.map((key) => [key, records.get(key) ?? null])),
    write,
  };
  return { fake, records, write };
}

describe("ENS scores relayer", () => {
  it("writes four records atomically and does not write again on replay or restart", async () => {
    const { fake, write } = target();
    const relayer = createScoreRelayer({ target: fake, parentName: "skeptique.eth" });
    await expect(relayer.finalize(event)).resolves.toMatchObject({ status: "written" });
    await expect(relayer.finalize(event)).resolves.toEqual({ status: "unchanged" });
    await expect(createScoreRelayer({ target: fake, parentName: "skeptique.eth" }).finalize(event)).resolves.toEqual({
      status: "unchanged",
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(name, {
      "eth.skeptique.score": "87",
      "eth.skeptique.confidence": "0.6",
      "eth.skeptique.round": "12",
      "eth.skeptique.hedera.tx": event.hederaTx,
    });
  });

  it("serializes concurrent duplicate events, skips older rounds and rejects conflicting same-round data", async () => {
    const { fake, write } = target();
    const relayer = createScoreRelayer({ target: fake, parentName: "skeptique.eth" });
    await Promise.all([relayer.finalize(event), relayer.finalize(event)]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await relayer.finalize({ ...event, roundId: "11" })).toEqual({ status: "superseded" });
    await expect(relayer.finalize({ ...event, score: 90 })).rejects.toThrow("Conflicting finalized round");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("retries failed transactions and never records an unsuccessful write as complete", async () => {
    const { fake, write } = target();
    write.mockRejectedValueOnce(new Error("reverted"));
    const relayer = createScoreRelayer({ target: fake, parentName: "skeptique.eth" });
    await expect(relayer.finalize(event)).rejects.toThrow("reverted");
    await expect(relayer.finalize(event)).resolves.toMatchObject({ status: "written" });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("syncs absolute critic snapshots so replay never increments counters twice", async () => {
    const { fake, write } = target();
    const ensureCritic = vi.fn(async () => {});
    const relayer = createScoreRelayer({ target: fake, parentName: "skeptique.eth", ensureCritic });
    const critic = {
      name: "alice.critic.skeptique.eth",
      address: "0x0000000000000000000000000000000000000002",
      stake: "500000000",
      honestRounds: 3,
      slashes: 1,
    };
    await relayer.critic(critic);
    await relayer.critic(critic);
    expect(write).toHaveBeenCalledTimes(1);
    expect(ensureCritic).toHaveBeenCalledWith(critic.name, critic.address);
    expect(write).toHaveBeenCalledWith(critic.name, {
      "eth.skeptique.stake": "500000000",
      "eth.skeptique.honestRounds": "3",
      "eth.skeptique.slashes": "1",
    });
  });
});
