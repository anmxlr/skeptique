import { performance } from 'node:perf_hooks';

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
  const consensus = await harness.consensus();
  const slashedCritics = new Set(consensus.slashed.map(critic => critic.critic));
  assert(consensus.honest.length === 3, 'expected three honest critics');
  assert(slashedCritics.has('lazy-copier') && slashedCritics.has('bribed'), 'lazy and bribed critics must be slashed');
  assert(consensus.slashed.every(critic => BigInt(critic.amount) > 0n), 'slash amount must be positive');

  const voidResult = await harness.voidRound();
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

export async function rehearseDemo(harness: DrillHarness, maxSeconds = 240): Promise<{ elapsedSeconds: number; drills: Array<{ name: string; passed: true }> }> {
  const startedAt = performance.now();
  const drills = await runFailureDrills(harness);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  assert(elapsedSeconds < maxSeconds, `local rehearsal took ${elapsedSeconds.toFixed(2)} seconds; limit is ${maxSeconds}`);
  return { elapsedSeconds, drills };
}
