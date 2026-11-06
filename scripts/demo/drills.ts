import { performance } from 'node:perf_hooks';
import { consensusDrillFixture, voidRoundDrillFixture } from './drill-fixtures';

export type DrillHarness = {
  consensus(): Promise<{ median: number; honest: string[]; slashed: Array<{ critic: string; amount: string }> }>;
  voidRound(): Promise<{ void: boolean; bountyBefore: string; bountyAfter: string; rewardsAccrued: string; nonRevealSlashApplied: boolean }>;
  worldDenial(path: string): Promise<{ path: string; denied: boolean; registrationOccurred: boolean }>;
  serviceOutage(): Promise<{ stopped: boolean; scoreSubmitted: boolean; pendingRevealPreserved: boolean }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Demo drill failed: ${message}`);
}

export async function runFailureDrills(harness: DrillHarness): Promise<Array<{ name: string; passed: true }>> {
  const expectedHonest = new Set<string>(consensusDrillFixture.critics.filter(critic => Math.abs(critic.score - consensusDrillFixture.median) <= consensusDrillFixture.tolerance).map(critic => critic.id));
  const expectedSlashes = new Map(consensusDrillFixture.critics.filter(critic => !expectedHonest.has(critic.id)).map(critic => [critic.id as string, (BigInt(critic.stake) * BigInt(consensusDrillFixture.slashBps) / 10_000n).toString()]));
  const consensus = await harness.consensus();
  const slashedCritics = new Set(consensus.slashed.map(critic => critic.critic));
  assert(consensus.median === consensusDrillFixture.median, 'median must match the deterministic critic scores and stakes');
  assert(consensus.honest.length === expectedHonest.size && new Set(consensus.honest).size === expectedHonest.size && consensus.honest.every(critic => expectedHonest.has(critic)), 'honest critics must match the deterministic scenario');
  assert(slashedCritics.size === expectedSlashes.size, 'only the deterministic outliers must be slashed');
  assert(slashedCritics.size === consensus.slashed.length, 'slash records must be distinct');
  assert(consensus.slashed.every(critic => expectedSlashes.has(critic.critic) && critic.amount === expectedSlashes.get(critic.critic)), 'slash amounts must match the configured stake percentage');

  const voidResult = await harness.voidRound();
  assert(/^(0|[1-9]\d*)$/.test(voidResult.bountyBefore) && /^(0|[1-9]\d*)$/.test(voidResult.bountyAfter), 'bounty balances must be unsigned amounts');
  assert(voidResult.bountyBefore === voidRoundDrillFixture.bounty, 'void round must begin with the funded fixture bounty');
  assert(voidResult.void, 'low-reveal round must be void');
  assert(voidResult.bountyBefore === voidResult.bountyAfter, 'void round must preserve bounty');
  assert(voidResult.rewardsAccrued === '0', 'void round must accrue no rewards');
  assert(voidResult.nonRevealSlashApplied, 'void round must apply the configured non-reveal slash');

  const denialPaths = ['unverified', 'expired', 'cancelled', 'duplicate-human', 'tampered'];
  for (const path of denialPaths) {
    const result = await harness.worldDenial(path);
    assert(result.path === path && result.denied && !result.registrationOccurred, `World ${path} denial must prevent registration`);
  }

  const outage = await harness.serviceOutage();
  assert(outage.stopped, 'critic must stop when service is unavailable');
  assert(!outage.scoreSubmitted, 'outage must not produce a fabricated score');
  assert(outage.pendingRevealPreserved, 'outage must preserve pending round state');

  return [
    { name: 'critic slashing', passed: true },
    { name: 'void round', passed: true },
    { name: 'World denials', passed: true },
    { name: 'service outage safe stop', passed: true },
  ];
}

// This times failure drills only; the full four-minute demo script still needs
// the integrated 27/28 rehearsal and its per-beat timings.
export async function rehearseDemo(harness: DrillHarness, maxSeconds = 240): Promise<{ scope: 'failure-drills'; elapsedSeconds: number; drills: Array<{ name: string; passed: true }> }> {
  const startedAt = performance.now();
  const drills = await runFailureDrills(harness);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  assert(elapsedSeconds < maxSeconds, `failure-drill run took ${elapsedSeconds.toFixed(2)} seconds; limit is ${maxSeconds}`);
  return { scope: 'failure-drills', elapsedSeconds, drills };
}
