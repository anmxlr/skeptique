# 03 Interfaces (frozen after ticket 06)

## Contracts (Solidity, `contracts/`)
```
ServiceRegistry
  listService(bytes32 specHash, string endpoint, uint256 pricePerCall, bytes32 ensNode) payable returns (uint256 serviceId)
  topUp(uint256 serviceId) payable
  getService(uint256 serviceId) view returns (Service)
  events: ServiceListed(serviceId, seller, specHash, endpoint, pricePerCall, ensNode), BountyToppedUp(serviceId, amount)

CriticRegistry
  registerCritic(bytes32 humanNullifier, uint64 expiry, bytes sig) payable   // stake >= S_MIN; sig = attestor over (nullifier, msg.sender, expiry, chainid)
  requestWithdraw(); withdraw()
  stakeOf(address) view; isCritic(address) view
  reverts: DuplicateNullifier, ExpiredVoucher, BadSignature, SellerCannotCritique, StakeTooLow
  events: CriticRegistered(critic, nullifier, stake), CriticSlashed(critic, roundId, amount, reason)

RoundManager
  openRound(uint256 serviceId)                        // auto after listing / anyone when bounty remains and no round open
  commit(uint256 roundId, bytes32 commitment)
  reveal(uint256 roundId, uint8 score, bytes32 salt, bytes32 evidenceHash, uint256 claimedCost)
  finalize(uint256 roundId)
  claim()                                              // pull rewards
  getRound(uint256) view returns (Round)
  events: RoundOpened(roundId, serviceId, commitEnd, revealEnd), CriticCommitted(roundId, critic), CriticRevealed(roundId, critic, score, evidenceHash),
          RoundFinalized(roundId, serviceId, median, nReveals, void), RewardAccrued(roundId, critic, amount)
```
Deploy output: `contracts/deployments/hedera-testnet.json` with addresses plus ABI export to `packages/shared/abi/`.

## Shared types (`packages/shared`, zod schemas + TS types)
```ts
TestCase  = { id: string; input: unknown; expect: {kind:'exact',value:unknown}|{kind:'schema',schema:object}|{kind:'regex',pattern:string}|{kind:'judge',rubric:string}; weight: number }
TestSuite = { version: 1; serviceName: string; category: string; determinism: 'none'|'llm'; cases: TestCase[] }   // sha256 of canonical JSON = specHash
Evidence  = { roundId: number; critic: string; suite: CaseResult[]; probes: ProbeResult[]; latencyMs: {p50:number;p95:number}; x402Txs: string[]; claimedCost: string; score: number; model: string }
ServiceView = { id:number; name:string; category:string; endpoint:string; pricePerCall:string; seller:string; ensName:string; median:number|null; confidence:number; rank:number; nRounds:number; lastRoundAt:string|null; popularityCalls:number }
RoundView   = { id:number; serviceId:number; phase:'commit'|'reveal'|'finalizable'|'finalized'|'void'; commitEnd:string; revealEnd:string; median:number|null; reveals:{critic:string;score:number;honest:boolean|null}[] }
```

## API (`apps/api`, Fastify, JSON)
`GET /services` `GET /services/:id` `GET /services/:id/suite` (must hash to specHash) `GET /rounds/:id` `GET /critics` `GET /critics/:address`
`POST /evidence` (body Evidence, returns `{hash}`) `GET /evidence/:hash`
`POST /world/rp-context` (returns `{rp_id, nonce, created_at, expires_at, signature}`, signed server-side; the client needs it to start an IDKit request)
`POST /world/verify` (body: World ID 4.0 IDKit result `{protocol_version, nonce, action, environment, responses[]}` forwarded unchanged, plus `critic` = the address used as the signal; returns `{nullifier, expiry, sig}` or 403 with `{reason}`; `nullifier` = `responses[0].nullifier` as bytes32, `expiry` = the attestor voucher expiry, not a World value)
`GET /events` (SSE stream of chain events for the UI) `GET /health`

## Service contract (each demo service, `apps/services/*`)
- `POST /call` x402-paywalled at `pricePerCall`; returns JSON per its own schema; `GET /suite.json` public suite; `GET /health`.
- Each service has its own `category`; buyers search by category.

## x402 client (`packages/x402-client`)
`payAndCall({url, body, maxPrice, signer}) -> {response, txId, paid}`. Hooks: `onBeforePay(price, merchant)` returns allow/deny (used by spend controls and approval). No human prompt in the default path.

## ENS records (written by relayer, see `spec/notes/ens.md` for real key names)
Key prefix is `eth.` + `ENS_PARENT_NAME` labels reversed (ENSIP-5), e.g. `eth.skeptique.*`.
Service subname `<slug>.svc.skeptique.eth`: own PermissionedResolver per service; subname registered to the seller with no registry roles (seller cannot change resolver or transfer). In it the relayer alone may set `eth.skeptique.score`, `eth.skeptique.confidence`, `eth.skeptique.round`, `eth.skeptique.hedera.tx`; the seller alone may set `url`/`description`.
Critic subname `<handle>.critic.skeptique.eth`: all critics share one PermissionedResolver where only the relayer may set `eth.skeptique.stake`, `eth.skeptique.honestRounds`, `eth.skeptique.slashes`.

## HCS audit topic messages
`{type:'round_finalized'|'agent_spend'|'critic_slashed', ...fields, ts}` JSON, one message per event.
