export type WeightedScore = { score: number; weight: bigint };

export function weightedMedian(values: readonly WeightedScore[]): number {
  if (values.length === 0) throw new Error("Weighted median needs at least one score");
  let totalWeight = 0n;
  const ordered = values
    .map((value) => {
      if (!Number.isInteger(value.score) || value.score < 0 || value.score > 100)
        throw new Error("Score must be an integer from 0 to 100");
      if (value.weight <= 0n) throw new Error("Weight must be positive");
      totalWeight += value.weight;
      return value;
    })
    .sort((a, b) => a.score - b.score);
  let cumulative = 0n;
  for (const value of ordered) {
    cumulative += value.weight;
    if (cumulative * 2n >= totalWeight) return value.score;
  }
  throw new Error("Unable to find weighted median");
}

export function slashAmount(stake: bigint, slashBps: number): bigint {
  if (stake < 0n) throw new Error("Stake cannot be negative");
  if (!Number.isInteger(slashBps) || slashBps < 0 || slashBps > 10_000)
    throw new Error("Slash rate must be between 0 and 10000 basis points");
  return (stake * BigInt(slashBps)) / 10_000n;
}
