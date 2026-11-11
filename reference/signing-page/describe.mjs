// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * What the owner is shown (SIGNING.md §2 item 3): every line is built HERE, on the server, from the payload's machine fields:
 * the kind of item, keys, purposes, actions, amounts, places and dates. Nothing the item's supplier wrote is used as a fact.
 * Supplier text (the item's title and summary) and free text inside the payload (a purpose statement, a role, a shown_to_owner
 * text, a display name) are returned separately as QUOTES, which the page shows marked as written by someone else.
 *
 * Nothing signed is hidden (N1, defender review 2026-10-28). Every leaf of the payload, at any depth, and of anything signed by
 * digest that the item carries (an allowance's grants, a door policy's private part), is either described in words or listed as
 * it is. Coverage is checked leaf by leaf after describing; a value the page can't show faithfully (control or invisible
 * characters, nesting deeper than 8, a key that would make a field's path ambiguous) is a problem, and the page refuses to start.
 *
 * Kinds (N2): an item carrying the marker fields of more than one kind (say a mandate's and a card's) is refused, because a
 * receiver ignores members it doesn't know and could read it as the other kind. `own_tap`: an item with any amount anywhere,
 * an allowance, or an item of a kind this page doesn't know is never put in a one-tap batch (SIGNING.md §3).
 */
import { digestOf } from "./webauthn.mjs";
import { raiseProblems, raiseDecision } from "./raise.mjs";
import { textFor } from "./i18n.mjs";

/** Identifiers are shown in full: a shortened key isn't the key that is signed. */
const id = (did) => typeof did === "string" ? did : JSON.stringify(did);
const money = (m) => m && typeof m === "object" && !Array.isArray(m) && typeof m.value === "string" && typeof m.currency === "string" && Object.keys(m).length === 2 ? `${m.value} ${m.currency}` : null;
const isPrim = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const UNSAFE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]/;
const join = (path, k) => typeof k === "number" ? `${path}[${k}]` : path ? `${path}.${k}` : k;

/** Every leaf (primitive, Money, empty object or array) with its path. */
function leaves(v, path, out, problems, depth = 0) {
  if (depth > 8) { problems.push(`${path}: nested deeper than 8 levels; the page can't show it`); return out; }
  if (isPrim(v) || money(v)) { out.push([path, v]); if (typeof v === "string" && UNSAFE.test(v)) problems.push(`${path}: contains control or invisible characters the page can't show faithfully`); return out; }
  if (Array.isArray(v)) { if (!v.length) out.push([path, v]); v.forEach((x, i) => leaves(x, join(path, i), out, problems, depth + 1)); return out; }
  if (v && typeof v === "object") { const e = Object.entries(v); if (!e.length) out.push([path, v]);
    for (const [k, x] of e) { if (!/^[A-Za-z0-9_$-]{1,64}$/.test(k)) problems.push(`${join(path, k)}: a field name the page can't show unambiguously`); leaves(x, join(path, k), out, problems, depth + 1); } return out; }
  problems.push(`${path}: a value the page can't show`); return out;
}
/** Every amount anywhere, with where it sits. */
const amountsIn = (root, base) => leaves(root, base, [], []).filter(([, v]) => money(v)).map(([p, v]) => [p, v]);

// Marker fields: a payload carrying markers of two kinds is ambiguous (N2).
const MARKERS = {
  card: ["representative_key", "mandate_scope", "owner_binding", "principal"],
  mandate: ["mandate_id", "allowed_actions", "limits", "counterparties", "under_allowance"],
  allowance: ["allowance_id", "grant_digests", "revocation_status"],
  door_policy: ["policy_id", "private_digest", "trusted_introducers", "public"],
  owner_link: ["link_id", "owners", "audience"],
  card_revocation: ["revoked_at", "standby"],
};
const KINDS = [
  ["card", (p) => p.card_id && p.representative_key && p.principal],
  ["mandate", (p) => p.mandate_id],
  ["allowance", (p) => p.allowance_id && Array.isArray(p.grant_digests)],
  ["door_policy", (p) => p.policy_id && p.public],
  ["owner_link", (p) => p.link_id && Array.isArray(p.owners)],
  ["card_revocation", (p) => p.card_id && p.revoked_at && p.principal_id],
];

export function describe(payload, extra = {}) {
  // SIGNING.md §7: the words come from the language's table (i18n.mjs); every figure goes through fm() or when(), which record it
  // in `figures`, so test/language.mjs can check that every language shows the same figures from the same payload.
  const t = textFor(extra.lang), figures = [], list = t.list;
  const fm = (m) => { if (!money(m)) return null; figures.push(["amount", m.value, m.currency]); return t.money(m); };
  const when = (x) => { figures.push(["time", x ?? null]); return t.when(x, extra.timeZone); };
  const you = t.you;
  // Decision first (review 2026-11-01): `facts` holds what the owner reads first; `details` the technical identifiers, shown
  // under a collapsed Details section. Both are on the page and both are checked: nothing signed is hidden.
  const details = [], D = (...xs) => details.push(...xs); let decision = null;
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}, facts = [], quotes = [], problems = [];
  const shown = new Set();
  const at = (root, path) => path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), root);
  /** Mark paths as shown in words. Only a primitive, Money or an array of primitives can be marked; anything else stays for the listing. */
  const S = (...paths) => { for (const x of paths) { const v = at(p, x); if (v === undefined) continue; if (isPrim(v) || money(v) || (Array.isArray(v) && v.every(isPrim))) shown.add(x); } };
  const q = (from, path, text) => { if (typeof text === "string" && text.trim()) { quotes.push({ from, text }); if (path) shown.add(path); } };
  const kindsHere = Object.entries(MARKERS).filter(([, ks]) => ks.some((k) => k in p)).map(([k]) => k);
  let kind = (KINDS.find(([, t]) => t(p)) ?? ["unknown"])[0];
  if (kindsHere.length > 1) { problems.push(`this item mixes fields of more than one kind (${kindsHere.join(" and ")}); a place could read it as either, so the page won't sign it`); kind = "ambiguous"; }
  let label, ownTap = false; const extraRoots = [];
  if (kind === "card") {
    label = t.cardLabel;
    const rk = p.representative_key ?? {};
    facts.push(t.cardWhat(id(p.card_id), p.protocol, id(p.representative_id), t.cardName(p.kind))); S("card_id", "protocol", "representative_id");
    D(t.repKey(id(rk.key_id), rk.alg, rk.public_key)); S("representative_key.key_id", "representative_key.alg", "representative_key.public_key");
    if (rk.key_id && p.representative_id && !String(rk.key_id).startsWith(p.representative_id)) facts.push(t.keyMismatch);
    facts.push(t.purposes(list(p.mandate_scope?.purposes?.map?.(t.purpose) ?? p.mandate_scope?.purposes)), t.actions(list(p.mandate_scope?.actions))); D(t.purposeCode(list(p.mandate_scope?.purposes))); S("mandate_scope.purposes", "mandate_scope.actions");
    const mine = extra.ownerDid && p.principal?.principal_id === extra.ownerDid;
    facts.push(t.cardOwner(mine ? you : `${id(p.principal?.principal_id)}${t.notYours}`, p.principal?.kind)); S("principal.principal_id", "principal.kind");
    const ob = p.owner_binding;
    if (ob) {
      facts.push(t.boundTo(ob.rp_id, ob.method, ob.owner_id === extra.ownerDid && extra.ownerDid ? you : `${id(ob.owner_id)}${extra.ownerDid ? t.notYours : ""}`));
      S("owner_binding.rp_id", "owner_binding.method", "owner_binding.owner_id");
      if (ob.platform_key !== undefined) { facts.push(t.chatKey(id(ob.platform_key))); S("owner_binding.platform_key"); }
    }
    facts.push(t.valid(when(p.issued_at), when(p.expires_at))); S("issued_at", "expires_at");
    if (p.revocation_url !== undefined) { D(t.withdrawals(p.revocation_url)); S("revocation_url"); }
    if (p.standing !== undefined || p.locales !== undefined) { D(t.standing(p.standing?.tier, list(p.locales))); S("standing.tier", "locales"); }
    q(t.qCardName, "principal.display_name", p.principal?.display_name); q(t.qRole, "role", p.role);
    if (p.kind === "host") { describeHostCard(p, extra, { facts, quotes, problems, S, q, extraRoots, t, fm, when, list, D, label: (x) => { label = x; } });
      if (extra.house && amountsIn(extra.house, "house").length) ownTap = true; }   // a door that takes payments: never in a one-tap batch
    else if (p.kind === "visitor") { facts.push(t.visitorKind); S("kind"); }
  } else if (kind === "mandate") {
    const L = p.limits ?? {}, max = fm(L.max_amount);
    label = max ? t.mandateSpend(max)
      : (p.purpose?.code === "visitation" && typeof t.mandateBrowseOnly === "string" ? t.mandateBrowseOnly : t.mandateNoSpend);
    ownTap = !!max;
    // SIGNING.md §8: a one-purchase raise. The figures are checked first; on any mismatch nothing is offered (the page refuses).
    if (p.supersedes?.hold !== undefined || extra.raise !== undefined) {
      ownTap = true; const rp = raiseProblems(p, extra.raise, t.lang);
      if (rp.length) { problems.push(...rp); label = t.raiseRefused; }
      else { decision = raiseDecision(p, extra.raise, t.lang, figures); label = decision.label;
        S("supersedes.mandate_id", "supersedes.mandate_digest", "supersedes.hold.hold_id", "supersedes.hold.act_digest", "shown_to_owner.text", "shown_to_owner.locale"); }
    } else if (p.supersedes !== undefined) { D(t.supersedes(id(p.supersedes.mandate_id), p.supersedes.mandate_digest)); S("supersedes.mandate_id", "supersedes.mandate_digest"); }
    const m0 = facts.length;
    facts.push(t.mandateWhat(id(p.mandate_id), id(p.card_id), id(p.representative_id))); S("mandate_id", "card_id", "representative_id");
    facts.push(t.owner(extra.ownerDid && p.principal_id === extra.ownerDid ? you : id(p.principal_id))); S("principal_id");
    if (extra.ownerDid && !p.under_allowance && p.principal_id !== extra.ownerDid) facts.push(t.otherOwner);
    facts.push(t.purposeActions(p.purpose?.code === undefined ? undefined : t.purpose(p.purpose.code), list(p.allowed_actions))); D(t.purposeCode(p.purpose?.code)); S("purpose.code", "allowed_actions");
    if (!max) facts.push(t.spendNone);
    else if (L.max_amount_scope === "per_operation") facts.push(t.spendPerOp(max, fm(L.session_max_amount) ?? max));
    else facts.push(decision ? t.raiseAggregate(max) : t.spendTotal(max));
    S("limits.max_amount", "limits.max_amount_scope", "limits.session_max_amount");
    const other = [L.max_operations != null && t.maxOps(L.max_operations), L.rate_per_hour != null && t.ratePerHour(L.rate_per_hour), L.max_session_s != null && t.maxSession(L.max_session_s), Array.isArray(L.data_classes) && t.dataShared(list(L.data_classes))].filter(Boolean);
    if (other.length) facts.push(t.otherLimits(other)); S("limits.max_operations", "limits.rate_per_hour", "limits.max_session_s", "limits.data_classes");
    facts.push(Array.isArray(p.counterparties) && p.counterparties.length ? t.whereOnly(list(p.counterparties.map(id))) : t.whereAny); S("counterparties");
    facts.push(t.valid(when(p.valid_from ?? p.issued_at), when(p.expires_at))); S("valid_from", "expires_at");
    if (p.issued_at !== undefined) { D(t.issued(when(p.issued_at))); S("issued_at"); }
    if (p.under_allowance) { D(t.underAllowance(id(p.under_allowance.allowance_id))); S("under_allowance.allowance_id"); }
    q(t.qPurpose, "purpose.statement", p.purpose?.statement);
    // a raise: the decision is the screen; every mandate line moves under Details, with the hold it is bound to
    if (decision) details.unshift(...facts.splice(m0), ...decision.details, t.supersedes(id(p.supersedes.mandate_id), p.supersedes.mandate_digest));
  } else if (kind === "allowance") {
    label = t.allowanceLabel;
    ownTap = true;
    facts.push(t.allowanceWhat(id(p.allowance_id), id(p.card_id), id(p.representative_id))); S("allowance_id", "card_id", "representative_id");
    facts.push(t.owner(extra.ownerDid && p.owner_id === extra.ownerDid ? you : id(p.owner_id))); S("owner_id");
    const grants = Array.isArray(extra.grants) ? extra.grants : null;
    const want = [...p.grant_digests].sort().join(), got = grants ? grants.map((g) => digestOf(g)).sort().join() : "";
    if (!grants || want !== got) problems.push(`allowance ${p.allowance_id}: the item must carry its grants, and their digests must be exactly grant_digests; otherwise the page can't show what it allows`);
    else {
      S("grant_digests");
      grants.forEach((g, i) => {
        const gs = new Set(), GS = (...ks) => ks.forEach((k) => { const v = at(g, k); if (v !== undefined && (isPrim(v) || money(v) || (Array.isArray(v) && v.every(isPrim)))) gs.add(k); });
        const s = g.spend;
        facts.push(t.grant(i + 1, list(g.purposes?.map?.(t.purpose) ?? g.purposes), list(g.place_categories), list(g.actions))); D(t.purposeCode(list(g.purposes))); GS("purposes", "place_categories", "actions");
        facts.push(s ? t.grantSpend(i + 1, fm(s.per_period), t.period(s.period), s.per_seat ? fm(s.per_seat) : null)
          : t.grantNoSpend(i + 1)); GS("spend.per_period", "spend.period", "spend.per_seat");
        facts.push(Array.isArray(g.counterparties) && g.counterparties.length ? t.grantWhereOnly(i + 1, list(g.counterparties.map(id))) : t.grantWhereAny(i + 1)); GS("counterparties");
        if (typeof g.note?.text === "string" && g.note.text.trim()) { quotes.push({ from: t.qGrantNote(i + 1), text: g.note.text }); gs.add("note.text"); }
        extraRoots.push([g, `grants[${i}]`, new Set([...gs].map((k) => `grants[${i}].${k}`))]);
      });
    }
    facts.push(t.allowanceValid(when(p.valid_from), when(p.expires_at), p.revocation_status)); S("valid_from", "expires_at", "revocation_status");
    q(t.qAllowance, "shown_to_owner.text", p.shown_to_owner?.text);
  } else if (kind === "door_policy") {
    const u = p.public ?? {};
    label = t.doorLabel;
    facts.push(t.doorWhat(id(p.representative_id), id(p.policy_id))); S("representative_id", "policy_id");
    facts.push(t.owner(extra.ownerDid && p.owner_id === extra.ownerDid ? you : id(p.owner_id))); S("owner_id");
    facts.push(t.whoMay(list(u.categories), u.introduction, u.uninvited_per_month, u.paid_introductions));
    S("public.categories", "public.introduction", "public.uninvited_per_month", "public.paid_introductions");
    facts.push(t.trusted(list((p.trusted_introducers ?? []).map(id)))); S("trusted_introducers");
    facts.push(t.listed(u.listed, u.own_name_visitors)); S("public.listed", "public.own_name_visitors");
    // The private part is signed by digest only; the item must carry it ({salt, note}) so the owner sees what the digest stands for.
    const pv = extra.private;
    if (!pv || typeof pv !== "object" || digestOf({ salt: pv.salt, note: pv.note }) !== p.private_digest) problems.push(`door policy ${p.policy_id}: the item must carry its private part ({salt, note}) whose digest is private_digest; otherwise the page can't show what the owner signs`);
    else { D(t.privatePart(p.private_digest)); S("private_digest");
      extraRoots.push([{ note: pv.note }, "private", new Set()]); }
    facts.push(t.validIssued(when(p.valid_from), when(p.expires_at), p.issued_at ? when(p.issued_at) : null)); S("valid_from", "expires_at", "issued_at");
    q(t.qPolicy, "shown_to_owner.text", p.shown_to_owner?.text);
  } else if (kind === "owner_link") {
    label = t.linkLabel;
    facts.push(t.linkWhat(id(p.link_id), id(p.audience), p.owners.map(id).join(t.and))); S("link_id", "audience", "owners");
    facts.push(t.valid(when(p.issued_at), when(p.expires_at))); S("issued_at", "expires_at"); q(t.qLink, "purpose", p.purpose);
  } else if (kind === "card_revocation") {
    label = p.standby ? t.revStandbyLabel : t.revLabel;
    facts.push(t.revWhat(id(p.card_id), p.card_digest, extra.ownerDid && p.principal_id === extra.ownerDid ? you : id(p.principal_id))); S("card_id", "card_digest", "principal_id");
    facts.push(p.standby ? t.revStandby(when(p.revoked_at)) : t.revNow(when(p.revoked_at))); S("standby", "revoked_at");
    if (p.reason) { facts.push(t.reason(p.reason)); S("reason"); }
  } else if (kind === "unknown") {
    label = t.unknownLabel;
    ownTap = true;
    facts.push(t.unknownWhat);
  } else { label = t.mixedLabel; ownTap = true; facts.push(t.mixedWhat); }
  // Nothing hidden: every leaf not described in words, at any depth, listed as it is (strings with spaces or longer than 60 as quotes).
  const roots = [[p, "", shown], ...extraRoots];
  for (const [root, base, marks] of roots) {
    const covered = (path) => [...marks].some((m) => path === m || path.startsWith(m + ".") || path.startsWith(m + "["));
    for (const [path, v] of leaves(root, base, [], problems)) {
      if (covered(path)) continue;
      if (money(v)) D(`${path}: ${fm(v)}`);
      else if (Array.isArray(v) || (v && typeof v === "object")) D(`${path}: ${t.empty}`);
      else if (typeof v === "string" && (v.length > 60 || /\s/.test(v)) && !/^(did:|sha-256:|https:)/.test(v)) { D(`${path}: ${t.textBelow}`); quotes.push({ from: t.qField(path), text: v }); }
      else D(`${path}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
  }
  const amts = roots.flatMap(([root, base]) => amountsIn(root, base));
  if (amts.length) { ownTap = true; if (kind !== "mandate" && kind !== "allowance") facts.push(t.amounts(amts.map(([w, m]) => [w, fm(m)]))); }
  const main = facts.splice(0);
  facts.push(...main, ...details);
  if (facts.length > 80) problems.push(`item too large to show on one screen (${facts.length} lines)`);
  return { kind, label, facts, main, details, decision, quotes, own_tap: ownTap, problems, figures };
}

/**
 * v0.4.0 (§2.3): a Shōkai host card. Its house_digest stands for the house config the door will serve (the rules and the
 * leaflet's words), so the item must carry that config and the page checks the digest, then words the rules and shows the
 * leaflet. Every field of the house config is listed too (grouped per rule, so the screen stays readable): nothing is hidden.
 */
function describeHostCard(p, extra, o) {
  const { facts, quotes, problems, S, q, extraRoots, t, fm, when, list, D } = o;
  o.label(t.hostLabel);
  facts.push(t.hostKind); S("kind");
  const pl = p.place ?? {};
  facts.push(t.hostPlace(pl.entry, extra.ownerDid && pl.principal_id === extra.ownerDid ? t.you : `${id(pl.principal_id)}${t.notYours}`)); S("place.entry", "place.principal_id");
  if (pl.listing_digest !== undefined) { D(t.listing(pl.listing_digest)); S("place.listing_digest"); }
  const hs = p.host_scope ?? {};
  facts.push(t.serves(list(hs.actions), list(hs.duties))); S("host_scope.actions", "host_scope.duties");
  if (p.org_approval) { facts.push(t.orgApproval(p.org_approval.approver?.name, p.org_approval.approver?.role, p.org_approval.approver?.approver_id ? id(p.org_approval.approver.approver_id) : null, when(p.org_approval.approved_at)));
    S("org_approval.approver.name", "org_approval.approver.role", "org_approval.approver.approver_id", "org_approval.approved_at", "org_approval.record_ref"); if (p.org_approval.record_ref) D(t.approvalRecord(p.org_approval.record_ref)); }
  q(t.qHostSummary, "shown_to_owner.text", p.shown_to_owner?.text); S("shown_to_owner.locale");
  const h = extra.house;
  if (!h) { problems.push("a Shōkai host card item must carry its house config (`house`), so the page can show what house_digest stands for"); return; }
  if (p.house_digest !== extra.houseDigest) { problems.push(`the Shōkai host card's house_digest (${p.house_digest}) isn't the digest of the house config this item carries (${extra.houseDigest}); the page won't sign it`); return; }
  if (h.name !== undefined && pl.entry && !String(pl.entry).endsWith(`/places/${h.name}/entry`)) problems.push(`the Shōkai host card's entry (${pl.entry}) isn't the door of the house "${h.name}"`);
  facts.push(t.house(p.house_digest)); S("house_digest");
  const P = h.policy ?? {};
  const purposes = (P.purposes ?? []).map((x) => x.code);
  facts.push(t.houseFor(list(purposes)));
  for (const a of P.actions ?? []) {
    const spends = (P.spending_actions ?? []).includes(a.action), cap = spends ? fm(a.limits?.max_amount) : undefined;
    facts.push(t.houseAction(a.action, String(a.level ?? "?").replace(/_/g, " "), list(a.purposes), cap, Array.isArray(a.data_asks) && a.data_asks.length ? list(a.data_asks) : null));
  }
  const vouch = P.require_vouch_for ?? [];
  facts.push(t.houseIntro(vouch.length ? list(vouch) : null, P.trusted_introducers === "*" ? t.anyone : list(P.trusted_introducers), P.purchase_hold_s, P.seat_ttl_s));
  if (P.lobby?.onboarding_url) facts.push(t.leaflet(P.lobby.onboarding_url));
  // the leaflet, as the house config carries it (lobby about/how), quoted: the place's words and the shared template
  for (const [loc, x] of Object.entries(P.lobby?.about ?? {})) quotes.push({ from: t.qAbout(loc), text: x });
  for (const [loc, x] of Object.entries(P.lobby?.how ?? {})) quotes.push({ from: t.qHow(loc), text: x });
  // nothing hidden: every house field, grouped per top-level rule
  const groups = {};
  for (const [path, v] of leaves(h, "house", [], problems)) {
    const top = path.split(/[.[]/).slice(0, 3).join(".");
    const long = typeof v === "string" && (v.length > 60 || /\s/.test(v)) && !/^(did:|sha-256:|https?:)/.test(v);
    if (long && !/^house\.policy\.lobby\.(about|how)\./.test(path)) quotes.push({ from: t.qHouseField(path), text: v });
    (groups[top] ??= []).push(`${path.slice(top.length) || "="}${long ? t.quotedBelow : " " + (fm(v) ?? JSON.stringify(v))}`);
  }
  for (const [top, xs] of Object.entries(groups)) D(`${top}: ${xs.join("; ")}`);
  void extraRoots;   // the house is shown here (grouped per rule), not as an extra root
}
