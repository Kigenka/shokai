// Verification of standing artifacts beyond the card: allowances and their published status (§5.2, the Revocation status extension), owner consents
// (§8.1), peer invitations (the Peer meetings extension), and vouch revocation logs (§4). Pure functions over verified bytes plus what the host
// fetched itself. All fail closed. v0.2.3: owner (ES256) signatures are checked against the owner's relying party.
import type * as S from "./shapes.js";
import { digestOf, parseMoney, badTimestamps, isExpired, notYetValid, isTimestamp, sameDid, SKEW_S } from "./crypto.js";
import type { Verifier } from "./verify.js";

/**
 * What this host fetched itself, keyed by URL (allowance revocation_status the Revocation status extension, a vouch's revocation_log §4, evidence §2.5).
 * Filled by the transport just before a message is handled (the gate stays a pure function of what was fetched).
 * A URL that is absent or `ok: false` was unreachable.
 */
export type FetchCache = Map<string, { ok: boolean; at: string; body?: unknown; digest?: string }>;
/** Owner DID → relying party id, learned from verified cards (owner_binding.rp_id). */
export type RpOf = (ownerId: string) => string | undefined;
export type Check = { ok: true } | { ok: false; why: string };
const fail = (why: string): Check => ({ ok: false, why });
const inWindow = (now: string, from: string, to: string) => !notYetValid(from, now) && !isExpired(to, now);

/** §4: fetched log = RevocationLogEntry[] (host-3-007). Chain and every revocation's signature are checked; broken/unreachable ⇒ no weight. */
export const STATUS_MAX_LIFETIME_S = 3600;   // D12
/** §4 (C271, provisional): a signed log head older than this is refused (the log host may be serving an old prefix). */
export const REVOCATION_HEAD_MAX_AGE_S = 86400;
/**
 * §4 (C271): read a fetched log body. `{entries, head}` (v0.5.0): the head must be the introducer's, name this log, match the
 * entries' count and last entry_hash, and be at most 24 hours old (and not from the future); else "stale" or "broken".
 * A bare array (v0.4.0, no head) is read only when `requireHead` is false (a Shōkai introduction card always requires a head).
 * At v0.5.0 final (C282), a head becomes required for every vouch; until then the bare-array path remains with residual stale-prefix risk.
 */
export function readLogBody(body: unknown, x: { url: string; introducer: string; verifier: Verifier; rpOf: RpOf; now?: string; requireHead?: boolean }):
  { ok: true; log: S.RevocationLogEntry[] } | { ok: false; state: "broken" | "stale" } {
  if (Array.isArray(body)) return x.requireHead ? { ok: false, state: "stale" } : { ok: true, log: body as S.RevocationLogEntry[] };
  const d = body as S.RevocationLogDocument | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.entries)) return { ok: false, state: "broken" };
  const h = d.head?.payload;
  if (!h || h.kind !== "revocation_log_head") return { ok: false, state: x.requireHead ? "stale" : "broken" };
  if (!x.verifier.signed(d.head, x.introducer, undefined, undefined, x.rpOf(x.introducer))) return { ok: false, state: "broken" };
  const last = d.entries.length ? d.entries[d.entries.length - 1]?.entry_hash : "genesis";
  if (h.log !== x.url || h.seq !== d.entries.length || h.entry_hash !== last || !isTimestamp(h.as_of)) return { ok: false, state: "broken" };
  const now = Date.parse(x.now ?? new Date().toISOString()), at = Date.parse(h.as_of);
  if (at > now + SKEW_S * 1e3 || now - at > REVOCATION_HEAD_MAX_AGE_S * 1e3) return { ok: false, state: "stale" };
  return { ok: true, log: d.entries };
}
/** Sign a log head (tests; an introducer publishes its own). */
export const logHeadOf = (url: string, log: S.RevocationLogEntry[], as_of: string): S.RevocationLogHead =>
  ({ kind: "revocation_log_head", log: url, seq: log.length, entry_hash: log.length ? log[log.length - 1].entry_hash : "genesis", as_of });
export function vouchLogState(fetched: FetchCache, v: S.Vouch, verifier: Verifier, rpOf: RpOf, x: { now?: string; requireHead?: boolean } = {}): "clear" | "revoked" | "unreachable" | "broken" | "stale" | "no_log" {
  if (!v.revocation_log) return "no_log";
  const f = fetched.get(v.revocation_log); if (!f || !f.ok) return "unreachable";
  const rb = readLogBody(f.body, { url: v.revocation_log, introducer: v.introducer.principal_id, verifier, rpOf, ...x }); if (!rb.ok) return rb.state;
  const log = rb.log;
  const c = checkLog(log, verifier, v.introducer.principal_id, rpOf);
  if (!c.ok) return "broken";
  return log.some((e) => e.revocation.payload.vouch_id === v.vouch_id) ? "revoked" : "clear";
}
export function checkLog(log: S.RevocationLogEntry[], verifier: Verifier, introducer: string | undefined, rpOf: RpOf): Check {
  let prev: string = "genesis";
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (!e || e.seq !== i || e.prev_hash !== prev) return fail(`seq/prev at ${i}`);
    if (badTimestamps(e.revocation).length) return fail(`timestamp at ${i}`);
    const who = e.revocation?.payload?.introducer_id;
    const rd = verifier.signed(e.revocation, who, undefined, undefined, rpOf(who));
    if (!rd) return fail(`revocation signature at ${i}`);
    if (introducer && !sameDid(who, introducer)) return fail(`foreign introducer at ${i}`);
    if (e.entry_hash !== digestOf({ seq: e.seq, prev_hash: e.prev_hash, revocation_digest: e.revocation.payload_digest })) return fail(`entry_hash at ${i}`);
    prev = e.entry_hash;
  }
  return { ok: true };
}
/** Build the next log entry (tests; an introducer publishes its own log). */
export function appendLog(log: S.RevocationLogEntry[], revocation: S.Signed<S.VouchRevocation>): S.RevocationLogEntry {
  const seq = log.length; const prev_hash = seq === 0 ? "genesis" : log[seq - 1].entry_hash;
  const e: S.RevocationLogEntry = { seq, prev_hash, revocation, entry_hash: digestOf({ seq, prev_hash, revocation_digest: revocation.payload_digest }) };
  log.push(e); return e;
}

/** §8.1: one signed OwnerConsent; passkey actions need subject digest, expiry and shown_to_owner inside the signature, checked against the owner's rp_id. */
export function verifyOwnerConsent(verifier: Verifier, c: S.Signed<S.OwnerConsent> | undefined, x: { action: S.OwnerConsent["action"]; owner_id: string;
  subject: { kind: S.OwnerConsent["subject_ref"]["kind"]; id: string; digest: string }; now: string; rpId: string | undefined; revoked?: Set<string>; representative_id?: string }): Check {
  const p = c?.payload; if (!p) return fail("no_consent");
  if (badTimestamps(c).length) return fail("timestamp_form");
  if (p.action !== x.action) return fail("wrong_action");
  if (p.decision !== "approve" && p.decision !== "decline") return fail("no_decision");
  if (!sameDid(p.owner_id, x.owner_id)) return fail("wrong_owner");
  if (p.assurance !== "passkey") return fail("not_passkey");                          // chat_reply where a passkey is required (C95)
  if (p.subject_ref?.kind !== x.subject.kind || p.subject_ref.id !== x.subject.id || p.subject_ref.digest !== x.subject.digest) return fail("wrong_subject");
  if (!p.expires_at || isExpired(p.expires_at, x.now)) return fail("expired_or_no_expiry");
  if (!p.issued_at || notYetValid(p.issued_at, x.now)) return fail("issued_at");
  if (!p.shown_to_owner?.text || !p.shown_to_owner.locale) return fail("no_shown_to_owner");
  if (x.representative_id && p.representative_id !== x.representative_id) return fail("wrong_representative");
  if (x.revoked?.has(p.consent_id + "|" + p.owner_id)) return fail("revoked");   // key: consent_id|owner_id (only its owner can revoke a consent)
  if (!verifier.signed(c!, x.owner_id, undefined, "ES256", x.rpId)) return fail("signature");   // never the representative's signature (signer = owner)
  return { ok: true };
}

/** §5.2 / the Revocation status extension: a published or stapled AllowanceStatus, signed by the owner binding's platform key, fresh (D12, v0.2.4: lifetime ≤ 1 h; now < next_update). */
export function verifyAllowanceStatus(verifier: Verifier, st: S.Signed<S.AllowanceStatus> | undefined, a: S.Allowance, allowanceDigest: string, card: S.RepresentativeCard, now: string): Check {
  const p = st?.payload; if (!p) return fail("no_status");
  if (badTimestamps(st).length || !isTimestamp(p.issued_at) || !isTimestamp(p.next_update)) return fail("status_timestamp_form");
  if (p.allowance_id !== a.allowance_id || p.allowance_digest !== allowanceDigest) return fail("status_for_another_allowance");
  const platform = card.owner_binding?.platform_key; if (!platform) return fail("no_platform_key");
  if (!verifier.signed(st!, platform)) return fail("status_signature");
  if (Date.parse(p.next_update) - Date.parse(p.issued_at) > STATUS_MAX_LIFETIME_S * 1e3) return fail("status_lifetime_over_1h");
  if (notYetValid(p.issued_at, now)) return fail("status_issued_in_future");
  if (!(Date.parse(now) < Date.parse(p.next_update))) return fail("status_stale");
  if (p.status === "revoked") return fail("revoked");
  if (p.status !== "active") return fail("status_unknown");
  return { ok: true };
}

/** §5.2 host verification of a mandate issued under an allowance. Any failure → MANDATE_INVALID. */
export function verifyAllowance(verifier: Verifier, pres: S.AllowancePresentation | undefined, m: S.Mandate, card: S.RepresentativeCard,
  x: { now: string; category?: S.PlaceCategory; host_principal: string; fetched: FetchCache; stapled?: S.Signed<S.AllowanceStatus> }): Check {
  const ua = m.under_allowance; if (!ua) return fail("not_under_allowance");
  const a = pres?.allowance?.payload; const g = pres?.grant;
  if (!a || !g) return fail("no_presentation");
  if (badTimestamps(pres!.allowance).length) return fail("timestamp_form");
  const owner = card.owner_binding?.owner_id; if (!owner || !sameDid(a.owner_id, owner)) return fail("owner_binding");
  if (a.representative_id !== card.representative_id || a.card_id !== card.card_id) return fail("allowance_binding");
  if (a.allowance_id !== ua.allowance_id) return fail("allowance_id");
  const ad = verifier.signed(pres!.allowance, owner, undefined, "ES256", card.owner_binding?.rp_id);
  if (!ad) return fail("owner_passkey");                                                       // forged allowance (C97)
  if (ad !== ua.allowance_digest) return fail("allowance_digest");
  const gd = digestOf(g);
  if (gd !== ua.grant_digest || !a.grant_digests.includes(gd)) return fail("grant_digest");
  if (typeof g.salt !== "string" || g.salt.length < 22) return fail("grant_salt");
  if (!inWindow(x.now, a.valid_from, a.expires_at)) return fail("allowance_expired");
  if (Date.parse(m.valid_from) < Date.parse(a.valid_from) || Date.parse(m.expires_at) > Date.parse(a.expires_at)) return fail("mandate_outside_allowance_validity");
  if (!g.purposes.includes(m.purpose.code)) return fail("purpose_not_in_grant");               // purpose swap (C97)
  if (m.allowed_actions.some((act) => !g.actions.includes(act))) return fail("actions_not_in_grant");
  const placeOk = (g.counterparties ?? []).includes(x.host_principal) || (!!x.category && g.place_categories.includes(x.category));
  if (!placeOk) return fail("place_not_in_grant");                                             // category swap (C97)
  const mm = m.limits?.max_amount ? parseMoney(m.limits.max_amount) : null;
  if (!g.spend) { if (m.limits?.max_amount) return fail("spend_without_budget"); }
  else {
    const cap = parseMoney(g.spend.per_seat ?? g.spend.per_period); const per = parseMoney(g.spend.per_period);
    if (!cap || !per || !["P1D", "P7D", "P1M"].includes(g.spend.period)) return fail("grant_budget_malformed");
    if (mm && (mm.currency !== cap.currency || mm.units > cap.units || mm.units > per.units)) return fail("max_amount_over_grant");   // spend above the grant (C97)
  }
  // Status (§5.2, the Revocation status extension): a fresh stapled status, else what we fetched from revocation_status; nothing fresh ⇒ fail closed.
  // A valid fetched status that says `revoked` wins over any stapled one (a revocation published after the staple).
  const f = x.fetched.get(a.revocation_status);
  const fetchedCheck = f?.ok ? verifyAllowanceStatus(verifier, f.body as S.Signed<S.AllowanceStatus>, a, ad, card, x.now) : null;
  if (fetchedCheck && !fetchedCheck.ok && fetchedCheck.why === "revoked") return fetchedCheck;
  if (x.stapled) { const s = verifyAllowanceStatus(verifier, x.stapled, a, ad, card, x.now); if (s.ok) return s; if (s.why === "revoked") return s; }
  if (!fetchedCheck) return fail(x.stapled ? "stapled_status_not_fresh_and_url_unreachable" : "status_unreachable");
  return fetchedCheck;
}

/**
 * the Peer meetings extension: a pair-place request must carry the inviting owner's PeerInvitation and the invited owner's passkey accept_invitation,
 * presented by a representative the invitation names; single use (spent at the farewell); dead once the acceptance is revoked.
 */
export function verifyPeerInvitation(verifier: Verifier, pi: S.InvitationRequest["peer_invitation"], x: { encounter_id: string; host_owner: string; host_rep: string;
  visitor_rep: string; visitor_principal: string; invitation_ref?: { invitation_id: string; digest: string }; now: string; rpOf: RpOf; spent: Set<string>; revoked: Set<string> }): Check {
  const inv = pi?.invitation?.payload; if (!inv || !pi?.acceptance) return fail("no_peer_invitation");
  if (badTimestamps(pi.invitation).length || badTimestamps(pi.acceptance).length) return fail("timestamp_form");
  if (inv.place?.kind !== "pair" || inv.place.place_id !== x.encounter_id) return fail("not_this_pair_place");
  if (!inv.representatives.includes(x.host_rep) || !inv.representatives.includes(x.visitor_rep)) return fail("representatives");   // replay by another agent
  const owners = [inv.from_owner.principal_id, inv.to_owner.principal_id];
  if (!owners.some((o) => sameDid(o, x.host_owner)) || !owners.some((o) => sameDid(o, x.visitor_principal)) || sameDid(x.host_owner, x.visitor_principal)) return fail("owners");
  if (!inWindow(x.now, inv.valid_from, inv.expires_at)) return fail("invitation_expired");
  if (x.spent.has(inv.invitation_id)) return fail("spent");
  const d = verifier.signed(pi.invitation, inv.from_owner.principal_id, undefined, "ES256", x.rpOf(inv.from_owner.principal_id));
  if (!d) return fail("inviter_passkey");                                                       // impersonated inviter
  const acc = verifyOwnerConsent(verifier, pi.acceptance, { action: "accept_invitation", owner_id: inv.to_owner.principal_id,
    subject: { kind: "invitation", id: inv.invitation_id, digest: d }, now: x.now, rpId: x.rpOf(inv.to_owner.principal_id), revoked: x.revoked });
  if (!acc.ok) return fail("acceptance:" + acc.why);
  if (pi.acceptance.payload.decision !== "approve") return fail("declined");
  if (!x.invitation_ref || x.invitation_ref.invitation_id !== inv.invitation_id || x.invitation_ref.digest !== d) return fail("introduction_without_invitation_ref");
  return { ok: true };
}

/**
 * v0.3.0-rc4 (§2.8, C196): an OwnerLink joins two of one owner's per-place identities for ONE place. Valid when: both owners are
 * distinct, each signed it with an ES256 passkey signature (a user-verified WebAuthn assertion, Appendix A.1), it is addressed to this
 * place, it is in its time window, and one of the owners is the card's principal. The place keeps it to itself (§12.4).
 */
export const OWNER_LINK_MAX_LIFETIME_S = 400 * 86400;
export function verifyOwnerLink(verifier: Verifier, l: S.Signed<S.OwnerLink> | undefined, x: { audience: string; principal: string; now: string; rpOf: RpOf }): Check & { other?: string } {
  const p = l?.payload; if (!p) return { ok: false, why: "missing" };
  if (!Array.isArray(p.owners) || p.owners.length !== 2 || typeof p.owners[0] !== "string" || typeof p.owners[1] !== "string" || sameDid(p.owners[0], p.owners[1])) return { ok: false, why: "owners" };
  if (verifier.mode === "real" && badTimestamps(l!).length) return { ok: false, why: "timestamp" };
  if (!sameDid(p.audience, x.audience)) return { ok: false, why: "audience" };
  if (!isTimestamp(p.issued_at) || !isTimestamp(p.expires_at) || notYetValid(p.issued_at, x.now) || isExpired(p.expires_at, x.now)) return { ok: false, why: "expired" };
  if (Date.parse(p.expires_at) - Date.parse(p.issued_at) > OWNER_LINK_MAX_LIFETIME_S * 1e3) return { ok: false, why: "lifetime" };
  const i = p.owners.findIndex((o) => sameDid(o, x.principal)); if (i < 0) return { ok: false, why: "not_this_owner" };
  for (const o of p.owners) if (!verifier.signed(l!, o, undefined, "ES256", x.rpOf(o))) return { ok: false, why: "signature" };
  return { ok: true, other: p.owners[1 - i] };
}

// ---------------------------------------------------------------- v0.4.0: two Shōkai cards, the credential rule, customer links

/** v0.4.0 (§2.3): the kind of a Shōkai card as read by its receiver. A card without `kind` (issued under v0.3.0) reads as a
 *  visitor card when a visitor presents it, and as a host card when a gatekeeper presents it. */
export function cardKindOf(card: S.RepresentativeCard, presentedBy: "visitor" | "gatekeeper"): S.CardKind {
  return card.kind === "visitor" || card.kind === "host" ? card.kind : presentedBy === "visitor" ? "visitor" : "host";
}
/** v0.4.0 (§2.3): the house config a Shōkai host card's `house_digest` fingerprints: the place's name, display name, principal and
 *  policy (purposes, actions, spending actions, lobby text, limits, everything the door decides by). */
export type HouseConfig = { name: string; display_name: string; principal_id: string; policy: unknown };
export function houseDigest(cfg: HouseConfig): string {
  return digestOf({ name: cfg.name, display_name: cfg.display_name, principal_id: cfg.principal_id, policy: cfg.policy });
}
/**
 * v0.4.0 (§2.3, C202–C205): the fields of a Shōkai host card (its signature is checked by the caller, §2.6). It names this place
 * (principal and entry), carries its host scope covering the place's actions, the house digest of the house config it serves now,
 * the signed summary the owner read, and for an organization the record of the person who approved it.
 */
export function checkHostCardFields(card: S.RepresentativeCard, x: { principal_id: string; entry?: string; house_digest?: string; actions?: string[] }): Check {
  if (card.kind !== "host") return fail(card.kind === "visitor" ? "visitor_card" : "no_kind");
  const pl = card.place;
  if (!pl || typeof pl.principal_id !== "string" || typeof pl.entry !== "string") return fail("no_place");
  if (!sameDid(pl.principal_id, x.principal_id) || !sameDid(card.principal?.principal_id ?? "", x.principal_id)) return fail("other_place");
  if (x.entry !== undefined && pl.entry !== x.entry) return fail("other_place");
  const hs = card.host_scope;
  if (!hs || !Array.isArray(hs.actions) || !Array.isArray(hs.duties)) return fail("no_host_scope");
  if ((x.actions ?? []).some((a) => !hs.actions.includes(a))) return fail("host_scope");
  if (typeof card.house_digest !== "string" || !card.house_digest) return fail("no_house_digest");
  if (x.house_digest !== undefined && card.house_digest !== x.house_digest) return fail("house_changed");
  if (!card.shown_to_owner?.text || !card.shown_to_owner.locale) return fail("no_shown_to_owner");
  if (card.principal?.kind !== "person") {
    const oa = card.org_approval;
    if (!oa || !oa.approver || typeof oa.approver.name !== "string" || !oa.approver.name || typeof oa.approver.role !== "string" || !oa.approver.role || !isTimestamp(oa.approved_at)) return fail("no_org_approval");
  }
  return { ok: true };
}
/** v0.4.0 (§5.4, C210): member names that carry an owner's login credential or an account or payment-card identifier. Shōkai
 *  never carries these: not in a card, a mandate or an act. Compared case-insensitively, with "-" and spaces read as "_". */
export const CREDENTIAL_MEMBERS = ["password", "passcode", "passphrase", "otp", "one_time_code", "one_time_password", "totp", "session_cookie",
  "access_token", "refresh_token", "bearer_token", "id_token", "api_key", "client_secret", "account_number", "iban", "routing_number", "sort_code",
  "card_number", "pan", "cvv", "cvc", "security_code",
  // v0.5.1 (red-team round 3, V05-F10-04): C210's "session cookie or token" in its other spellings. See also sessionShaped below.
  "session_token", "session_key", "set_cookie", "auth_token"];
/**
 * v0.5.1 (red-team round 3, V05-F10-04; C210 "session cookie or token"): names that are a credential only by their shape, so an
 * ordinary argument with the same word (a bakery's `cookie: "oatmeal"`, a booked class `session: { date, time }`) isn't refused: a
 * `session` object carrying a cookie, token, secret or sid (a pasted session: `{ id, cookie }`), and a `cookie` or `cookies` whose
 * value is an object, an array, or a string holding `name=value`. Checked wherever the C210 list is (when `names` includes session_cookie).
 */
const SESSION_SECRETS = ["cookie", "cookies", "set_cookie", "token", "secret", "sid"];
export function sessionShaped(name: string, v: unknown): boolean {
  if (name === "session") return !!v && typeof v === "object" && Object.keys(v as object).some((k) => SESSION_SECRETS.includes(k.toLowerCase().replace(/[-\s]/g, "_")));
  if (name === "cookie" || name === "cookies") return (!!v && typeof v === "object") || (typeof v === "string" && /[^=\s]=/.test(v));
  return false;
}
/** v0.4.0 (§5.1, C211): a mandate or card also carries no payment instrument: no payment token or wallet credential. */
export const INSTRUMENT_MEMBERS = ["payment_token", "payment_method_token", "wallet_token", "network_token", "card_token"];
export function forbiddenMembers(x: unknown, names: string[] = CREDENTIAL_MEMBERS, depth = 0): string[] {
  if (!x || typeof x !== "object" || depth > 12) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const n = k.toLowerCase().replace(/[-\s]/g, "_");
    if (names.includes(n) || (names.includes("session_cookie") && sessionShaped(n, v))) out.push(n);
    out.push(...forbiddenMembers(v, names, depth + 1));
  }
  return [...new Set(out)];
}
/** v0.4.0 (§5.4): a customer link lasts at most 400 days, like an owner link (§2.8). */
export const CUSTOMER_LINK_MAX_LIFETIME_S = 400 * 86400;
/**
 * v0.4.0 (§5.4, C207): a CustomerLink the place recorded in its own channel. Valid when it names this place, it is in its time
 * window and lifetime, it is signed by the place's principal key, and by the owner's passkey (ES256, against its stated rp_id).
 */
export function verifyCustomerLink(verifier: Verifier, l: S.Signed<S.CustomerLink> | undefined, x: { place: string; now: string }): Check {
  const p = l?.payload; if (!p) return fail("missing");
  if (verifier.mode === "real" && badTimestamps(l!).length) return fail("timestamp");
  if (typeof p.link_id !== "string" || !p.link_id || !sameDid(p.place, x.place)) return fail("place");
  if (!isTimestamp(p.issued_at) || !isTimestamp(p.expires_at) || notYetValid(p.issued_at, x.now) || isExpired(p.expires_at, x.now)) return fail("expired");
  if (Date.parse(p.expires_at) - Date.parse(p.issued_at) > CUSTOMER_LINK_MAX_LIFETIME_S * 1e3) return fail("lifetime");
  if (!p.scope || !Array.isArray(p.scope.actions)) return fail("scope");
  if (!p.shown_to_owner?.text) return fail("no_shown_to_owner");
  if (!verifier.signed(l!, x.place)) return fail("place_signature");
  if (!verifier.signed(l!, p.owner_id, undefined, "ES256", p.rp_id)) return fail("owner_signature");
  return { ok: true };
}

/** v0.4.0 (§3.1, C203, C204, C205, C207): the fixed sentences a visiting representative brings home when it didn't go in. */
export const PLACE_CARD_REPORTS = {
  visitor_card: "This place showed a Shōkai visitor card instead of a Shōkai host card, so I didn't go in.",
  other_place: "This place showed a Shōkai host card for another place, so I didn't go in.",
  withdrawn: "This place's Shōkai host card has been withdrawn by its owner, so I didn't go in.",
  house_changed: "This place's setup changed after its owner signed its Shōkai host card, so I didn't go in.",
  unchecked_withdrawal: "I couldn't check whether this place's Shōkai host card is still in force, so I didn't go in to buy anything.",
  incomplete: "This place's Shōkai host card is missing something its owner must sign, so I didn't go in.",
} as const;
export type PlaceCardProblem = keyof typeof PLACE_CARD_REPORTS;
/**
 * v0.4.0 (§2.6, C207): has the place's owner withdrawn its Shōkai host card? Read from a list the visitor fetched itself at the card's
 * `revocation_url` (a JSON array of Signed<CardRevocation>), each verified against the card's principal. "none": the card names no list.
 */
export function placeCardRevocation(verifier: Verifier, card: S.SignedCard, fetched: FetchCache): "none" | "clear" | "revoked" | "unreachable" {
  const p = card.payload; const url = p.revocation_url; if (typeof url !== "string" || !url) return "none";
  const f = fetched.get(url); if (!f || !f.ok || !Array.isArray(f.body)) return "unreachable";
  for (const x of f.body as S.Signed<S.CardRevocation>[]) {
    const r = x?.payload; if (!r || r.card_id !== p.card_id || !sameDid(r.principal_id, p.principal.principal_id) || (r.card_digest !== undefined && r.card_digest !== card.payload_digest)) continue;
    if (verifier.signed(x, p.principal.principal_id, undefined, undefined, p.owner_binding?.rp_id ?? x.signatures?.[0]?.webauthn?.rp_id)) return "revoked";
  }
  return "clear";
}
/**
 * v0.4.0 (§3.1, §2.3): the visitor's two-card checks of the place's card, after C104 (signature by the listed principal, the listed
 * representative, its key and the possession proof). A v0.3.0 card without `kind` reads as a host card here (§2.3). A host card must
 * name this listing entry, cover the listed actions, fingerprint the house config the listing says is served now, and not be
 * withdrawn; a list it can't fetch ends a spending visit (fail closed) and is noted for any other.
 */
export function visitorPlaceCardCheck(verifier: Verifier, card: S.SignedCard, x: { principal_id: string; entry: string; house_digest?: string; actions?: string[];
  fetched: FetchCache; spending: boolean }): { ok: true; legacy: boolean; revocation: "none" | "clear" | "unreachable" } | { ok: false; problem: PlaceCardProblem; report: string } {
  const no = (problem: PlaceCardProblem) => ({ ok: false as const, problem, report: PLACE_CARD_REPORTS[problem] });
  const p = card.payload;
  if (cardKindOf(p, "gatekeeper") !== "host") return no("visitor_card");
  const legacy = p.kind === undefined;
  if (!legacy) {
    const f = checkHostCardFields(p, { principal_id: x.principal_id, entry: x.entry, ...(x.house_digest !== undefined ? { house_digest: x.house_digest } : {}), actions: x.actions });
    if (!f.ok) return no(f.why === "other_place" ? "other_place" : f.why === "house_changed" ? "house_changed" : "incomplete");
  }
  const rv = placeCardRevocation(verifier, card, x.fetched);
  if (rv === "revoked") return no("withdrawn");
  if (rv === "unreachable" && x.spending) return no("unchecked_withdrawal");
  return { ok: true, legacy, revocation: rv };
}
