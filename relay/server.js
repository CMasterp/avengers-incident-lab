import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateApproval, validateCommand, validateWorkerResult, CommandValidationError } from "../schemas/commands.js";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_OUTPUT_BYTES = 160 * 1024;
const DEFAULT_PORT = 4318;
const pageOrigin = "https://cmasterp.github.io";
const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

const workerDefinitions = [
  {
    id: "iron-man",
    name: "Iron Man",
    mission: "Read the PR diff, changed files, nearby code, and existing review threads. Find only evidence-backed code-quality findings."
  },
  {
    id: "black-widow-strange",
    name: "Black Widow & Doctor Strange",
    mission: "Read the PR and inspect security-sensitive inputs, behavior impact, and regressions. Find only evidence-backed risk findings."
  },
  {
    id: "hulk",
    name: "Hulk",
    mission: "Read the PR tests and changed behavior. Identify missing negative tests and focused verification scenarios with evidence."
  }
];

function allowedOrigin(origin) {
  return origin === pageOrigin || localOrigin.test(origin ?? "");
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    // Required by Chromium when an HTTPS page reaches a loopback/private network target.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}

function writeJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function publicError(error) {
  if (error instanceof CommandValidationError) return error.message;
  return "The JARVIS relay could not complete this operation.";
}

async function readJson(req) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) throw new CommandValidationError("Request body exceeds 16 KB.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CommandValidationError("Request body must be valid JSON.");
  }
}

function sanitize(value) {
  return String(value ?? "")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/ghp_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 700);
}

function parseLastJson(output) {
  const lines = output.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.result && typeof parsed.result === "object") return parsed.result;
      if (parsed?.output && typeof parsed.output === "object") return parsed.output;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Codex --json streams envelopes; only a valid final JSON object is useful here.
    }
  }
  throw new Error("Codex did not return a machine-readable result.");
}

function loadLocalGitHubPat(repoRoot) {
  if (process.env.GITHUB_PAT) return;
  try {
    const entry = readFileSync(resolve(repoRoot, ".env"), "utf8")
      .split(/\r?\n/)
      .find((line) => /^\s*GITHUB_PAT\s*=/.test(line));
    if (!entry) return;
    const value = entry.replace(/^\s*GITHUB_PAT\s*=\s*/, "").trim().replace(/^['"]|['"]$/g, "");
    if (value) process.env.GITHUB_PAT = value;
  } catch {
    // Missing local configuration is reported only if a real Codex operation needs it.
  }
}

function runProcess(command, args, { cwd, env }) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let total = 0;
    const receive = (target) => (chunk) => {
      total += chunk.length;
      if (total > MAX_OUTPUT_BYTES) {
        child.kill("SIGTERM");
        return;
      }
      if (target === "out") stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.on("data", receive("out"));
    child.stderr.on("data", receive("err"));
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (total > MAX_OUTPUT_BYTES) return rejectProcess(new Error("Codex output exceeded the safety limit."));
      if (code !== 0) return rejectProcess(new Error(`Codex exited with ${code}: ${sanitize(stderr)}`));
      resolveProcess(stdout);
    });
  });
}

function workerPrompt(worker, pullRequest) {
  return [
    "You are a read-only JARVIS subagent. Do not write to GitHub, change files, run shell commands that mutate state, or expose secrets.",
    `Repository: CMasterp/avengers-incident-lab. Pull request: #${pullRequest}.`,
    worker.mission,
    "Use only GitHub MCP read tools. Return exactly one JSON object and no Markdown:",
    `{"agent":"${worker.id}","findings":[{"finding":"...","evidence":[{"url":"https://github.com/...","detail":"..."}]}]}`
  ].join("\n");
}

function orchestratorPrompt(command, workers) {
  const workerSummary = workers.map(({ worker, result }) => ({ agent: worker.id, result })).map((entry) => JSON.stringify(entry)).join("\n");
  const writeInstruction = command.type === "investigate"
    ? "Do not post review comments, resolve threads, or change application code. You may use GitHub MCP to update only docs/mission-report.json on main with public, evidence-backed findings and liveMonitor state after the investigation."
    : "The operator explicitly approved this one action. Use GitHub MCP only for the requested action, verify GitHub confirms it, then update docs/mission-report.json on main with the confirmed public state. Do not do any other mutation.";
  return [
    "You are JARVIS Orchestrator for CMasterp/avengers-incident-lab.",
    writeInstruction,
    `Command: ${JSON.stringify(command)}`,
    "Worker evidence follows:", workerSummary,
    "Follow AGENTS.md. Return exactly one JSON object with a public `message` and `status`; never include secrets."
  ].join("\n");
}

/** Creates a loopback-only relay. Use mode=mock for safe demos/tests; live runs codex exec. */
export function createJarvisRelay({ port = DEFAULT_PORT, host = "127.0.0.1", mode = process.env.JARVIS_RELAY_MODE ?? "mock", repoRoot, spawnRunner = runProcess } = {}) {
  if (!["mock", "live"].includes(mode)) throw new Error("JARVIS_RELAY_MODE must be mock or live.");
  const resolvedRoot = repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (mode === "live") loadLocalGitHubPat(resolvedRoot);
  const operations = new Map();

  function event(operation, type, message, extra = {}) {
    const payload = { id: operation.id, type, phase: operation.phase, message: sanitize(message), at: new Date().toISOString(), ...extra };
    operation.events.push(payload);
    for (const response of operation.clients) response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  async function execute(operation) {
    operation.phase = "investigating";
    event(operation, "phase", "Avengers assembled. JARVIS is coordinating the mission.");
    if (mode === "mock") {
      for (const worker of workerDefinitions) event(operation, "agent", `${worker.name} completed a read-only evidence scan.`, { agent: worker.id, status: "complete" });
      operation.phase = operation.command.type === "investigate" ? "awaiting_approval" : "completed";
      event(operation, "complete", operation.command.type === "investigate" ? "Threats isolated. Human approval is required before GitHub writes." : "Approved command completed in mock mode.");
      return;
    }

    try {
      const workerResults = await Promise.all(workerDefinitions.map(async (worker) => {
        event(operation, "agent", `${worker.name} is investigating.`, { agent: worker.id, status: "investigating" });
        const output = await spawnRunner("codex", ["exec", "--json", workerPrompt(worker, operation.command.pullRequest)], {
          cwd: resolvedRoot,
          env: { ...process.env, JARVIS_ROLE: worker.id }
        });
        const result = validateWorkerResult(parseLastJson(output), worker.id);
        event(operation, "agent", `${worker.name} returned evidence-backed findings.`, { agent: worker.id, status: "complete", findingCount: result.findings.length });
        return { worker, result };
      }));
      event(operation, "orchestrator", "JARVIS is validating the evidence and removing duplicates.");
      const output = await spawnRunner("codex", ["exec", "--json", orchestratorPrompt(operation.command, workerResults)], {
        cwd: resolvedRoot,
        env: { ...process.env, JARVIS_ROLE: "orchestrator" }
      });
      const result = parseLastJson(output);
      operation.phase = operation.command.type === "investigate" ? "awaiting_approval" : "completed";
      event(operation, "complete", result.message ?? "JARVIS completed the operation.", { status: result.status ?? operation.phase });
    } catch (error) {
      operation.phase = "error";
      event(operation, "error", publicError(error));
    }
  }

  function createOperation(command) {
    const operation = { id: randomUUID(), command, phase: ["publish", "resolve"].includes(command.type) ? "awaiting_approval" : "queued", events: [], clients: new Set() };
    operations.set(operation.id, operation);
    event(operation, "created", command.type === "investigate" ? "Investigation command accepted." : "Command staged. Explicit approval is required before a GitHub write.");
    if (command.type === "investigate") queueMicrotask(() => execute(operation));
    return operation;
  }

  const server = createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204); res.end(); return;
    }
    const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      writeJson(res, 200, { status: "online", mode, bind: `${host}:${port}`, message: "JARVIS LOCAL LINK ONLINE" }); return;
    }
    if (req.method === "POST" && url.pathname === "/v1/commands") {
      try {
        const command = validateCommand(await readJson(req));
        const operation = createOperation(command);
        writeJson(res, 202, { id: operation.id, phase: operation.phase, requiresApproval: command.type !== "investigate" });
      } catch (error) { writeJson(res, 400, { error: publicError(error) }); }
      return;
    }
    const approval = /^\/v1\/commands\/([0-9a-f-]{36})\/approve$/.exec(url.pathname);
    if (req.method === "POST" && approval) {
      try {
        validateApproval(await readJson(req));
        const operation = operations.get(approval[1]);
        if (!operation) return writeJson(res, 404, { error: "Operation not found." });
        if (!["publish", "resolve"].includes(operation.command.type) || operation.phase !== "awaiting_approval") return writeJson(res, 409, { error: "This operation cannot be approved." });
        operation.phase = "queued";
        event(operation, "approved", "Operator approval received. JARVIS may execute the requested GitHub mutation.");
        queueMicrotask(() => execute(operation));
        writeJson(res, 202, { id: operation.id, phase: operation.phase });
      } catch (error) { writeJson(res, 400, { error: publicError(error) }); }
      return;
    }
    const events = /^\/v1\/operations\/([0-9a-f-]{36})\/events$/.exec(url.pathname);
    if (req.method === "GET" && events) {
      const operation = operations.get(events[1]);
      if (!operation) return writeJson(res, 404, { error: "Operation not found." });
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
      res.write("retry: 1500\n\n");
      for (const item of operation.events) res.write(`event: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`);
      operation.clients.add(res);
      req.on("close", () => operation.clients.delete(res));
      return;
    }
    writeJson(res, 404, { error: "Route not found." });
  });

  return {
    mode,
    server,
    operations,
    listen: () => new Promise((resolveListen, rejectListen) => {
      const onError = (error) => { server.off("listening", onListen); rejectListen(error); };
      const onListen = () => { server.off("error", onError); resolveListen(server.address()); };
      server.once("error", onError);
      server.once("listening", onListen);
      server.listen(port, host);
    }),
    close: () => new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const relay = createJarvisRelay();
  relay.listen().then((address) => {
    console.log(`JARVIS relay listening on http://${address.address}:${address.port} (${relay.mode} mode)`);
  });
}
