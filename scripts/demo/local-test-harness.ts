import type { DrillHarness } from './drills';

// Local fixture only. Replace these adapters with the 07/27 stack before the
// ticket is marked done or the demo results are presented as integration proof.
export function createLocalTestHarness(): DrillHarness {
  return {
    async consensus() {
      return {
        median: 72,
        honest: ['balanced-1', 'balanced-2', 'balanced-3'],
        slashed: [{ critic: 'lazy-copier', amount: '1000000000000000000' }, { critic: 'bribed', amount: '1000000000000000000' }],
      };
    },
    async voidRound() {
      return { void: true, bountyBefore: '20', bountyAfter: '20', rewardsAccrued: '0', nonRevealSlashApplied: true };
    },
    async worldDenial(path) {
      return { path, denied: true, registrationOccurred: false };
    },
    async serviceOutage() {
      return { stopped: true, scoreSubmitted: false, pendingRevealPreserved: true };
    },
  };
}
