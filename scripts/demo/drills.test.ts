import { describe, expect, it } from 'vitest';
import { rehearseDemo, runFailureDrills, type DrillHarness } from './drills';

function localHarness() {
  return {
    async consensus() {
      return { median: 72, honest: ['balanced-1', 'balanced-2', 'balanced-3'], slashed: [{ critic: 'lazy-copier', amount: '1000000000000000000' }, { critic: 'bribed', amount: '1000000000000000000' }] };
    },
    async voidRound() { return { void: true, bountyBefore: '20000000000000000000', bountyAfter: '20000000000000000000', rewardsAccrued: '0', nonRevealSlashApplied: true }; },
    async worldDenial(path: string) { return { path, denied: true, registrationOccurred: false }; },
    async serviceOutage() { return { stopped: true, scoreSubmitted: false, pendingRevealPreserved: true }; },
  };
}

describe('demo failure drills', () => {
  it.each([
    ['wrong median', { median: 0 }],
    ['arbitrary honest identities', { honest: ['unknown-a', 'unknown-b', 'unknown-c'] }],
    ['one-wei slashes', { slashed: [{ critic: 'lazy-copier', amount: '1' }, { critic: 'bribed', amount: '1' }] }],
    ['an extra incorrectly slashed critic', { honest: ['balanced-2', 'balanced-3', 'unknown'], slashed: [{ critic: 'lazy-copier', amount: '1000000000000000000' }, { critic: 'bribed', amount: '1000000000000000000' }, { critic: 'balanced-1', amount: '1000000000000000000' }] }],
  ] satisfies Array<[string, Partial<Awaited<ReturnType<DrillHarness['consensus']>>>]>)('rejects %s for the deterministic consensus scenario', async (_name, incorrect) => {
    const harness = localHarness();
    const original = await harness.consensus();
    harness.consensus = async () => ({ ...original, ...incorrect });
    await expect(runFailureDrills(harness)).rejects.toThrow();
  });

  it('rejects an unfunded void-round drill', async () => {
    const harness = localHarness();
    harness.voidRound = async () => ({ void: true, bountyBefore: '0', bountyAfter: '0', rewardsAccrued: '0', nonRevealSlashApplied: true });
    await expect(runFailureDrills(harness)).rejects.toThrow();
  });

  it('rejects duplicated or slashed honest critics instead of counting list entries', async () => {
    const harness = localHarness();
    harness.consensus = async () => ({ median: 72, honest: ['balanced-1', 'balanced-1', 'bribed'], slashed: [{ critic: 'lazy-copier', amount: '1' }, { critic: 'bribed', amount: '1' }] });
    await expect(runFailureDrills(harness)).rejects.toThrow();
  });

  it('rejects invalid medians and negative void-round balances', async () => {
    const harness = localHarness();
    const original = await harness.consensus();
    harness.consensus = async () => ({ ...original, median: NaN });
    await expect(runFailureDrills(harness)).rejects.toThrow();
    harness.consensus = async () => original;
    harness.voidRound = async () => ({ void: true, bountyBefore: '-20', bountyAfter: '-20', rewardsAccrued: '0', nonRevealSlashApplied: true });
    await expect(runFailureDrills(harness)).rejects.toThrow();
  });
  it('asserts slashing, void round, all World denial paths, and safe outage stop', async () => {
    const result = await runFailureDrills(localHarness());
    expect(result.map(drill => drill.name)).toEqual(['critic slashing', 'void round', 'World denials', 'service outage safe stop']);
  });

  it('reports the timing scope as failure drills rather than a full demo rehearsal', async () => {
    const result = await rehearseDemo(localHarness());
    expect(result).toHaveProperty('scope', 'failure-drills');
    expect(result.elapsedSeconds).toBeLessThan(240);
    expect(result.drills).toHaveLength(4);
  });
});
