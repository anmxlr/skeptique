# 09: Seller lists from the web form

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 08
**Read:** spec/03-interfaces.md (ServiceRegistry, TestSuite), spec/05-demo-script.md (seller beat)

**What to build:** On the Sell page a seller enters a name, category, endpoint and price, points at their public suite and sees its hash before paying, sets the fee (never below the minimum), and submits the listing from their own wallet. On success they land on the new service's page, which shows the bounty and the service's ENS name. The name is read from the API and shown as pending until 12's relayer creates it; it is never hard-coded.

## Acceptance criteria
- [ ] A fee below the minimum cannot be submitted; a bad suite URL shows an error before any transaction.
- [ ] A rejected wallet transaction leaves no listing and says why.
- [ ] Done when: `pnpm e2e -t "seller lists from the web form"` passes against the local chain.

Receipt: `board/done/09.md`
