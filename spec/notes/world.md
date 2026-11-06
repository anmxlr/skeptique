# World ID Agent Pass (spike 05 note)

Researched 2026-11-06 from first-party World sources only. "[D]" = docs page, "[S]" = official source code. Short URL keys are listed under Sources.

**Headline:** no first-party World page uses the name "Agent Pass". auth.world.org is "World IdP", an OIDC issuer that uses `client_id`/`client_secret` [A1][A2]. The three values we hold (`app_id`, `rp_id`, `signing_key`) are the **World ID 4.0 relying-party (RP) credentials for IDKit**, issued by developer.world.org [W1]. So the integration path is: **IDKit + an RP signature + `POST /api/v4/verify/{rp_id}`**. OIDC is not the path for these credentials. World's own agent package `@worldcoin/human-in-the-loop` uses the same env names we chose: `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, `NEXT_PUBLIC_WORLD_APP_ID` [W7].

## Request/response flow

1. Our backend signs a request with `signing_key` and returns `{ sig, nonce, created_at, expires_at }` [W1].
2. The client builds an IDKit request from `app_id`, `action` and `rp_context = { rp_id, nonce, created_at, expires_at, signature: sig }` [W1].
3. The user scans the QR / connector URL (desktop) or follows the deep link (mobile) in the World ID app, then approves [W1].
4. IDKit returns the proof result to the client, and the client forwards it to our backend unchanged [W1].
5. Our backend calls the Developer Portal verify API, then stores the nullifier to block reuse [W1].

- Packages (latest on npm today): `@worldcoin/idkit-core@4.6.0` (JS), `@worldcoin/idkit@4.6.0` (React), `@worldcoin/idkit-server@1.2.0` (RP signing) [N1][G1].
- Agent-flavoured wrappers: `@worldcoin/human-in-the-loop@0.2.1` and `@worldcoin/agentkit@0.2.1`. AgentKit is wallet registration in AgentBook plus x402; it does not use rp_id [N1][W8].
- Signing: `signRequest({ signingKeyHex, action?, ttl? }): { sig, nonce, createdAt, expiresAt }` from `@worldcoin/idkit-server` (also exported as `@worldcoin/idkit-core/signing`). It throws if called outside Node [S1][W2].
- Algorithm [S1][W2]:
  - The key must be 32 bytes of hex (`0x` prefix optional).
  - `nonce = keccak256(32 random bytes) >> 8`.
  - `msg = 0x01 || nonce(32) || created_at u64be || expires_at u64be || keccak-field(action)(32)`. The action part is omitted for session proofs.
  - The message is hashed with EIP-191 `"\x19Ethereum Signed Message:\n"+len` and keccak256, then signed with secp256k1 recoverable ECDSA.
  - `sig` is 65 bytes as hex: `r||s||v`, where `v = recovery + 27`.
  - Default TTL is 300 s.
- Client call: `IDKit.request({ app_id, action, rp_context, allow_legacy_proofs, environment?, return_to?, bridge_url?, require_user_presence?, session_id?: "create" }).preset(proofOfHuman({ signal }))`. Returns an `IDKitRequest` with `connectorURI`, `requestId`, `pollOnce()`, `pollUntilCompletion({ pollInterval?, timeout?, signal? })` [S2][W3].
- `environment` takes `"production" | "staging" | "sandbox"` and defaults to `"production"` [S2].
- `pollUntilCompletion` never throws. It returns `{ success: true, result: IDKitResult }` or `{ success: false, error, reason? }`. Defaults: poll every 1000 ms, time out after 900000 ms (15 min) [S3].
- React widget: `<IDKitRequestWidget app_id action rp_context allow_legacy_proofs preset handleVerify onSuccess open onOpenChange />`. `handleVerify` posts the result to our backend and should throw on failure [W1].
- Result returned to the app (v4 uniqueness) [S4][W1]:
  - `{ protocol_version: "4.0", nonce, action, environment, session_id?, responses: [...], user_presence_completed?, integrity_bundle? }`
  - Each response item: `{ identifier: "proof_of_human", issuer_schema_id: 1, nullifier, proof: string[5], expires_at_min, signal_hash? }`

## Server-side validation

- Endpoint: `POST https://developer.world.org/api/v4/verify/{rp_id}` [W4][W1].
- Other documented servers: `https://developer.worldcoin.org` (legacy) and `https://staging-developer.worldcoin.org` (staging) [W4].
- `{rp_id}` should be `rp_...`. `app_...` is still accepted for backward compatibility [W4].
- Auth: the OpenAPI spec has `security: []`. No API key or header is documented beyond a JSON body [W4].
- Body: forward the IDKit result unchanged and set `environment` server-side, e.g. `{ ...idkitResponse, environment: "production" }` [W1][W7].
- v4 uniqueness body fields [W4]:
  - `protocol_version: "4.0"`, `nonce`, `action`, `action_description?`, `environment`, `user_presence_completed?`, `integrity_bundle?`
  - `responses[]` items: `{ identifier, issuer_schema_id, nullifier, expires_at_min, proof: [5 strings], signal_hash? (default "0x0"), sybil_score? }`. `sybil_score` is only for schema 11 (Selfie Check).
- Session variant: `session_id` (`session_` + 128 hex) and `session_nullifier: [nullifier, action]` [W4].
- 200 response (schema; no example is documented) [W4]:
  - `{ success: true, results: [{ identifier, success, nullifier, code, detail }], action?, nullifier?, created_at?, environment?, session_id?, message? }`
- 400 response: `{ success: false, code, detail, results? }`. The only codes the page shows [W4]:
  - `app_not_migrated` (app is not on 4.0)
  - `all_verifications_failed`, with per-result `code: "verification_error"`
- 404 response: app not found or no longer active. No code is documented [W4].
- Required backend checks [W1]:
  - Reject if `idkitResponse.environment` differs from the expected environment.
  - After the call, require `success === true` and a matching returned `environment`.
  - The verify endpoint does **not** dedupe for us. Our backend must reject a nullifier it has already stored.
- The human-in-the-loop reference implementation does the same POST with a 10 s timeout and forces `environment: 'production'`. Its reason: staging and sandbox accept test proofs [W7].

## Secrets: client vs server

- `signing_key`: **server only**. Never expose it. Rotate it if it leaks, because a leaked key lets anyone forge requests [W1][W2].
- The Developer Portal MCP tools are `get_world_id_signing_key` and `rotate_world_id_signing_key`. They need a team `api_` key, which is also secret [W9].
- `app_id`: public. World's own example ships it as `NEXT_PUBLIC_WORLD_APP_ID` and passes it to the client widget [W7][W1].
- `rp_id`: public. It goes into the client `rp_context` and the verify URL path [W1]. World's agent package reads it server-side as `WORLD_RP_ID` [W7].
- `nonce`, `created_at`, `expires_at`, `sig`: produced on the server, safe to send to the client. The client must never generate them [W1].
- The verify API takes no secret (`security: []`) [W4].

## Per-human identifier

- Field: `responses[i].nullifier` in the IDKit result. It is echoed back as `results[i].nullifier` / `nullifier` in the verify 200 [S4][W4].
- Scope: per user + app + action ("a unique identifier for a combination of a user, app_id, and action") [W5].
- In 4.0, "App ID" becomes "RP ID" [W5], and source comments call it an "RP-scoped nullifier" [S4].
- The same person verifying the same action always produces the same value [W1].
- Format is inconsistent across first-party sources:
  - Source type comment: "(decimal)" [S4].
  - Docs say "Convert the hex value to a decimal" and store it as `NUMERIC(78,0)` with `UNIQUE(nullifier, action)` [W1].
  - Verify examples show `0x...` hex [W4].
  - The server `Nullifier` class parses hex up to 64 digits and checks that the value is below the BN254 field modulus. Its canonical form is `nil_` + 64 lowercase hex [S5].
  - Conclusion: normalise via `BigInt` before storing or comparing [S5][W7].
- Session proofs use `session_id` as the stable handle. `session_nullifier` is only for replay protection of each proof [A2][W6].

## Per-human id decision

**Decision: use the nullifier World returns. Nothing needs deriving.** `responses[0].nullifier` is a stable per-human id, scoped to user + RP + action [W5][W1]. The spike saw the same value on three separate runs for the simulator's one staging identity (`spikes/world/spike-transcript.txt`).

- Action: one fixed action per protected act, `register-critic`. The nullifier then means "this human, as a critic of skeptique". A second registration by the same human gives the same nullifier.
- Canonical form: `0x` + 64 lowercase hex (bytes32), computed as `BigInt(nullifier).toString(16).padStart(64, "0")`. This handles both the hex and decimal wire formats [S5][W1][W4]. It is the key the contract and the API store for "one critic per human" (spec/01 §3).
- Uniqueness is ours to enforce. World's verify endpoint accepted the same nullifier on every run, so `apps/api` (and the contract, via the voucher) must reject a nullifier it has already registered [W1].
- Signal: bind the proof to the critic by passing the critic's address as the `proofOfHuman({ signal })` value. This stops a proof being replayed for a different wallet [W1][W3]. The spike used a fixed string.

## Spike result (ticket 05)

`spikes/world/spike.mjs` runs everything headlessly on a laptop. Run it with `cd spikes/world && npm i && node spike.mjs`; the transcript is in `spikes/world/spike-transcript.txt`.

1. The local server (`spikes/world/server.mjs`) signs an `rp_context` with `WORLD_SIGNING_KEY` via `signRequest({ signingKeyHex, action })`.
2. The client calls `IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false, environment: "staging" }).preset(proofOfHuman({ signal }))` from `@worldcoin/idkit-core@4.6.0`, running in Node.
3. A JSON-RPC `tools/call` of `complete_test_request({ connect_url })` to `https://simulator.worldcoin.org/api/mcp` returned `proof_delivered`, with no auth and no Origin header needed [S7].
4. `pollUntilCompletion()` returned `{ protocol_version: "4.0", environment: "staging", responses: [1 item] }`.
5. The server's `POST /world/verify` checks `environment` and `action`, then forwards the body to `POST https://developer.world.org/api/v4/verify/{rp_id}`. Results:
   - **Valid proof:** 200, server returns `{ nullifier, expires_at_min }`.
   - **Tampered proof** (one digit of `proof[0]` changed): World answers 400 `all_verifications_failed` ("All proof verifications failed."), and our server returns 403 `{ reason: "all_verifications_failed" }`.
   - **Replayed nullifier** (same human again): our server returns 403 `{ reason: "nullifier_already_registered" }`.

Settled by the spike:
- The production verify host `developer.world.org` validates staging proofs when `environment: "staging"` is sent. `staging-developer.worldcoin.org` was not needed.
- An RP registered in the normal Developer Portal passes the simulator's staging check.
- The simulator MCP works from Node over plain HTTPS (Streamable HTTP, a stateless SSE reply).

### How we produce each failure case (for ticket 16)

- **Denied, invalid proof:** tamper any proof field before posting it. World returns 400 `all_verifications_failed` [W4]. Shown in the spike.
- **Denied, second critic from the same human:** post the same staging proof (or any later one from the simulator's single identity) a second time. Our nullifier store rejects it. Shown in the spike.
- **Denied, wrong environment:** our server rejects a result whose `environment` is not the configured one, before calling World [W1]. Covered by code, not exercised by the spike.
- **Expired:** sign the `rp_context` with a short `ttl` (e.g. `signRequest({ ..., ttl: 1 })`) and wait past `expires_at` before completing. The simulator then reports `request_expired`, and IDKit reports `rp_signature_expired` / `timestamp_too_old` [S1][S6][W12]. A client poll that times out reports `timeout` [S3]. Not exercised by the spike.
- **Cancelled:** abort `pollUntilCompletion({ signal })` with an `AbortController`. IDKit returns `{ success: false, error: "cancelled" }` [S3][W12]. In World App the user's "cancel" arrives as `user_rejected` [W12]. The simulator cannot cancel, because it only completes requests [S7]. Not exercised by the spike.
- In every failure case the protected action (critic registration) must not run: `/world/verify` returns 403 and signs no voucher.

### Proposed spec/03 change (not applied; spec/03 is frozen for this ticket)

- `POST /world/verify` body: "the IDKit 4.0 result `{ protocol_version, nonce, action, environment, responses[] }`, forwarded unchanged, plus the critic address that was used as the signal".
- Add `POST /world/rp-context`, which returns `{ rp_id, nonce, created_at, expires_at, signature }`. The client cannot build an IDKit request without a server-signed `rp_context` [W1].
- Response `expiry`: World returns no proof expiry on success. `responses[0].expires_at_min` is the closest field (the credential's minimum validity) [W4]. Propose that `expiry` means the voucher expiry set by our attestor (spec/01 §3).

## Mocked proofs and staging

- IDKit staging: set `environment: "staging"` and use the simulator at `simulator.worldcoin.org` [W1][W3].
- The simulator is a "Web simulator of the Worldcoin app to test the World ID protocol on the staging network" [G2]. It mirrors World App in the browser and needs no phone [G2][P1].
- The simulator only accepts requests with `environment === "staging"`. Anything else fails with `staging_required` [S6].
- IDKit sandbox: `environment: "sandbox"` plus the TestFlight / Play-testing "World ID (Sandbox)" phone app [W10].
  - Sandbox proofs are verified at the production endpoint `https://developer.world.org/api/v4/verify/${rp_id}` [W10].
  - Sandbox accounts are deletable and "not production" [W11].
- World IdP (OIDC) has its own sandbox issuer, `https://sandbox.auth.world.org`, using a manual selfie verify in the sandbox app [A3]. It is not relevant to our IDKit credentials.
- Example mocked-proof payload: **not documented**. A staging proof has the same `IDKitResult` shape as production with `environment: "staging"` [S4][S6].
- The event page's "proofs are mocked" most plausibly means staging/simulator proofs. No World page confirms this. We use staging + simulator for the demo.

## Failure cases (denied / expired / cancelled)

Client codes come from the `IDKitErrorCode` / `IDKitErrorCodes` enum, which also returns an optional `reason` [S2][S4][W12].

- **Cancelled:**
  - `user_rejected`: the user cancelled in the World ID app [W12][S4].
  - `verification_rejected`: legacy code; handle it like `user_rejected` [W12].
  - `cancelled`: client-side abort via the `signal` AbortSignal [S3][W12].
  - Optional reason `user_cancelled` [S4].
- **Expired:**
  - `timeout`: client polling passed `timeout` (default 15 min) [S3].
  - `rp_signature_expired` and `timestamp_too_old`: the RP signature is past `expires_at`. TTL defaults to 300 s [W12][S1].
  - `timestamp_too_far_in_future` and `invalid_timestamp` [W12].
  - The simulator reports `request_expired` [S6].
  - Proof request fields: `expires_at_min` (unix s) [W4].
- **Denied:**
  - Verify API returns HTTP 400 `all_verifications_failed`, with per-result `verification_error` (invalid proof) [W4].
  - Other client codes: `nullifier_replayed`, `max_verifications_reached`, `invalid_rp_signature`, `duplicate_nonce`, `unknown_rp`, `inactive_rp`, `invalid_rp_id_format`, `credential_unavailable`, `world_id_4_not_available`, `invalid_network`, `failed_by_host_app` (our `handleVerify` threw), `generic_error` [W12][S4].
  - Our own "already registered" check is a stored-nullifier collision [W1].
- Statuses from `pollOnce`: `waiting_for_connection`, `awaiting_confirmation`, `confirmed`, `failed` [S3].
- Which codes the verify API itself returns, beyond the three listed in Server-side validation, is **not documented** [W4].

## Headless testing

- The simulator exposes an MCP server with one tool, `complete_test_request({ connect_url })`. It generates a real native World ID 4.0 staging proof and delivers it through the IDKit bridge [S7].
- Route: `src/pages/api/mcp.ts`, so the endpoint is `https://simulator.worldcoin.org/api/mcp`. This URL is inferred from the Next.js route and the host allow-list; it is not in the docs [S8].
- Tool requirements [S7][S6]:
  - `environment: "staging"`
  - `allow_legacy_proofs: false`
  - a single Proof of Human uniqueness request (session `"create"` is allowed)
  - the RP registered for 4.0. The simulator checks `POST https://developer.worldcoin.org/api/v4/proof-context/{app_id}`, and if the RP is not registered it fails with the `AppNotRegisteredV4` error.
- Success result: `{ "status": "proof_delivered", "request_id" }` [S7].
- Failure result: `{ error, stage, outcome: "not_completed" | "unknown", error_delivered }`. Error codes include `invalid_connection_url`, `simulator_busy`, `staging_required`, `native_uniqueness_required`, `request_expired`, `proof_of_human_required`, `app_unavailable`, `prover_unavailable` [S6][S7].
- It "does not synthesize" invalid proofs. Test invalid-proof and business-rule failures through our own backend [S7].
- Browser shortcut: `https://simulator.worldcoin.org/?connect_url=<url-encoded connector URI>` [G2].
- Test vectors for RP signing exist in the docs, and the repo has `test-vectors/nullifier.json` [W2][G1].

## Open questions / not documented

- "Agent Pass" as a product or API: **not documented** on any World page found. auth.world.org documents only World IdP (OIDC, step-up, device grant, XAA) [A1][A2].
- Which verify host and `environment` value to use for staging/simulator proofs: **not documented explicitly**. Settled by the spike: `developer.world.org` with `environment: "staging"` works.
- A full verify-API error-code list and a 200 example: **not documented** [W4].
- Nullifier wire format (decimal or hex): sources conflict. Normalise via BigInt [S4][S5][W1][W4].
- Whether the app registered in the production portal passes the simulator's staging check: **not documented**. Settled by the spike: it does.
- Whether the simulator MCP needs auth or an Origin header from Node clients: the source validates Host/Origin against an allow-list but shows no auth [S8]. Settled by the spike: neither is needed.

## Sources

- A1 https://auth.world.org/llms.txt
- A2 https://auth.world.org/docs/guides/getting-started
- A3 https://auth.world.org/docs/guides/testing
- (also read) https://auth.world.org/.well-known/openid-configuration, https://auth.world.org/docs/guides/oidc, https://auth.world.org/docs/guides/id-token, https://auth.world.org/docs/guides/step-up, https://auth.world.org/docs/guides/coding-agent-setup.md
- W1 https://docs.world.org/world-id/idkit/integrate.md
- W2 https://docs.world.org/world-id/idkit/signatures.md
- W3 https://docs.world.org/world-id/idkit/javascript.md
- W4 https://docs.world.org/api-reference/developer-portal/verify.md
- W5 https://docs.world.org/world-id/concepts.md
- W6 https://docs.world.org/world-id/4-0-migration.md
- W7 https://docs.world.org/agents/human-in-the-loop/integrate.md
- W8 https://docs.world.org/agents/agent-kit/integrate.md
- W9 https://docs.world.org/model-context-protocol/developer-portal.md
- W10 https://docs.world.org/world-id/sandbox/sandbox-access.md
- W11 https://docs.world.org/world-id/sandbox/what-is-sandbox.md
- W12 https://docs.world.org/world-id/idkit/error-codes.md
- G1 https://github.com/worldcoin/idkit
- G2 https://github.com/worldcoin/simulator (README)
- P1 https://simulator.worldcoin.org
- S1 https://github.com/worldcoin/idkit/blob/main/js/packages/server/src/lib/signing.ts
- S2 https://github.com/worldcoin/idkit/blob/main/js/packages/core/src/types/config.ts
- S3 https://github.com/worldcoin/idkit/blob/main/js/packages/core/src/request.ts
- S4 https://github.com/worldcoin/idkit/blob/main/js/packages/core/src/types/protocol.ts
- S5 https://github.com/worldcoin/idkit/blob/main/js/packages/server/src/lib/nullifier.ts
- S6 https://github.com/worldcoin/simulator/blob/HEAD/src/services/complete-test-request.ts (and src/services/metadata.ts, src/lib/constants.ts)
- S7 https://github.com/worldcoin/simulator/blob/HEAD/src/services/mcp.ts
- S8 https://github.com/worldcoin/simulator/blob/HEAD/src/pages/api/mcp.ts
- N1 https://registry.npmjs.org/@worldcoin/idkit-core/latest (and /@worldcoin/idkit, /@worldcoin/idkit-server, /@worldcoin/human-in-the-loop, /@worldcoin/agentkit)
