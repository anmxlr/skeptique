import type { PendingReveal, RoundAgentContract } from "./round-agent";

export type OpenedRound = { roundId: number; serviceId: number; commitEnd: number; revealEnd: number };

/** Chain reads the daemon needs. `now` is chain time in seconds, so tests can drive it. */
export interface DaemonChain {
  now(): Promise<number>;
  openedRounds(): Promise<OpenedRound[]>;
  activeRound(critic: string): Promise<number>;
}

export type ReviewResult = { evidenceHash: `0x${string}`; evidence: { score: number; claimedCost: string } };

export function createCriticDaemon(options: {
  critic: string;
  chain: DaemonChain;
  contract: Pick<RoundAgentContract, "isCommitted" | "isRevealed">;
  agent: {
    commit(input: {
      roundId: number;
      score: number;
      evidenceHash: `0x${string}`;
      claimedCost: string;
    }): Promise<unknown>;
    reveal(roundId: number): Promise<void>;
  };
  store: { get(roundId: number): Promise<PendingReveal | undefined> };
  review: (input: { round: OpenedRound; budgetMs: number; signal: AbortSignal }) => Promise<ReviewResult>;
  log?: (message: string) => void;
  /** Upper bound for one review; the real budget also ends `marginSecs` before commitEnd. */
  roundBudgetMs: number;
  marginSecs: number;
}) {
  const log = options.log ?? (() => {});
  const failed = new Set<number>();
  const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

  async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("Review missed its deadline");
            controller.abort(error);
            reject(error);
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function reveals(rounds: OpenedRound[], now: number) {
    for (const round of rounds) {
      if (now < round.commitEnd || now >= round.revealEnd) continue;
      if (!(await options.store.get(round.roundId))) continue;
      try {
        await options.agent.reveal(round.roundId);
        log(`round ${round.roundId}: revealed`);
      } catch (error) {
        log(`round ${round.roundId}: reveal failed, will retry: ${describe(error)}`);
      }
    }
  }

  async function commitTo(round: OpenedRound) {
    const id = BigInt(round.roundId);
    if (await options.contract.isCommitted(id, options.critic)) return;
    const saved = await options.store.get(round.roundId);
    if (saved) {
      // A crash between saving and committing: resume with the same score instead of reviewing again.
      await options.agent.commit({
        roundId: round.roundId,
        score: saved.score,
        evidenceHash: saved.evidenceHash,
        claimedCost: saved.claimedCost,
      });
      log(`round ${round.roundId}: resumed commit`);
      return;
    }
    if (failed.has(round.roundId)) return;
    if ((await options.chain.activeRound(options.critic)) !== 0) return;
    const now = await options.chain.now();
    const budgetMs = Math.min(options.roundBudgetMs, (round.commitEnd - now - options.marginSecs) * 1000);
    if (budgetMs <= 0) return;
    let result: ReviewResult;
    try {
      result = await withDeadline((signal) => options.review({ round, budgetMs, signal }), budgetMs);
    } catch (error) {
      failed.add(round.roundId);
      log(`round ${round.roundId}: review failed, skipping: ${describe(error)}`);
      return;
    }
    if ((await options.chain.now()) >= round.commitEnd) {
      failed.add(round.roundId);
      log(`round ${round.roundId}: review finished after commitEnd, skipping`);
      return;
    }
    try {
      await options.agent.commit({
        roundId: round.roundId,
        score: result.evidence.score,
        evidenceHash: result.evidenceHash,
        claimedCost: result.evidence.claimedCost,
      });
      log(`round ${round.roundId}: committed score ${result.evidence.score}`);
    } catch (error) {
      log(`round ${round.roundId}: commit failed: ${describe(error)}`);
    }
  }

  /** One pass: reveal what is due, then review and commit to open rounds, oldest first. */
  async function tick(): Promise<void> {
    try {
      const [now, rounds] = await Promise.all([options.chain.now(), options.chain.openedRounds()]);
      await reveals(rounds, now);
      for (const round of rounds.filter((candidate) => now < candidate.commitEnd)) {
        try {
          await commitTo(round);
        } catch (error) {
          log(`round ${round.roundId}: ${describe(error)}`);
        }
      }
    } catch (error) {
      log(`tick failed: ${describe(error)}`);
    }
  }

  async function run(signal: AbortSignal, pollMs: number): Promise<void> {
    while (!signal.aborted) {
      await tick();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  return { tick, run };
}
