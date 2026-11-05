# ETHGlobal Mumbai: sponsors and prizes (primary-source research)

Researched 2026-11-05 (the event's first day) from ethglobal.com pages and sponsor docs. Every claim is followed by its source URL. Amounts are USDC, paid by ETHGlobal, per https://ethglobal.com/events/mumbai/prizes.

## 0. Event identity

- An event literally named "ETHGlobal Mumbai" exists, so no closest-match substitution was needed. Source: https://ethglobal.com/events (path `/events/mumbai`).
- Dates: the events list shows "Nov 5-7 (Thu-Sat)"; year is not printed there, but weekdays match 2026. The submission page confirms 2026. Source: https://ethglobal.com/events and https://ethglobal.com/events/mumbai/info/details
- Submission deadline: "Saturday, November 7th 2026" at "09:00 am IST"; late submissions not accepted. Source: https://ethglobal.com/events/mumbai/info/details
- A separate conference, Pragma Mumbai (Nov 6, 2026), is also listed; it is not the hackathon. Source: https://ethglobal.com/events
- Venue: not stated on the details page. Source: https://ethglobal.com/events/mumbai/info/details. The main page https://ethglobal.com/events/mumbai returned HTTP 500 (twice), so it was not read.
- Team size: the details page does not state limits. The finalist prize table is per team size of solo, 2, and 3-5 people (see section 1), which hints at a max of 5 but is not an explicit rule. Source: https://ethglobal.com/events/mumbai/prizes

### Submission rules (as written on https://ethglobal.com/events/mumbai/info/details)
- Submit via the Hacker Dashboard: project title, description, repo link.
- Two paths: "Finalist and Partner Prizes" or "Partner Prizes only".
- Up to 3 Partner Prizes can be selected; multiple tracks from one partner count as one prize.
- Provide GitHub repo/Figma or equivalent proof the work was done during the hackathon. Use version control throughout; large single commits or missing history may lead to disqualification. Clearly separate new work from reused code.
- Classic "From Scratch" track: work must start after the official start; earlier project-specific work is only allowed from public libraries or starter kits. Pre-event projects are ineligible for Partner Prizes and Finalist.
- Continuity tracks: you may build on an existing codebase, but must document pre-existing work and include new features built during the hackathon.
- AI: allowed but must be documented (which files/assets). AI should assist, not generate the whole project; projects relying entirely on AI may be ineligible. Spec-driven workflows are allowed if you include all spec files, prompts and planning artifacts in the repo.
- Demo video: optional but encouraged; 2-4 min, at least 720p; no sped-up video, no text-to-speech/AI voiceover, no mobile-phone recording, no background music in place of narration; intro under ~20 s.
- Finalist judging: 7 minutes per team (4 demo + 3 Q&A). Criteria: Technicality, Originality, Practicality, Usability (UI/UX/DX), WOW Factor.
- Partner judging is based on submitted materials; visiting booths is optional.

## 1. ETHGlobal Finalist prizes (all teams eligible via the Finalist path)
Source: https://ethglobal.com/events/mumbai/prizes
- Per person: solo 250 USDC (no travel); 2 people 250 USDC + 250 USDC travel; 3-5 people 1,000 USDC + 500 USDC travel. Travel is usable toward one in-person ETHGlobal hackathon within 365 days.
- Finalist Pack: $828 off ETHGlobal Plus, finalist hoodie, $10,000 AWS credits.
- Search-result snippet says top 10 teams are finalists (Source: web search result for https://ethglobal.com/events/mumbai/prizes); I did not see that number verbatim in the page fetch.

## 2. Prize pools at a glance

Totals per https://ethglobal.com/events/mumbai/prizes (World and 1inch totals are the sum of their listed tracks).

| Sponsor | Total | Notes |
|---|---|---|
| World | $12,500 | 4 tracks, 2 are Continuity |
| 1inch | $7,000 | Aqua app only, DeFi-heavy |
| 0G | $15,000 | 4 tracks, 1 Continuity |
| Uniswap Foundation | $15,000 | $10k open + $5k Continuity |
| Arc | $15,000 | 5 tracks of $3k, must start in Arc Studio |
| Hedera | $15,000 | 4 tracks, 1 Continuity |
| Arkiv | $15,000 | 6 tracks, 2 Continuity |
| Whitechain | $15,000 | 4 tracks, 1 Continuity |
| Ethereum Foundation | $15,000 | 4 tracks, 1 Continuity |
| ENS | $10,000 | $7k open + $3k Continuity |
| Definitive | $5,000 | 1 open ($2.5k) + 1 Continuity ($2.5k) |
| Chainlink | $5,000 | CRE $1.5k + CCIP $3.5k |

Continuity = only for teams extending an existing project; a from-scratch team cannot win these. Open tracks (non-Continuity) are the relevant ones for a new project.

## 3. Per-sponsor detail

Per-sponsor pages: `https://ethglobal.com/events/mumbai/prizes/<slug>` (slugs: world, 1inch, 0g, uniswap-foundation, arc, hedera, arkiv, whitechain, ethereum-foundation, ens, definitive, chainlink). Unless a line cites otherwise, the source is that page; the index https://ethglobal.com/events/mumbai/prizes was the main fetch.

### World ($12,500) https://ethglobal.com/events/mumbai/prizes/world
Product (own docs): World ID is "Anonymous Proof of Human" you can add to a website/app. The docs page also references AgentKit, distinguishing human-backed agents from bots. IDKit and Agent Pass were not defined on the docs home I fetched. Source: https://docs.world.org

- **World ID Agent Pass, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000). Requirements: integrate the official Agent Pass; show full journey (request, user completion, validated result, protected action); show a denied/expired/cancelled path where the action does not occur; validate in a secure backend without exposing client secrets; submit an integration debrief (time to first success, friction, missing docs, top improvement). Note: "Proofs are using fake identities, DO NOT rely in them for production."
  - Hint wording: "We are especially interested in agentic products, but any compelling use case is eligible." Wants apps that ask a person to authenticate/verify at the moment, leading to a meaningful action needing a human identity or approval layer. Not wanted: "not simply a login screen added to an existing product."
- **[Continuity] World ID Agent Pass, $2,500** (1st $1,500 / 2nd $1,000): same requirements, Continuity only.
- **Best Use of IDKit, $2,500** (up to 2 teams x $1,250). Requirements: IDKit in a working app, mini app or onchain flow; at least one supported credential (Proof of Human, Passport/NFC, Selfie Check) verified server-side or onchain; explain why that credential is the minimum sufficient; show success plus one alternative path (cancel, unavailable credential, rejection, ineligible user); integration debrief.
  - Hint wording: products at a "real trust moment"; examples: fair access to a scarce benefit, privacy-preserving eligibility check, protecting/recovering an account action, making a workflow safer or simpler. "We are not rewarding the most credentials used."
- **[Continuity] Best Use of IDKit, $2,500**: identical.

### 1inch ($7,000) https://ethglobal.com/events/mumbai/prizes/1inch
Product (own docs): not verified (see open questions).
- **Build an Aqua App, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000). Build a custom Aqua app implementing a sophisticated DeFi position; SwapVM opcodes may be modified; demonstrate positions via test scripts or UI. "Projects using SwapVM score higher." Requirements: official Aqua/SwapVM contracts; onchain token transfers shown in final demo (local forks OK); proper Git history (no single-commit final-day entries).
- **Aqua App Continuity, $2,000** (1st $1,500 / 2nd $500).

### 0G ($15,000) https://ethglobal.com/events/mumbai/prizes/0g
Product (own docs): 0G is a platform for decentralized AI; 0G Compute offers inference and fine-tuning; Storage offers client libraries for Go/TypeScript. The docs home I fetched did not mention "Private Computer". Source: https://docs.0g.ai
Note on the page: prizes are paid "at 0G's discretion" and only to projects meeting a quality threshold, so not every place is guaranteed.

- **Build with 0G Private Computer, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000). "Consumer apps where AI on 0G is the product. Creative image, video, and voice apps are welcome." Wants apps people "open, use, and come back to tomorrow." OpenAI-compatible API ("If you've used the OpenAI SDK, you already know how to build on it"). Requirements: inference on 0G Private Computer in the main user flow with request IDs; working app a judge can try with a reason to return; one sentence on what breaks without 0G. Bonus: 0G account sign-in with visibly decreasing daily credits; standout apps may be invited to discuss revenue share. Not wanted: "Generic chat wrappers", "Apps where the AI call could be removed without anyone noticing."
- **Physical AI: Agents with a Body, $5,000** (1st $2,500 / 2nd $1,500 / best real-hardware $1,000). Robots, drones, wearables, pocket devices whose decisions run on 0G; simulated builds eligible for every prize. Requirements: a 0G call in the decision loop; episode log on 0G Storage with request ID per decision; replayable sim or live hardware demo; safe-stop fallback (a fallback that fakes decisions is disqualifying). Tools named: zerobot (includes a mock robot), MuJoCo, PyBullet, Gazebo, LeRobot. Not wanted: "a chatbot with a robot avatar, pre-recorded motion, 0G used only for logs."
- **Keep Building on 0G, $3,000** (up to 2 x $1,500, Continuity only).
- **Agents That Pay for Themselves, $2,000** (up to 2 x $1,000). Agent earns money that pays for its own 0G Compute inference, no human top-up. "We'd love to see": agents doing work worth paying for; budget-aware agents that degrade gracefully; agents that hire/pay other agents. Requirements: full money loop with tx hashes and request IDs; autonomous demo; spend cap. Not wanted: "A token launch with a chatbot attached"; "revenue" only from trading your own token; an agent whose wallet a human refills. Recommended path: "comfy" launchpad.

### Uniswap Foundation ($15,000) https://ethglobal.com/events/mumbai/prizes/uniswap-foundation
Product (own docs): Uniswap API is a toolkit for adding swaps, managing liquidity and launching tokens in your app (free API keys after account creation); v4 hooks "Define custom logic for pools". Source: https://developers.uniswap.org/
- **Build with Uniswap, $10,000** (1st $4,000 / 2nd $3,000 / 3rd $2,000 / 4th $1,000). Any part of the Uniswap stack (API, v2/v3/v4, CCA, other protocols), incl. v4 hooks, official-repo improvements, ecosystem tooling. Requirements: public open-source GitHub repo; a FEEDBACK.md; completed Uniswap Developer Feedback Form linking to it; README pointing to relevant contracts/lines.
- **Build with Uniswap Continuity, $5,000** (4 x $1,250).

### Arc ($15,000) https://ethglobal.com/events/mumbai/prizes/arc
Product (own docs): Arc is a platform for "onchain finance with stablecoins", USDC as gas token, sub-second finality; Bridge Kit wraps CCTP to move USDC across chains. Arc Studio and Nanopayments were not defined in the page I fetched. Source: https://docs.arc.io/
All Arc prizes: must start in Arc Studio and name the bounty in the submission; need shareable Arc Studio project URL, working frontend+backend, architecture diagram, video demo, GitHub/Replit repo. No place breakdowns listed.
- Best DeFi / Onchain Finance App End to End in Arc Studio, $3,000 (USDC/EURC settlement: trading incl. RWAs, lending, payments, neobanks).
- Best Mobile Web Consumer Agent Using the Marketplace Discovery API, $3,000 (agent discovers services and pays in USDC; needs per-use Nanopayments, spend limits, approvals, purchase history, mobile-first UX).
- Best Smart Contracts with Advanced Stablecoin Logic in Arc Studio, $3,000 (conditional escrow, payroll/vesting, treasury splits, software-to-software payments, crosschain conditional transfer; reusable contracts get bonus).
- Best Use of Bridge Kit for Non-USDC Assets in Arc Studio, $3,000.
- Arc Studio Continuity: Bring Your Project to Arc, $3,000 (Continuity only).

### Hedera ($15,000) https://ethglobal.com/events/mumbai/prizes/hedera
Product (own docs): public proof-of-stake network using hashgraph consensus; HTS (Token Service) manages native fungible/NFT tokens; HCS (Consensus Service) gives real-time audit logs with consensus timestamps; docs mention "Hedera Network MCP and x402 payments" under Hedera AI Studio. Source: https://docs.hedera.com/hedera
- **AI Agents That Pay: x402 on Hedera, $6,500** (1st $3,000 / 2nd $2,000 / 3rd $1,500). "Ideas include pay-per-call APIs, agent marketplaces, metered MCP servers, budgeted research agents, micropaywalls, and open-source facilitators." Requirements: at least one x402-protected endpoint settling on Hedera testnet/mainnet; autonomous paying client; public repo with README and settled tx ID; demo of 5 minutes or less linked to HashScan. Extra points: spending controls, HCS-14/ERC-8004 identity, HCS audit logs, A2A/ACP negotiation, HTS settlement, scheduled payments, Hedera Agent Kit/MCP.
- **Tokenize Anything with Hedera Studios, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000). Use ATS or Stablecoin Studio to issue/manage an RWA or stablecoin. Ideas: invoice fractions, tokenized bonds, gold/real-estate fractions, remittance stablecoins, order books. Requirements: testnet deploy; public repo with contracts verified on HashScan; demo under 5 min covering issuance and one lifecycle op.
- **"No Solidity Allowed": Build with Hedera SDKs, $2,000** (up to 2 x $1,000). Complete app with no smart contracts, using at least two native services (e.g., HTS and HCS) via JS/TS or Python SDK; public repo + README; demo under 5 min. Extra: end-to-end UX, Mirror Node REST, creative HCS use, Agent Kit.
- **Built on Hedera Continuity, $1,500** (up to 2 x $750).

### Arkiv ($15,000) https://ethglobal.com/events/mumbai/prizes/arkiv
Product (own site): "The guarantees of blockchain, the convenience of a database"; stores searchable data that expires on schedule, resists tampering and is changeable only by the owner's wallet. Source: https://arkiv.network . Page text: "Ethereum-aligned DB-Chain"; entities owned by a wallet, SQL-like queries, optional expiry.
All tracks require: `/arkiv/friction.md` feedback, open-source license, AI-use disclosure, README with writing wallet address(es) and one runnable query, `/arkiv/schema.md`. One Arkiv track prize per team; Swarm bonus stacks.
- **Mirror something Ethereum depends on, $4,000** (1st $3,000 / 2nd $1,000). Ideas: token lists, chain and RPC registries, address labels, wallet ratings, function signatures. Not Sourcify data (that is the page's example). From scratch, republishable data license, re-runnable import script. Judging: friction, reach, why Arkiv, data quality (25% each).
- **Build on Arkiv, from scratch, $4,000** (1st $3,000 / 2nd $1,000). Ideas: agent coordination state (tasks/bids/claims that expire), expiring markets, publishing/media (posts, profiles, follows), ENS-keyed identity/directories. Must write to Arkiv testnet and a user-visible feature must read from it. Judging: friction, reach, why Arkiv, how you use Arkiv (25% each).
- **Build on Arkiv, existing projects, $4,000** (Continuity only).
- **Node tooling, $2,000** (no place split): operator dashboard or slow-query finder; new repo.
- **Arkiv + Swarm bonus, $500** (from scratch) and **$500** (Continuity): use Swarm meaningfully (e.g., Swarm files referenced from entities, encrypted uploads); needs `/arkiv/swarm.md`.

### Whitechain ($15,000) https://ethglobal.com/events/mumbai/prizes/whitechain
Product (own docs): not verified.
All tracks require: verified contracts on Whitechain Sepolia (chain ID 1874); at least one USDT payment settled in the main flow with explorer link; README line on why onchain stablecoin settlement is needed; steady commits; 2-4 min demo; `WHITECHAIN_FEEDBACK.md`. Test tokens have no monetary value.
- **Operate, Stablecoin Payments for Business, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000): merchant-ready USDT flow (checkout, payment links/invoices, subscriptions, refunds), merchant and customer views, "drop-in piece that a demo app adds in about 20 lines". Won't place: plain-transfer pay buttons, tip jars, bill splitters, custodial bridges, payroll/escrow/splits alone.
- **Tokenize, Real World Finance, $4,000** (1st $2,500 / 2nd $1,500): RWA flows with rules enforced in the contract (allowlists, transfer restrictions, maturity/settlement). Won't place: mint button without rules; NFTs with nothing enforced.
- **Scale, Payments Nobody Notices, $3,000** (1st $2,000 / 2nd $1,000): zero visible crypto steps (gasless EIP-3009/permit with relayer, embedded wallets, or x402 for agents); show who covers gas and relayer-drain protection. Won't place: payer still pays gas; AI chats that never pay.
- **Continuity, Bring Your Product to Whitechain, $3,000** (2 x $1,500, Continuity only).

### Ethereum Foundation ($15,000) https://ethglobal.com/events/mumbai/prizes/ethereum-foundation
Product (own docs): not verified for Anon-RPC / EIP-8141 / ERC-8421 / CROPS (see open questions). Descriptions below are from the ETHGlobal page.
- **Best Use of Anon-RPC, $5,000** (1st $2,500 / 2nd $1,500 / 3rd $1,000): app that routes RPC reads through Anon-RPC by default, or a new Anon-RPC worker/harness. Judging: end-to-end demo, UX, share of traffic through Anon-RPC, shippability, technical depth.
- **Best use of the Frame Transaction Alternative Mempool, $5,000** (same split): EIP-8141 frame transactions and alt mempool (ERC-8421); something only an alt mempool enables, dev tooling, or DoS/simulator work. Judging: creativity, usefulness, practicality, performance, relation to alt mempool. Needs a devnet explorer link to an admitted tx or code submitting one.
- **Best CROPS App, $3,500** (1st $2,000 / 2nd $1,000 / 3rd $500): an app/wallet feature/dev tool where one CROPS property (censorship resistant, open source, private, secure) is the reason it exists without giving up the other three. Free-license public repo, README "CROPS" section, demo of 3 min or less, no third-party trackers; one EF prize per project.
- **Best CROPS Upgrade to an Existing Project, $1,500** (Continuity only).

### ENS ($10,000) https://ethglobal.com/events/mumbai/prizes/ens
Product (own docs): "Build applications with decentralized self-sovereign identity"; the docs home links an ENSv2 section (overview, app tutorials, subnames, deployments) but did not define ENSv2 itself. Source: https://docs.ens.domains
- **Best Use of ENSv2, $7,000** (1st $3,000 / 2nd $2,000 / 3rd $1,000 / 3rd $1,000). Build on ENSv2 (mainnet or Sepolia) with ENSv2 "central to the product, not a cosmetic add-on". Functional demo (no hard-coded values), live demo link, open-source code. Ideas on the page: hierarchical registry/wildcard resolution; own subname registry with custom rules; narrow permissions via Enhanced Access Control (e.g., edit only specific text records); Permissioned Resolvers per subname; record and namespace aliasing; subnames that are expiring, revocable, transferable or not, or permanent; "AI agents as namespaces". "Be among the first to build on it." Bonus for AI agents.
- **Best Integration of ENSv2 into an Existing Project, $3,000** (1st $2,000 / 2nd $1,000, Continuity only).

### Definitive ($5,000) https://ethglobal.com/events/mumbai/prizes/definitive
Product (own docs): Flash is Definitive's trading API for AI agents/builders; Market, Limit, Stop, Stop Loss, Take Profit, Trailing Stop, Bracket, TWAP, DCA and cross-chain orders across 900+ liquidity sources, non-custodial, EVM and Solana. Source: https://flash.definitive.fi/docs . Also has an MCP server and LLM-optimized docs (from the prize page).
- **Best Use of Flash Advanced Orders in a Social App, $2,500** (single award; no places listed; no judging criteria listed). "Build the best social trading agent or app on top of Flash's advanced order types." Ideas: copy trading via Flash; trade signals/leaderboards shared to X, TikTok; agent-run products (e.g., a Grok bot) others follow; "any product that makes trading a shared experience".
- **Most Creative Use of Definitive Flash Advanced Orders, $2,500** (Continuity only). Judging: originality of integration, technical creativity, how well the demo shows Flash. Ideas: multi-agent systems with Flash as one tool, voice/chat trading, workflows combining Flash with other MCP servers/onchain data.
- Requirements (both): working trading flow using Flash API or MCP advanced orders (DCA, Limit, Stop, Stop Loss, Take Profit, TWAP); onchain execution in final demo; short demo video posted on both Discord and X tagging @DefinitiveFi. Note: the page's tips list Stop Buy and Bracket as order types while the requirements list omits them.

### Chainlink ($5,000) https://ethglobal.com/events/mumbai/prizes/chainlink
Product (own docs): docs.chain.link/cre and /ccip returned 404 when fetched, so no product description from Chainlink's own docs. Links listed on the prize page: https://docs.chain.link/ccip, https://docs.chain.link/cre, https://github.com/smartcontractkit/cre-templates/
- **Best Workflow with CRE, $1,500**: build/simulate/deploy a CRE workflow as an orchestration layer; integrate at least one blockchain with an external API, system, data source, LLM or AI agent; successful CRE CLI simulation or live deployment; workflow must be meaningfully used. Simulation is enough.
- **Best Use of Chainlink CCIP 2.0, $3,500** (up to 2 x $1,750): CCIP inside smart contracts making an onchain state change (a frontend only reading Data Feeds does not qualify). Ideas: cross-chain DeFi app, yield aggregator, CCIP token bridge, multihop CCIP router. Page lists no judging criteria.

## 4. Analysis flags (my reading of the sources above, not sponsor statements)

### Biggest single prizes (open tracks)
- Uniswap "Build with Uniswap" $10,000 pool, top prize $4,000 (4 places). Very open scope.
- ENS "Best Use of ENSv2" $7,000 pool, top $3,000 (4 places).
- Hedera x402 $6,500 pool, top $3,000.
- 0G Private Computer $5,000, Physical AI $5,000; World Agent Pass $5,000; 1inch Aqua $5,000; Whitechain Operate $5,000; EF Anon-RPC and Frame Tx $5,000 each; Hedera Tokenize $5,000.
- Biggest single first prize: Uniswap $4,000, then Hedera x402/ENS/0G-style $2,500-$3,000 firsts.

### Prizes that combine in one simple project (note: max 3 partner prizes per submission; multiple tracks of the same partner count as one)
- Agent that pays/gets paid + human verification: Hedera x402 (agents pay) + World Agent Pass (human approval gating a protected action) + 0G "Agents That Pay for Themselves" or Whitechain "Scale" (x402 for agents) + ENS (agent as a namespace/identity). Source pages as cited above; the overlap is my inference.
- ENSv2 + Arkiv: Arkiv explicitly suggests "ENS-keyed identity" / service directories, and ENS suggests agents as namespaces. Sources: https://ethglobal.com/events/mumbai/prizes/arkiv and /ens.
- Arkiv + Swarm bonus stacks on an Arkiv track (stated on the Arkiv page).
- World IDKit: needs only one credential and a success + alternative path; the simplest integration of the list.
- Definitive Flash social app + ENS names for traders + World ID for "real human leaderboard" is a plausible stack (inference).

### Possibly low-competition (narrow or odd requirements; inference)
- Arkiv Node tooling ($2,000), Arkiv Mirror ($4,000, data-focused, requires importer script), Arkiv Swarm bonus ($500): niche, unusual for a typical team.
- Hedera "No Solidity Allowed" ($2,000, up to 2 winners): constraint is a no-contracts app using two native services.
- EF Frame Tx Alt Mempool and Anon-RPC: highly specialized, new EIPs.
- Chainlink CRE ($1,500): simulation is enough, no deployment needed.
- Definitive Social App ($2,500): one award, narrow Flash API requirement, requires posting video on Discord and X.
- World IDKit ($2,500, 2 winners).
- Hedera x402 explicitly welcomes simple "pay-per-call APIs" and "micropaywalls."

### Easy to scope without a heavy tech stack (inference)
- World IDKit; Arkiv "from scratch" (writes + reads entities); Hedera x402 pay-per-call endpoint; Chainlink CRE simulation; ENSv2 subname model; 0G Private Computer consumer app using an OpenAI-style API.

### Things sponsors explicitly do NOT want (useful for avoiding wasted effort)
- 0G: generic chat wrappers; AI call removable unnoticed; chatbot with robot avatar; token launch with chatbot; human-refilled agent wallet.
- World: a login screen bolted on; stacking credentials.
- Whitechain: tip jars, bill splitters, plain pay buttons, mint-only RWA, flows where payer pays gas, AI chats that never pay.
- Arkiv: SDK installed but unused; Sourcify mirror for the Mirror track.
- Continuity prizes: old demos re-presented as new work.

## 5. Open questions / things I could not verify
- https://ethglobal.com/events/mumbai (main event page) returned HTTP 500 twice: venue, official start time, FAQ and any team-size rule were not read. Team size limits: not found on the details page.
- The main prizes page fetch was truncated at ~100k of ~110k characters; I read the remaining part (Definitive/Chainlink) via a second fetch. I did not individually fetch the per-sponsor pages for 1inch, Uniswap Foundation, Arc, Hedera, Whitechain, Ethereum Foundation; those sections come from the index page https://ethglobal.com/events/mumbai/prizes, and any extra "ideas" text only on the individual pages may be missing. Fetch results were summarized by a tool model, so wording is mostly paraphrase; re-check exact requirements on the live pages before relying on them.
- Whether the Finalist group is exactly "top 10" is from a search snippet only.
- Sponsor product docs not verified from the sponsor's own site: 1inch Aqua/SwapVM, Whitechain, EF Anon-RPC / EIP-8141 / ERC-8421 / CROPS, 0G Private Computer (not on docs.0g.ai home), World ID Agent Pass and IDKit definitions (not on docs.world.org home), Arc Studio and Nanopayments, ENSv2 definition. Chainlink CRE and CCIP docs URLs returned 404 at fetch time.
- Whether prize amounts, tracks, or deadlines changed after my fetches (event is live as of 2026-11-05). The search snippet said the prize page was published about 13 days earlier.
- Whether the prize pages' "Won't place"/"Not wanted" lists are exhaustive: unknown.
- Judging criteria are absent for several tracks (Definitive social app, Chainlink, Arc place splits); overall ETHGlobal criteria in section 0 apply to Finalist judging only as stated.
