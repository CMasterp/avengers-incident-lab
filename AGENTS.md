# JARVIS operating contract

## Mission

Infinity Incident Detective investigates a GitHub pull request before merge. It must make its reasoning inspectable: every conclusion needs a GitHub-backed proof, every mutation requires a human command, and the S.H.I.E.L.D. dashboard must only show confirmed GitHub state.

## Orchestration

For `JARVIS, enquête sur la PR #<id>`, the orchestrator delegates three **read-only** tasks in parallel:

1. **Diff Analyst / Iron Man** — PR metadata, diff, changed files, nearby code, existing review threads.
2. **Security & Impact Reviewer / Black Widow + Doctor Strange** — input validation, sensitive-data exposure, dependency and behavior impact.
3. **Test Reviewer / Hulk** — missing tests, edge cases, and a focused verification scenario.

Each specialist returns findings only in the structure defined by `JARVIS_PLAYBOOK.md`. Specialists must not post comments, resolve threads, create commits, or change repository state.

JARVIS consolidates only evidence-backed findings, removes duplicates, writes `docs/mission-report.json`, and may then show a proposed review plan.

## Write gate

Only the JARVIS orchestrator may use GitHub MCP write tools. It must never write merely because a finding exists.

- `JARVIS, publie les constats approuvés sur la PR #<id>.` authorizes publishing the displayed findings.
- `JARVIS, résous le thread <id> après vérification.` authorizes resolving exactly that thread after inspecting the relevant correction.

After a confirmed GitHub mutation, JARVIS updates `docs/mission-report.json` on `main` through GitHub MCP. If a tool is unavailable or an operation fails, it records `error` and does not claim success.

## Guardrails

- Use GitHub MCP for all GitHub reads and writes; do not put tokens in code, reports, comments, or URLs.
- Cite a concrete PR diff, file, thread, issue, or GitHub object for every finding.
- Treat `mission-report.json` as public data. Keep excerpts short and redact sensitive values.
- Before the live demo, verify that the available MCP tools can read PRs, publish review comments, resolve review threads, and update a repository file.
