import { describe, expect, it } from 'vitest';
import { rehearseDemo, runFailureDrills } from './drills';

function localHarness() {
  return {
    async consensus() {
      return { median: 72, honest: ['balanced-1', 'balanced-2', 'balanced-3'], slashed: [{ critic: 'lazy-copier', amount: '1000000000000000000' }, { critic: 'bribed', amount: '1000000000000000000' }] };
    },
    async voidRound() { return { void: true, bountyBefore: '20', bountyAfter: '20', rewardsAccrued: '0', nonRevealSlashApplied: true }; },
    async worldDenial(path: string) { return { path, denied: true, registrationOccurred: false }; },
    async serviceOutage() { return { stopped: true, scoreSubmitted: false, pendingRevealPreserved: true }; },
  };
}

describe('demo failure drills', () => {
  it('asserts slashing, void round, all World denial paths, and safe outage stop', async () => {
    const result = await runFailureDrills(localHarness());
    expect(result.map(drill => drill.name)).toEqual(['critic slashing', 'void round', 'World denials', 'service outage safe stop']);
  });

  it('completes the local rehearsal within four minutes', async () => {
    const result = await rehearseDemo(localHarness());
    expect(result.elapsedSeconds).toBeLessThan(240);
    expect(result.drills).toHaveLength(4);
  });
});
