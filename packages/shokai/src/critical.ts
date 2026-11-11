// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.5.0, expert review SHK-03 (provisional, C289): must-understand members and unknown enum values (SPEC Conventions).
// A signer lists in `crit` (inside the signed payload) the members a reader must implement to read the artefact as meant; a
// reader that doesn't implement one refuses the artefact instead of reading a narrowing as a widening. Unknown enum values fail closed.

/** C289 (review 4 R4-01): the members a v0.5.0 signer MUST list in `crit` when it uses them (ignoring one would widen what its
 *  artefact allows, and every reader of that artefact claims the class that defines it). */
export const RESTRICTIVE_MEMBERS = ["max_claims", "supersedes.hold", "fields[].sensitive", "limits.booking"] as const;
/** C289 (R4-01): opt-in extension members a signer MUST NOT list in `crit`; a reader that doesn't implement one ignores it. */
export const NEVER_CRITICAL_MEMBERS = ["owner_prompts", "place.site", "customer_link"] as const;

export type CritVerdict = { ok: true } | { ok: false; answer: "not_now"; reason_code: "UNSUPPORTED_CRITICAL"; unknown: string[]; malformed?: true };

const has = (o: unknown, path: string): boolean => {
  // C289 (fix check): a segment ending in "[]" addresses every element of an array; the path is present when one element carries it.
  const walk = (cur: any, segs: string[]): boolean => { if (!segs.length) return true; const [k, ...rest] = segs; const arr = k.endsWith("[]"), key = arr ? k.slice(0, -2) : k;
    if (cur === null || typeof cur !== "object" || !(key in cur)) return false; const v = cur[key]; return arr ? Array.isArray(v) && v.some((x) => walk(x, rest)) : walk(v, rest); };
  return walk(o, path.split("."));
};

/**
 * Check a parsed signed payload's `crit` list against the members this reader implements.
 * `crit` MUST be a non-empty array of distinct strings, each naming a member present in the payload (dotted paths for nested ones).
 */
export function checkCritical(payload: Record<string, unknown>, implemented: Iterable<string>): CritVerdict {
  if (!("crit" in payload)) return { ok: true };
  const c = payload.crit; const impl = new Set(implemented);
  const bad = (unknown: string[] = []): CritVerdict => ({ ok: false, answer: "not_now", reason_code: "UNSUPPORTED_CRITICAL", unknown, malformed: true });
  if (!Array.isArray(c) || c.length === 0 || !c.every((x) => typeof x === "string" && x.length > 0)) return bad();
  if (new Set(c).size !== c.length) return bad();
  const missing = (c as string[]).filter((m) => !has(payload, m)); if (missing.length) return bad(missing);
  const unknown = (c as string[]).filter((m) => !impl.has(m));
  return unknown.length ? { ok: false, answer: "not_now", reason_code: "UNSUPPORTED_CRITICAL", unknown } : { ok: true };
}

export const KNOWN_DECISIONS = ["grant", "deny", "conditional", "considering"] as const;
export const KNOWN_DISPOSITIONS = ["not_now", "not_a_fit", "never"] as const;
export const KNOWN_RETRY_KINDS = ["never", "after", "with_credential"] as const;

/** An unknown disposition reads as `not_now` (never as `never`, and never as a grant). */
export function readDisposition(v: unknown): { value: "not_now" | "not_a_fit" | "never"; unknown?: true } {
  return typeof v === "string" && (KNOWN_DISPOSITIONS as readonly string[]).includes(v) ? { value: v as "not_now" | "not_a_fit" | "never" } : { value: "not_now", unknown: true };
}

/** How a receiver reads a decision whose `decision` value it doesn't know: deny / `not_now`, nothing granted. */
export function readDecision(d: { decision?: unknown; disposition?: unknown }): { decision: string; disposition?: string; granted: boolean; unknown?: true } {
  if (typeof d.decision !== "string" || !(KNOWN_DECISIONS as readonly string[]).includes(d.decision)) return { decision: "deny", disposition: "not_now", granted: false, unknown: true };
  if (d.decision === "deny") { const k = readDisposition(d.disposition); return { decision: "deny", disposition: k.value, granted: false, ...(k.unknown ? { unknown: true as const } : {}) }; }
  return { decision: d.decision, granted: d.decision === "grant" || d.decision === "conditional" };
}

/** An unknown reason code reads as absent; an unknown retry kind reads as no retry advice. */
export function readReasonCode(v: unknown, known: Iterable<string>): string | undefined { return typeof v === "string" && new Set(known).has(v) ? v : undefined; }
export function readRetryKind(v: unknown): "never" | "after" | "with_credential" | undefined {
  return typeof v === "string" && (KNOWN_RETRY_KINDS as readonly string[]).includes(v) ? (v as "never" | "after" | "with_credential") : undefined;
}

/** An unknown message `type` (or artefact `kind`) is not acted on. */
export function actOnType(type: unknown, known: Iterable<string>): boolean { return typeof type === "string" && new Set(known).has(type); }
