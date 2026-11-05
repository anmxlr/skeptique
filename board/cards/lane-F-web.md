# Lane F: web (`apps/web`, Next.js). Build against the API fixtures; never hard-code product values.

## F-1 · Shell and design system
- deps: T-01
- size: M
- read: spec/05-demo-script.md
- do: layout, navigation (Marketplace, Critics, Sell, Run buyer), design tokens, light/dark, responsive, typed API client with fixture mode.
- done when: `pnpm --filter web build` passes and a screenshot test of the shell renders at 375px and 1280px.

## F-2 · Marketplace list
- deps: F-1, E-1
- size: M
- tracks: ENS
- read: spec/03-interfaces.md (ServiceView, ENS records)
- do: ranked services with score, confidence bar, probation state, category filter, ENS name and live record values read through the ENS reader (D-5).
- done when: component tests pass against fixtures; empty/loading/error states covered.

## F-3 · Service detail
- deps: F-2
- size: M
- read: spec/03-interfaces.md (RoundView, Evidence)
- do: round timeline, each critic's reveal and honest flag, evidence viewer (suite vs probes, latency, tx links to HashScan), score history.
- done when: tests pass; HashScan links built from tx ids.

## F-4 · Critic dashboard
- deps: F-1, E-1
- size: M
- read: spec/03-interfaces.md
- do: stake, honest rounds, slashes, pending rewards, claim button, ENS critic name.
- done when: tests pass with fixtures including a slashed critic.

## F-5 · Seller listing flow
- deps: F-1, A-5
- size: M
- read: spec/03-interfaces.md (ServiceRegistry)
- do: form (name, endpoint, price, suite upload with hash preview, fee), wallet transaction, result with ENS subname.
- done when: flow test against a local chain passes.

## F-6 · Critic onboarding with World Agent Pass (incl. denied path)
- deps: F-1, D-1
- size: M
- tracks: World
- read: spec/notes/world.md, spec/04-compliance-checklist.md (World)
- do: verify, show result, stake and register; clear UI states for denied, expired, cancelled and duplicate human; protected action never fires on failure.
- done when: tests cover success and every denied state; no secrets in client bundle (grep test).

## F-7 · Buyer-run panel (side by side)
- deps: F-2, E-3, E-5
- size: M
- read: spec/05-demo-script.md
- do: pick a task, run Skeptic buyer and popularity buyer, show choice explanations, results, tx ids with HashScan links.
- done when: tests pass against mocked buyers.

## F-8 · Approval modal and spend settings
- deps: F-7, E-4
- size: S
- tracks: Hedera
- do: pending approvals queue, approve/deny, budget and cap settings.
- done when: tests pass for approve and deny.

## F-9 · Polish pass
- deps: F-3, F-4, F-5, F-6, F-7, F-8
- size: M
- do: copy, spacing, loading skeletons, error toasts, keyboard and contrast checks, live SSE updates, 404/empty states, demo-mode banner explaining staged consensus.
- done when: Lighthouse accessibility >= 90 on main pages; no console errors in a scripted walkthrough.
