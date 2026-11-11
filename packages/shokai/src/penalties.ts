// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * Graduated penalties (SPEC §9.3, §2.4, Conventions; C288).
 *
 * - A setup failure is something the visiting representative can fix: a schema or format error, REQUEST_INCOMPLETE,
 *   PURPOSE_NOT_SERVED for a purpose the place doesn't list, a listed purpose the place refuses, or a possession proof
 *   that is missing, malformed or signed over the wrong nonce. It never counts toward probing and never yields `never`.
 *   The first one gets `not_now` with a short retry; repeats only lengthen the retry, up to a bound (default 1 hour).
 * - Only signed misconduct (a deterministic finding on signed material: a copied possession proof valid for another
 *   encounter, a forged or contradicting signed claim, a replay) may escalate to `never`. Every `never` carries an expiry
 *   (at most 180 days) and an appeal path.
 * - Heuristic detection alone is "other": it is noted, it never bans and it doesn't lengthen the retry.
 *
 * Callers compare principals as the door does (canonical DIDs); the ledger keys on the string it is given.
 */

export type PenaltyKind = "setup" | "signed_misconduct" | "other";

/** The deterministic findings that may escalate to a long refusal (§9.3, C288). */
export type MisconductFinding = "copied_proof" | "forged_claim" | "contradicting_claim" | "replay";

export type PenaltyEvidence = {
  /** The finding rests on a message the principal's key signed, and that signature verified. */
  signed?: boolean;
  /** A deterministic finding on signed material. */
  finding?: MisconductFinding;
  /** The detection is heuristic only (a pattern or a guess); then it is never signed misconduct. */
  heuristic?: boolean;
  /** A schema or format error in the message. */
  schemaError?: boolean;
  /** The possession proof's setup problem (§2.4). */
  proof?: "missing" | "malformed" | "wrong_nonce";
  /** The purpose problem: one the place doesn't list, or a listed one it refuses. */
  purpose?: "unlisted" | "refused";
};

/** Where a refused principal can appeal: the place's contact/appeal URL in the reply, or an owner-signed appeal message. */
export type Appeal = { kind: "url"; url: string } | { kind: "owner_signed_message" };

export type PenaltyOutcome =
  | { disposition: "not_now"; retryAfterS: number }
  | { disposition: "never"; expiresAt: string; appeal: Appeal };

export type PenaltyLedgerOptions = {
  /** REQUIRED: every `never` carries an appeal path. */
  appeal: Appeal;
  /** The first setup failure's retry (default 60 s). */
  baseRetryS?: number;
  /** The bound on the retry (default 3600 s). */
  maxRetryS?: number;
  /** How much each repeat lengthens the retry (default 2). */
  factor?: number;
  /** A quiet period after which the backoff starts over (default 86400 s). */
  resetAfterS?: number;
  /** How long a `never` lasts (default and maximum 180 days). */
  neverDays?: number;
};

/** Reason codes that are setup failures whatever the evidence. */
export const SETUP_REASON_CODES: readonly string[] = ["REQUEST_INCOMPLETE", "PURPOSE_NOT_SERVED", "CREDENTIAL_REQUIRED", "VOUCH_REQUIRED"];

const FINDINGS: ReadonlySet<string> = new Set<MisconductFinding>(["copied_proof", "forged_claim", "contradicting_claim", "replay"]);
const DAY_MS = 86400e3;
export const MAX_NEVER_DAYS = 180;

/** Classify a refusal (§9.3, C288): signed misconduct only on a deterministic signed finding; heuristics are "other". */
export function classify(reasonCode?: string | null, evidence: PenaltyEvidence = {}): PenaltyKind {
  if (evidence.signed === true && !evidence.heuristic && typeof evidence.finding === "string" && FINDINGS.has(evidence.finding)) return "signed_misconduct";
  if (evidence.schemaError || evidence.proof || evidence.purpose) return "setup";
  if (typeof reasonCode === "string" && SETUP_REASON_CODES.includes(reasonCode)) return "setup";
  return "other";
}

const toMs = (t: Date | string | number): number => {
  const v = t instanceof Date ? t.getTime() : typeof t === "number" ? t : Date.parse(t);
  if (!Number.isFinite(v)) throw new Error("penalties: not a time");
  return v;
};

/** Per-principal graduated penalties, local to one host representative (§9.3, C288). */
export class PenaltyLedger {
  private readonly appeal: Appeal;
  private readonly baseRetryS: number;
  private readonly maxRetryS: number;
  private readonly factor: number;
  private readonly resetAfterS: number;
  private readonly neverDays: number;
  private readonly failures = new Map<string, { count: number; last: number }>();
  private readonly bans = new Map<string, number>();

  constructor(o: PenaltyLedgerOptions) {
    if (!o || !o.appeal) throw new Error("penalties: an appeal path is required");
    if (o.appeal.kind === "url") new URL(o.appeal.url);   // throws on a malformed URL
    else if (o.appeal.kind !== "owner_signed_message") throw new Error("penalties: unknown appeal kind");
    this.appeal = o.appeal.kind === "url" ? { kind: "url", url: o.appeal.url } : { kind: "owner_signed_message" };
    this.baseRetryS = o.baseRetryS ?? 60;
    this.maxRetryS = o.maxRetryS ?? 3600;
    this.factor = o.factor ?? 2;
    this.resetAfterS = o.resetAfterS ?? 86400;
    this.neverDays = o.neverDays ?? MAX_NEVER_DAYS;
    if (!(this.baseRetryS > 0) || !(this.maxRetryS >= this.baseRetryS) || !(this.factor >= 1) || !(this.resetAfterS > 0)) throw new Error("penalties: bad backoff options");
    if (!(this.neverDays > 0) || this.neverDays > MAX_NEVER_DAYS) throw new Error(`penalties: neverDays must be in (0, ${MAX_NEVER_DAYS}]`);
  }

  /** The principal's active `never`, if any; an expired one is lifted. */
  status(principal: string, now: Date | string | number): PenaltyOutcome | undefined {
    const t = toMs(now);
    const until = this.bans.get(principal);
    if (until === undefined) return undefined;
    if (t >= until) { this.bans.delete(principal); return undefined; }
    return { disposition: "never", expiresAt: new Date(until).toISOString(), appeal: this.appeal };
  }

  /** Record a refusal of the given kind and say how to answer it. */
  record(principal: string, kind: PenaltyKind, now: Date | string | number): PenaltyOutcome {
    const t = toMs(now);
    const active = this.status(principal, t);
    if (active) return active;
    if (kind === "signed_misconduct") {
      const until = t + this.neverDays * DAY_MS;
      this.bans.set(principal, until);
      this.failures.delete(principal);
      return { disposition: "never", expiresAt: new Date(until).toISOString(), appeal: this.appeal };
    }
    let f = this.failures.get(principal);
    if (!f || t - f.last > this.resetAfterS * 1e3) f = { count: 0, last: t };
    if (kind === "setup") f.count++;   // a warning ("other") never lengthens the retry and never bans
    f.last = t;
    this.failures.set(principal, f);
    const n = Math.max(1, f.count);
    const retry = Math.min(this.maxRetryS, Math.round(this.baseRetryS * Math.pow(this.factor, n - 1)));
    return { disposition: "not_now", retryAfterS: Number.isFinite(retry) ? retry : this.maxRetryS };
  }
}
