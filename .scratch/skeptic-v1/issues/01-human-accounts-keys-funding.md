# 01: HUMAN: accounts, keys, funding, repo

**Status:** needs-human
**Size:** M
**Tracks:** Hedera, ENS, World
**Blocked by:** none (can start immediately; the final env check needs 04 merged)
**Read:** spec/01-architecture.md (defaults, chains and ids)

**What to build:** A human sets up everything an agent cannot: funded Hedera testnet accounts (deployer, attestor, relayer, seller, buyer, a pool of critic accounts), Sepolia ETH, the ENS parent name on Sepolia ENSv2 (use whatever name spike 03 says works), an app in the World Agent Pass portal, an LLM API key, and confirming the public `skeptique` GitHub repo carries the MIT licence. Every key lands in `.env` (gitignored), never in git. Start a timer for the World integration debrief at first touch of the World portal.

Suggest running `/wizard` to generate the step-by-step walkthrough script for this ticket.

## Acceptance criteria
- [ ] Every variable in `.env.example` has a value in `.env`.
- [ ] Each Hedera account shows a testnet balance on HashScan; the Sepolia account holds ETH.
- [ ] The World debrief timer start time is written in the raw World feedback notes.
- [ ] Done when: the env check from 04 is green (`pnpm env:check`).

Receipt: `board/done/01.md`
