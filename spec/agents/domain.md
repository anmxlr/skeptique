# Domain Docs

How the engineering skills should consume this repo's domain documentation. This repo keeps docs in `spec/` (not a root `GLOSSARY.md` or `docs/adr/`), and work items in `.scratch/`.

## Before exploring, read these

- **`spec/GLOSSARY.md`**: the domain vocabulary (seller, critic, round, bounty, median, probe, voucher, and so on).
- **`spec/adr/`**: read ADRs that touch the area you're about to work in.
- The spec-kit itself (`spec/01`..`05`) is the source of truth for architecture, mechanism and interfaces. `spec/02` and `spec/03` are frozen: a change needs a human OK and a `spec/CHANGELOG.md` entry.

If the glossary or ADR folder doesn't exist yet, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved. When it does, it must write them under `spec/` (`spec/GLOSSARY.md`, `spec/adr/0001-slug.md`), overriding its root and `docs/adr/` defaults.

## Layout

Single-context repo:

```
/
├── spec/
│   ├── GLOSSARY.md
│   ├── adr/
│   │   └── 0001-<slug>.md
│   ├── 01-architecture.md … 05-demo-script.md
│   └── notes/            ← sponsor API findings from spike tickets
└── .scratch/<feature>/issues/NN-<slug>.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `spec/GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
