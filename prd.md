# PRD: Incentivised Honest-Review Layer for an Agent Services Marketplace

Status: pre-build. ETHGlobal Mumbai 2026 (from scratch). Repo name: `skeptique`.

## 1. Problem

Agents can already list and buy services (inference, skills, API calls) per call. In a marketplace flooded with listings, a buyer agent has no trustworthy way to decide which service to use.

Today's proxies:
- Human-style ratings (RapidAPI, GPT Store): gameable, no stake, no penalty for lying.
- Usage/popularity ranking: rewards first movers and marketing, not quality. Coinbase's x402 Bazaar appears to rank on usage and metadata signals (distinct buyers, successful transactions, recency, metadata quality); sources disagree and the formula is not confirmed.
- Bittensor validators and UMA-style staked reporting: the closest mechanism-design ancestors (agents score agents, honest reporters rewarded, divergent ones slashed).
- Open feedback registries (ERC-8004 reputation registry): record feedback but, as far as we know, give no reason to leave costly, critical, honest reviews. Verify this before pitching it.

## 2. Idea

An incentive layer that pays dedicated critic agents to test services and rate them honestly, so buyer agents can choose using grounded, stake-backed scores.

Positioning (after mentor feedback): not "another marketplace". It is the incentive layer for reviews on top of x402 payments, Bazaar-style discovery, x402-attest receipts and ERC-8004 identity/reputation.

## 3. Decisions from the grill session

| # | Decision | Choice |
|---|---|---|
| Q1 | Scope | Hackathon-scoped: smallest mechanism that is novel and demoable on-chain |
| Q2 | Ground truth for "honest" | Stake-weighted consensus among independent critics (Bittensor/UMA style) |
| Q3 | Who reviews | Dedicated critic agents who stake, a separate role from buyers |
| Q4 | What is sold | Services with some automatable correctness check (code/tool agents, structured-task APIs). Purely subjective services are out of v1 |
| Q5 | What a critic does | Actually calls the service with test inputs and scores real output: known-answer tests plus an LLM-judge rubric where no single answer exists |
| Q6 | Consensus | Stake-weighted median |
| Q7 | Sybil/collusion | Bonded stake to register; slash critics who diverge from the final median beyond a tolerance |
| Q8 | Reward funding | Seller-funded listing fee forms a bounty pool paid to critics |
| Q9 | Cold start | New services get a mandatory probation batch of critic reviews funded by the listing fee; scores show a sample-size/confidence indicator; new critics join with minimum stake, reputation adjusts reward share after a few rounds |

Confirmed: critic registration is gated with World ID Agent Pass, one critic agent per person, so one human cannot run many critics. This strengthens Q7 beyond stake alone.

## 4. Sponsor tracks

Source: the ETHGlobal Mumbai prizes page. The three-pick cap is inferred from Arkiv's wording ("does not use another of your three picks"); it is not in the ETHGlobal rules text we fetched. Confirm at the desk, including whether it counts sponsors or individual prizes.

Recommended three:

| Sponsor / track | Prize | Fit | Must show |
|---|---|---|---|
| Hedera: AI Agents That Pay (x402) | $6,500, 3 winners | Agent marketplace, discover/compare/pay; extra points for ERC-8004/HCS-14 reputation and an HCS audit log | An x402 endpoint settling on Hedera, an agent completing a paid request end to end, public repo, demo of 5 min or less linking to HashScan |
| ENS: Best Use of ENSv2 | $7,000, 4 winners | Services/critics as subnames; Permissioned Resolver plus Enhanced Access Control so only the consensus contract writes the score record | ENSv2 central, mainnet or Sepolia, functional demo without hard-coded values, live link, open source |
| World: Agent Pass | $5,000, 3 winners | Human-backed critic registration against sybils | Full verification journey plus a denied/expired path, secure backend validation, integration feedback. Proofs are mocked at this event |

Considered and not picked:
- 0G, Agents That Pay for Themselves ($2,000): fits (critics pay their own inference) but needs a second chain, small, paid at 0G's discretion. Swap candidate for World.
- Arc: contracts prize must be built in Arc Studio; consumer prize wants a mobile consumer app.
- Whitechain Scale ($3,000): overlaps Hedera on x402.
- Chainlink CRE ($1,500): cheap but would use a pick.
- Arkiv: decent fit for expiring review rounds, heavy docs requirements.

Universal requirements: from-scratch repo, steady commit history, AI-use disclosure.

## 4.1 Exact guidelines we must satisfy

Read from the ETHGlobal Mumbai prizes page and ethglobal.com/rules. This section is the source of truth; `spec/04-compliance-checklist.md` maps each line to a build card.

### Which prize inside each sponsor (wrong pick = disqualified)
- Hedera: **"AI Agents That Pay: x402 on Hedera"** ($6,500). Not Tokenize, not "No Solidity Allowed", not the Continuity prize.
- ENS: **"Best Use of ENSv2"** ($7,000). The "Best Integration of ENSv2 into an Existing Project" prize is Continuity-only: do not enter it.
- World: **"World ID Agent Pass" $5,000** (1st $2,500, 2nd $1,500, 3rd $1,000). The $2,500 Agent Pass prize is Continuity-only: do not enter it. IDKit prizes are a different track: not ours.

### ETHGlobal general rules
- Classic "From Scratch" track: begin the project at event kick-off. Pre-existing project-specific code, designs or assets are not allowed; using them makes us ineligible for Partner prizes and the Finalist category.
- Use version control throughout. Repos with single commits of large files and no history are assumed unqualified. Never squash; commit small and often.
- Disclose any pre-existing work in writing and in the submission (repo history, video, description). Undisclosed pre-existing work or misrepresentation can mean disqualification, revoked prizes and a ban.
- Submit before the submission deadline; in-person events require physical presence and check-in.
- Third-party partner APIs/software are subject to their own licences. Open-source libraries (x402, ENS, World SDKs) are fine to use; only our project-specific work must be new.
- Not found in the rules text we read: the three-partner-pick cap and an AI-use disclosure rule. Both come only from Arkiv's page wording. We disclose AI use anyway (`AI_USAGE.md`) and confirm the cap with staff when convenient.

### Hedera: AI Agents That Pay: x402 on Hedera
Qualification (all required):
1. At least one x402-protected endpoint that settles on Hedera testnet or mainnet through a facilitator listed in the Hedera docs (Official x402, Ax402, or Blocky402) or one we run ourselves.
2. An agent or client that finds the endpoint and completes at least one paid request end to end, **with no human approving**.
3. Public GitHub repo with a README covering setup, architecture and the payment flow, **including the Hedera transaction ID of at least one settled payment**.
4. Demo video of 5 minutes or less that shows a payment settling and **links to it on HashScan**.

Extra points (we target all that are cheap): agent spending controls (budgets, per-merchant limits, allowlists, human approval above a set amount); agent identity/reputation via HCS-14 or ERC-8004; an HCS topic as a tamper-evident audit log of agent spending; A2A/ACP negotiation before payment; settling in an HTS token such as USDC or using HTS custom fees to split revenue; scheduled-transaction subscriptions; Hedera Agent Kit or Hedera Network MCP.

Their own idea list names "an agent marketplace where agents hire other agents" and agents that "discover, compare, and pay for those services on their own".

### ENS: Best Use of ENSv2
Prize: 1st $3,000, 2nd $2,000, 3rd $1,000, 3rd $1,000.
Qualification:
- Built on ENSv2 on Ethereum mainnet or Sepolia.
- ENSv2 features must be **central to the product, not a cosmetic add-on**.
- The demo must be functional and **not include hard-coded values**.
- Submission showcase must link to a **live demo**; code must be **open source** on GitHub or similar.

What they reward: the new hierarchical registry, subname registries, wildcard resolution, Enhanced Access Control (role-based delegation, e.g. letting an account edit only certain text records), Permissioned Resolvers, record/namespace aliasing, expiring/revocable/non-transferable subnames. Bonus points for AI agents: "agents as namespaces, each with their own identity and permissions". Resources they list: Agent Text Records (ENSIP-26), AI Agent Registry ENS Name Verification (ENSIP-25), agent-native ens-cli.

### World: World ID Agent Pass ($5,000)
Note on the page: proofs are mocked right now (fake identities); do not rely on them for production. No sandbox app needed.
Strong submissions show "a meaningful action that needs a human identity or approval layer, not simply a login screen added to an existing product".
Qualification (all required):
1. Integrate with the **official World ID Agent Pass** (auth.world.org).
2. Demonstrate the complete journey: identity/verification request, user completion, validated result, and the protected application or agent action.
3. Demonstrate a **denied, expired, cancelled or otherwise unsuccessful path** where the protected action does not occur.
4. Validate identity results in a **secure backend**; do not expose client secrets or treat an unvalidated client response as authorization.
5. Include a short **integration debrief/feedback**: time to first success, friction encountered, missing capability or documentation, and the one improvement with the greatest impact (`WORLD_FEEDBACK.md`; start a timer at first touch).

Our protected action: registering a critic agent (staking and entering review rounds). Denied path: unverified human, expired proof, or a second critic from the same human.

## 5. Mentor feedback

- Mentor 1 dismissed the idea as already built and pointed to x402-attest, "EIP-8002" and x402 Bazaar, without hearing the full idea.
  - x402-attest: SDK producing tamper-evident receipts for paid calls (proves a purchase, not quality). Complementary; usable as a verified-buyer proof for reviewers. Only search snippets were read.
  - EIP-8002 is a Bitcoin payment-verification gateway, unrelated. Likely meant ERC-8004 (identity, reputation, validation registries), which does overlap.
  - x402 Bazaar: usage-based discovery; an open issue (x402-foundation/x402 #1277) proposes a reputation layer, which suggests the gap is real.
- Mentor 2 liked the idea.

## 6. Risks

- If the pitch reads as "ERC-8004 reputation registry plus a bond", judges may see it as thin. Need one sentence on why stake-weighted median consensus with grounded testing is more than that.
- ERC-8004's reputation and validation sections and issue #1277 have not been read in detail.
- Cross-chain sprawl: each sponsor wants settlement on its own chain; keep one primary settlement chain.
- Consensus cold start and critic cost: critics pay real per-call cost to test services.

## 7. Open items

1. Done: spec-kit in `spec/` and kanban board in `board/` (see section 8). Next: run the board.
2. Humans must do card H-01 (accounts, keys, funding) before agents can touch testnets.
3. Defaults chosen in `spec/01-architecture.md` (money on Hedera, ENS on Sepolia via a relayer, HBAR for stakes). Veto there if wrong.

Deprioritised by the team (not blocking): confirming the pick cap with ETHGlobal staff, checking the `skeptique` GitHub/`.eth` availability, and reading ERC-8004 and issue #1277 for a precise gap statement.

## 8. 30-hour product scope and incentive refinements

Goal: a real, polished, working product in about 30 hours, not a bare demo. Time is available for polish, feedback and iteration.

Incentive loop (rough version, to be refined later):
- The seller who lists a service funds a bounty pool, because the seller wants good reviews to get sales.
- Per-call payments (critic test calls and buyer purchases) use the Hedera x402 standard.
- Critics whose scores land near the stake-weighted median are rewarded; outliers are slashed.

Refinements so the loop is not exploitable:
1. The seller funds the pool but must not influence results: the bounty pays for closeness to consensus, never positivity; the fee is non-refundable once a round opens; the seller cannot pick critics or see scores before finalisation.
2. Herding: commit-reveal so critics cannot copy each other, and scores come from real test runs with evidence hashes.
3. Test-call costs: the bounty reimburses critics' x402 test costs plus a reward. Seller-to-critic payment circularity must not inflate usage-based ranking.
4. World ID limits one critic agent per person; it does not stop a seller bribing a real person. Stake and slashing against the median is the defence. Do not claim sybil-proof.

Demo honesty: if the team runs the critics, the consensus is staged. The demo says so and shows the mechanism acting (a lazy critic gets slashed, a suite-gaming service is exposed by critics' own probe tests).

Working-product definition: 5 real demo services (including a bad actor and a suite-gamer), 4-5 LLM-driven critic agents, commit-reveal rounds with real Hedera x402 payments, a buyer agent that chooses by score and explains why, ENS records for scores, an HCS audit log, World-ID-gated critic onboarding with a denied path, and a polished web UI.

Spec-kit: `AGENTS.md` (agent rules), `spec/` (architecture, mechanism, interfaces, compliance checklist, demo script), `board/` (kanban cards, dependency graph and `status.mjs`).
