export type CriticPersona = 'balanced' | 'strict' | 'lenient' | 'lazy-copier' | 'bribed';
export type PersonaScore = { score: number; testsRun: boolean };

export function scorePersona(
  persona: CriticPersona,
  measuredScore: number,
  options: { lazyScore?: number; strictPenalty?: number; lenientBonus?: number; bribeBonus?: number } = {},
): PersonaScore {
  if (!Number.isInteger(measuredScore) || measuredScore < 0 || measuredScore > 100) throw new Error('Measured score must be from 0 to 100');
  const clamp = (score: number) => Math.max(0, Math.min(100, Math.round(score)));
  switch (persona) {
    case 'balanced': return { score: measuredScore, testsRun: true };
    case 'strict': return { score: clamp(measuredScore - (options.strictPenalty ?? 5)), testsRun: true };
    case 'lenient': return { score: clamp(measuredScore + (options.lenientBonus ?? 5)), testsRun: true };
    case 'lazy-copier': return { score: clamp(options.lazyScore ?? 20), testsRun: false };
    case 'bribed': return { score: clamp(measuredScore + (options.bribeBonus ?? 25)), testsRun: true };
  }
}
