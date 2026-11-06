import type { ServiceView } from './index';

export type RankingInput = Omit<ServiceView, 'confidence' | 'rank'> & { nReveals: number };
export type RankedService = ServiceView & { probation: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;

export function rankService(service: RankingInput, now: Date | number = Date.now()): RankedService {
  if (!Number.isInteger(service.nReveals) || service.nReveals < 0) throw new Error('nReveals must be a non-negative integer');
  const { nReveals, ...view } = service;
  const probation = service.median === null || service.nRounds === 0 || service.nReveals === 0 || service.lastRoundAt === null;
  if (probation) return { ...view, confidence: 0, rank: 0, probation: true };
  const lastRoundMs = Date.parse(service.lastRoundAt!);
  if (!Number.isFinite(lastRoundMs)) throw new Error('lastRoundAt must be a valid timestamp');
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) throw new Error('now must be a valid timestamp');
  const ageDays = Math.max(0, nowMs - lastRoundMs) / DAY_MS;
  const decay = Math.max(0.3, 0.5 ** (ageDays / 7));
  const confidence = Math.min(1, nReveals / 5) * decay;
  const median = service.median;
  if (median === null) throw new Error('Ranked service must have a finalized median');
  return { ...view, confidence, rank: median - 15 * (1 - confidence), probation: false };
}

function compareRank(a: RankedService, b: RankedService): number {
  if (a.probation !== b.probation) return a.probation ? 1 : -1;
  if (a.rank !== b.rank) return b.rank - a.rank;
  return a.id - b.id;
}

export function rankMarketplaceServices(services: readonly RankingInput[], now: Date | number = Date.now()): RankedService[] {
  return services.map(service => rankService(service, now)).sort(compareRank);
}

export function rankServices(services: readonly RankingInput[], now: Date | number = Date.now()): RankedService[] {
  return rankMarketplaceServices(services, now).filter(service => !service.probation);
}
