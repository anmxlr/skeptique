# 30: Web polish

**Status:** ready-for-agent
**Size:** M
**Tracks:** none
**Blocked by:** 16, 22, 26
**Read:** spec/05-demo-script.md, spec/02-mechanism.md §6

**What to build:** The UI feels finished and honest.
- **Live updates:** pages update as chain events arrive (the API's event stream route).
- **Banner:** a demo-mode banner says plainly that the team runs the critics, so the consensus is staged.
- **Limits page:** an honest-limits page lists what spec/02 §6 does not defend (the closing beat of the demo).
- **Finish:** loading skeletons, error toasts and empty states on every page, keyboard navigation and contrast fixes.

If time is short, ship the banner and the limits page first.

## Acceptance criteria
- [ ] A round phase change appears on an open service page without a reload.
- [ ] Lighthouse accessibility scores 90 or more on the Marketplace, service, Critics and Buyer pages.
- [ ] A scripted walkthrough of every page logs no console errors.
- [ ] Done when: `pnpm --filter web test` and `pnpm e2e -t "live updates"` pass.

Receipt: `board/done/30.md`
