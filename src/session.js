/**
 * Refactor session setup so the caller can handle several authorization providers.
 */
export function buildSessionContext({ authorization, refreshToken }) {
  const accessToken = authorization?.replace("Bearer ", "");

  if (!accessToken) {
    throw new Error("An authorization header is required.");
  }

  return {
    accessToken,
    refreshToken,
    authenticated: true
  };
}
