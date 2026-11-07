# Skeptique demo video: script and screen guide (target 3:45, hard cap 4:00)

Rules from ticket 33: real narration, no music over narration, not sped up, 720p or better, intro under 20 s, no secrets on screen. Record the screen at 1080p with your own mic.

## Pre-record checklist (5 min)
- Browser tabs open in this order: (1) https://skeptique.vercel.app/ (2) http://localhost:3000/arena (3) HashScan tx tab (4) `docs/arena.md` on GitHub.
- HashScan tabs pre-loaded:
  - Without Skeptique (paid the suite-gamer, answer 630000 ETH): https://hashscan.io/testnet/transaction/0.0.9185802@1794014115.000823419
  - With Skeptique (paid unit-convert, answer 0.00063 ETH): https://hashscan.io/testnet/transaction/0.0.9185802@1794014112.716860391
  - Critic payment: https://hashscan.io/testnet/transaction/0.0.9185802@1793963896.847912784
- Hide: `.env`, terminal history, any key. Close Slack/notifications.
- Dark or light theme, either, but zoom the browser to 125% so text is readable.

## How to start the local stack (verified on this checkout; Vercel has no API behind it)
Use three terminals from the repo root. `apps/arena/.env` is a gitignored copy of the root `.env`.

1. Arena plus a seeded local market (about 2 min to boot, prints `arena on http://127.0.0.1:4320`):
```sh
cd apps/arena && set -a && . ./.env && set +a && pnpm live
```
2. Web app, pointed at the API port printed as `local market api http://127.0.0.1:<port>`:
```sh
cd apps/web && NEXT_PUBLIC_API_URL=http://127.0.0.1:<port> NEXT_PUBLIC_ARENA_URL=http://127.0.0.1:4320 pnpm dev
```
3. Open http://localhost:3000. The marketplace shows unit-convert 94, fx-reference 94, flaky-fx 61, suite-gamer 34 (verified).

Needed for a live Arena run: the `claude` CLI must be on PATH (`npm i -g @anthropic-ai/claude-code`, then log in). It was missing on the machine where this was checked, so a live run hung. If you cannot fix that in a few minutes, do not run live: narrate the Arena beat over the saved results in `docs/arena.md` and the three HashScan tabs.

## Script

| Time | Screen | Say (read it naturally, in your own words) |
|---|---|---|
| 0:00-0:18 | Vercel home page (marketplace), then `/limits` banner "Demo mode" visible | "Agents are starting to sell services to other agents, and buyer agents have no way to know which ones are good. Today they pick by price and popularity. We built Skeptique: critic agents, backed by a stake and a verified human, test services and get paid for honest ratings. Buyer agents pick by those ratings." |
| 0:18-0:45 | Marketplace list: scores, confidence, probation badge. Click `suite-gamer` then `unit-convert` service pages | "Here are agent services ranked by critic consensus. This one, suite-gamer, passes every public test but fails private probes the critics wrote themselves, so its score collapses to 40. unit-convert scores 100. A popularity ranking would not tell you that." |
| 0:45-1:15 | `/sell` page, then service page showing the ENS name and score | "A seller lists a service and locks a fee as the review bounty. Listing opens a review round and creates an ENS subname for the service. The score is not hard-coded: the web reads it back from the ENS resolver on Sepolia, and only a role-limited relayer can write it." |
| 1:15-1:50 | `/critics` onboarding, World verification, show denied path (second critic from same human, tampered proof) | "To become a critic you prove you are a unique human with World ID. The backend validates the proof and issues a wallet-bound voucher. A second critic from the same human is denied, and so is a tampered proof. Then the critic stakes." |
| 1:50-2:20 | Service page "rounds" timeline, then the HashScan critic payment tab | "Critics call the service through x402 and pay for it on Hedera, no human approving. Here is one settling on HashScan. They run the public suite plus private probes, commit a hashed score, then reveal. The contract takes a stake-weighted median and slashes outliers." |
| 2:20-3:25 | `/arena`: pick the "21,000 gas at 30 gwei" task, press run (or show the saved batch result). Show both cards side by side. Open both HashScan tabs | "This is the proof it matters. Same model, same prompt, same budget, two buyer agents. Left has no Skeptique. Right sees the review scores and a spend policy. Both pay real x402 on Hedera testnet. Left paid the suite-gamer and was told a gas fee of 630,000 ETH. Right paid unit-convert and got 0.00063. Over two live batches, 38 paid parts per side: without Skeptique 66 percent correct and a third of spend wasted; with Skeptique 100 percent and nothing wasted. A deterministic oracle grades it, not an LLM." |
| 3:25-3:40 | `/buyer` page: spend limits form and approval queue | "Buyers set spend caps. Anything over the threshold waits in an approval queue; everything under it pays automatically." |
| 3:40-4:00 | `/limits` page | "Honest limits: agreement is not ground truth, a majority of stake can collude, the critics in this demo are run by our team, rewards and the Hedera audit log are not finished. Skeptique: pay critics to be honest so agents can pick what is good. Thanks." |

## If something breaks while recording
- Arena run fails or is slow: show the saved results in `docs/arena.md` and the two HashScan tabs; say "recorded live batch".
- Vercel marketplace shows "Loading services": the deploy has no API behind it. Record the marketplace pages from the local stack instead (`pnpm --filter @skeptique/web dev` with `NEXT_PUBLIC_API_URL` pointing at the local API).
- Do not claim the full integrated journey (World to Hedera to ENS to buyer) ran end to end live. The README says ticket 27 is pending. Say each piece has recorded evidence.
