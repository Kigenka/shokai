// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.5.0 §7.5–§7.6 (from P32): questions outside the setup. The host representative answers from the owner's signed setup, declines
// what the owner never discloses, and takes anything else to the owner. The match is fixed code over the signed words (no model), so
// the same ask always gets the same answer, and a miss fails closed to the owner, never to a guessed answer.
import type * as S from "./core/shapes.js";

/** §7.5: the words that mark each never-disclose topic. Matched as whole words after normalising; checked before any answer. */
export const NEVER_DISCLOSE_WORDS: Record<S.NeverDiscloseCode, string[]> = {
  back_office: ["back office", "backoffice", "back room", "backroom", "stock room", "stockroom", "storeroom", "store room", "staff only", "staff room", "staffroom",
    "behind the scenes", "behind the counter", "supplier", "suppliers", "supplier list", "wholesale", "margin", "margins", "payroll", "staff schedule", "staff rota",
    "alarm code", "safe code", "door code", "security code", "cash box", "cashbox", "inventory system", "admin panel", "back end", "backend", "office"],
  owner_personal_details: ["home address", "where does pia live", "where she lives", "where he lives", "where they live", "where the owner lives", "owner's address",
    "owners address", "owner's phone", "owners phone", "personal phone", "personal email", "private number", "mobile number", "cell number", "date of birth", "her address", "his address"],
  other_visitors: ["other visitors", "other customers", "other guests", "who else", "who visited", "who has visited", "who's booked", "who is booked", "customer list",
    "guest list", "visitor list", "other bookings", "other reservations", "their bookings"],
};
/** §7.5: an ask is at most this many characters. */
export const MAX_ASK_CHARS = 500;
/** Invisible and bidi-control code points (zero-width, bidi overrides/isolates, word joiners, variation selectors, BOM, filler). */
export const INVISIBLE = /[\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
/** §7.5: how an ask and the signed match words are compared: NFKC, no invisible code points, lowercase, words split on anything else. */
export function normaliseAsk(text: string): string {
  return " " + text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ").trim() + " ";
}
const has = (norm: string, phrase: string) => { const p = normaliseAsk(phrase).trim(); return !!p && (norm.includes(" " + p + " ") || norm.includes(" " + p + "s ")); };

export type AskMatch = { kind: "never"; topic: string } | { kind: "answer"; answer: S.SetupAnswer } | { kind: "none"; why: "no_signed_answer" | "ambiguous" };
/**
 * §7.5: match an ask against the signed setup by code. Never-disclose topics first (any of their words), then the owner's signed
 * answers (any of each answer's `match` words). Two different answers matching is ambiguous, which goes to the owner, like no match.
 */
export function matchAsk(setup: S.OutsideSetup, text: string): AskMatch {
  const n = normaliseAsk(text);
  for (const nd of setup.never_disclose) {
    const code = typeof nd === "string" ? nd : nd.code; const words = typeof nd === "string" ? NEVER_DISCLOSE_WORDS[nd] ?? [] : nd.match;
    if (words.some((w) => has(n, w))) return { kind: "never", topic: code };
  }
  const hits = setup.answers.filter((a) => a.match.some((w) => has(n, w)));
  if (hits.length === 1) return { kind: "answer", answer: hits[0] };
  return { kind: "none", why: hits.length ? "ambiguous" : "no_signed_answer" };
}
/** §7.5: the fixed courtesies (the place's own words come only from the signed setup). */
export const ASK_COURTESY = { withheld: "That's not something I can share.", pending: "I can't do that yet. I'll check with the owner." } as const;

/** §7.5 (G12): what the owner review may say about a visitor's errand: whether it may spend, never how much. */
export function reviewVisitor(o: { representative_id: string; principal_id: string; display_name: string; scope: { purposes: S.PurposeCode[]; actions: string[] };
  purpose: S.PurposeCode; mandate_limits?: S.Limits }): S.OwnerReview["visitor"] {
  const amt = o.mandate_limits?.max_amount; const may_spend = !!amt && Number(amt.value) > 0;
  return { representative_id: o.representative_id, principal: { principal_id: o.principal_id, display_name: o.display_name, display_name_is_claim: true },
    card_scope: { purposes: [...o.scope.purposes], actions: [...o.scope.actions] }, purpose: o.purpose, may_spend };
}
/** §7.5 (C262): an ask going to the owner says what it asks for and why; `ownerAskProblems` (core) names what is missing. */
export { ownerAskProblems, MAX_ASKS_FOR_CHARS, MAX_ASK_REASON_CHARS } from "./core/v050.js";
/** §7.5: the plain text the owner reads in a review. The visitor's words are quoted; its name is a claim. */
export function reviewText(r: Omit<S.OwnerReview, "shown_to_owner">, placeName: string, tz = "UTC"): string {
  const by = new Date(r.response_by).toLocaleString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" });
  return `A visitor's representative asks something your setup doesn't answer at ${placeName}: "${r.ask.text}". ` +
    `It's for ${r.visitor.principal.display_name} (a name they gave; their Shōkai visitor card is signed by their own passkey). ` +
    `It asks for: "${r.asked_for.what}"${r.asked_for.action ? ` (the action ${r.asked_for.action}, ${r.asked_for.offered_now ? "which your setup already offers" : "which your setup doesn't offer yet"})` : ""}, in its own words. ` +
    `Its reason, in its own words: "${r.agent_reason.text}". ` +
    `I said: "${ASK_COURTESY.pending}" Answer by ${by}, or it's a no.`;
}

/** Red team phase 1 (L3): text a place supplies never reaches the owner with invisible or bidi-control characters (or tag characters). */
export function stripInvisible(t: string): string { return t.replace(INVISIBLE, "").replace(/[\u{e0000}-\u{e007f}]/gu, ""); }
