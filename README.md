# Avengers Incident Lab

Controlled GitHub repository for the **Infinity Incident Detective** demo.

- `main` contains the secure reference implementation and the GitHub Pages dashboard.
- The `feature/nexus-auth-refactor` pull request intentionally introduces review findings.
- No GitHub Actions are used in this repository.

## JARVIS demo

1. Open the pull request selected in `docs/mission-report.json`.
2. In Codex, ask JARVIS to investigate it.
3. Open the GitHub Pages dashboard and refresh the mission report.
4. Explicitly authorize JARVIS to publish one or more review comments.
5. After a correction, explicitly authorize JARVIS to resolve a verified thread.

The dashboard is static. It reads its live report from this repository's public raw GitHub URL; it never stores a GitHub token or invokes GitHub mutation APIs from the browser.

## Start the agent

```bash
cp .env.example .env
# Set GITHUB_PAT in .env, then:
set -a && source .env && set +a
codex
```

The repository-scoped `.mcp.json` exposes the GitHub MCP server to the coding agent. Follow `AGENTS.md` and `JARVIS_PLAYBOOK.md`; the dashboard itself is intentionally read-only.
