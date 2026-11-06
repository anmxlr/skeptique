# 27: Testnet end to end, evidence captured

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera, ENS, World
**Blocked by:** 13, 15, 16, 20, 21, 22, 26, 35, 36, 37
**Read:** spec/05-demo-script.md, spec/04-compliance-checklist.md

**What to build:** The whole demo story runs once on real networks, and the proof is written down:
1. Services listed on Hedera testnet, with subnames on Sepolia.
2. A World-verified critic and the demo personas registered.
3. A round with real x402 test payments, finalised.
4. Scores written to ENS.
5. Audit messages on HCS.
6. The buyer paying unattended, plus one approved over-threshold payment.

The run is a script that collects every tx id, HashScan link, ENS read and HCS message into an evidence document for the README and the submission.

## Acceptance criteria
- [ ] The evidence lists at least one settled x402 payment tx id, one finalise tx, one ENS record read through the resolver, one HCS message, and one unattended buyer payment, each with its link.
- [ ] Any step that fails is recorded with its error rather than skipped silently.
- [ ] Done when: `pnpm test:live -t "testnet end to end"` passes and the evidence document is committed.

Receipt: `board/done/27.md`
