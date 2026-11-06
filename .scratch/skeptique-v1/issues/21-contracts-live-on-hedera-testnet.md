# 21: Contracts live on Hedera testnet

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 01, 02, 14
**Read:** spec/notes/hedera-x402.md (RPC, chain id, HBAR units), spec/03-interfaces.md (deploy output)

**What to build:** The mechanism runs on Hedera testnet, not just locally. A deploy script deploys every contract with RoundConfig values in the unit spec/notes/hedera-x402.md says contracts see, writes the deployment addresses, and exports ABIs to the shared package. The API, critic, relayer and web read addresses from the deployment output, never from constants. A smoke run lists one service and completes one round on testnet with short demo windows, and prints HashScan links for each transaction. Re-running the script after later contract changes redeploys cleanly.

## Acceptance criteria
- [ ] Stake and fee minimums behave on testnet as spec/02 §2 intends (e.g. a 4.9 HBAR stake is rejected, 5 is accepted).
- [ ] No app hard-codes a contract address.
- [ ] Done when: `pnpm --filter contracts deploy:hedera` prints addresses, and `pnpm test:live -t "round on hedera testnet"` passes with HashScan links printed.

Receipt: `board/done/21.md`
