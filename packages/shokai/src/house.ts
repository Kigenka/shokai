// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.4.0 drop-in door: house.json, the one file that says what a place's door is. Whoever writes it (the owner by hand, or the
// owner's agent in a setup conversation), houseToDoorOptions() turns it into the same createDoor() options, so both ways in
// make the same door with the same house digest. Host-local tooling: nothing here is on the wire.
import type * as S from "./core/shapes.js";
import type { ActionPolicy } from "./core/policy.js";
import { leafletProblems, leaflet } from "./leaflet.js";
import { PRESETS, houseConfigFor, hostScopeFor, hostCardSummary, sign, type DoorOptions, type DoorPreset, type PasskeyOwner } from "./index.js";
import { randomId, digestOf, canonDid } from "./core/crypto.js";
import { PROTOCOL } from "./core/version.js";
import { summaryDigest } from "./core/v050.js";

export const HOUSE_FORMAT = "1" as const;
export type HouseAction = { action: string; purposes: S.PurposeCode[]; level: S.SeatingLevel; spends?: boolean;
  /** Per pass. A spending action needs max_amount. */ limits?: S.Limits; data_asks?: S.DataAsk[] };
export type House = {
  shokai_house: typeof HOUSE_FORMAT;
  place: { name: string; display_name: string; category: S.PlaceCategory; locales?: string[] };
  /** The host representative: the name it signs the leaflet with. */
  host: { name: string };
  offers: { purposes: { code: S.PurposeCode; statement: string }[]; actions: HouseAction[] };
  preset?: DoorPreset;
  /** Introducers this place names (DIDs). Needed by "strict"; "open" counts anyone's vouch when this is empty. */
  introducers?: string[];
  leaflet: { about: string; place_questions?: string[]; closing?: string };
  owner: { kind: "person" | "organization"; display_name: string; approver?: { name: string; role: string } };
  door: { base_url: string; onboarding_url?: string; site_url?: string };
};
export type HouseProblem = { path: string; message: string };

const CATEGORIES = ["store", "bank", "restaurant", "travel", "public_service", "education", "gathering"];
const PURPOSES = ["inquiry", "account_servicing", "payment_initiation", "data_access", "creative_assist", "support", "teaching", "collaboration", "invitation", "introduction", "visitation", "purchase", "gathering", "presentation", "gift"];
const NON_SPENDING = ["visitation", "invitation", "introduction"];
const LEVELS = ["discover", "advise", "act_on_behalf"];
const ASKS = ["name", "email", "phone", "address", "date_of_birth", "account"];
/** Words in the place's own text that would overstate what Shōkai does, or ask for what a door never asks for. */
const OVERSTATE: [RegExp, string][] = [
  [/\bcertif(?:y|ied|ication)\b/i, "Shōkai checks signatures, not places or people; say what the place does instead"],
  [/\bguarantee[ds]?\b/i, "Shōkai guarantees nothing about visitors; say what the place does instead"],
  [/\bbouncer\b/i, "the door welcomes; it isn't a bouncer"],
  [/\b(?:verified|approved|endorsed) by Sh[oō]kai\b/i, "Shōkai verifies signatures, not places or people"],
  [/\bpasswords?\b|\bcredit card\b|\bcard numbers?\b|\bCVV\b/i, "a door never asks for passwords or payment details"],
];
const MONEY = /^(0|[1-9]\d{0,11})(\.\d{1,4})?$/;

/** Everything wrong with a house file, with where. [] = ready for preview and signing. */
export function checkHouse(h: any): HouseProblem[] {
  const p: HouseProblem[] = []; const bad = (path: string, message: string) => p.push({ path, message });
  if (!h || typeof h !== "object") return [{ path: "", message: "not a JSON object" }];
  if (h.shokai_house !== HOUSE_FORMAT) bad("shokai_house", `must be "${HOUSE_FORMAT}"`);
  const pl = h.place ?? {};
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(pl.name ?? "")) bad("place.name", "lowercase letters, digits and dashes (it is part of the door's addresses)");
  if (typeof pl.display_name !== "string" || !pl.display_name.trim() || pl.display_name.length > 80) bad("place.display_name", "the place's name as people know it (1 to 80 characters)");
  if (!CATEGORIES.includes(pl.category) && !/^x-[a-z0-9-]+$/.test(pl.category ?? "")) bad("place.category", `one of ${CATEGORIES.join(", ")}, or x-something`);
  if (pl.locales !== undefined && (!Array.isArray(pl.locales) || !pl.locales.every((x: unknown) => typeof x === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x)))) bad("place.locales", "language tags such as en-US");
  if (typeof h.host?.name !== "string" || !h.host.name.trim() || h.host.name.length > 40) bad("host.name", "the host representative's name (1 to 40 characters)");
  const purposes: any[] = h.offers?.purposes ?? []; const actions: any[] = h.offers?.actions ?? [];
  if (!Array.isArray(purposes) || !purposes.length) bad("offers.purposes", "at least one purpose a visiting representative may come for");
  else purposes.forEach((x, i) => {
    if (!PURPOSES.includes(x?.code) && !/^x-[a-z0-9_-]+$/.test(x?.code ?? "")) bad(`offers.purposes[${i}].code`, `one of ${PURPOSES.join(", ")}, or x-something`);
    if (typeof x?.statement !== "string" || !x.statement.trim() || x.statement.length > 200) bad(`offers.purposes[${i}].statement`, "one sentence saying what it means here (at most 200 characters)");
  });
  const codes = new Set(purposes.map((x) => x?.code));
  if (!Array.isArray(actions) || !actions.length) bad("offers.actions", "at least one action the door serves");
  else actions.forEach((a, i) => {
    const at = `offers.actions[${i}]`;
    if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(a?.action ?? "")) bad(`${at}.action`, "a name such as menu.view (lowercase, dots)");
    if (!Array.isArray(a?.purposes) || !a.purposes.length || a.purposes.some((c: string) => !codes.has(c))) bad(`${at}.purposes`, "purposes listed in offers.purposes");
    if (!LEVELS.includes(a?.level)) bad(`${at}.level`, `one of ${LEVELS.join(", ")}`);
    const max = a?.limits?.max_amount;
    if (a?.spends) {
      if (!max || !MONEY.test(max.value ?? "") || !/^[A-Z]{3}$/.test(max.currency ?? "")) bad(`${at}.limits.max_amount`, "a spending action needs a cap per pass, e.g. { \"value\": \"50.00\", \"currency\": \"USD\" }");
      if (a.level !== "act_on_behalf") bad(`${at}.level`, "a spending action is act_on_behalf");
      if ((a.purposes ?? []).some((c: string) => NON_SPENDING.includes(c))) bad(`${at}.purposes`, `${NON_SPENDING.join(", ")} never spend`);
    } else if (max) bad(`${at}.spends`, "an action with an amount spends: set spends: true");
    for (const [j, d] of (a?.data_asks ?? []).entries()) if (!ASKS.includes(d) && !/^x-[a-z0-9_-]+$/.test(d)) bad(`${at}.data_asks[${j}]`, d === "payment_method" || d === "government_id" ? "a door never asks for payment details or identity documents" : `one of ${ASKS.join(", ")}`);
  });
  if (new Set(actions.map((a) => a?.action)).size !== actions.length) bad("offers.actions", "each action once");
  const preset = h.preset ?? "standard";
  if (!(preset in PRESETS)) bad("preset", "open, standard or strict");
  const intro = h.introducers ?? [];
  if (!Array.isArray(intro) || intro.some((d: unknown) => typeof d !== "string" || !/^did:[a-z0-9]+:\S+$/.test(d))) bad("introducers", "a list of DIDs");
  else if (preset === "strict" && !intro.length) bad("introducers", "the strict preset needs at least one introducer this place names");
  const l = h.leaflet ?? {};
  for (const m of leafletProblems({ about: l.about, placeQuestions: l.place_questions, closing: l.closing, hostName: h.host?.name ?? "", placeName: pl.display_name ?? "" }))
    if (!m.startsWith("leaflet.hostName")) bad(m.split(":")[0].replace("placeQuestions", "place_questions"), m.slice(m.indexOf(":") + 2));
  const o = h.owner ?? {};
  if (!["person", "organization"].includes(o.kind)) bad("owner.kind", "person or organization");
  if (typeof o.display_name !== "string" || !o.display_name.trim()) bad("owner.display_name", "the owner's name, as shown on the Shōkai host card");
  if (o.kind === "organization" && !(o.approver?.name?.trim() && o.approver?.role?.trim())) bad("owner.approver", "an organization's Shōkai host card names the person who approved it: { name, role }");
  const d = h.door ?? {};
  const url = (u: unknown, path: string) => { try { const x = new URL(String(u)); const lb = ["127.0.0.1", "localhost", "[::1]"].includes(x.hostname);
    if (!(x.protocol === "https:" || (lb && x.protocol === "http:")) || x.search || x.hash) bad(path, "https (http only on this computer), no query or fragment"); return x; } catch { bad(path, "a full URL"); return null; } };
  const base = url(d.base_url, "door.base_url"); if (base && base.pathname.replace(/\/$/, "") === "") bad("door.base_url", "a path for the door, e.g. https://example.com/shokai");
  if (d.onboarding_url !== undefined) url(d.onboarding_url, "door.onboarding_url");
  if (d.site_url !== undefined) url(d.site_url, "door.site_url");
  // the place's own words
  const words: [string, unknown][] = [["place.display_name", pl.display_name], ["leaflet.about", l.about], ["leaflet.closing", l.closing],
    ...((Array.isArray(l.place_questions) ? l.place_questions : []) as unknown[]).map((q, i): [string, unknown] => [`leaflet.place_questions[${i}]`, q]),
    ...purposes.map((x, i): [string, unknown] => [`offers.purposes[${i}].statement`, x?.statement])];
  for (const [path, v] of words) if (typeof v === "string") for (const [re, why] of OVERSTATE) if (re.test(v)) bad(path, `"${re.exec(v)![0]}": ${why}`);
  return p;
}

/** The one conversion both ways in use: house.json → createDoor() options (add keys, the signed card and a store yourself). */
export function houseToDoorOptions(h: House, extra: Partial<DoorOptions> = {}): DoorOptions {
  const problems = checkHouse(h);
  if (problems.length) throw Object.assign(new Error("house.json: " + problems.map((x) => `${x.path}: ${x.message}`).join("; ")), { code: "SHOKAI_HOUSE_INVALID", problems });
  const actions: ActionPolicy[] = h.offers.actions.map((a) => ({ action: a.action, purposes: a.purposes, level: a.level,
    ...(a.limits ? { limits: a.limits } : {}), ...(a.data_asks?.length ? { data_asks: a.data_asks } : {}) }));
  const preset = h.preset ?? "standard"; const intro = h.introducers ?? [];
  return {
    name: h.place.name, displayName: h.place.display_name, category: h.place.category,
    purposes: h.offers.purposes.map((p) => ({ code: p.code, statement: p.statement })), actions,
    spendingActions: h.offers.actions.filter((a) => a.spends).map((a) => a.action),
    locales: h.place.locales ?? ["en-US"], baseUrl: h.door.base_url.replace(/\/$/, ""),
    ...(h.door.onboarding_url ? { onboardingUrl: h.door.onboarding_url } : {}),
    preset, ...(intro.length ? { trustedIntroducers: intro } : {}),
    leaflet: { about: h.leaflet.about, ...(h.leaflet.place_questions?.length ? { placeQuestions: h.leaflet.place_questions } : {}), ...(h.leaflet.closing ? { closing: h.leaflet.closing } : {}), hostName: h.host.name, placeName: h.place.display_name },
    ...(h.owner.kind === "organization" && h.owner.approver ? { approvedBy: h.owner.approver } : {}),
    ...extra,
  };
}

/** What the owner reads before signing: the door in plain words, then the whole leaflet. Built from the fields, not from prose. */
export function previewHouse(h: House): string {
  const o = houseToDoorOptions(h); const cfg = houseConfigFor(o);
  const P = cfg.policy; const lf = leaflet({ ...o.leaflet!, placeName: o.displayName });
  const money = (m?: S.Money) => (m ? `${m.value} ${m.currency}` : "");
  const lines = [
    `${h.place.display_name} (${h.place.category}): a Shōkai door at ${o.baseUrl}`,
    `Host representative: ${h.host.name}`,
    `Owner: ${h.owner.display_name} (${h.owner.kind}${h.owner.approver ? `, approved by ${h.owner.approver.name}, ${h.owner.approver.role}` : ""})`,
    `How strict: ${o.preset} — ${PRESETS[o.preset!]}`,
    "",
    "Visiting representatives may come to:",
    ...h.offers.purposes.map((p) => `  - ${p.code}: ${p.statement}`),
    "With a pass, they may:",
    ...h.offers.actions.map((a) => `  - ${a.action} (${a.level.replace(/_/g, " ")}; for ${a.purposes.join(", ")})${a.spends ? `, spending at most ${money(a.limits?.max_amount)} per pass` : ""}${a.data_asks?.length ? `, asking for ${a.data_asks.join(", ")}` : ""}`),
    `Introductions: ${P.require_vouch_for.length ? `required for ${P.require_vouch_for.join(", ")}` : "welcome, never needed"}; counted from ${P.trusted_introducers === "*" ? "any introducer" : (P.trusted_introducers as string[]).length ? (P.trusted_introducers as string[]).join(", ") : "no one yet (name introducers to count them)"}.`,
    ...(P.purchase_hold_s ? [`Purchases are held up to ${P.purchase_hold_s} seconds for the visitor's owner to approve.`] : []),
    `Agents without a Shōkai visitor card get the leaflet below, also at ${P.lobby.onboarding_url}.`,
    "",
    `The Shōkai host card you sign says: "${hostCardSummary(o, P)}"`,
    "Your passkey covers all of this: the rules above and every word of the leaflet (the house digest).",
    "",
    "──────── the leaflet ────────",
    lf.markdown.trimEnd(),
  ];
  return lines.join("\n") + "\n";
}

/**
 * The item the owner signs on the signing page: their door's Shōkai host card, with the house config it fingerprints (the page
 * computes the house digest once the owner's passkey exists, and shows the rules and the leaflet). The agent prepares it; only
 * the owner signs. `rep` is the public part of the door's representative key (its private key never leaves the door's computer).
 */
export function hostCardRequest(h: House, rep: { id: string; key_id: string; public_key: string }, o: { validDays?: 90 | 180 | 365 } = {}) {
  const opts = houseToDoorOptions(h); const cfg = houseConfigFor(opts); const scope = hostScopeFor(cfg.policy);
  const days = o.validDays ?? 365;
  const payload: Record<string, unknown> = {
    card_id: randomId("card-host"), protocol: PROTOCOL, representative_id: rep.id,
    principal: { principal_id: "$OWNER_DID", kind: h.owner.kind === "person" ? "person" : "company", display_name: h.owner.display_name },
    role: `Host representative for ${h.place.display_name}`, standing: { tier: "principal" },
    mandate_scope: { purposes: opts.purposes.map((p) => p.code), actions: opts.actions.map((a) => a.action) }, locales: cfg.policy.supported_locales,
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: rep.public_key },
    issued_at: "$NOW", expires_at: `$IN_${days}D`,
    owner_binding: { method: "passkey_webauthn", owner_id: "$OWNER_DID", rp_id: "$RP_ID" },
    kind: "host", place: { principal_id: "$OWNER_DID", entry: `${opts.baseUrl}/places/${opts.name}/entry` }, host_scope: scope, house_digest: "$HOUSE_DIGEST",
    // v0.5.0 (§2.3, C248): the digest of the house summary (it doesn't depend on the owner's DID, so it is computed here).
    ...(cfg.policy.summary ? { summary_digest: summaryDigest(cfg.policy.summary) } : {}),
    shown_to_owner: { text: hostCardSummary(opts, cfg.policy), locale: "en-US" },
    ...(h.owner.kind === "organization" ? { org_approval: { approver: h.owner.approver, approved_at: "$NOW" } } : {}),
  };
  return {
    note: `The Shōkai host card for ${h.place.display_name}'s door, prepared from house.json. Only the owner signs it, with their passkey.`,
    owner_display_name: h.owner.display_name,
    items: [{ name: "host-card", title: `The Shōkai host card for ${h.place.display_name}`,
      summary: [`WHAT: ${h.host.name}, the host representative, keeps ${h.place.display_name}'s door.`, `WHERE: ${opts.baseUrl}.`, `FOR: ${days} days.`],
      house: { name: cfg.name, display_name: cfg.display_name, policy: cfg.policy }, payload }],
  };
}

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
/**
 * What the reference signing page does with a host-card item once the owner's passkey exists: fill $OWNER_DID, $RP_ID, $NOW,
 * $IN_<n>D and $HOUSE_DIGEST (the digest of the item's house config with the owner's DID). Exported so tests and the setup kit
 * can check a request end to end; the real signing is the owner's, on the page.
 */
export function fillHostCardItem(item: { house: { name: string; display_name: string; policy: unknown }; payload: unknown }, ownerDid: string, rpId: string, now = Date.now()) {
  const houseDigest = digestOf({ name: item.house.name, display_name: item.house.display_name, principal_id: canonDid(ownerDid), policy: item.house.policy });
  const fill = (v: unknown): unknown => typeof v === "string"
    ? v.replace(/\$(OWNER_DID|RP_ID|NOW|HOUSE_DIGEST|IN_(\d{1,3})D)\b/g, (_m, k: string, n?: string) => k === "OWNER_DID" ? ownerDid : k === "RP_ID" ? rpId : k === "NOW" ? iso(now) : k === "HOUSE_DIGEST" ? houseDigest : iso(now + Number(n) * 86400e3))
    : Array.isArray(v) ? v.map(fill) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  return { payload: fill(item.payload) as S.RepresentativeCard, houseDigest };
}
/**
 * TESTS AND DEVELOPMENT ONLY: sign a host-card request with a stand-in passkey (developmentPasskey()). A real Shōkai host card
 * is signed by the owner on the signing page with their own passkey; no agent and no tool signs for them.
 */
export function signHostCardForDevelopment(req: ReturnType<typeof hostCardRequest>, owner: PasskeyOwner): S.SignedCard {
  if (owner.kind !== "passkey" || !/(^|\.)(example|test|invalid|localhost)$/.test(owner.rpId))   // reserved test names (RFC 2606) only
    throw new Error("signHostCardForDevelopment: development passkeys only; the owner signs a real Shōkai host card on the signing page");
  const at = Date.now() - 60e3; const { payload } = fillHostCardItem(req.items[0], owner.id, owner.rpId, at);
  return sign(payload, owner, iso(at)) as S.SignedCard;
}
