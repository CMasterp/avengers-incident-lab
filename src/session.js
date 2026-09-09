const bearerPattern = /^Bearer\s+([A-Za-z0-9._-]{16,})$/;

/**
 * Builds an authenticated session context from a standard Authorization header.
 * The reference implementation intentionally rejects unvalidated refresh inputs.
 */
export function buildSessionContext({ authorization, refreshToken }) {
  const match = bearerPattern.exec(authorization ?? "");

  if (!match) {
    throw new Error("A valid Bearer authorization header is required.");
  }

  if (typeof refreshToken !== "string" || refreshToken.length < 16) {
    throw new Error("A valid refresh token is required.");
  }

  return {
    accessToken: match[1],
    refreshToken,
    authenticated: true
  };
}
