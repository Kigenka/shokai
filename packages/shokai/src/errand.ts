// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * v0.5.0 (§5.5, C247; §8.3, C251; §7.3, C230; §6.6, C249): what a representative keeps to itself.
 *
 * - The errand budget: an owner-signed effort cap for one errand. The representative counts its effort against it and, when its
 *   next step would pass a limit, stops and brings the errand home. It can't raise its own budget: only a new ErrandBudget the
 *   owner signs for the same mandate replaces it (`ErrandMeter.replace`); there is no other way in.
 * - Records never sent to a place: an ErrandBudget, ReturnPrefs, and a LimitRequest's notify_at (`neverSentMember`).
 * - No acknowledgement-only messages (`acknowledgementOnly`).
 */
import type * as S from "./core/shapes.js";
import { makeSigned, makeOwnerSigned, digestOf, randomId, resolveDid, checkSig, sameDid, type Ed25519Signer, type PasskeyOwner } from "./core/crypto.js";

export const SHOKAI_ERRAND_BUDGET_REACHED = "SHOKAI_ERRAND_BUDGET_REACHED" as const;
export const SHOKAI_ERRAND_BUDGET_INVALID = "SHOKAI_ERRAND_BUDGET_INVALID" as const;
export const SHOKAI_NEVER_SENT = "SHOKAI_NEVER_SENT" as const;
export const SHOKAI_ACKNOWLEDGEMENT_ONLY = "SHOKAI_ACKNOWLEDGEMENT_ONLY" as const;

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");

export type ErrandBudgetInput = { maxTokens: number; maxMinutes?: number; maxVisits?: number; expiresAt?: string; shownToOwner?: string; locale?: string };
/** Have the owner sign an ErrandBudget for a mandate (§5.5). It expires with the mandate unless `expiresAt` is earlier. */
export function signErrandBudget(owner: PasskeyOwner | Ed25519Signer, mandate: S.SignedMandate, b: ErrandBudgetInput): S.Signed<S.ErrandBudget> {
  const exp = b.expiresAt && Date.parse(b.expiresAt) < Date.parse(mandate.payload.expires_at) ? b.expiresAt : mandate.payload.expires_at;
  const lim = [`${b.maxTokens} tokens`, ...(b.maxMinutes !== undefined ? [`${b.maxMinutes} minutes`] : []), ...(b.maxVisits !== undefined ? [`${b.maxVisits} visits`] : [])].join(", ");
  const p: S.ErrandBudget = { budget_id: randomId("eb"), mandate_id: mandate.payload.mandate_id, mandate_digest: mandate.payload_digest, max_tokens: b.maxTokens,
    ...(b.maxMinutes !== undefined ? { max_minutes: b.maxMinutes } : {}), ...(b.maxVisits !== undefined ? { max_visits: b.maxVisits } : {}), expires_at: exp,
    shown_to_owner: { text: b.shownToOwner ?? `This errand may take up to ${lim}.`, locale: b.locale ?? "en-US" } };
  const at = iso(Date.now());
  return owner.kind === "passkey" ? makeOwnerSigned(p, owner, at) : makeSigned(p, owner, at);
}

/** Why a budget can't be kept for this mandate, or null (signed by the mandate's owner, bound to it, well formed). */
export function errandBudgetProblem(b: S.Signed<S.ErrandBudget>, mandate: S.SignedMandate, rpId?: string): string | null {
  const p = b?.payload; if (!p || typeof p !== "object") return "not a signed ErrandBudget";
  let d: string; try { d = digestOf(p); } catch { return "payload is not canonicalisable"; }
  if (d !== b.payload_digest) return "payload_digest mismatch";
  const sig = b.signatures?.[0]; if (!sig || !sameDid(sig.signer, mandate.payload.principal_id)) return "not signed by the mandate's owner";
  const key = resolveDid(sig.signer); if (!key || !checkSig(sig, d, key, rpId).ok) return "the owner's signature doesn't verify";
  if (p.mandate_id !== mandate.payload.mandate_id || p.mandate_digest !== mandate.payload_digest) return "for another mandate";
  if (!Number.isInteger(p.max_tokens) || p.max_tokens < 0) return "max_tokens is not a count";
  for (const k of ["max_minutes", "max_visits"] as const) if (p[k] !== undefined && (typeof p[k] !== "number" || p[k]! < 0)) return `${k} is not a count`;
  if (!p.shown_to_owner?.text) return "no shown_to_owner";
  if (!Number.isFinite(Date.parse(p.expires_at))) return "no expires_at";
  return null;
}

export type ErrandStep = { tokens?: number; minutes?: number; visits?: number;
  /** True when the step's token count came from the model service (metered); otherwise it is the representative's estimate. */
  metered?: boolean };
export type ErrandLimit = "max_tokens" | "max_minutes" | "max_visits" | "expires_at";
/**
 * Counts one errand's effort against its owner-signed budget (§5.5, C247). Kept by the representative; never sent.
 * `minutes` are the wall-clock minutes since the meter started plus the step's own estimate.
 */
export class ErrandMeter {
  #budget: S.Signed<S.ErrandBudget>;
  readonly used = { tokens: 0, visits: 0 };
  readonly started: number;
  #stoppedBy?: ErrandLimit; #estimated = false; #metered = false;
  constructor(budget: S.Signed<S.ErrandBudget>, readonly mandate: S.SignedMandate, private o: { rpId?: string; now?: () => number } = {}) {
    const why = errandBudgetProblem(budget, mandate, o.rpId);
    if (why) throw Object.assign(new Error(`errand budget not kept: ${why}`), { code: SHOKAI_ERRAND_BUDGET_INVALID });
    this.#budget = budget; this.started = this.now();
  }
  private now() { return this.o.now ? this.o.now() : Date.now(); }
  get budget(): S.Signed<S.ErrandBudget> { return this.#budget; }
  get max() { const p = this.#budget.payload; return Object.freeze({ tokens: p.max_tokens, minutes: p.max_minutes, visits: p.max_visits, expires_at: p.expires_at }); }
  get minutes() { return (this.now() - this.started) / 60000; }
  /** The limit the next step would pass, or null. */
  wouldPass(step: ErrandStep = {}): { limit: ErrandLimit; used: number; max: number | string } | null {
    const m = this.max;
    if (this.now() > Date.parse(m.expires_at)) return { limit: "expires_at", used: this.now(), max: m.expires_at };
    if (this.used.tokens + (step.tokens ?? 0) > m.tokens) return { limit: "max_tokens", used: this.used.tokens, max: m.tokens };
    if (m.minutes !== undefined && this.minutes + (step.minutes ?? 0) > m.minutes) return { limit: "max_minutes", used: this.minutes, max: m.minutes };
    if (m.visits !== undefined && this.used.visits + (step.visits ?? 0) > m.visits) return { limit: "max_visits", used: this.used.visits, max: m.visits };
    return null;
  }
  /** Count a step, or stop: throws SHOKAI_ERRAND_BUDGET_REACHED (bringHome: true) and counts nothing when it would pass a limit. */
  count(step: ErrandStep): void {
    const w = this.wouldPass(step);
    if (w) { this.#stoppedBy = w.limit; throw Object.assign(new Error(`the errand budget's ${w.limit} would be passed: stop and bring the errand home with what it has (§5.5, §8.2)`),
      { code: SHOKAI_ERRAND_BUDGET_REACHED, bringHome: true as const, limit: w.limit }); }
    this.used.tokens += step.tokens ?? 0; this.used.visits += step.visits ?? 0;
    if ((step.tokens ?? 0) > 0) { if (step.metered) this.#metered = true; else this.#estimated = true; }
  }
  /**
   * The limit that stopped this errand, if one did (§5.5 "Stopping on the wire"): a step that would have passed a limit, or the
   * budget's end or its minutes run out. Once stopped, the representative sends nothing more for the errand except its farewell.
   */
  stopped(): ErrandLimit | undefined {
    if (!this.#stoppedBy) { const w = this.wouldPass({}); if (w) this.#stoppedBy = w.limit; }
    return this.#stoppedBy;
  }
  /** What the errand used, for the report home (§5.5, `VisitReport.errand_used`). Minutes are whole minutes, rounded up. */
  usage(): S.ErrandUsed {
    const stoppedBy = this.stopped();
    return { budget_id: this.#budget.payload.budget_id, tokens: this.used.tokens, tokens_basis: this.#metered && !this.#estimated ? "metered" : "estimated",
      visits: this.used.visits, minutes: Math.ceil(Math.max(0, this.minutes)), ...(stoppedBy ? { stopped_by: stoppedBy } : {}) };
  }
  /** The owner raises (or lowers) the budget by signing a new ErrandBudget for the same mandate. Anything else is refused. A stop
   *  ends with the new budget only if the errand is within its limits (what was used stays counted). */
  replace(next: S.Signed<S.ErrandBudget>): boolean {
    if (errandBudgetProblem(next, this.mandate, this.o.rpId) || next.payload.budget_id === this.#budget.payload.budget_id) return false;
    this.#budget = next; this.#stoppedBy = undefined; return true;
  }
}

/** §5.5 (C247), §8.3 (C251), §7.3 (C230): members and records a representative never sends to a place. */
const NEVER_SENT_KEYS = ["errand_budget", "return_prefs", "notify_at"] as const;
/** The first never-sent member or record found anywhere in `x` (by member name, or by an ErrandBudget/ReturnPrefs shape), or null. */
export function neverSentMember(x: unknown, depth = 0): string | null {
  if (!x || typeof x !== "object" || depth > 24) return null;
  if (Array.isArray(x)) { for (const v of x) { const r = neverSentMember(v, depth + 1); if (r) return r; } return null; }
  const o = x as Record<string, unknown>;
  for (const k of NEVER_SENT_KEYS) if (k in o) return k;
  if ("budget_id" in o && "max_tokens" in o && "mandate_id" in o) return "ErrandBudget";
  if ("prefs_id" in o && "time_zone" in o) return "ReturnPrefs";
  for (const v of Object.values(o)) { const r = neverSentMember(v, depth + 1); if (r) return r; }
  return null;
}

/** Messages the ritual requires, or that carry a decision or fact by their type: never acknowledgement-only (§6.6). */
const STRUCTURED = new Set(["greeting", "card_presentation", "introduction", "invitation_request", "invitation_response", "act", "act_confirmation", "act_result",
  "act_decision", "act_held", "farewell", "card_revocation", "inbox_poll", "delivery_receipt", "card_receipt", "lobby_briefing", "consideration_outcome"]);
const HEADER = new Set(["protocol", "encounter_id", "msg_id", "sent_at", "from", "to", "type", "in_reply_to", "seat_id"]);
const ACK_WORDS = new Set(["thanks", "thank", "you", "thx", "ty", "got", "it", "received", "ok", "okay", "noted", "ack", "acknowledged", "understood", "roger",
  "cheers", "great", "perfect", "much", "many", "appreciated", "will", "do", "sure", "sounds", "good", "all", "well"]);
/** True when a message's only content is an acknowledgement ("thanks", "got it", "received"): a representative SHOULD NOT send it (§6.6, C249). */
export function acknowledgementOnly(m: unknown): boolean {
  const o = (m && typeof m === "object" && "payload" in (m as object) ? (m as { payload: unknown }).payload : m) as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || STRUCTURED.has(String(o.type))) return false;
  const rest = Object.keys(o).filter((k) => !HEADER.has(k));
  if (!rest.every((k) => k === "text" || k === "courtesy")) return false;
  const text = typeof o.text === "string" ? o.text : (o.courtesy as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return rest.length === 0;
  const words = text.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  return words.length > 0 && words.length <= 8 && words.every((w) => ACK_WORDS.has(w));
}
