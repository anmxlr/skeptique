// Local scenario inputs for deterministic seed and drill adapters. They do not
// constitute chain, identity, or settlement evidence.
export const demoCriticFixtures = [
  { id: 'balanced-1', address: '0x0000000000000000000000000000000000000001', nullifier: `0x${'01'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000', score: 70 },
  { id: 'balanced-2', address: '0x0000000000000000000000000000000000000002', nullifier: `0x${'02'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000', score: 72 },
  { id: 'balanced-3', address: '0x0000000000000000000000000000000000000003', nullifier: `0x${'03'.repeat(32)}`, persona: 'balanced', stake: '5000000000000000000', score: 74 },
  { id: 'lazy-copier', address: '0x0000000000000000000000000000000000000004', nullifier: `0x${'04'.repeat(32)}`, persona: 'lazy-copier', stake: '5000000000000000000', score: 0 },
  { id: 'bribed', address: '0x0000000000000000000000000000000000000005', nullifier: `0x${'05'.repeat(32)}`, persona: 'bribed', stake: '5000000000000000000', score: 100 },
] as const;

export const consensusDrillFixture = { critics: demoCriticFixtures, median: 72, tolerance: 10, slashBps: 2000 } as const;
export const voidRoundDrillFixture = { bounty: '20000000000000000000' } as const;
