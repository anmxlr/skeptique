# 12: Listing creates a role-limited ENS subname

**Status:** ready-for-agent
**Size:** M
**Tracks:** ENS
**Blocked by:** 01, 03, 08
**Read:** spec/notes/ens.md, spec/03-interfaces.md (ENS records), spec/01-architecture.md (default 2)

**What to build:** When a service is listed, its subname under the services namespace appears on Sepolia ENSv2, and the marketplace and service page show that name resolved live through the resolver.

- A one-time, re-runnable setup script creates the parent, the service and critic subname registries, and the Permissioned Resolver.
- It grants roles so the seller may edit only `url` and `description` on their own subname, and only the relayer may write `skeptic.*` keys.
- The relayer watches listings and creates subnames, and is safe to restart.

Follow spec/notes/ens.md for every ENS call. If a needed capability is missing there, stop and write a blocker.

## Acceptance criteria
- [ ] A seller write to a `skeptic.*` key reverts; a seller write to `url` succeeds; a relayer write to a `skeptic.*` key succeeds.
- [ ] Re-running the relayer over the same listing does not create a second subname.
- [ ] The UI reads the name through the resolver, not from a constant or the API alone.
- [ ] Done when: `pnpm --filter relayer test` (mocked resolver) and `pnpm test:live -t "listing creates ENS subname"` (Sepolia) pass.

Receipt: `board/done/12.md`
