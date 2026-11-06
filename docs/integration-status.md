# Integration status and follow-up workflow

The consolidation integrates ticket 14's funded round lifecycle, tickets 18–21's evidence/ranking/ENS/deployment stack and the previously stacked PR merge history into current `main`. It retains the newer ticket 30 SSE stream, World onboarding and UI accessibility/loading/error work. Normal merges preserve the original commits. Remote branches are removed only after GitHub confirms their tips are ancestors of `main`.

## Integration boundaries checked

- Listing opens its first round; both local and Hedera deployers bind ServiceRegistry and RoundManager and authorize CriticRegistry stake operations. The live smoke consumes the listing's RoundOpened event rather than opening a duplicate round.
- Stake is held in CriticRegistry, locked at commit, and cannot back overlapping rounds. Concurrent service tests use separate critic pools. Successful finalization releases collateral and slashes outliers.
- API ranking uses actual finalization block timestamps, preserving ticket 19's age decay. The round timeline is a separate pinned chain view and cannot overwrite ranking history with the reveal deadline.
- Single-round and timeline endpoints include committer state. Production event/timeline scans start at the manifest deployment block; `/events` is wired in both the harness and deployed API.
- The service page retains finalized anchored evidence, public/private outcomes, linked-evidence disclaimers, ENS score reads, historical rounds and the live latest-round panel.
- Evidence publication and review lookup share one store. World CORS remains restricted to the configured web origin. Browser listing/onboarding use manifest addresses and check the wallet chain.
- ENS score publication retains per-record permissions, canonical namehash binding, atomic writes and durable signed-transaction recovery. Generated ABIs match the combined contracts.

## Remaining work

| Area | Follow-up |
| --- | --- |
| Failed-round settlement | Implement too-few-reveal void finalization, non-reveal penalties and collateral release for all committers. A failed round currently locks stake. |
| Incentives | Implement reimbursements, reward accounting and claims; the current code does not distribute bounties. |
| Runtime/storage | Complete unattended critic orchestration with model/budget/deadline controls; persist API evidence and appropriate identity state; add historical indexing beyond the relay window. |
| ENS score acceptance | Rehearse new finalized Hedera → ENS score publication on live networks and record evidence. Service subname/role/resolver live evidence already exists in receipt 12. |
| Deployment acceptance | Run a fresh funded mechanism deploy and short-window round smoke. Code integration does not establish ticket 21 live completion. |
| Ticket 27 | Demonstrate one complete sponsor journey including buyer payment and HCS audit publication. Receipt 15 already records one real settled x402 payment; receipt 16 records official World staging success/denials. |

No fabricated deployment manifests or live completion receipts are added. See the [README](../README.md) for setup and the exact distinction between local tests and recorded live evidence.

## Verification

The consolidation is validated with frozen installation, lint, workspace build, package/contract tests, Chromium web checks, end-to-end local-stack tests, HTTP-evidence settlement, repeatable fixture seeds and failure drills. Results and any environment limitations are recorded in the consolidation PR. Run web build, browser checks and the e2e suite sequentially because they share `.next`; e2e workers are bounded to avoid concurrent EVM/build startup starvation.

## Follow-up workflow

1. Sync clean `main` with `gh repo sync --source anmxlr/skeptique --branch main`.
2. Create a new branch/worktree from current `main`, one integration concern per PR. Old commits remain in history after branch deletion.
3. For an existing teammate branch, merge current `main` normally and resolve against shared schemas, ABIs and deployment manifest. Do not squash or force-push.
4. Keep offline unit fixtures and separate credential-dependent live tests. Replace adapters at their actual boundary and add a regression using the real dependency.
5. Run frozen install, lint, build, tests and applicable e2e/settlement checks. Record actual live transaction links only after funded checks succeed.
6. Add completion receipts only when the owning ticket's acceptance criteria pass. Merging implementation code does not mark missing sponsor evidence complete.
