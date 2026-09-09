import assert from "node:assert/strict";
import test from "node:test";
import { createJarvisRelay } from "../relay/server.js";
import { validateApproval, validateCommand } from "../schemas/commands.js";

test("command schema accepts only structured JARVIS intents", () => {
  assert.deepEqual(validateCommand({ type: "investigate", pullRequest: 1 }), { type: "investigate", pullRequest: 1 });
  assert.deepEqual(validateCommand({ type: "publish", pullRequest: 1, findingIds: ["iron-man-1"] }), { type: "publish", pullRequest: 1, findingIds: ["iron-man-1"] });
  assert.throws(() => validateCommand({ type: "investigate", pullRequest: 1, prompt: "rm -rf /" }), /Unknown/);
  assert.throws(() => validateCommand({ type: "shell", command: "anything" }), /type/);
  assert.throws(() => validateApproval({ approve: false }), /approve/);
});

async function withRelay(fn) {
  const relay = createJarvisRelay({ port: 0, mode: "mock" });
  const address = await relay.listen();
  try { await fn(`http://127.0.0.1:${address.port}`); } finally { await relay.close(); }
}

test("health is loopback-ready and CORS permits the published Page", async () => {
  await withRelay(async (base) => {
    const response = await fetch(`${base}/health`, { headers: { Origin: "https://cmasterp.github.io" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://cmasterp.github.io");
    assert.equal((await response.json()).status, "online");
  });
});

test("write commands wait for an explicit approval and publish SSE history", async () => {
  await withRelay(async (base) => {
    const created = await fetch(`${base}/v1/commands`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "publish", pullRequest: 1, findingIds: ["iron-man-1"] })
    });
    assert.equal(created.status, 202);
    const operation = await created.json();
    assert.equal(operation.requiresApproval, true);
    const stream = await fetch(`${base}/v1/operations/${operation.id}/events`);
    const reader = stream.body.getReader();
    const firstChunk = await reader.read();
    const history = new TextDecoder().decode(firstChunk.value);
    await reader.cancel();
    assert.match(history, /Command staged/);

    const approved = await fetch(`${base}/v1/commands/${operation.id}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve: true })
    });
    assert.equal(approved.status, 202);
  });
});
