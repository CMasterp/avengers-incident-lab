const COMMAND_TYPES = new Set(["investigate", "publish", "resolve"]);
const ID_PATTERN = /^[A-Za-z0-9_.:-]{4,200}$/;

export class CommandValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandValidationError";
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new CommandValidationError(`Unknown command property: ${key}`);
    }
  }
}

function pullRequestNumber(value) {
  if (!Number.isInteger(value) || value < 1 || value > 10_000_000) {
    throw new CommandValidationError("pullRequest must be a positive integer.");
  }
  return value;
}

function safeId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new CommandValidationError(`${label} has an invalid format.`);
  }
  return value;
}

/**
 * Validates the only commands a browser may send to the local relay. Deliberately
 * no free-form prompt, repository, shell option, or MCP tool name is accepted.
 */
export function validateCommand(value) {
  if (!isPlainObject(value)) {
    throw new CommandValidationError("Command must be a JSON object.");
  }
  if (!COMMAND_TYPES.has(value.type)) {
    throw new CommandValidationError("type must be investigate, publish, or resolve.");
  }

  if (value.type === "investigate") {
    assertExactKeys(value, new Set(["type", "pullRequest"]));
    return { type: "investigate", pullRequest: pullRequestNumber(value.pullRequest) };
  }

  if (value.type === "publish") {
    assertExactKeys(value, new Set(["type", "pullRequest", "findingIds"]));
    const findingIds = value.findingIds;
    if (!Array.isArray(findingIds) || findingIds.length < 1 || findingIds.length > 20) {
      throw new CommandValidationError("findingIds doit contenir entre 1 et 20 identifiants.");
    }
    const uniqueIds = [...new Set(findingIds.map((id) => safeId(id, "findingId")))];
    if (uniqueIds.length !== findingIds.length) {
      throw new CommandValidationError("findingIds must not contain duplicates.");
    }
    return { type: "publish", pullRequest: pullRequestNumber(value.pullRequest), findingIds: uniqueIds };
  }

  assertExactKeys(value, new Set(["type", "pullRequest", "threadId"]));
  return {
    type: "resolve",
    pullRequest: pullRequestNumber(value.pullRequest),
    threadId: safeId(value.threadId, "threadId")
  };
}

export function validateWorkerResult(value, expectedAgent) {
  if (!isPlainObject(value) || value.agent !== expectedAgent || !Array.isArray(value.findings)) {
    throw new Error(`Invalid ${expectedAgent} worker result.`);
  }
  if (value.findings.length > 12) {
    throw new Error(`Too many findings from ${expectedAgent}.`);
  }
  for (const finding of value.findings) {
    if (!isPlainObject(finding) || typeof finding.finding !== "string" || !Array.isArray(finding.evidence) || finding.evidence.length < 1) {
      throw new Error(`A ${expectedAgent} finding lacks required evidence.`);
    }
  }
  return value;
}
