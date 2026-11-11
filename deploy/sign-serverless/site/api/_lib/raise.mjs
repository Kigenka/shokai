// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * SIGNING.md §8 (v0.5.0): a one-purchase raise. A place held a purchase above the owner's limit (SPEC §7.3) and the
 * representative agent brought home a LimitRequest. The item carries the superseding mandate to sign (`payload`) and, beside it,
 * what the page checks it against (`raise`):
 *   { limit_request: LimitRequest, current_mandate: { payload } (the mandate the owner signed), seat_limit?: Money,
 *     ledger_current: Money (the representative agent's own ledger for the errand), held: { tool, amount, act_digest },
 *     place_name?: string (a claim), time_zone?: IANA zone for the deadline }
 * The figures are checked before anything is shown; on any mismatch the page offers nothing to sign (it refuses to start) and
 * says the place's figures didn't match. The mandate must be built from the hold, never from free text.
 * Every function takes the owner's language ("en" or "ja", SIGNING.md §7); only the words change, never a figure or a check.
 */
import { digestOf } from "./webauthn.mjs";
import { textFor } from "./i18n.mjs";

const parse = (m) => {
  if (!m || typeof m !== "object" || typeof m.value !== "string" || typeof m.currency !== "string" || !/^\d+(\.\d{1,6})?$/.test(m.value)) return null;
  const [w, f = ""] = m.value.split("."); return { units: BigInt(w + f.padEnd(6, "0")), currency: m.currency };
};
/** A computed figure as Money, with as many decimals as `like` (never rounded: units are millionths). */
const fig = (units, cur, like) => { const dp = (like?.value?.split(".")[1] ?? "").length; const s = units.toString().padStart(7, "0");
  const w = s.slice(0, -6).replace(/^0+(?=\d)/, ""), f = s.slice(-6).slice(0, dp); return { value: dp ? `${w}.${f}` : w, currency: cur }; };
const placeOf = (did, lang) => typeof did !== "string" ? JSON.stringify(did) : did.startsWith("did:web:") ? (lang === "ja" ? `${decodeURIComponent(did.slice(8).split(":")[0])}（${did}）` : `${decodeURIComponent(did.slice(8).split(":")[0])} (${did})`) : did;
export const deadline = (t, tz, lang) => textFor(lang).deadline(t, tz);
/** The words for one language, with show() and when() recording every figure they render (for test/language.mjs). */
const words = (lang, figures) => { const t = textFor(lang), rec = figures ?? [];
  return { t, show: (m) => { rec.push(["amount", m?.value ?? null, m?.currency ?? null]); return m ? t.money(m) : t.money(null); },
    cell: (m) => { rec.push(["amount", m?.value ?? null, m?.currency ?? null]); return t.cell(m ?? null); },
    when: (x, tz) => { rec.push(["time", x ?? null]); return t.deadline(x, tz); } }; };

/** §8 item 2 and item 6: every problem with the figures or with how the mandate was built. Empty when the page may offer it. */
export function raiseProblems(p, r, lang) {
  const out = [], { t, show } = words(lang);
  if (!r || typeof r !== "object") return [t.raiseNoContext];
  const lr = r.limit_request ?? {}, cm = r.current_mandate?.payload, held = r.held ?? {};
  if (!cm || typeof cm !== "object") return [t.raiseNoMandate];
  const lim = parse(lr.limit), cur = parse(lr.current), pro = parse(lr.proposed), act = parse(held.amount), mcap = parse(cm.limits?.max_amount), mine = parse(r.ledger_current), scap = parse(r.seat_limit), max = parse(p.limits?.max_amount);
  if (!lim || !cur || !pro || !act || !mcap || !mine || !max) return [t.raiseMissing];
  if (new Set([lim.currency, cur.currency, pro.currency, act.currency, mcap.currency, mine.currency, max.currency]).size !== 1) return [t.raiseCurrency];
  // §8 item 2: limit against the signed mandate (or the seat's cap when lower), current against the ledger, proposed − current against the held act
  const want = scap && scap.currency === mcap.currency && scap.units < mcap.units ? scap.units : mcap.units;
  if (lim.units !== want) out.push(t.raiseLimit(show(lr.limit), show(fig(want, mcap.currency, cm.limits.max_amount))));
  if (cur.units !== mine.units) out.push(t.raiseCurrent(show(lr.current), show(r.ledger_current)));
  if (pro.units - cur.units !== act.units) out.push(t.raiseAct(show(fig(pro.units - cur.units, pro.currency, lr.proposed)), show(held.amount)));
  if (pro.units <= lim.units) out.push(t.raiseNotAbove(show(lr.proposed), show(lr.limit)));
  // §8 item 6: the mandate is built from the hold, not from free text
  const s = p.supersedes ?? {};
  if (max.units !== pro.units) out.push(t.raiseMax(show(p.limits?.max_amount), show(lr.proposed)));
  if (typeof p.expires_at !== "string" || typeof lr.expires_at !== "string" || isNaN(Date.parse(p.expires_at)) || Date.parse(p.expires_at) > Date.parse(lr.expires_at)) out.push(t.raiseExpiry(p.expires_at, lr.expires_at));
  if (s.hold?.hold_id !== lr.hold_id || !lr.hold_id) out.push(t.raiseHoldId(s.hold?.hold_id, lr.hold_id));
  if (s.hold?.act_digest !== held.act_digest || !held.act_digest) out.push(t.raiseActDigest);
  if (s.mandate_id !== cm.mandate_id || s.mandate_digest !== digestOf(cm)) out.push(t.raiseSupersedes);
  if (p.card_id !== cm.card_id || p.representative_id !== cm.representative_id || p.principal_id !== cm.principal_id) out.push(t.raiseSame);
  if (p.under_allowance !== undefined) out.push(t.raiseAllowance);
  if (Array.isArray(p.counterparties) && p.counterparties.length && !p.counterparties.every((c) => c === lr.place)) out.push(t.raisePlace);
  if (p.shown_to_owner !== undefined && p.shown_to_owner?.text !== raiseText(p, r, lang)) out.push(t.raiseShown);
  return out;
}
/** §8 items 1, 3, 4, 5: what the owner reads (and what shown_to_owner records). Built only from machine fields. */
export function raiseText(p, r, lang, figures) {
  const lr = r.limit_request, held = r.held, pro = parse(lr.proposed), { t, show, when } = words(lang, figures);
  return t.raiseText(placeOf(lr.place, t.lang), held.tool, show(held.amount), show(lr.limit), show(lr.current), show(fig(pro.units, pro.currency, lr.proposed)), when(lr.expires_at, r.time_zone));
}
/** The decision-first screen (SIGNING.md §8, review 2026-11-01): the question with the purchase amount, why approval is needed,
 *  the four figures, what this approves and what it doesn't, the seller (its name only as an unverified claim), the deadline and
 *  the text that is signed. Machine fields only. Call only when raiseProblems() is empty. The technical identifiers (card, mandate,
 *  keys, hold, act digest) are listed by describe() under Details. */
export function raiseDecision(p, r, lang, figures) {
  const lr = r.limit_request, held = r.held, cur = parse(lr.current), pro = parse(lr.proposed), { t, show, cell, when } = words(lang, figures);
  const act = fig(pro.units - cur.units, pro.currency, lr.proposed), total = fig(pro.units, pro.currency, lr.proposed), place = placeOf(lr.place, t.lang);
  const dl = when(lr.expires_at, r.time_zone);
  return {
    label: t.raiseLabel(show(act)), headline: t.raiseHeadline(show(act)), why: t.raiseWhy(place, show(act)),
    table_title: t.raiseTableTitle,
    table: [[t.raiseRows[0], cell(lr.limit)], [t.raiseRows[1], cell(lr.current)], [t.raiseRows[2], cell(act)], [t.raiseRows[3], cell(total)]],
    table_note: t.raiseTableNote, scope: t.raiseScope(show(act), show(total)),
    merchant_title: t.raiseMerchantTitle, merchant: [t.raiseSite(place), ...(r.place_name ? [t.raiseStoreName(r.place_name)] : [])], warning: t.raiseWarning,
    expiry_title: t.raiseExpiryTitle, expiry: [t.raiseExpiryLine(dl), ...t.raiseExpiryNotes],
    signed_title: t.raiseSignedTitle, signed_text: raiseText(p, r, lang, figures), approve: t.raiseApprove, decline: t.raiseDecline,
    details: [t.raiseTool(held.tool), t.raiseHold(lr.hold_id), t.raiseActId(held.act_digest)],
  };
}
