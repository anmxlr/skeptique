import { describe, expect, it } from 'vitest';
import { scorePersona } from './personas';

describe('critic personas', () => {
  it('keeps balanced, strict and lenient critics near measured quality', () => {
    expect(scorePersona('balanced', 72).score).toBe(72);
    expect(scorePersona('strict', 72).score).toBe(67);
    expect(scorePersona('lenient', 72).score).toBe(77);
  });

  it('models a fixed-score lazy copier and a 25-point bribe', () => {
    expect(scorePersona('lazy-copier', 72, { lazyScore: 20 })).toMatchObject({ score: 20, testsRun: false });
    expect(scorePersona('bribed', 72).score).toBe(97);
  });

  it('rejects non-finite persona configuration instead of producing an invalid score', () => {
    expect(() => scorePersona('lazy-copier', 72, { lazyScore: NaN })).toThrow();
    expect(() => scorePersona('strict', 72, { strictPenalty: Infinity })).toThrow();
  });
});
