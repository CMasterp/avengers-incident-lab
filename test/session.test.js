import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionContext } from "../src/session.js";

const authorization = "Bearer demo-access-token-0123456789";
const refreshToken = "demo-refresh-token-0123456789";

test("builds an authenticated session when both tokens are valid", () => {
  const session = buildSessionContext({ authorization, refreshToken });

  assert.equal(session.authenticated, true);
  assert.equal(session.accessToken, "demo-access-token-0123456789");
});

test("rejects an authorization header that is not a Bearer token", () => {
  assert.throws(
    () => buildSessionContext({ authorization: "Basic demo", refreshToken }),
    /Bearer authorization/
  );
});

test("rejects a malformed refresh token", () => {
  assert.throws(
    () => buildSessionContext({ authorization, refreshToken: "short" }),
    /refresh token/
  );
});
