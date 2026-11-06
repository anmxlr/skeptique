# ENS score relayer (ticket 20)

`createScoreRelayer` consumes finalized score events and absolute critic snapshots. `relayScoresFromChain` is the real chain adapter: it scans confirmed Hedera logs in bounded chunks, verifies every configured service name against `ServiceRegistry.ensNode`, ignores void rounds, derives honest/slash counts from chain history, and reads current stake at the same source block. It never derives an ENS name from a display name or trusts API scores.

## Run one catch-up pass

Create a **public** JSON config using your actual deployment addresses and names:

```json
{
  "chainId": "296",
  "fromBlock": "DEPLOYMENT_BLOCK",
  "confirmations": "2",
  "roundManager": "0x...",
  "serviceRegistry": "0x...",
  "criticRegistry": "0x...",
  "parentName": "skeptique.eth",
  "ensCriticRegistry": "0x...",
  "ensCriticResolver": "0x...",
  "ensCriticExpiry": "PARENT_EXPIRY_UNIX_SECONDS",
  "serviceNames": { "1": "converter.svc.skeptique.eth" },
  "criticNames": { "0xCRITIC_ADDRESS": "alice.critic.skeptique.eth" }
}
```

Set `HEDERA_RPC_URL`, `SEPOLIA_RPC_URL`, `SEPOLIA_RELAYER_PRIVATE_KEY`, and `ENS_TRANSACTION_JOURNAL` (a persistent local path outside git). Load your existing environment file with Node/tsx, then run:

```sh
pnpm --filter @skeptique/relayer exec tsx --env-file=/absolute/path/to/existing.env src/run-scores.ts /absolute/path/to/score-relayer.json
```

Run **one process per signer**, without another program using that signer's nonce. Repeat the pass for new events; start from the real deployment block so critic lifetime counts are complete. There are no background timers or browser-triggered signing operations. The CLI always uses a durable transaction journal: signed raw bytes and their hash are atomically persisted before broadcast. Recovery resends the same transaction and awaits its receipt before reading/replaying events. Keep the journal after transport errors; a replaced pending transaction needs operator inspection. A confirmed reverted transaction clears its journal and fails the pass, allowing retry after its cause is fixed. The optional in-memory library mode without a journal only guarantees replay safety for already-mined writes, and must not be used as the production runtime.

Score writes are a single atomic `multicall`. Each key is checked against the relayer's setter roles, the transaction is simulated, the mined receipt must succeed, and records are read back through the Universal Resolver at/after the receipt block. Older rounds are skipped; conflicting data for an already-published round fails. At finalization confidence is `min(1, nReveals/5)`; API ranking may separately apply age decay. Critic counters are absolute snapshots, so replay never increments them again.

## Namespace setup

Reuse ticket 12's `ens:setup` namespace command and listing relayer (`start`) to provision services: one PermissionedResolver per service, relayer score-key roles, seller metadata-only roles, and name ownership with `roleBitmap=0`. Their deployed ABI/constants and naming helpers are shared with this score relayer. The service namehash must be supplied when listing the service on Hedera.

An operator separately calls exported `provisionCriticNamespace({transport, operator, relayer, parentName, criticRegistry})` once. It deploys a deterministic shared critic resolver if absent, grants the relayer exactly the three critic text keys, and grants the critic registry's registrar role. Use its returned resolver in the config and the parent expiry as `ensCriticExpiry`. It never grants resolver administrator roles to the runtime signer. Do not supply `ENS_OPERATOR_PRIVATE_KEY` to the runtime process. The runtime creates missing critic names with the critic as owner and `roleBitmap=0`, and refuses owner/resolver conflicts. The source contracts and namespace must already exist; this code does not fabricate deployments.

## UI and checks

`EnsScore` takes the provisioned `service.ensName`, `NEXT_PUBLIC_SEPOLIA_RPC_URL`, and `NEXT_PUBLIC_ENS_PARENT_NAME`. It displays one pinned-block resolver snapshot and the exact queries. Missing, malformed, or unreachable ENS data produces an explicit unavailable/error state; API scores never substitute for it.

```sh
pnpm --filter @skeptique/relayer exec vitest run -t scores
pnpm --filter @skeptique/shared exec vitest run src/ens.test.ts
pnpm --filter @skeptique/web exec vitest run test/ens-score.test.tsx
pnpm exec vitest run --config vitest.live.config.ts -t 'score written to ENS'
```

The browser regression exercises both actual pages with real viem JSON-RPC encoding and a stale API score, using intercepted local transports:

```sh
NEXT_PUBLIC_API_URL=http://127.0.0.1:43199 NEXT_PUBLIC_SEPOLIA_RPC_URL=http://127.0.0.1:43200 pnpm --filter @skeptique/web exec playwright test ens-scores.spec.ts
```

The live test requires the existing RPC/key variables plus `ENS_PARENT_NAME`, `ENS_SCORE_TEST_NAME`, `HEDERA_ROUND_MANAGER_ADDRESS`, `HEDERA_SERVICE_REGISTRY_ADDRESS`, `ENS_SCORE_TEST_FROM_BLOCK`, and `ENS_SCORE_TEST_ROUND_ID`. It finds an actual non-void Hedera finalization, verifies the service namehash, writes all four ENS records, proves duplicate replay is unchanged, and reads the values from Sepolia. Missing credentials skip the test; **a skip is not a completed live acceptance gate**. Do not write `board/done/20.md` until the real test passes.

## Research and implementation choices

- [ENSIP-5](https://docs.ens.domains/ensip/5/): service keys use reverse notation for a namespace the service owns. Thus `skeptique.eth` writes `eth.skeptique.score`, not the earlier ticket shorthand `skeptique.score`.
- [ENSv2 PermissionedResolver source, pinned](https://github.com/ensdomains/contracts-v2/blob/07e55a056f5b6a9c90119f501bdd05714e67dddd/contracts/src/resolver/PermissionedResolver.sol): this deployed version scopes setter roles to text keys, rather than per-name keys. Service resolvers are separate to prevent one seller editing another service's records. Critic names can safely share a resolver because only the relayer writes their keys.
- [Enhanced Access Control](https://docs.ens.domains/ensv2/enhanced-access-control/): root roles apply across resources. Runtime receives registrar permission only on the critic registry, plus specific resolver text-key roles; no administrator permissions.
- [Viem ENS text reads](https://viem.sh/docs/ens/actions/getEnsText): reuse the existing viem dependency and Universal Resolver instead of implementing ENS resolution. Public UI reads batch HTTP requests; each snapshot pins a block to avoid mixing records across updates. Source log scans use two bounded concurrent queries per chunk rather than one query per event.
- The repository's `spec/notes/ens.md` and Sepolia spike establish the deployed addresses, ABI pin and load-balanced RPC stale-read failure. This implementation pins post-write reads and retries only unknown-block errors; outages and reverts are never interpreted as missing records.

Limitations: setup still trusts the namespace operator and ENS upgrade administrators. Cross-chain source confirmation depth is an explicit deployment choice; ENS writes cannot automatically roll back a deep Hedera reorganization. Full-history catch-up is appropriate for the hackathon; a long-lived production indexer should persist canonical source checkpoints and derived critic totals. The UI shows chain scores; marketplace API ordering can lag that view until its index catches up.
