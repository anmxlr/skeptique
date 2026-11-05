# Lane P: polish and submission

## P-1 · README
- deps: I-2
- size: M
- tracks: Hedera, ENS, World
- read: spec/04-compliance-checklist.md, prd.md section 4.1
- do: setup, architecture diagram, payment flow, **a Hedera tx id of a settled payment**, how each sponsor is used, honest limits (spec/02 §6), disclosure of third-party libraries, mention HCS-14/ERC-8004 relation.
- done when: a fresh clone follows the README to run locally (checked by a human or scripted).

## P-2 · Architecture diagram
- deps: I-2
- size: S
- do: mermaid source in `docs/architecture.mmd` rendered to PNG, embedded in README.
- done when: image committed and referenced.

## P-3 · WORLD_FEEDBACK.md
- deps: S-03, D-1, F-6
- size: S
- tracks: World
- read: spec/04-compliance-checklist.md (World)
- do: turn raw notes into the debrief: time to first success, friction, missing capability or docs, the one highest-impact improvement.
- done when: file has all four items.

## P-4 · ENS live demo and showcase notes
- deps: D-3, F-2, P-8
- size: S
- tracks: ENS
- do: confirm the live site reads records through the resolver, list the ENSv2 features used and why they are central.
- done when: notes in `docs/ens.md` and the live link works.

## P-5 · HUMAN: demo video
- deps: I-5, F-9
- size: M
- who: human
- read: spec/05-demo-script.md
- do: record <= 5:00 following the script, HashScan link visible, World denied path, no secrets on screen.
- done when: video uploaded and linked in the submission draft.

## P-6 · AI usage disclosure
- deps: T-02
- size: S
- do: run `scripts/compile-ai-usage.mjs`, review, commit `AI_USAGE.md`.
- done when: file lists agent-assisted areas honestly.

## P-7 · HUMAN: final submission checklist
- deps: P-1, P-2, P-3, P-4, P-5, P-6
- size: M
- who: human
- read: spec/04-compliance-checklist.md
- do: tick every checklist line with evidence, verify git history looks incremental (no giant dump), select the exact three prizes (Hedera x402, Best Use of ENSv2, World ID Agent Pass $5,000), submit before the deadline.
- done when: checklist fully ticked and submission confirmation received.

## P-8 · Deploy web and api (live link)
- deps: F-9, I-2
- size: M
- do: deploy `apps/web` and `apps/api` to a public host with env configured; health check green.
- done when: public URL loads the marketplace and a record read works.
