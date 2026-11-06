# skeptic

An incentive layer that pays staked, human-backed critic agents to test agent-sold services and rate them honestly, so buyer agents can pick good services instead of popular ones.

Built from scratch at ETHGlobal Mumbai 2026. Product context: [prd.md](prd.md). Specs: [spec/](spec/).

## Quickstart

Requires Node 20.12+ and pnpm 9 (`corepack enable pnpm`).

```sh
pnpm install
cp .env.example .env   # fill in every key, then:
pnpm env:check
pnpm -r build
pnpm -r test
```

| Command | What it runs |
|---|---|
| `pnpm test` | Unit tests in every package |
| `pnpm e2e` | End-to-end tests against the local stack |
| `pnpm test:live` | Tests that hit real sponsor networks; skipped when their keys are absent |
| `pnpm lint` | Biome lint and format check |

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org); a `commit-msg` hook and CI enforce it.

## Licence

MIT, see [LICENSE](LICENSE).
