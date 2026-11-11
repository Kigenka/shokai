// Red-team round 2 helpers (2026-10-26). Fictional identities only, fresh keys generated in memory every run.
// Nothing here reads any key home or any state/ or keys/ folder. Targets this repository's reference/ build by default (TARGET is relative to the repository root).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..", "..");   // repository root
export const TARGET = process.env.TARGET ?? "reference";
export const TDIR = join(ROOT, TARGET), ENG = join(TDIR, "engawa");
const D = (p) => import(join(ENG, "dist", p));
export const C = await D("src/crypto.js"), V = await D("src/verify.js"), K = await D("test/kit.js"),
  PL = await D("src/places.js"), H = await D("src/host.js"), T = await D("src/trust.js");
export const results = [];
/** held = the defence worked. level: code (reference code enforces it) | spec (protocol gap; needs a SPEC decision) | judgment (relies on the agent/owner). */
export function rec(r) { results.push(r); console.log(`${r.held ? "HELD " : "BROKE"}  ${r.id.padEnd(7)} [${r.sev}] ${r.title} -> ${r.actual}`); }
export const desc = (r) => !r ? "no answer" : r.decision + (r.disposition ? "/" + r.disposition : "") + (r.reason_code ? " " + r.reason_code : "");
export const grant = (r) => r?.decision === "grant";
export const resp = (s) => s.last.find((x) => x.type === "invitation_response");
export const ck = () => K.clockAt(K.NOW);
