import { describe, expect, it, vi } from "vitest";
import { createCriticDaemon, type ReviewResult } from "./daemon";
import type { PendingReveal } from "./round-agent";

const critic = `0x${"11".repeat(20)}`;
const evidenceHash = `0x${"33".repeat(32)}` as `0x${string}`;
const round = (roundId: number, commitEnd = 1000, revealEnd = 1500) => ({
  roundId,
  serviceId: roundId,
  commitEnd,
  revealEnd,
});

function setup(options: {
  rounds?: ReturnType<typeof round>[];
  locked?: number;
  reviewImpl?: () => Promise<ReviewResult>;
}) {
  const clock = { now: 100 };
  const pending = new Map<number, PendingReveal>();
  const committed = new Set<number>();
  const revealed = new Set<number>();
  const chain = {
    now: async () => clock.now,
    openedRounds: async () => options.rounds ?? [round(1)],
    activeRound: vi.fn(async () => options.locked ?? 0),
  };
  const contract = {
    isCommitted: async (id: bigint) => committed.has(Number(id)),
    isRevealed: async (id: bigint) => revealed.has(Number(id)),
  };
  const agent = {
    commit: vi.fn(
      async (input: { roundId: number; score: number; evidenceHash: `0x${string}`; claimedCost: string }) => {
        const state: PendingReveal = { ...input, critic, salt: `0x${"22".repeat(32)}` };
        pending.set(input.roundId, state);
        committed.add(input.roundId);
        return state;
      },
    ),
    reveal: vi.fn(async (id: number) => {
      revealed.add(id);
      pending.delete(id);
    }),
  };
  const store = { get: async (id: number) => pending.get(id) };
  const review = vi.fn(
    options.reviewImpl ?? (async () => ({ evidenceHash, evidence: { score: 80, claimedCost: "0" } })),
  );
  const log = vi.fn();
  const daemon = createCriticDaemon({
    critic,
    chain,
    contract,
    agent,
    store,
    review,
    log,
    roundBudgetMs: 50,
    marginSecs: 5,
  });
  return { clock, daemon, agent, review, chain, committed, pending, log };
}

describe("critic daemon", () => {
  it("commits once per round, however many ticks run", async () => {
    const { daemon, agent, review } = setup({});
    await daemon.tick();
    await daemon.tick();
    expect(review).toHaveBeenCalledTimes(1);
    expect(agent.commit).toHaveBeenCalledTimes(1);
    expect(agent.commit).toHaveBeenCalledWith({ roundId: 1, score: 80, evidenceHash, claimedCost: "0" });
  });

  it("skips a round while its stake is locked in another round", async () => {
    const { daemon, agent, review } = setup({ locked: 7 });
    await daemon.tick();
    expect(review).not.toHaveBeenCalled();
    expect(agent.commit).not.toHaveBeenCalled();
  });

  it("reveals after commitEnd from saved state, including after a restart", async () => {
    const first = setup({});
    await first.daemon.tick();
    first.clock.now = 1001;
    // A fresh daemon over the same persisted state reveals; nothing is reviewed again.
    const restarted = createCriticDaemon({
      critic,
      chain: { now: async () => 1001, openedRounds: async () => [round(1)], activeRound: async () => 1 },
      contract: { isCommitted: async () => true, isRevealed: async () => false },
      agent: first.agent,
      store: { get: async (id) => first.pending.get(id) },
      review: first.review,
      log: vi.fn(),
      roundBudgetMs: 50,
      marginSecs: 5,
    });
    await restarted.tick();
    expect(first.agent.reveal).toHaveBeenCalledWith(1);
    expect(first.review).toHaveBeenCalledTimes(1);
  });

  it("retries a failed reveal on the next tick until revealEnd", async () => {
    const { daemon, agent, clock } = setup({});
    await daemon.tick();
    clock.now = 1001;
    agent.reveal.mockRejectedValueOnce(new Error("rpc down"));
    await daemon.tick();
    await daemon.tick();
    expect(agent.reveal).toHaveBeenCalledTimes(2);
    clock.now = 1500;
    agent.reveal.mockClear();
    await daemon.tick();
    expect(agent.reveal).not.toHaveBeenCalled();
  });

  it("logs a throwing review, makes no commit, and keeps going", async () => {
    const { daemon, agent, review, log } = setup({
      rounds: [round(1), round(2)],
      reviewImpl: async () => {
        throw new Error("service down");
      },
    });
    await expect(daemon.tick()).resolves.toBeUndefined();
    await daemon.tick();
    expect(agent.commit).not.toHaveBeenCalled();
    expect(review).toHaveBeenCalledTimes(2); // each round tried once, then skipped
    expect(log).toHaveBeenCalledWith(expect.stringContaining("service down"));
  });

  it("abandons a review that overruns its deadline without committing", async () => {
    const { daemon, agent } = setup({ reviewImpl: () => new Promise<ReviewResult>(() => {}) });
    await expect(daemon.tick()).resolves.toBeUndefined();
    expect(agent.commit).not.toHaveBeenCalled();
  });

  it("does not commit when the review finishes after commitEnd", async () => {
    const ctx = setup({});
    ctx.review.mockImplementation(async () => {
      ctx.clock.now = 1000;
      return { evidenceHash, evidence: { score: 80, claimedCost: "0" } };
    });
    await ctx.daemon.tick();
    expect(ctx.agent.commit).not.toHaveBeenCalled();
  });

  it("does not start a review with less than the margin left before commitEnd", async () => {
    const { daemon, review, clock } = setup({});
    clock.now = 996;
    await daemon.tick();
    expect(review).not.toHaveBeenCalled();
  });
});
