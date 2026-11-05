# 04 Compliance checklist

Source of truth for wording: `prd.md` section 4.1. Tick a box only with evidence (link/command). Owner column = the card that produces the evidence.

## ETHGlobal general
- [ ] Project began at kick-off; no pre-existing project code/design/assets (P-7 verifies git history). Owner: all
- [ ] Steady commit history, no giant single commit, no squash. Owner: T-02, P-7
- [ ] Any pre-existing/third-party material disclosed in README. Owner: P-1
- [ ] AI use disclosed (`AI_USAGE.md`). Owner: P-6
- [ ] Submitted before deadline, physically checked in. Owner: P-7 (human)
- [ ] Public repo, MIT licence. Owner: T-00

## Hedera: AI Agents That Pay: x402
- [ ] x402-protected endpoint settles on Hedera testnet/mainnet through a listed facilitator or our own. Owner: S-01, B-1
- [ ] Agent completes a paid request end to end with **no human approving**. Owner: E-3, I-2
- [ ] README has setup, architecture, payment flow and the **Hedera tx ID** of a settled payment. Owner: P-1
- [ ] Demo video <= 5 min, payment settling shown, **HashScan link**. Owner: P-5
- [ ] Extra: spending controls (budget, per-merchant cap, allowlist, approval threshold). Owner: E-4, F-8
- [ ] Extra: HCS audit log of spending. Owner: D-4
- [ ] Extra: agent reputation (our registry; mention HCS-14/ERC-8004 in README, adopt if cheap). Owner: P-1
- [ ] Extra: Hedera Agent Kit / Network MCP used. Owner: E-6 (optional)
- [ ] Extra: settle in HTS token (USDC) if S-01 allows. Owner: S-01 note

## ENS: Best Use of ENSv2
- [ ] Built on ENSv2 on Sepolia (or mainnet). Owner: S-02, D-2
- [ ] ENSv2 central: subname registries, Permissioned Resolver and Enhanced Access Control roles (seller edits own records only; relayer writes score records). Owner: D-2, D-3
- [ ] Demo functional, **no hard-coded values** (UI reads records through resolver). Owner: D-5, F-2
- [ ] Live demo link in showcase. Owner: P-8
- [ ] Open source on GitHub. Owner: T-00
- [ ] Bonus: agents as namespaces (critic and service subnames with permissions). Owner: D-2

## World: World ID Agent Pass ($5,000 track)
- [ ] Official Agent Pass integrated. Owner: S-03, D-1
- [ ] Full journey: request, completion, validated result, protected action (critic registration). Owner: D-1, F-6
- [ ] Denied/expired/cancelled path where the protected action does not occur. Owner: D-1, F-6, I-4
- [ ] Validation in a secure backend, no client secrets, client response not trusted. Owner: D-1
- [ ] Integration debrief `WORLD_FEEDBACK.md` (time to first success, friction, missing docs, top improvement). Owner: S-03 starts the timer, P-3 writes
- [ ] Submitted to the $5,000 Agent Pass prize, not the Continuity-only $2,500 one. Owner: P-7

## Wrong-prize traps
- [ ] Hedera: submitted to "AI Agents That Pay: x402", not Tokenize/No-Solidity/Continuity.
- [ ] ENS: submitted to "Best Use of ENSv2", not the Continuity-only integration prize.
- [ ] World: not submitted to IDKit or Continuity prizes.
