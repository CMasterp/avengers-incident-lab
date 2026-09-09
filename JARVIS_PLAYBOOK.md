# JARVIS playbook

## Operator commands

```text
JARVIS, enquête sur la PR #<id>.
JARVIS, publie les constats approuvés sur la PR #<id>.
JARVIS, résous le thread <id> après vérification.
```

The local Jarvis Relay accepts only these structured intents: `investigate` (PR number), `publish` (PR number), and `resolve` (thread ID). The dashboard-only `status` request refreshes the public report and never reaches the relay. The relay must never forward arbitrary browser text as a shell command or MCP call. `publish` and `resolve` always stop at an approval gate before any GitHub write.

## Specialist response contract

Return a JSON object containing a `findings` array. A finding has this shape:

```json
{
  "hero": "IRON_MAN | BLACK_WIDOW | DOCTOR_STRANGE | HULK",
  "severity": "critical | high | medium | low",
  "title": "Short, actionable finding",
  "description": "Why this matters",
  "file": "relative/path.js",
  "line": 12,
  "confidence": 0.82,
  "evidence": [{
    "type": "pull_request_diff | repository_file | review_thread | issue",
    "url": "https://github.com/owner/repo/...",
    "detail": "Short factual proof"
  }],
  "proposedComment": "A concise review comment, not published yet"
}
```

Do not return a finding below `0.5` confidence. If evidence is unavailable, return an empty array and explain the gap to JARVIS.

## Orchestrator workflow

1. Confirm the target PR and put both `mission.status` and `liveMonitor.phase` in `investigating` state. Add a concise public event identifying the operation, never its raw prompt.
2. Launch the three specialists in parallel with the PR coordinate and response contract.
3. Merge evidence-backed findings, retaining their source URLs and confidence.
4. Write a report in `awaiting_approval` state with a `pendingActions` entry; do not create GitHub comments.
5. On an explicit publish command and local approval, post approved comments via GitHub MCP and record their actual thread IDs and URLs. Only then set the phase to `commented`.
6. On an explicit resolution command and local approval, re-read the relevant diff and thread. Resolve only the requested thread after confirmation, then set the phase to `resolved`.
7. On any failure, set the public phase to `error` with a short safe message; do not claim success.
8. Commit the updated public-safe report to `main` via GitHub MCP so GitHub Pages can refresh.
