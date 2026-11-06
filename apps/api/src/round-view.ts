import { type RoundView, RoundViewSchema } from "@skeptique/shared";

export type RoundSnapshot = {
  id: number;
  serviceId: number;
  commitEnd: number;
  revealEnd: number;
  finalized: boolean;
  median: number | null;
  committed: string[];
  reveals: Array<{ critic: string; score: number; honest?: boolean | null }>;
  void?: boolean;
};

export function toRoundView(round: RoundSnapshot, nowSeconds = Math.floor(Date.now() / 1000)): RoundView {
  const phase = round.void
    ? "void"
    : round.finalized
      ? "finalized"
      : nowSeconds < round.commitEnd
        ? "commit"
        : nowSeconds < round.revealEnd
          ? "reveal"
          : "finalizable";
  return RoundViewSchema.parse({
    id: round.id,
    serviceId: round.serviceId,
    phase,
    commitEnd: new Date(round.commitEnd * 1000).toISOString(),
    revealEnd: new Date(round.revealEnd * 1000).toISOString(),
    median: round.finalized ? round.median : null,
    committed: round.committed,
    reveals: round.reveals.map(({ critic, score, honest }) => ({ critic, score, honest: honest ?? null })),
  });
}

export function getPublishedServiceScore(rounds: RoundView[], serviceId: number): number | null {
  return (
    rounds
      .filter((round) => round.serviceId === serviceId && round.phase === "finalized" && round.median !== null)
      .sort((a, b) => b.id - a.id)[0]?.median ?? null
  );
}

export function getServiceRoundTimeline(rounds: RoundView[], serviceId: number): RoundView[] {
  return rounds.filter((round) => round.serviceId === serviceId).sort((a, b) => a.id - b.id);
}
