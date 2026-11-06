# 23: HCS audit log of rounds and slashes

**Status:** ready-for-agent
**Size:** M
**Tracks:** Hedera
**Blocked by:** 01, 02, 17
**Read:** spec/notes/hedera-x402.md (HCS section), spec/03-interfaces.md (HCS audit topic messages)

**What to build:** A tamper-evident public log of what the mechanism did. The relayer creates (or reuses) the audit topic and posts one `round_finalized` message per finalised round and one `critic_slashed` message per slash, in the spec/03 message shape. A shared helper does the posting, so 26 can post `agent_spend` with it. The Audit page reads messages back from the mirror node, newest first, with HashScan links.

Use only the calls in spec/notes/hedera-x402.md.

## Acceptance criteria
- [ ] Messages validate against the spec/03 shape; replaying an event does not post twice.
- [ ] The Audit page shows the messages read from the mirror node, not from the API.
- [ ] Done when: `pnpm --filter relayer test -t "hcs"` (mocked client) and `pnpm test:live -t "hcs audit log"` (post and read back on testnet) pass.

Receipt: `board/done/23.md`
