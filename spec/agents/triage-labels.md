# Triage Labels

The skills speak in terms of five canonical triage roles. This repo uses only two label strings; the other roles have no label and are not used.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | (not used)           | Maintainer needs to evaluate this issue  |
| `needs-info`               | (not used)           | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `needs-human`        | Only a human can do it (accounts, keys, faucets, recording, submitting) |
| `wontfix`                  | (not used)           | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table. If a skill asks for a role marked "not used", leave the ticket as `ready-for-agent` and add a note under `## Comments` instead.

For a `needs-human` ticket, suggest `/wizard` to generate the walkthrough script the human follows.
