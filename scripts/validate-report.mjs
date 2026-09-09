import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(new URL("../docs/mission-report.json", import.meta.url)));

assert.equal(report.version, 1, "report version must be 1");
assert.ok(report.updatedAt, "report needs an updatedAt timestamp");
assert.ok(["idle", "investigating", "commented", "resolved", "error"].includes(report.mission.status), "mission status is invalid");
assert.equal(report.agents.length, 3, "report needs exactly three specialist agents");
assert.ok(Array.isArray(report.findings), "findings must be an array");
assert.ok(Array.isArray(report.threads), "threads must be an array");
assert.ok(report.liveMonitor && typeof report.liveMonitor === "object", "report needs a liveMonitor object");

const phases = ["idle", "listening", "investigating", "commented", "resolved", "error"];
const commandTypes = ["investigate", "publish", "resolve", "status"];
assert.ok(phases.includes(report.liveMonitor.phase), "liveMonitor phase is invalid");
assert.ok(report.liveMonitor.activeOperation === null || typeof report.liveMonitor.activeOperation === "object", "activeOperation must be null or an object");
assert.equal(typeof report.liveMonitor.lastAgentMessage, "string", "liveMonitor needs a lastAgentMessage");
assert.ok(Array.isArray(report.liveMonitor.events), "liveMonitor events must be an array");
assert.ok(Array.isArray(report.liveMonitor.pendingActions), "liveMonitor pendingActions must be an array");

for (const event of report.liveMonitor.events) {
  assert.ok(event.id && event.at && event.actor && event.message, "liveMonitor events need id, time, actor, and message");
  assert.ok(phases.includes(event.phase), "liveMonitor event phase is invalid");
}

for (const action of report.liveMonitor.pendingActions) {
  assert.ok(action.id && action.label, "pending actions need id and label");
  assert.ok(commandTypes.includes(action.type), "pending action type is invalid");
}

for (const finding of report.findings) {
  assert.ok(finding.hero && finding.title && finding.description, "findings need a hero, title, and description");
  assert.ok(finding.confidence >= 0 && finding.confidence <= 1, "finding confidence must be in [0, 1]");
  assert.ok(Array.isArray(finding.evidence) && finding.evidence.length > 0, "findings need evidence");
}

console.log("mission-report.json is valid");
