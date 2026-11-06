import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';
import { z } from 'zod';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uintString = z.string().regex(/^(0|[1-9]\d*)$/);
const uint = z.number().int().nonnegative();
const score = z.number().int().min(0).max(100);

export const TestCaseSchema = z.object({
  id: z.string().min(1),
  input: z.unknown(),
  expect: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exact'), value: z.unknown() }).strict(),
    z.object({ kind: z.literal('schema'), schema: z.record(z.string(), z.unknown()) }).strict(),
    z.object({ kind: z.literal('regex'), pattern: z.string() }).strict(),
    z.object({ kind: z.literal('judge'), rubric: z.string().min(1) }).strict(),
  ]),
  weight: z.number().positive().finite(),
}).strict();
export type TestCase = z.infer<typeof TestCaseSchema>;

export const TestSuiteSchema = z.object({
  version: z.literal(1),
  serviceName: z.string().min(1),
  category: z.string().min(1),
  determinism: z.enum(['none', 'llm']),
  cases: z.array(TestCaseSchema).min(1),
}).strict().superRefine((suite, context) => {
  const ids = new Set<string>();
  for (const [index, testCase] of suite.cases.entries()) {
    if (ids.has(testCase.id)) {
      context.addIssue({ code: 'custom', path: ['cases', index, 'id'], message: 'Duplicate case ID' });
    }
    ids.add(testCase.id);
  }
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;

// Evidence result fields complete the otherwise undefined CaseResult and ProbeResult
// references in spec/03. Probe results retain the generated case for later inspection.
export const CaseResultSchema = z.object({
  caseId: z.string().min(1),
  passed: z.boolean(),
  weight: z.number().positive().finite(),
  latencyMs: z.number().nonnegative().finite(),
  error: z.string().optional(),
});
export type CaseResult = z.infer<typeof CaseResultSchema>;

export const ProbeResultSchema = CaseResultSchema.extend({ case: TestCaseSchema });
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const EvidenceSchema = z.object({
  roundId: uint,
  critic: address,
  suite: z.array(CaseResultSchema),
  probes: z.array(ProbeResultSchema),
  latencyMs: z.object({ p50: z.number().nonnegative().finite(), p95: z.number().nonnegative().finite() }).refine(v => v.p95 >= v.p50),
  x402Txs: z.array(z.string().min(1)),
  claimedCost: uintString,
  score,
  model: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ServiceViewSchema = z.object({
  id: uint,
  name: z.string().min(1),
  category: z.string().min(1),
  endpoint: z.string().min(1),
  pricePerCall: uintString,
  seller: address,
  ensName: z.string(),
  median: score.nullable(),
  confidence: z.number().min(0).max(1),
  rank: z.number().finite(),
  nRounds: uint,
  lastRoundAt: z.string().nullable(),
  popularityCalls: uint,
});
export type ServiceView = z.infer<typeof ServiceViewSchema>;

export const RoundViewSchema = z.object({
  id: uint,
  serviceId: uint,
  phase: z.enum(['commit', 'reveal', 'finalizable', 'finalized', 'void']),
  commitEnd: z.string(),
  revealEnd: z.string(),
  median: score.nullable(),
  reveals: z.array(z.object({ critic: address, score, honest: z.boolean().nullable() })),
});
export type RoundView = z.infer<typeof RoundViewSchema>;

// S_MIN and MIN_LISTING_FEE are denominated in HBAR here. Deployment code must
// convert them using the Hedera unit notes before passing values to contracts.
export const RoundConfigSchema = z.object({
  K_MIN: z.number().int().min(1),
  K_MAX: z.number().int().min(1),
  S_MIN: z.number().positive().finite(),
  COMMIT_SECS: z.number().int().positive(),
  REVEAL_SECS: z.number().int().positive(),
  TOLERANCE: score,
  SLASH_BPS: z.number().int().min(0).max(10_000),
  NOREVEAL_SLASH_BPS: z.number().int().min(0).max(10_000),
  MIN_LISTING_FEE: z.number().positive().finite(),
  WITHDRAW_COOLDOWN: uint,
}).refine(config => config.K_MIN <= config.K_MAX, { path: ['K_MIN'], message: 'K_MIN must not exceed K_MAX' });
export type RoundConfig = z.infer<typeof RoundConfigSchema>;

export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  K_MIN: 3,
  K_MAX: 7,
  S_MIN: 5,
  COMMIT_SECS: 600,
  REVEAL_SECS: 300,
  TOLERANCE: 10,
  SLASH_BPS: 2000,
  NOREVEAL_SLASH_BPS: 1000,
  MIN_LISTING_FEE: 20,
  WITHDRAW_COOLDOWN: 300,
};

export function suiteHash(input: TestSuite): `0x${string}` {
  const suite = TestSuiteSchema.parse(input);
  const json = canonicalize(suite);
  if (json === undefined) throw new Error('Suite cannot be canonicalized');
  return `0x${createHash('sha256').update(json).digest('hex')}`;
}

export const CommitmentInputSchema = z.object({ score, salt: bytes32, evidenceHash: bytes32, critic: address });
export type CommitmentInput = z.infer<typeof CommitmentInputSchema>;

export function commitmentHash(input: CommitmentInput): `0x${string}` {
  const value = CommitmentInputSchema.parse(input);
  return keccak256(encodeAbiParameters(
    parseAbiParameters('uint8, bytes32, bytes32, address'),
    [value.score, value.salt as `0x${string}`, value.evidenceHash as `0x${string}`, value.critic as `0x${string}`],
  ));
}

// Fixed Solidity test vector: keccak256(abi.encode(uint8(73), bytes32(0x11…11),
// bytes32(0x22…22), address(0x0000000000000000000000000000000000000001))).
export const commitmentVector = {
  input: {
    score: 73,
    salt: `0x${'11'.repeat(32)}`,
    evidenceHash: `0x${'22'.repeat(32)}`,
    critic: '0x0000000000000000000000000000000000000001',
  },
  expected: '0x0069e7b76594a9ca34a952412e27dbe6a57c31a993aa09431c1a7cccc0502afc',
} as const;

export { rankMarketplaceServices, rankService, rankServices } from './ranking';
export type { RankedService, RankingInput } from './ranking';

export const EventSchemas = {
  ServiceListed: z.object({ serviceId: uint, seller: address, specHash: bytes32, endpoint: z.string(), pricePerCall: uintString, ensNode: bytes32 }),
  BountyToppedUp: z.object({ serviceId: uint, amount: uintString }),
  CriticRegistered: z.object({ critic: address, nullifier: bytes32, stake: uintString }),
  CriticSlashed: z.object({ critic: address, roundId: uint, amount: uintString, reason: z.string().min(1) }),
  RoundOpened: z.object({ roundId: uint, serviceId: uint, commitEnd: uint, revealEnd: uint }),
  CriticCommitted: z.object({ roundId: uint, critic: address }),
  CriticRevealed: z.object({ roundId: uint, critic: address, score, evidenceHash: bytes32 }),
  RoundFinalized: z.object({ roundId: uint, serviceId: uint, median: score, nReveals: uint, void: z.boolean() }),
  RewardAccrued: z.object({ roundId: uint, critic: address, amount: uintString }),
} as const;

const addr = '0x0000000000000000000000000000000000000001';
const hash = `0x${'11'.repeat(32)}`;
export const eventFixtures = {
  ServiceListed: { serviceId: 1, seller: addr, specHash: hash, endpoint: 'http://localhost:3000/call', pricePerCall: '1', ensNode: hash },
  BountyToppedUp: { serviceId: 1, amount: '20' },
  CriticRegistered: { critic: addr, nullifier: hash, stake: '5' },
  CriticSlashed: { critic: addr, roundId: 1, amount: '1', reason: 'outlier' },
  RoundOpened: { roundId: 1, serviceId: 1, commitEnd: 100, revealEnd: 200 },
  CriticCommitted: { roundId: 1, critic: addr },
  CriticRevealed: { roundId: 1, critic: addr, score: 73, evidenceHash: hash },
  RoundFinalized: { roundId: 1, serviceId: 1, median: 73, nReveals: 3, void: false },
  RewardAccrued: { roundId: 1, critic: addr, amount: '1' },
} as const;
