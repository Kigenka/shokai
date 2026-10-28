// No signing session is open. The session script writes a session here (backend origin, token hash, relay secret, expiry)
// only for a session the steward approved, in a copy of site/ that is never committed; closing it redeploys this file (null).
export const SESSION = null;
