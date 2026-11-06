# World ID integration debrief (skeptique, ETHGlobal Mumbai)

skeptique gates its protected action, a critic agent staking and registering on CriticRegistry, behind World ID 4.0 proof of human. We built it with IDKit 4.6.0 (`@worldcoin/idkit-core`, `@worldcoin/idkit-server`), a server-signed `rp_context`, `POST developer.world.org/api/v4/verify/{rp_id}`, and the World ID simulator for staging proofs. Times are UTC on 2026-11-06, taken from the raw notes below and our git history.

## 1. Time to first success
- **3h14m38s wall clock** from first touching the Developer Portal (05:22:02) to the first proof validated on our server (08:36:40). Most of that gap was other hackathon work.
- **About 14 minutes of hands-on work** from starting the World spike (08:23) to that first validated proof. The first staging proof arrived on our first run (08:36:10), and `developer.world.org` accepted it on our first try.
- **Full onboarding with denied paths** (server validation, voucher, Critics page, e2e for every failure path): the commits span 11:27–11:41, and a live run through the real simulator passed at 11:37:49, **6h15m after the timer started**.
- **Total hands-on World work** was under an hour; most of it was reading docs, not writing code.

## 2. Friction encountered
- **Two products, one prize name.** The prize names "World ID Agent Pass (auth.world.org)", but no World page uses "Agent Pass". auth.world.org documents an OIDC IdP (client_id/client_secret), while the Developer Portal hands out World ID 4.0 relying-party credentials (app_id, rp_id, signing_key) that belong to IDKit on docs.world.org. We had to guess which one was meant.
- **The portal didn't match our expectations.** We expected OIDC client credentials; the portal offered "Register relying party" instead, and we searched the docs to map one to the other.
- **The useful testing tool is hidden.** The simulator's MCP tool `complete_test_request` delivers a real staging proof headlessly, which made our automated tests possible. We found it only by reading the simulator's source.
- **Uniqueness is easy to get wrong.** Repeated runs returned the same nullifier and the verify endpoint accepted it every time. Rejecting a second critic from the same human is entirely the app's job. The docs say so, but it is easy to miss.

## 3. Missing capability or docs
- **The verify API reference** shows no example 200 body and only two error codes (`app_not_migrated`, `all_verifications_failed`).
- **The nullifier wire format** is stated three ways: the type comment says decimal, the integrate guide says convert hex to decimal, and the verify examples show `0x` hex. We normalise through `BigInt`.
- **Which verify host and `environment` to use for simulator (staging) proofs** isn't stated. `staging-developer.worldcoin.org` is listed, but the production host with `environment: "staging"` is what worked.
- **The "staging registry"** that the simulator's instructions mention appears nowhere in the docs. A portal-registered RP turned out to be accepted.
- **No documented way to simulate cancelled or expired results.** The simulator only completes requests, so we tested those paths with fixtures on our own server.

## 4. The one improvement with the greatest impact
**One "Agent Pass" quickstart page on auth.world.org** that says: for gating an agent action on a human, use IDKit 4.0 + an RP-signed request + `/api/v4/verify`; test headlessly with the simulator MCP; here is a real 200 and a real 400 from verify. That single page would have removed every guess listed above.

---

# Raw notes

- 2026-11-06T05:22:02Z: World debrief timer started (ticket 01, first touch of the World portal)
- Friction: expected OIDC client ID/secret (as in our .env.example); portal instead offers "Register relying party" (World ID 4.0: app_id, rp_id, signing_key). Had to search the docs to map it.
- 2026-11-06T08:23:00Z: Spike 05 started (3h01m after timer start; the gap was other tickets, not World work).
- 2026-11-06T08:34:00Z: Docs research done (~11 min of an agent reading docs.world.org, auth.world.org, the idkit and simulator repos).
- Friction: the prize says "official World ID Agent Pass (auth.world.org)", but no World page uses the name "Agent Pass". auth.world.org documents World IdP (OIDC, client_id/client_secret), while the portal hands out World ID 4.0 RP credentials (app_id, rp_id, signing_key) that belong to IDKit on docs.world.org. Two products, one prize name; we had to guess which is meant.
- Missing docs: no example 200 body and only two error codes (`app_not_migrated`, `all_verifications_failed`) on the v4 verify reference page.
- Missing docs: nullifier wire format conflicts (type comment says decimal, integrate guide says convert hex to decimal, verify examples show 0x hex).
- Missing docs: which verify host and `environment` value to use for simulator (staging) proofs is not stated; `staging-developer.worldcoin.org` is listed but the simulator resolves RP context against `developer.worldcoin.org`.
- Nice: the simulator ships an MCP tool (`complete_test_request`) that delivers a real staging proof headlessly. Found only by reading source; not mentioned in the docs.
- 2026-11-06T08:35:00Z: Simulator MCP answered initialize from plain curl (no Origin header, no auth). Its instructions say the RP must be 'registered in the staging registry'; unclear whether a portal-registered RP counts. Docs never mention a staging registry.
- 2026-11-06T08:36:10Z: FIRST STAGING PROOF received in Node via simulator MCP + idkit-core 4.6.0 on the first run (3h14m after timer start; ~13 min of hands-on spike work). The portal-registered RP was accepted by the simulator's staging check. Server verify still a stub (red run).
- 2026-11-06T08:36:40Z: FIRST SERVER-VALIDATED SUCCESS: `POST https://developer.world.org/api/v4/verify/{rp_id}` accepted a simulator staging proof with `environment: "staging"` on the first try (3h14m38s after timer start; ~14 min of hands-on spike work). Tampered proof came back 400 `all_verifications_failed`.
- Observation: three runs gave the same nullifier, so the simulator uses one fixed staging identity, and World's verify endpoint accepted the same nullifier every time. Uniqueness is entirely the app's job; the docs say so, but it is easy to miss.
- Answer to an open question: the production verify host works for staging proofs; `staging-developer.worldcoin.org` was not needed.
- 2026-11-06T08:45:00Z: Spike 05 closed (note + passing spike). World work so far: ~22 min hands-on (08:23 to 08:45), most of it reading docs.
- Biggest-impact improvement (candidate): one "Agent Pass" quickstart page on auth.world.org that says "for agent/human gating use IDKit 4.0 + RP signature + /api/v4/verify; test with the simulator MCP", with a real 200 and 400 verify example. That would have removed every guess we made.
