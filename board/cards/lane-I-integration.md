# Lane I: integration (starts when its deps merge)

## I-1 · Local end-to-end scenario
- deps: A-4, C-6, B-7, E-1, D-1
- size: M
- read: spec/05-demo-script.md
- do: script that on a local chain with fake x402 runs: list 5 services, register 5 critics (3 honest, lazy-copier, bribed), run a round, finalise; asserts median, honest/slash outcomes, rewards, and that the suite-gamer scores low.
- done when: `pnpm e2e:local` passes in under 5 minutes.

## I-2 · Testnet deploy and e2e with HashScan evidence
- deps: I-1, A-5, D-3, D-4, E-3
- size: M
- tracks: Hedera, ENS
- do: deploy to Hedera testnet, run the scenario with real x402 payments, capture tx ids and HashScan links into `docs/evidence.md`, confirm ENS records and HCS messages exist.
- done when: `docs/evidence.md` lists >= 1 settled x402 payment tx id, one finalize tx, one ENS record read, one HCS message.

## I-3 · Seed script
- deps: I-2
- size: S
- do: idempotent seed for demo state (services, critics, history, popularity counts that favour the suite-gamer).
- done when: running twice produces the same state; UI shows ranked services.

## I-4 · Failure drills
- deps: I-2, F-6
- size: M
- do: scripted drills: lazy critic slashed, bribed critic slashed, service outage mid-round, void round (< K_MIN), World denied cases, duplicate human. Each with an assertion.
- done when: `pnpm drills` passes.

## I-5 · Demo timing tuning
- deps: I-2
- size: S
- do: set demo round windows (90/45 s), rehearse the 4:30 script, note any slow step and fix or pre-record it.
- done when: dry run finishes under 4:45.
