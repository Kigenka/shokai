// Pre-release compatibility (v0.3.0-rc1). The ONLY place in this implementation where the pre-release working-name
// wire tag appears: it lets a host that opts in (acceptLegacyCards) read cards signed before the v0.3 wire break.
// Conformance runs never use it. Removed at v0.3.0 final.
import { homedir } from "node:os";
import { join } from "node:path";
/** Wire tag of cards signed before the v0.3 wire break. Accepted for cards only, and only when a host opts in. */
export const LEGACY_PROTOCOL = "amcp/0.2";
/** The local key directory used by pilot-server.ts without --ephemeral-keys. Never committed. */
export const KEY_HOME = process.env.SHOKAI_HOME ?? join(homedir(), ".shokai");
export const LEGACY_KEY_HOME = KEY_HOME;
/** Environment variables are read with the SHOKAI_ prefix. */
export const env = (name: string): string | undefined => process.env["SHOKAI_" + name];
