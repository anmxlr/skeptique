# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. (The GitHub MCP is not usable in this setup, so nothing goes to GitHub Issues.)

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec, when there is one, is `.scratch/<feature-slug>/spec.md`. Product-wide specs stay in `spec/`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the strings)
- Blocking edges are a `Blocked by:` line listing ticket numbers, or `none`
- Comments and conversation history append to the bottom of the file under a `## Comments` heading
- `.scratch/` is committed, not gitignored: ETHGlobal allows spec-driven work only if the planning artifacts are in the repo

## Done state

A ticket is done when its receipt exists at `board/done/<NN>.md` (what changed, command output tail, spec deviations, AI-use note), as `AGENTS.md` requires. Agents do not edit the ticket file to mark it done, so parallel agents never write the same file.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
