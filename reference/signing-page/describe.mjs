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

/** Identifiers are shown in full: a shortened key isn't the key that is signed. */
const id = (did) => typeof did === "string" ? did : JSON.stringify(did);
const money = (m) => m && typeof m === "object" && !Array.isArray(m) && typeof m.value === "string" && typeof m.currency === "string" && Object.keys(m).length === 2 ? `${m.value} ${m.currency}` : null;
const isPrim = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const list = (a) => Array.isArray(a) && a.length ? a.map(String).join(", ") : "none";
const when = (t) => typeof t === "string" ? t.replace("T", " ").replace(/:\d\dZ$/, " UTC").replace(/Z$/, " UTC") : "not stated";
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
const amountsIn = (root, base) => leaves(root, base, [], []).filter(([, v]) => money(v)).map(([p, v]) => [p, money(v)]);

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
    label = "A card for your representative";
    const rk = p.representative_key ?? {};
    facts.push(`WHAT: a card (${id(p.card_id)}, format ${p.protocol ?? "not stated"}) that lets this key act as your representative: ${id(p.representative_id)}.`); S("card_id", "protocol", "representative_id");
    facts.push(`REPRESENTATIVE KEY: ${id(rk.key_id)} (${rk.alg ?? "algorithm not stated"}, public key ${rk.public_key ?? "not stated"}).`); S("representative_key.key_id", "representative_key.alg", "representative_key.public_key");
    if (rk.key_id && p.representative_id && !String(rk.key_id).startsWith(p.representative_id)) facts.push("WARNING: the card's representative_id and its key don't match.");
    facts.push(`PURPOSES: ${list(p.mandate_scope?.purposes)}.`, `ACTIONS: ${list(p.mandate_scope?.actions)}.`); S("mandate_scope.purposes", "mandate_scope.actions");
    const mine = extra.ownerDid && p.principal?.principal_id === extra.ownerDid;
    facts.push(`OWNER: ${mine ? "you (this passkey)" : `${id(p.principal?.principal_id)}. WARNING: not this passkey's key`} (${p.principal?.kind ?? "kind not stated"}).`); S("principal.principal_id", "principal.kind");
    const ob = p.owner_binding;
    if (ob) {
      facts.push(`BOUND TO: your passkey on ${ob.rp_id ?? "no stated site"}, method ${ob.method ?? "not stated"}, owner ${ob.owner_id === extra.ownerDid && extra.ownerDid ? "you (this passkey)" : `${id(ob.owner_id)}${extra.ownerDid ? ". WARNING: not this passkey's key" : ""}`}.`);
      S("owner_binding.rp_id", "owner_binding.method", "owner_binding.owner_id");
      if (ob.platform_key !== undefined) { facts.push(`CHAT KEY: ${id(ob.platform_key)}. This key alone can sign "you replied yes in chat" approvals for this card (SPEC §8.1). Sign only if it's the key of the chat app you use.`); S("owner_binding.platform_key"); }
    }
    facts.push(`VALID: ${when(p.issued_at)} until ${when(p.expires_at)}.`); S("issued_at", "expires_at");
    if (p.revocation_url !== undefined) { facts.push(`WITHDRAWALS: places can check ${p.revocation_url}.`); S("revocation_url"); }
    if (p.standing !== undefined || p.locales !== undefined) { facts.push(`STANDING: ${p.standing?.tier ?? "not stated"}. LANGUAGES: ${list(p.locales)}.`); S("standing.tier", "locales"); }
    q("the name on the card (a claim; nobody checked it)", "principal.display_name", p.principal?.display_name); q("the role written on the card", "role", p.role);
  } else if (kind === "mandate") {
    const L = p.limits ?? {}, max = money(L.max_amount);
    label = max ? `Permission to spend up to ${max}` : "Permission to act (no spending)";
    ownTap = !!max;
    facts.push(`WHAT: a mandate (${id(p.mandate_id)}) for card ${id(p.card_id)}, for the representative key ${id(p.representative_id)}.`); S("mandate_id", "card_id", "representative_id");
    facts.push(`OWNER: ${extra.ownerDid && p.principal_id === extra.ownerDid ? "you (this passkey)" : id(p.principal_id)}.`); S("principal_id");
    if (extra.ownerDid && !p.under_allowance && p.principal_id !== extra.ownerDid) facts.push(`WARNING: the mandate names another owner key, not this passkey's.`);
    facts.push(`PURPOSE: ${p.purpose?.code ?? "not stated"}. ACTIONS: ${list(p.allowed_actions)}.`); S("purpose.code", "allowed_actions");
    if (!max) facts.push("SPEND: nothing (no max_amount, so no spending is allowed).");
    else if (L.max_amount_scope === "per_operation") facts.push(`SPEND: up to ${max} per action, and at most ${money(L.session_max_amount) ?? max} in one visit.`);
    else facts.push(`SPEND: at most ${max} in total, across every visit under this mandate.`);
    S("limits.max_amount", "limits.max_amount_scope", "limits.session_max_amount");
    const other = [L.max_operations != null && `at most ${L.max_operations} actions`, L.rate_per_hour != null && `at most ${L.rate_per_hour} an hour`, L.max_session_s != null && `visits of at most ${L.max_session_s} s`, Array.isArray(L.data_classes) && `data shared: ${list(L.data_classes)}`].filter(Boolean);
    if (other.length) facts.push(`OTHER LIMITS: ${other.join("; ")}.`); S("limits.max_operations", "limits.rate_per_hour", "limits.max_session_s", "limits.data_classes");
    facts.push(Array.isArray(p.counterparties) && p.counterparties.length ? `WHERE: only at ${p.counterparties.map(id).join(", ")}.` : "WHERE: ANY place. No place is named, so it can be used anywhere that accepts it."); S("counterparties");
    facts.push(`VALID: ${when(p.valid_from ?? p.issued_at)} until ${when(p.expires_at)}.`); S("valid_from", "expires_at");
    if (p.issued_at !== undefined) { facts.push(`ISSUED: ${when(p.issued_at)}.`); S("issued_at"); }
    if (p.under_allowance) { facts.push(`UNDER ALLOWANCE: ${id(p.under_allowance.allowance_id)}.`); S("under_allowance.allowance_id"); }
    q("the purpose statement in the mandate", "purpose.statement", p.purpose?.statement);
  } else if (kind === "allowance") {
    label = "A standing allowance (your representative acts on its own inside it)";
    ownTap = true;
    facts.push(`WHAT: a standing allowance (${id(p.allowance_id)}) for card ${id(p.card_id)}: inside it the representative key ${id(p.representative_id)} acts without asking you.`); S("allowance_id", "card_id", "representative_id");
    facts.push(`OWNER: ${extra.ownerDid && p.owner_id === extra.ownerDid ? "you (this passkey)" : id(p.owner_id)}.`); S("owner_id");
    const grants = Array.isArray(extra.grants) ? extra.grants : null;
    const want = [...p.grant_digests].sort().join(), got = grants ? grants.map((g) => digestOf(g)).sort().join() : "";
    if (!grants || want !== got) problems.push(`allowance ${p.allowance_id}: the item must carry its grants, and their digests must be exactly grant_digests; otherwise the page can't show what it allows`);
    else {
      S("grant_digests");
      grants.forEach((g, i) => {
        const gs = new Set(), GS = (...ks) => ks.forEach((k) => { const v = at(g, k); if (v !== undefined && (isPrim(v) || money(v) || (Array.isArray(v) && v.every(isPrim)))) gs.add(k); });
        const s = g.spend;
        facts.push(`GRANT ${i + 1}: purposes ${list(g.purposes)}; places of kind ${list(g.place_categories)}; actions ${list(g.actions)}.`); GS("purposes", "place_categories", "actions");
        facts.push(s ? `GRANT ${i + 1} SPEND: up to ${money(s.per_period)} each ${({ P1D: "day", P7D: "week", P1M: "month" })[s.period] ?? s.period}${s.per_seat ? `, at most ${money(s.per_seat)} in one visit` : ""}. Your representative keeps this period total across places; each place checks only its own visit.`
          : `GRANT ${i + 1} SPEND: nothing.`); GS("spend.per_period", "spend.period", "spend.per_seat");
        facts.push(Array.isArray(g.counterparties) && g.counterparties.length ? `GRANT ${i + 1} WHERE: only at ${g.counterparties.map(id).join(", ")}.` : `GRANT ${i + 1} WHERE: any place of those kinds.`); GS("counterparties");
        if (typeof g.note?.text === "string" && g.note.text.trim()) { quotes.push({ from: `your note on grant ${i + 1}`, text: g.note.text }); gs.add("note.text"); }
        extraRoots.push([g, `grants[${i}]`, new Set([...gs].map((k) => `grants[${i}].${k}`))]);
      });
    }
    facts.push(`VALID: ${when(p.valid_from)} until ${when(p.expires_at)}. Places check for a withdrawal at ${p.revocation_status ?? "(not stated)"}.`); S("valid_from", "expires_at", "revocation_status");
    q("the allowance's shown_to_owner text", "shown_to_owner.text", p.shown_to_owner?.text);
  } else if (kind === "door_policy") {
    const u = p.public ?? {};
    label = "The rules for your own door";
    facts.push(`WHAT: the rules the key ${id(p.representative_id)} follows when it keeps your door (policy ${id(p.policy_id)}).`); S("representative_id", "policy_id");
    facts.push(`OWNER: ${extra.ownerDid && p.owner_id === extra.ownerDid ? "you (this passkey)" : id(p.owner_id)}.`); S("owner_id");
    facts.push(`WHO MAY PRESENT: ${list(u.categories)}; introductions ${u.introduction ?? "not stated"}; up to ${u.uninvited_per_month ?? "?"} uninvited brands a month; paid introductions ${u.paid_introductions ?? "not stated"}.`);
    S("public.categories", "public.introduction", "public.uninvited_per_month", "public.paid_introductions");
    facts.push(`TRUSTED INTRODUCERS: ${(p.trusted_introducers ?? []).length ? p.trusted_introducers.map(id).join(", ") : "none"}.`); S("trusted_introducers");
    facts.push(`LISTED PUBLICLY: ${u.listed ? "yes" : "no"}. VISITORS USING YOUR OWN NAME: ${u.own_name_visitors ?? "refuse (default)"}.`); S("public.listed", "public.own_name_visitors");
    // The private part is signed by digest only; the item must carry it ({salt, note}) so the owner sees what the digest stands for.
    const pv = extra.private;
    if (!pv || typeof pv !== "object" || digestOf({ salt: pv.salt, note: pv.note }) !== p.private_digest) problems.push(`door policy ${p.policy_id}: the item must carry its private part ({salt, note}) whose digest is private_digest; otherwise the page can't show what the owner signs`);
    else { facts.push(`PRIVATE PART (seen only by your representative, never by brands; signed as ${p.private_digest}): listed below as private.*.`); S("private_digest");
      extraRoots.push([{ note: pv.note }, "private", new Set()]); }
    facts.push(`VALID: ${when(p.valid_from)} until ${when(p.expires_at)}${p.issued_at ? `, issued ${when(p.issued_at)}` : ""}.`); S("valid_from", "expires_at", "issued_at");
    q("the policy's shown_to_owner text", "shown_to_owner.text", p.shown_to_owner?.text);
  } else if (kind === "owner_link") {
    label = "Telling one place that two of your identities are you";
    facts.push(`WHAT: link ${id(p.link_id)} tells ${id(p.audience)} (only that place) that ${p.owners.map(id).join(" and ")} are the same person.`); S("link_id", "audience", "owners");
    facts.push(`VALID: ${when(p.issued_at)} until ${when(p.expires_at)}.`); S("issued_at", "expires_at"); q("the link's purpose text", "purpose", p.purpose);
  } else if (kind === "card_revocation") {
    label = p.standby ? "A standby withdrawal of a card (kept for later)" : "Withdrawing a card";
    facts.push(`WHAT: withdraws card ${id(p.card_id)}${p.card_digest ? ` (${p.card_digest})` : ""} of the owner ${extra.ownerDid && p.principal_id === extra.ownerDid ? "you (this passkey)" : id(p.principal_id)}. Every open visit under it ends where it is delivered.`); S("card_id", "card_digest", "principal_id");
    facts.push(p.standby ? `STANDBY: nothing happens now; anyone holding this slip can deliver it later, so keep it safe. Dated ${when(p.revoked_at)}.` : `NOW: dated ${when(p.revoked_at)}.`); S("standby", "revoked_at");
    if (p.reason) { facts.push(`REASON: ${p.reason}.`); S("reason"); }
  } else if (kind === "unknown") {
    label = "An item of a kind this page doesn't recognize";
    ownTap = true;
    facts.push("WHAT: this page doesn't recognize this kind of item. Every field is listed below as it is; sign only if you understand all of it.");
  } else { label = "An item this page won't sign (mixed kinds)"; ownTap = true; facts.push("WHAT: this item carries fields of more than one kind of item; the page won't sign it."); }
  // Nothing hidden: every leaf not described in words, at any depth, listed as it is (strings with spaces or longer than 60 as quotes).
  const roots = [[p, "", shown], ...extraRoots];
  for (const [root, base, marks] of roots) {
    const covered = (path) => [...marks].some((m) => path === m || path.startsWith(m + ".") || path.startsWith(m + "["));
    for (const [path, v] of leaves(root, base, [], problems)) {
      if (covered(path)) continue;
      if (money(v)) facts.push(`${path}: ${money(v)}`);
      else if (Array.isArray(v) || (v && typeof v === "object")) facts.push(`${path}: (empty)`);
      else if (typeof v === "string" && (v.length > 60 || /\s/.test(v)) && !/^(did:|sha-256:|https:)/.test(v)) { facts.push(`${path}: (text, shown below as a quote)`); quotes.push({ from: `the item's field ${path}`, text: v }); }
      else facts.push(`${path}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
    }
  }
  const amts = roots.flatMap(([root, base]) => amountsIn(root, base));
  if (amts.length) { ownTap = true; if (kind !== "mandate" && kind !== "allowance") facts.push(`AMOUNTS IN THIS ITEM: ${amts.map(([w, m]) => `${m} (${w || "the item"})`).join("; ")}.`); }
  if (facts.length > 80) problems.push(`item too large to show on one screen (${facts.length} lines)`);
  return { kind, label, facts, quotes, own_tap: ownTap, problems };
}
