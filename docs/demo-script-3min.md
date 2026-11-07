# Skeptique: 3-minute finalist demo script

Target: 3:00 live. Spoken lines are 424 words, about 140 words per minute, leaving a few seconds for clicks. Read the "Say" column word for word in rehearsal, then loosen it.

Rule for the stage: every number below comes from `docs/arena.md` or a `board/done` receipt. If something on screen differs from the script (a fresh live run will give its own numbers), say what is on screen.

## Main script

| Time | On screen (exact page / click) | Say | Sponsor moment |
|---|---|---|---|
| 0:00–0:15 | `/arena`, top of page: "Same task. Same AI. One sees Skeptique's reviews." | Before your AI agent pays another agent, how does it know the service works? Today it can't. It sees a price and a popularity count, and it pays. We built Skeptique so it can check first. | |
| 0:15–0:35 | Preset tasks: click the Web3 gas task ("An Ethereum transfer used 21,000 gas at 30 gwei..."). Buying rule: **Must buy**. Click **Run**. Point at the "How is this fair?" box while it runs. | This is our arena. Two buyer agents, same task, same Claude model, same budget. The left one sees what agent marketplaces show today: price and popularity. The right one also sees Skeptique review scores and follows a spend policy. The task: 21,000 gas at 30 gwei. Fee in ETH? | |
| 0:35–1:00 | Both cards land. Point at the left card's wrong answer, then the right card's answer. Hover the "Why it chose this" line. | Both agents paid a vendor. The left agent picked a vendor that games the public test suite, and was told the fee is six hundred and thirty thousand ETH. The right agent skipped that vendor, because its review score is 40, and got 0.00063 ETH. No LLM grades this: a fixed checker does, and links to the definition on ethereum.org. | |
| 1:00–1:15 | Right card, "Where this came from" corner: click **The payment on HashScan**. HashScan tab opens on the settled transaction. Come back and point at "What it quoted". | Every purchase is a real x402 payment on Hedera testnet. Here it is on HashScan. No human approved it. And this corner shows where every number came from, and checks the agent didn't make any up. | **Hedera x402**: payment settled, HashScan link, agent pays with no human approving, spend policy |
| 1:15–1:40 | `/services/<suite-gamer id>`: review rounds and each tester's score. | So where do scores come from? A seller lists a service, and its listing fee funds a bounty. Critics stake HBAR, pay the service through x402, and test it: 40 percent public suite, 60 percent private probes. They commit, then reveal. The contract takes a stake-weighted median, slashes outliers and pays honest critics from the bounty. | |
| 1:40–1:55 | `/critics`, critic onboarding. Start verification with the same human who already has a critic. Red alert appears: "Not registered: ..." (reason `duplicate_human`). | Critics are one per human, so one person cannot run a crowd of fake reviewers. They verify with World ID, and our server checks the proof. Here the same person tries to register a second critic. Refused, and the registration never happens. | **World ID Agent Pass**: verified journey and denied path |
| 1:55–2:15 | `/services/<id>`: ENS name with "(resolved on ENS)" and its score record. Optional 2-second flash of `/audit` (HCS topic). | Scores are published to ENSv2. Each service gets its own subname, and the app reads the score through the resolver, not our database. The seller can edit its URL but cannot write its own score. Finished rounds also go to a Hedera audit log. | **ENSv2**: subname, resolver read, role-limited records. Hedera HCS extra |
| 2:15–2:35 | `/arena` benchmark chart ("Correct parts", "Wasted tinybars"), pre-run. Or the results table in `docs/arena.md`. | We ran every task, twice, live. 38 parts. Without Skeptique, the agent got 66 percent right. Coin-flip maths predicts 64.5. A third of its money paid for wrong answers. With Skeptique: 100 percent, and nothing wasted. Same model, same budget. The only difference is what the agent knew. | |
| 2:35–3:00 | Stay on the scoreboard. | What we don't claim: agreement among critics is not truth. Our team runs the demo critics today, and the arena's review rounds run on a local chain. The payments are real testnet. Next, we open critic registration and feed these scores into x402 discovery. Before your agent pays, let it check. Thank you. | |

### Line-level notes
- Say "six hundred and thirty thousand ETH" slowly, then pause one beat. That pause is the demo.
- The 66% / 100% / 32% figures are from the two recorded batches (25/38 vs 38/38; 12 of 37 paid tinybars wasted). If the on-screen chart shows a different single batch, say "over our two recorded batches" and point at the table.
- Do not say the review rounds behind the arena ran on Hedera. They ran on a local chain. A separate full round did run on Hedera testnet (receipt 22); keep that for Q&A.
- If you need to cut time, drop the `/audit` flash and the "Finished rounds also go to a Hedera audit log" sentence (about 4 seconds).

## Pre-demo checklist

Do this 10 minutes before going on stage.

**Servers**
- [ ] Arena server, API, web app and services are running. Restart anything started before the latest Hedera redeploy (ticket 22); they read the manifest at startup.
- [ ] Hedera testnet payer funded. Server's Claude key works. Do one warm-up run of the gas task. It also gives you the fallback tab and proof file.

**Tabs, in this order**
1. `/arena` with the gas task ready to click, buying rule **Must buy**, the quickest model selected. "Use your own keys" collapsed (no key fields on screen).
2. `/arena` fallback: the warm-up gas-task run finished, both cards visible.
3. `/arena` benchmark: **Run all tasks** finished ahead of time, chart visible. Backup: `docs/arena.md` results table on GitHub.
4. HashScan, recorded Skeptique-side payment: https://hashscan.io/testnet/transaction/0.0.9185802@1794014112.716860391 (status-quo "630000 ETH" payment: https://hashscan.io/testnet/transaction/0.0.9185802@1794014115.000823419).
5. `/services/<suite-gamer id>`: rounds and tester scores.
6. `/critics`: onboarding with the World ID simulator ready, and one critic already registered for that human so the next attempt is denied. Rehearse this click path once. Receipt 16 says the browser flow was not exercised end to end, only the API live and e2e.
7. `/services/<id>` with "(resolved on ENS)" and the score shown.
8. `/audit` (HCS topic messages).
9. Downloaded proof file `arena-<runId>.json` from the warm-up run, open in an editor at the record hash.

**Fallbacks**
- **Live run is slow.** If both cards are not back by about 0:40, switch to tab 2 and say: "Here is the same run from a few minutes ago; its proof hash is on screen." Keep talking from the 0:35 line. Never wait in silence.
- **Arena or network is down.** Play the pre-recorded run (record it during the warm-up), or open the proof JSON plus the two HashScan tabs above. The record has the prompts, raw model output, option shuffle and tx ids.
- **World denial won't render.** Show the receipt 16 live output in a terminal: `second critic, same human -> 403 {"reason":"duplicate_human"}`.
- **ENS page slow (Sepolia RPC).** Show the receipt 12 live result: `live-mw4tcxok.svc.skeptique.eth`, score read through the Universal Resolver, and the seller's score write reverting with `EACUnauthorizedAccountRoles`.

**Hygiene:** no `.env`, private keys or terminal history on screen. Notifications off. Browser zoom at 125% so judges can read the cards.

## Likely judge Q&A

**1. Isn't this just ERC-8004 reputation?**
ERC-8004 gives agents an identity and a place to record feedback. As far as we know, it does not make a reviewer test anything or cost a reviewer anything for being wrong. Skeptique is the incentive layer on top: critics stake, pay to test with private probes, commit before they reveal, and are slashed if they are outliers. Our scores could be written into an 8004 registry, but we have not built that adapter.

**2. What if critics collude?**
We make it costly, but we don't claim to stop it. One critic per human, through World ID. Stake is at risk. Commit-reveal stops critics copying each other. Private probes (60% of the score) mean a seller cannot just train on the public tests. A majority of real, staked humans who agree to lie would still win: consensus is not truth. That limit is in our spec.

**3. What if your agent hallucinates?**
Two answers. First, no model grades anything: a deterministic oracle checks every answer against the official definition (NIST, Hedera docs, ethereum.org). Second, each card checks that every number the agent quoted appears in the data it was shown, and flags anything that doesn't. It is strict, so a number the agent worked out itself shows as "not directly in its data". It proves a number was in the data, not which vendor it belongs to.

**4. Why blockchain?**
Because money and penalties need a holder nobody controls. Stakes, the seller's bounty, slashing and rewards are enforced by the contract, not by us. The seller cannot withdraw the bounty or see scores early. Agents pay each other per call through x402 without accounts. Scores live on ENS, so any agent can read them without our API, and the audit log on HCS is tamper-evident.

**5. Is the consensus real or staged?**
The mechanism is real, but the participants are ours. Payments are real Hedera testnet, with HashScan links. Arena review medians come from our critic code with held-out probes, finalised by our RoundManager contract on a local chain, with critics we run. Separately, we ran a full round on Hedera testnet: three critics committed and revealed, the median was 72, and each honest critic was owed 666,666,666 tinybars (receipt 22). World proofs were validated live against developer.world.org using the staging simulator. We have not yet run the entire journey across all sponsor networks in one go.

**6. How do you make money?**
Not built yet; this is the plan. Sellers already pay a listing fee to be reviewed, so we would take a small protocol cut of it. Marketplaces and buyer agents could pay per score lookup over x402. The value is measurable: in our arena, 32% of the status-quo agent's spend went to wrong answers.
