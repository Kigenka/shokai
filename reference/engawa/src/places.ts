// Place configurations: Fernwood Goods (store: L0, S1, A1), Harborlight Savings & Trust (bank: B1, M1, R1),
// Maison Ardoise (heritage house: S2), The Engawa (gathering: GA1), and a pair place for Aya's representative (P1). All fictional.
import type * as S from "./shapes.js";
import { digestOf, makeSigned, makeOwnerSigned, newEd25519, edRawToKey, type Ed25519Signer, type PasskeyOwner, b64u } from "./crypto.js";
import type { PlaceConfig, PlacePolicy } from "./policy.js";
import { Host, type HostOpts } from "./host.js";
import { RealVerifier, type KeyRegistry } from "./verify.js";
import { ATTEND_ACTION, REQUEST_INVITATION_ACTION } from "./place.js";
import { DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT, defaultDoorPolicy, privateDigest, type DoorConfig, type PrivateNote } from "./inbound.js";
import { randomBytes } from "node:crypto";
import { PROTOCOL } from "./version.js";

const base = (v: string, name: string): PlacePolicy => ({
  policy_version: v, supported_locales: ["en-US", "es-ES", "ja-JP", "fr-FR", "pt-BR"], access_mode: "session", purposes: [], actions: [], spending_actions: [],
  considering: { actions: [], routed_to: { kind: "role", role: "Owner", human: true }, response_days: 14, requires_introduction: true },
  require_vouch_for: [], trusted_introducers: "*",
  lobby: { about: { "en-US": "A place that meets representatives at the door." },
    how: { "en-US": "Greet (signed or not), exchange signed cards, introduce yourself (a vouch is optional), then state a structured purpose within a signed mandate." },
    onboarding_url: `https://${name}.example/shokai/onboard`, receipt_ttl_days: 7,
    readiness: [{ code: "card", required: true }, { code: "owner_binding", required: true }, { code: "purpose", required: true }, { code: "introduction", required: false }] },
  receipt_echo_limit: 3, probing_threshold: 3, probing_window_s: 86400, ritual_retry_s: 60, not_a_fit_retry_days: 30, paused_retry_days: 30, enforce_owner_passkey: true,
});
const pd = (code: S.PurposeCode, text: string): S.PurposeDescription => ({ code, statement: { text, locale: "en-US" } });

export type PlaceKeys = { rep: Ed25519Signer; principal: Ed25519Signer };
const at = "2026-10-01T00:00:00Z";
function hostCard(k: PlaceKeys, display: string, kind: S.PrincipalKind, role: string, scope: S.RepresentativeCard["mandate_scope"], locales: string[]): S.SignedCard {
  return makeSigned<S.RepresentativeCard>({ card_id: "card-" + display.toLowerCase().replace(/\W+/g, "-"), protocol: PROTOCOL, representative_id: k.rep.id,
    principal: { principal_id: k.principal.id, kind, display_name: display }, role, standing: { tier: "principal" }, mandate_scope: scope, locales,
    representative_key: { key_id: k.rep.key_id, alg: "Ed25519", public_key: b64u(k.rep.pubRaw) }, issued_at: at, expires_at: "2027-10-01T00:00:00Z" }, k.principal, at);
}
function seeking(k: PlaceKeys, display: string, id: string, version: string, items: S.SeekingItem[]): S.SignedSeekingDeclaration {
  return makeSigned<S.SeekingDeclaration>({ seeking_id: id, version, host: { principal_id: k.principal.id, display_name: display }, items, published_at: at, expires_at: "2027-10-01T00:00:00Z" }, k.principal, at);
}

export function fernwood(k: PlaceKeys): PlaceConfig {
  const p = base("fernwood-gate-2026.10.3", "fernwood"); p.serves_allowances = true;
  p.category = "store";
  p.lobby.about = { "en-US": "Fernwood Goods is a small online store for handmade ceramics and home goods.", "es-ES": "Somos Fernwood Goods, una pequeña tienda en línea de cerámica hecha a mano.",
    "ja-JP": "Fernwood Goods は手作りの陶器と生活雑貨のオンラインストアです。" };
  p.lobby.how = { "en-US": "Representatives present a signed card and say what they want to do.", "es-ES": "Los representantes presentan una tarjeta firmada y dicen qué desean hacer." };
  p.purposes = [pd("purchase", "Buying goods for your owner, within a signed spending allowance."), pd("visitation", "Looking around and asking questions. No spending allowance needed."),
    pd("inquiry", "Questions about an order or a product."), pd("x-reviews", "Reviewing new pieces as an early reviewer.")];
  p.actions = [
    { action: "store.browse_catalog", purposes: ["visitation", "purchase", "inquiry", "x-reviews"], level: "discover", limits: { max_operations: 5 } },
    { action: "store.request_quote", purposes: ["visitation", "purchase"], level: "discover" },
    { action: "store.join_reviewer_program", purposes: ["x-reviews"], level: "advise", data_asks: ["email"] },
    { action: "store.place_order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: { value: "500.00", currency: "USD" }, max_operations: 5 }, data_asks: ["name", "address", "payment_method"] },
  ];
  p.spending_actions = ["store.place_order"];
  const d = "Fernwood Goods";
  return { name: "fernwood", display_name: d, principal_id: k.principal.id, rep_id: k.rep.id, policy: p,
    card: hostCard(k, d, "company", "Front-door representative", { purposes: ["inquiry", "visitation", "purchase", "x-reviews"], actions: p.actions.map((a) => a.action) }, ["en-US", "es-ES"]),
    seeking: seeking(k, d, "seek-fernwood", "v2", [
      { item_id: "reviewers", area: "x-reviews", summary: { text: "Thoughtful reviewers for new ceramics.", locale: "en-US" }, wants: ["store.join_reviewer_program"], status: "open" },
      { item_id: "repeat-buyers", area: "purchase", summary: { text: "Customers who order seasonally.", locale: "en-US" }, wants: ["store.place_order"], status: "open" }]) };
}
/** v0.5.0 conformance fixture (Appendix B; the black-box checks C230–C255): Fernwood with every v0.5.0 house member a door can show.
 *  Short purchase holds (15 s, grace 2 s) so the clock checks run in seconds; over-limit holds (limit_calls); one open hold at a time;
 *  conduct rules, one named third-party classifier and one model provider (structured), a trust requirement on the reviewer program, retention, a message cap, a stated message size and closed templates. Sign it with `withHostCard` (duty
 *  hold_purchases) once its policy is final. Test keys only. */
export function fernwoodV05(k: PlaceKeys): PlaceConfig {
  const c = fernwood(k); const p = c.policy as PlaceConfig["policy"] & Record<string, unknown>;
  p.policy_version = "fernwood-v05-gate-2026.11.1"; p.purchase_hold_s = 15;
  Object.assign(p, { limit_calls: true, hold_grace_s: 2, hold_policies: { max_open_holds: 1 }, retention_days: 30, message_cap: 30, max_message_bytes: 65536, closed_templates: true,
    conduct_rules: [{ code: "no_payment_credentials", text: "Please never send card numbers here.", locale: "en-US" }],
    third_party_classifiers: [{ name: "Quietline Safety (fixture)", purpose: { text: "Screens visitor text for abuse before the host reads it.", locale: "en-US" }, jurisdiction: ["US"], retention_days: 30, role: "processor" }],
    model_providers: [{ name: "Northwind Inference (fixture)", purpose: { text: "Runs the host representative's model.", locale: "en-US" }, jurisdiction: ["US"], retention_days: 0, role: "processor" }],
    // §6.9 (C243): the reviewer program needs some history here, or an introduction by one of the place's customers; a first visit can't meet it.
    trust_requirements: { "store.join_reviewer_program": { any_of: [{ all_of: [{ kind: "history", min_visits: 3, min_days: 14, clean_days: 14 }] }, { all_of: [{ kind: "introduction", kinds: ["customer"] }] }] } } });
  return { ...c, name: "fernwood-v05", display_name: "Fernwood Goods (v0.5.0 test place)" };
}
export function harborlight(k: PlaceKeys): PlaceConfig {
  const p = base("harborlight-gate-2026.10.3", "harborlight"); p.serves_allowances = true;
  p.category = "bank"; p.supported_locales = ["en-US", "es-ES"];
  p.lobby.about = { "en-US": "Harborlight Savings & Trust is a community bank. Its front door meets representatives of customers and partners." };
  p.purposes = [pd("account_servicing", "Servicing an existing account."), pd("payment_initiation", "Initiating payments for an account holder (introduction required)."),
    pd("x-partnership", "Exploring a partnership with the bank (decided inside).")];
  p.actions = [
    { action: "bank.get_balance", purposes: ["account_servicing"], level: "act_on_behalf", data_asks: ["account"] },
    { action: "bank.submit_payment", purposes: ["account_servicing", "payment_initiation"], level: "act_on_behalf", limits: { max_amount: { value: "10000.00", currency: "USD" }, max_operations: 5 }, data_asks: ["account"] },
  ];
  p.spending_actions = ["bank.submit_payment"];
  p.considering = { actions: ["bank.agent_access_pilot", "bank.change_beneficiary"], routed_to: { kind: "role", role: "Head of Digital Partnerships", human: true }, response_days: 14, requires_introduction: true };
  p.require_vouch_for = ["payment_initiation"];
  const d = "Harborlight Savings & Trust";
  return { name: "harborlight", display_name: d, principal_id: k.principal.id, rep_id: k.rep.id, policy: p,
    card: hostCard(k, d, "company", "Front-door representative", { purposes: ["account_servicing", "payment_initiation", "x-partnership", "inquiry"], actions: [...p.actions.map((a) => a.action), "bank.intro_call", ...p.considering.actions] }, ["en-US"]),
    seeking: seeking(k, d, "seek-harborlight", "v1", [{ item_id: "agent-pilot", area: "x-partnership", summary: { text: "Partners to pilot safe agent access for small businesses.", locale: "en-US" }, status: "open" }]) };
}
export function maison(k: PlaceKeys): PlaceConfig {
  const p = base("ardoise-gate-2026.10.3", "maison-ardoise"); p.serves_allowances = true;
  p.category = "store"; p.supported_locales = ["fr-FR", "en-US"];
  p.lobby.about = { "fr-FR": "La Maison Ardoise est une maison de couture patrimoniale.", "en-US": "Maison Ardoise is a heritage fashion house." };
  p.purposes = [pd("collaboration", "Creative collaboration with the house.")];
  p.actions = [
    { action: "maison.discovery_conversation", purposes: ["collaboration"], level: "advise", min_proof: [{ target: "imprint.worldview", level: "vouched" }] },
    { action: "maison.receive_brand_brief", purposes: ["collaboration"], level: "discover", min_proof: [{ target: "imprint.expertise", level: "evidenced" }] },
  ];
  const d = "Maison Ardoise";
  return { name: "maison-ardoise", display_name: d, principal_id: k.principal.id, rep_id: k.rep.id, policy: p,
    card: hostCard(k, d, "brand", "Représentant de la maison", { purposes: ["collaboration"], actions: p.actions.map((a) => a.action) }, ["fr-FR", "en-US"]) };
}
export function engawa(k: PlaceKeys, invitees: S.Gathering["invitees"], when = { starts_at: "2026-10-24T00:00:00Z", ends_at: "2027-12-31T00:00:00Z" }, testProfile = false): PlaceConfig {
  const p = base("engawa-2026.10.3", "engawa");
  p.category = "gathering"; p.supported_locales = ["en-US", "ja-JP"];
  p.lobby.about = { "en-US": "The Engawa is a veranda where invited representatives meet, learn from each other and chat. Groups are places: whoever is invited.", "ja-JP": "縁側は、招かれた代理人たちが集い、学び合う場所です。" };
  p.purposes = [pd("gathering", "Attending an invited gathering (gathering.attend), with your owner's accept_house_rules consent.")];
  p.actions = [{ action: ATTEND_ACTION, purposes: ["gathering"], level: "advise", limits: { max_session_s: 7200 } }];
  if (testProfile) {   // Appendix B.3: the test gathering admits a verified requester (purpose `invitation`)
    p.purposes.push(pd("invitation", "Asking to be invited to the gathering (test profile, Appendix B.3)."));
    p.actions.push({ action: REQUEST_INVITATION_ACTION, purposes: ["invitation"], level: "discover", limits: { max_operations: 1 } });
    p.require_vouch_for = [];
  }
  const d = "The Engawa";
  const g = makeSigned<S.Gathering>({ gathering_id: "gath-engawa-1", place: { principal_id: k.principal.id, display_name: d }, title: "Autumn evening on the veranda", invitees,
    house_rules: { default_attribution: "chatham_house", private_never_leaves: true, pressing_after_decline: "flagged", pressing: { light_flags: 2, notice_at: 3 }, quoting: "paraphrase_by_default",
      entry_requires_consent: true, topics: ["x-ceramics"] }, ...when }, k.principal, at);
  return { name: "engawa", display_name: d, principal_id: k.principal.id, rep_id: k.rep.id, policy: p, gathering: g, affiliation_hints: ["kiln", "glaze", "pottery wheel"],
    card: hostCard(k, d, "system", "Host of the veranda", { purposes: ["gathering", ...(testProfile ? ["invitation" as const] : [])], actions: [ATTEND_ACTION, ...(testProfile ? [REQUEST_INVITATION_ACTION] : [])] }, ["en-US", "ja-JP"]) };
}
/**
 * A pair place for a personal representative (the Peer meetings extension). `owner` is the owner's passkey (simulated, test-only); the owner signs the card.
 * Meetings need a PeerInvitation signed by one owner and accepted (passkey accept_invitation) by the other.
 */
export function pair(rep: Ed25519Signer, owner: PasskeyOwner, display = "Aya"): PlaceConfig {
  const p = base("peer-aya-2026.10.3", "aya");
  p.category = "pair"; p.supported_locales = ["en-US", "ja-JP"];
  p.lobby.about = { "en-US": `The personal representative of ${display}. Meetings are by owner-to-owner invitation only.` };
  p.purposes = [pd("collaboration", "Collaborating in a pair place seeded by a PeerInvitation."), pd("invitation", "Proposing or accepting a meeting between owners.")];
  p.actions = [
    { action: "peer.share_portfolio_sample", purposes: ["collaboration"], level: "advise" },
    { action: "peer.share_project_brief", purposes: ["collaboration"], level: "advise" },
    { action: "peer.propose_owner_call", purposes: ["collaboration", "invitation"], level: "advise" },
  ];
  p.considering = { actions: ["peer.commit_to_project"], routed_to: { kind: "principal", principal_id: owner.id }, response_days: 7, requires_introduction: true };
  const card = makeOwnerSigned<S.RepresentativeCard>({ card_id: "card-" + display.toLowerCase(), protocol: PROTOCOL, representative_id: rep.id,
    principal: { principal_id: owner.id, kind: "person", display_name: display }, role: `Personal representative of ${display}`, standing: { tier: "standard" },
    mandate_scope: { purposes: ["collaboration", "invitation"], actions: [...p.actions.map((a) => a.action), "peer.commit_to_project"] }, locales: p.supported_locales,
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) }, issued_at: at, expires_at: "2027-10-01T00:00:00Z",
    owner_binding: { method: "passkey_webauthn", owner_id: owner.id, rp_id: owner.rpId } }, owner, at);
  return { name: "pair", display_name: `${display}'s representative`, principal_id: owner.id, rep_id: rep.id, policy: p, card, peer: { owner_id: owner.id } };
}

/** v0.2.8 (§4, P2): the same place, naming the introducers it trusts (needed for vouches on money / account-creating requests). */
export const trusting = (fn: (k: PlaceKeys) => PlaceConfig, ids: string[]) => (k: PlaceKeys): PlaceConfig => { const c = fn(k); return { ...c, policy: { ...c.policy, trusted_introducers: [...ids] } }; };
export function newKeys(): PlaceKeys { return { rep: newEd25519(), principal: newEd25519() }; }
export function makeHost(cfgFn: (k: PlaceKeys) => PlaceConfig, keys = newKeys(), registry: KeyRegistry = new Map(), clock?: () => string, opts: HostOpts = {}): Host {
  return new Host(cfgFn(keys), keys.rep, keys.principal, new RealVerifier(registry), clock, opts);
}
export { edRawToKey };

// ---------------- S5 pilot (loopback only; BINDING-PLAN §4) ----------------
/** Fixed window so the Gathering digest (what each owner's accept_house_rules signs) stays stable across restarts. */
export const PILOT_WHEN = { starts_at: "2026-10-25T00:00:00Z", ends_at: "2026-12-31T00:00:00Z" };
/**
 * The pilot Engawa: the test-profile gathering (B.1 loopback status URLs; B.3 request_invitation) with one pilot policy choice:
 * `gathering.attend` also serves purpose `visitation`, so a representative on a learn-visit allowance (purposes visitation,
 * invitation) can enter. Entry still needs the owner's passkey accept_house_rules over this Gathering's digest (the Gatherings extension).
 */
export function pilotEngawa(k: PlaceKeys, invitees: S.Gathering["invitees"]): PlaceConfig {
  const c = engawa(k, invitees, PILOT_WHEN, true);
  c.policy.policy_version = "engawa-pilot-2026.10.25";
  c.policy.purposes.push(pd("visitation", "A learn visit: attend the gathering to listen, learn and chat (pilot)."));
  c.policy.actions = c.policy.actions.map((a) => a.action === ATTEND_ACTION ? { ...a, purposes: ["gathering", "visitation"] } : a);
  // Red team 2026-10-25 (RT-F5): the B.3 test-gathering rule seated ANY verified requester and re-signed the guest list, so a stranger with a
  // self-made key could walk in, read the room (private items included) and void every real guest's passkey consent. In the pilot,
  // asking for an invitation is taken inside instead (considering, routed to the host, introduction required): a stranger hears
  // not_now / VOUCH_REQUIRED ("ask someone to introduce you"); the guest list changes only when the host edits invitees.json.
  c.policy.actions = c.policy.actions.filter((a) => a.action !== REQUEST_INVITATION_ACTION);
  c.policy.considering = { ...c.policy.considering, actions: [...c.policy.considering.actions, REQUEST_INVITATION_ACTION], routed_to: { kind: "role", role: "Host of the Engawa", human: true }, requires_introduction: true };
  const g = makeSigned<S.Gathering>({ ...c.gathering!.payload, title: "Pilot evening on the veranda (practice)" }, k.principal, at);
  const card = makeSigned<S.RepresentativeCard>({ ...c.card!.payload, mandate_scope: { purposes: ["gathering", "invitation", "visitation"], actions: [ATTEND_ACTION, REQUEST_INVITATION_ACTION] } }, k.principal, at);
  return { ...c, gathering: g, card };
}
/**
 * A representative's own door (pair place, the Peer meetings extension) built from its owner-signed card (the owner's key never reaches this process).
 * Pilot policy choice: peer.share_project_brief also serves `visitation` (a learn-visit allowance can meet under a meeting key).
 */
export function pairDoor(repId: string, card: S.SignedCard, display: string): PlaceConfig {
  const p = base("door-" + display.toLowerCase().replace(/\W+/g, "-") + "-2026.10.25", "door");
  p.category = "pair"; p.supported_locales = ["en-US"];
  p.lobby.about = { "en-US": `The door of ${display}'s representative. Meetings are by owner-to-owner invitation only (pilot, loopback).` };
  p.purposes = [pd("collaboration", "Collaborating in a pair place seeded by a PeerInvitation."), pd("visitation", "A learn visit in a pair place (pilot)."),
    pd("invitation", "Proposing or accepting a meeting between owners.")];
  p.actions = [
    { action: "peer.share_project_brief", purposes: ["collaboration", "visitation"], level: "advise" },
    { action: "peer.share_portfolio_sample", purposes: ["collaboration"], level: "advise" },
    { action: "peer.propose_owner_call", purposes: ["collaboration", "invitation"], level: "advise" },
  ];
  const owner = card.payload.owner_binding!.owner_id;
  p.considering = { actions: ["peer.commit_to_project"], routed_to: { kind: "principal", principal_id: owner }, response_days: 7, requires_introduction: true };
  return { name: "door", display_name: `${display}'s representative`, principal_id: owner, rep_id: repId, policy: p, card, peer: { owner_id: owner } };
}

// ---------------- v0.2.9 (§10): a person's inbound door ----------------
export type DoorOpts = Partial<S.DoorPolicy["public"]> & { categories?: S.DoorCategory[]; trusted_introducers?: string[]; note?: PrivateNote; judge?: DoorConfig["judge"];
  /** Sign the policy with this key instead of the owner's (negative tests). */ signer?: PasskeyOwner; tamper?: (p: S.DoorPolicy) => S.DoorPolicy };
/**
 * Kiran's door (fictional): her representative keeps an inbound door for brands under a DoorPolicy her passkey signed once.
 * Introductions preferred, 2 uninvited a month, unadvertised, no data for gifts (defaults), unless `o` says otherwise.
 */
export function inboundDoor(rep: Ed25519Signer, owner: PasskeyOwner, display = "Kiran Vale", o: DoorOpts = {}): PlaceConfig {
  const p = base("door-" + display.toLowerCase().replace(/\W+/g, "-") + "-2026.10.26", "door");
  p.category = "x-inbound-door"; p.supported_locales = ["en-US"];
  p.lobby.about = { "en-US": `The door of ${display}'s representative. Brands may present one thing at a time, by the door policy her owner signed.` };
  p.purposes = [pd("presentation", "Present one item, or invite the owner to look at something, within the door's public categories."), pd("gift", "Offer one gift, claimed by ticket. Never in exchange for data.")];
  p.actions = [
    { action: DOOR_PRESENT, purposes: ["presentation"], level: "advise" },
    { action: DOOR_INVITE, purposes: ["presentation"], level: "advise" },
    { action: DOOR_GIFT, purposes: ["presentation", "gift"], level: "advise" },
  ];
  const { categories, trusted_introducers, note, judge, signer, tamper, ...pub } = o;
  const salt = b64u(randomBytes(16)); const n: PrivateNote = note ?? { for_you: ["kyoto", "travel coat"], not_for_you: ["gym", "watch"] };
  let pol = defaultDoorPolicy({ owner_id: owner.id, representative_id: rep.id, categories: categories ?? ["fashion", "travel", "home"], trusted_introducers: trusted_introducers ?? [],
    private_digest: privateDigest(salt, n), ...pub });
  if (tamper) pol = tamper(pol);
  const policy = makeOwnerSigned<S.DoorPolicy>(pol, signer ?? owner, at);
  p.trusted_introducers = [...(trusted_introducers ?? [])];
  const card = makeOwnerSigned<S.RepresentativeCard>({ card_id: "card-door-" + display.toLowerCase().replace(/\W+/g, "-"), protocol: PROTOCOL, representative_id: rep.id,
    principal: { principal_id: owner.id, kind: "person", display_name: display }, role: `Personal representative of ${display} (inbound door)`, standing: { tier: "standard" },
    mandate_scope: { purposes: ["presentation", "gift"], actions: p.actions.map((a) => a.action) }, locales: p.supported_locales,
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) }, issued_at: at, expires_at: "2027-10-01T00:00:00Z",
    owner_binding: { method: "passkey_webauthn", owner_id: owner.id, rp_id: owner.rpId } }, owner, at);
  return { name: "door-" + display.toLowerCase().split(" ")[0], display_name: `${display}'s door`, principal_id: owner.id, rep_id: rep.id, policy: p, card,
    door: { policy, privateNote: { salt, note: n }, secret: randomBytes(32), ...(judge ? { judge } : {}) } };
}

// ---------------- v0.4.0 (§2.3): Shōkai host cards for the places above ----------------
import { houseDigest } from "./trust.js";
import { houseSummaryOf } from "./v050.js";
import { SPEC_REF } from "./version.js";
/**
 * v0.5.0 (§2.3, C248): a v0.5.0 house config carries its house summary. When a place's config has none, one is built from its policy
 * (so it agrees by construction), in the place's own words (its lobby's `about`), before the house is fingerprinted and signed.
 */
export function withHouseSummary(c: PlaceConfig): PlaceConfig {
  if (c.policy.summary) return c;
  const loc = c.policy.supported_locales?.[0] ?? "en-US"; const about = c.policy.lobby?.about ?? {};
  const statement = about[loc] ?? Object.values(about)[0] ?? c.display_name;
  return { ...c, policy: { ...c.policy, summary: houseSummaryOf(c as any, { statement, locale: about[loc] ? loc : (Object.keys(about)[0] ?? loc) }, SPEC_REF) } };
}
/**
 * Re-sign a place's own card as a v0.4.0 Shōkai host card: kind "host", bound to this place (its principal and entry address), with
 * its host scope, the fingerprint of the house config it serves (house_digest), the summary its owner read and, for an organization,
 * the record of the person who approved it. Signed by the place's principal key (an organization's key; a person's place uses a passkey).
 */
export function withHostCard(c: PlaceConfig, signer: Ed25519Signer | PasskeyOwner, entry: string, o: { duties?: S.HostDuty[]; approver?: S.OrgApproval["approver"];
  card_id?: string; revocation_url?: string; place_principal?: string; entryOverride?: string; house?: string } = {}): PlaceConfig {
  c = withHouseSummary(c);
  const p = c.card!.payload; const actions = [...new Set([...c.policy.actions.map((a) => a.action), ...c.policy.considering.actions])];
  const card: S.RepresentativeCard = { ...p, card_id: o.card_id ?? p.card_id + "-host", kind: "host",
    place: { principal_id: o.place_principal ?? c.principal_id, entry: o.entryOverride ?? entry },
    host_scope: { actions, duties: o.duties ?? ["seat", "issue_passes", "receipts", "consider", "misconduct_notices"] },
    house_digest: o.house ?? houseDigest(c),
    // v0.5.0 (§2.3, C248): a house config with policy.summary: the card carries the digest of the summary's JCS bytes.
    ...(c.policy.summary ? { summary_digest: digestOf(c.policy.summary) } : {}),
    shown_to_owner: { text: `${c.display_name}'s host representative may welcome visitors at ${c.display_name}, admit them with a pass and serve ${actions.join(", ")}, until ${p.expires_at.slice(0, 10)}.`, locale: "en-US" },
    ...(p.principal.kind !== "person" ? { org_approval: { approver: o.approver ?? { name: "Ren Okabe", role: "Owner" }, approved_at: at } } : {}),
    ...(o.revocation_url ? { revocation_url: o.revocation_url } : {}) };
  const signed = signer.kind === "passkey" ? makeOwnerSigned(card, signer, at) : makeSigned(card, signer, at);
  return { ...c, card: signed };
}
/** v0.4.0 (§5.4): Harborlight as an institution: account actions are served only to linked customers; no money moves before a link's cooling-off ends. */
export function harborlightInstitution(k: PlaceKeys): PlaceConfig {
  const c = harborlight(k); const p = c.policy;
  p.profile = "institution"; p.policy_version = "harborlight-gate-2026.10.29";
  p.actions = p.actions.map((a) => ({ ...a, requires_customer_link: true }));
  p.require_vouch_for = [];
  return c;
}
