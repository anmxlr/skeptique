# ENSv2 implementation and evidence

ENS is the service/critic identity and published review layer. Names are hierarchical (`<slug>.svc.<parent>` and `<handle>.critic.<parent>`), with permissioned registries/resolvers and Enhanced Access Control. Seller roles cover profile records (`url`, `description`); relayer roles cover only review keys. No wildcard, aliasing or expiration feature beyond the implemented provisioning is claimed.

## Records and reads

Record keys are derived from the normalized parent, reversed into a record-key prefix. For `skeptique.eth`, service keys are `eth.skeptique.score`, `eth.skeptique.confidence`, `eth.skeptique.round`, `eth.skeptique.hedera.tx`; critic keys are `eth.skeptique.stake`, `eth.skeptique.honestRounds`, `eth.skeptique.slashes`. `packages/shared/src/ens.ts` is authoritative.

The listing relayer verifies the fetched suite hash and registered service namehash before deriving/creating the service subname. The marketplace and service page resolve profiles/scores using ENS; unavailable scores stay unavailable rather than falling back to API scores. Published confidence is a snapshot, separate from the API's time-decayed ranking heuristic.

## Operations

- `pnpm --filter @skeptique/relayer ens:setup`: one-time namespace provisioning with the operator key; re-runnable.
- `pnpm --filter @skeptique/relayer start`: listing relay, requiring its documented namespace/source configuration (`apps/relayer/src/cli.ts`).
- `pnpm --filter @skeptique/relayer scores /absolute/path/to/public-ens-config.json`: finalized service and critic snapshot publication. Source contracts/start block come from the deployment manifest. The public JSON supplies `parentName`, `ensCriticRegistry`, `ensCriticResolver`, `ensCriticExpiry` (decimal string), `confirmations` (decimal string), `serviceNames` and `criticNames` maps. See `apps/relayer/src/run-scores.ts` and `src/ens-target.ts`.

Provision critic subnames and grant the per-record writer roles separately. The running score publisher uses only the relayer key; it does not need the operator key. `ENS_TRANSACTION_JOURNAL` must be persistent and outside git. Each signed transaction is journaled before broadcast, allowing retries to recover the same transaction rather than duplicate writes. Record updates use resolver multicall.

Configure the same parent for the seller, API, browser and relayer. Old zero-node listings must be relisted with a correct namehash because their ENS node cannot be changed after listing.

## Evidence and trust

[Receipt 12](../board/done/12.md) records a live Sepolia subname, resolver read, access-control denials and idempotent rerun. The new score publisher has local recovery/permission tests and browser regression coverage, but fresh finalized Hedera → Sepolia publication evidence remains outstanding for ticket 20 and the integrated ticket 27 demo.

The relayer can misreport, delay or censor records. The Hedera transaction reference enables independent comparison, not trustless cross-chain verification. Do not interpret a successfully resolved name as proof that its service is good.
