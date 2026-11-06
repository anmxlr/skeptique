# Lane E: api, ranking, buyer agent

## E-1 · Indexer and REST API
- deps: T-01
- size: M
- read: spec/03-interfaces.md (API), spec/02-mechanism.md §5
- do: `apps/api` Fastify + SQLite: ingest contract events, serve all routes in the spec, `/events` SSE, evidence store, popularity counter that excludes `x-skeptique-role: critic` calls. Work from event fixtures; chain adapter behind an interface.
- done when: API tests against fixtures pass for every route and schema.

## E-2 · Ranking function
- deps: T-01
- size: S
- read: spec/02-mechanism.md §5
- do: pure `rank(median, nReveals, ageDays)` in `packages/shared`, with unit tests for new service, stale service, and ordering stability.
- done when: `pnpm --filter shared test -- rank` passes.

## E-3 · Buyer agent core
- deps: E-1, B-8, E-2
- size: M
- tracks: Hedera
- read: spec/03-interfaces.md, spec/05-demo-script.md
- do: `apps/buyer`: given a task and category, list candidates, rank by `rank`, explain the choice in plain language, pay via x402 with no human approving, return result plus tx id. Mockable API and x402 client.
- done when: tests pass against mocks; one testnet run pays a real service and records the tx id.

## E-4 · Spend controls and approval threshold
- deps: E-3
- size: M
- tracks: Hedera
- read: prd.md section 4.1 (Hedera extra points)
- do: budget, per-merchant cap, allowlist, and an approval threshold above which the payment waits for a human decision (API endpoint plus pending queue); every payment writes an `agent_spend` HCS message via D-4 helper.
- done when: tests assert deny/approve/threshold behaviours and HCS message emission (mocked).

## E-5 · Popularity baseline buyer
- deps: E-1
- size: S
- read: spec/05-demo-script.md
- do: a buyer that ranks only by `popularityCalls`, used for the side-by-side demo.
- done when: test shows it picks the suite-gamer from seeded data while E-3 does not.

## E-6 · Optional: Hedera Agent Kit / Network MCP integration
- deps: E-3
- size: M
- tracks: Hedera
- read: docs.hedera.com/solutions/ai/agent-kit
- do: expose the buyer's payment and HCS actions through the Hedera Agent Kit (or call Hedera Network MCP for audit lookups). Skip if it costs more than one card.
- done when: README names the usage and one test or script exercises it.
