# World feedback (raw notes)

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
