import { hashCanonical } from "./record";
import type { ArenaRecord, RunSummary, Scoreboard, Side, SideResult, SideScore, SideSummary } from "./schema";

const SIDES: readonly Side[] = ["baseline", "skeptique"];

const summariseSide = (r: SideResult): SideSummary => ({
  outcome: r.outcome,
  answeredCorrect: r.outcome === "correct",
  noAnswer: r.outcome === "refused" || r.outcome === "blocked",
  paidTinybars: r.paidTinybars,
  wastedTinybars: r.wastedTinybars,
  correctParts: r.correctParts,
  totalParts: r.totalParts,
});

export const summarise = (sides: ArenaRecord["sides"]): RunSummary => ({
  baseline: summariseSide(sides.baseline),
  skeptique: summariseSide(sides.skeptique),
});

function scoreSide(runs: SideSummary[]): SideScore {
  const count = (keep: (r: SideSummary) => boolean) => runs.filter(keep).length;
  const sum = (rs: SideSummary[], f: (r: SideSummary) => string) => rs.reduce((acc, r) => acc + BigInt(f(r)), 0n);
  const total = sum(runs, (r) => r.paidTinybars);
  const wasted = sum(runs, (r) => r.wastedTinybars);
  return {
    answeredCorrect: count((r) => r.answeredCorrect),
    noAnswer: count((r) => r.noAnswer),
    correctParts: runs.reduce((acc, r) => acc + r.correctParts, 0),
    totalParts: runs.reduce((acc, r) => acc + r.totalParts, 0),
    correct: count((r) => r.outcome === "correct"),
    partial: count((r) => r.outcome === "partial"),
    wrong: count((r) => r.outcome === "wrong"),
    refused: count((r) => r.outcome === "refused"),
    blocked: count((r) => r.outcome === "blocked"),
    error: count((r) => r.outcome === "error"),
    totalTinybars: total.toString(),
    wastedTinybars: wasted.toString(),
    // Every paid part is graded correct or wrong, so paid-for-correct = paid - wasted.
    paidToCorrectShare: total === 0n ? null : Number(total - wasted) / Number(total),
  };
}

export function scoreBatch(records: readonly ArenaRecord[]): Scoreboard {
  const sides = Object.fromEntries(SIDES.map((side) => [side, scoreSide(records.map((r) => r.summary[side]))]));
  return { tasks: records.length, sides: sides as Scoreboard["sides"] };
}

export const hashBatch = (scoreboard: Scoreboard, runHashes: readonly string[]) =>
  hashCanonical({ scoreboard, runHashes });
