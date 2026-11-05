# skeptic spec-kit

| File | Purpose |
|---|---|
| `01-architecture.md` | Components, chains, data flow, defaults and the decisions to veto |
| `02-mechanism.md` | The incentive mechanism, precisely: rounds, scoring, rewards, slashing, parameters, known limits |
| `03-interfaces.md` | Frozen seams: contract ABI, shared types, API routes, test-suite format. Lanes build against this |
| `04-compliance-checklist.md` | Every sponsor/ETHGlobal requirement mapped to the card that satisfies it |
| `05-demo-script.md` | The demo storyline, with the moments each sponsor needs to see |
| `notes/` | Findings written by spike cards (`S-01..S-03`). Agents read these instead of guessing sponsor APIs |

Change policy: `02` and `03` are frozen after card `T-01` merges. A change needs a human OK and a note in `spec/CHANGELOG.md`, because five lanes build against them in parallel.
