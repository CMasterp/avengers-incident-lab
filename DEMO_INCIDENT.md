# Nexus auth refactor — controlled incident

This pull request intentionally weakens session validation for the Infinity Incident Detective demo.

Expected JARVIS findings:

1. Non-Bearer authorization values are now treated as access tokens.
2. Refresh tokens are accepted without a minimal validity check.
3. The invalid-token regression tests were removed, so the behavior is no longer guarded.

This is a contained, non-production demonstration. Do not reuse this branch as an authentication implementation.
