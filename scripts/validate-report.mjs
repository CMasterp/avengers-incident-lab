import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(new URL("../docs/mission-report.json", import.meta.url)));

assert.equal(report.version, 1, "report version must be 1");
assert.ok(report.updatedAt, "report needs an updatedAt timestamp");
assert.ok(["idle", "investigating", "awaiting_approval", "commented", "resolved", "error"].includes(report.mission.status), "mission status is invalid");
assert.equal(report.agents.length, 3, "report needs exactly three specialist agents");
assert.ok(Array.isArray(report.findings), "findings must be an array");
assert.ok(Array.isArray(report.threads), "threads must be an array");

for (const finding of report.findings) {
  assert.ok(finding.hero && finding.title && finding.description, "findings need a hero, title, and description");
  assert.ok(finding.confidence >= 0 && finding.confidence <= 1, "finding confidence must be in [0, 1]");
  assert.ok(Array.isArray(finding.evidence) && finding.evidence.length > 0, "findings need evidence");
}

console.log("mission-report.json is valid");
