# 04 Compliance checklist

Source of truth for wording: `prd.md` section 4.1. Tick a box only with evidence (link/command). Owner column = the ticket in `.scratch/skeptique-v1/issues/` that produces the evidence (remapped from the old lane cards on 2026-11-06).

## ETHGlobal general
- [ ] Project began at kick-off; no pre-existing project code/design/assets (34 verifies git history). Owner: all
- [ ] Steady commit history, no giant single commit, no squash. Owner: 04 (commit check), 34
- [ ] Any pre-existing/third-party material disclosed in README. Owner: 31
- [ ] AI use disclosed (`AI_USAGE.md`). Owner: 32 (compiler), 34 (final compile)
- [ ] Submitted before deadline, physically checked in. Owner: 34 (human)
- [ ] Public repo, MIT licence. Owner: 01, 04

## Hedera: AI Agents That Pay: x402
- [ ] x402-protected endpoint settles on Hedera testnet/mainnet through a listed facilitator or our own. Owner: 02, 15
- [ ] Agent completes a paid request end to end with **no human approving**. Owner: 24, 27 (testnet proof)
- [ ] README has setup, architecture, payment flow and the **Hedera tx ID** of a settled payment. Owner: 31 (tx id from 27)
- [ ] Demo video <= 5 min (we target 4:00 for ETHGlobal), payment settling shown, **HashScan link**. Owner: 33
- [ ] Extra: spending controls (budget, per-merchant cap, allowlist, approval threshold). Owner: 26
- [ ] Extra: HCS audit log of spending. Owner: 23, 26
- [ ] Extra: agent reputation (our registry; mention HCS-14/ERC-8004 in README, adopt if cheap). Owner: 31
- [ ] Extra: Hedera Agent Kit / Network MCP used. Owner: cut in planning (2026-11-06); no spike covers it
- [ ] Extra: settle in HTS token (USDC) if the x402 spike allows. Owner: 02 note, 15

## ENS: Best Use of ENSv2
- [ ] Built on ENSv2 on Sepolia (or mainnet). Owner: 03, 12
- [ ] ENSv2 central: subname registries, Permissioned Resolver and Enhanced Access Control roles (seller edits own records only; relayer writes score records). Owner: 12, 20
- [ ] Demo functional, **no hard-coded values** (UI reads records through resolver). Owner: 12, 20
- [ ] Live demo link in showcase. Owner: 29
- [ ] Open source on GitHub. Owner: 01, 04
- [ ] Bonus: agents as namespaces (critic and service subnames with permissions). Owner: 12 (services), 20 (critics)

## World: World ID Agent Pass ($5,000 track)
- [ ] Official Agent Pass integrated. Owner: 05, 16
- [ ] Full journey: request, completion, validated result, protected action (critic registration). Owner: 16
- [ ] Denied/expired/cancelled path where the protected action does not occur. Owner: 16, 28 (drills)
- [ ] Validation in a secure backend, no client secrets, client response not trusted. Owner: 16
- [ ] Integration debrief `WORLD_FEEDBACK.md` (time to first success, friction, missing docs, top improvement). Owner: 01 starts the timer, 05 keeps raw notes, 32 writes
- [ ] Submitted to the $5,000 Agent Pass prize, not the Continuity-only $2,500 one. Owner: 34

## Wrong-prize traps (Owner: 34)
- [ ] Hedera: submitted to "AI Agents That Pay: x402", not Tokenize/No-Solidity/Continuity.
- [ ] ENS: submitted to "Best Use of ENSv2", not the Continuity-only integration prize.
- [ ] World: not submitted to IDKit or Continuity prizes.
