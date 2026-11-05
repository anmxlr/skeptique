# skeptic spec-kit

| File | Purpose |
|---|---|
| `01-architecture.md` | Components, chains, data flow, defaults and the decisions to veto |
| `02-mechanism.md` | The incentive mechanism, precisely: rounds, scoring, rewards, slashing, parameters, known limits |
| `03-interfaces.md` | Frozen seams: contract ABI, shared types, API routes, test-suite format. Lanes build against this |
| `04-compliance-checklist.md` | Every sponsor/ETHGlobal requirement mapped to the ticket that satisfies it |
| `05-demo-script.md` | The demo storyline, with the moments each sponsor needs to see |
| `notes/` | Findings written by spike tickets 02, 03 and 05. Agents read these instead of guessing sponsor APIs |

Change policy: `02` and `03` are frozen after ticket 06 merges. A change needs a human OK and a note in `spec/CHANGELOG.md`, because parallel tickets build against them.
