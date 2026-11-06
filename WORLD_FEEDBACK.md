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
