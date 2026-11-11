// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// @kigenka/shokai: the reference TypeScript SDK for Shōkai, the agent introduction protocol (spec v0.5.0, wire shokai/0.5; answers shokai/0.3 in kind during the transition window).
// The protocol logic lives in ./core, synced byte for byte from the reference implementation that passes every conformance suite
// (scripts/sync-core.mjs). This file is the developer-facing surface: doors, representatives, visits, signing and verification.
import type * as S from "./core/shapes.js";
import { Host, PRINCIPAL_KINDS, reservedRpId, publicEntryUrl, type HostOpts, type Out, type PruneReport } from "./core/host.js";
import { createsAccount } from "./core/gate.js";
import { RealVerifier, type KeyRegistry } from "./core/verify.js";
import { possessionPayload } from "./core/verify.js";
import { placeListing, doorPointer, entryUrl, inboxUrl, lobbyUrl } from "./core/door.js";
import type { PlaceConfig, PlacePolicy, ActionPolicy } from "./core/policy.js";
import { houseDigest, visitorPlaceCardCheck, PLACE_CARD_REPORTS, forbiddenMembers, type FetchCache, type PlaceCardProblem } from "./core/trust.js";
import { parsePublicKey, makeSigned, makeOwnerSigned, newEd25519, newPasskeyOwner, digestOf, jcs, b64u, sha256, randomId, resolveDid, checkSig, sameDid, canonDid,
  parseMoney, edKeyToRaw, didKeyFromEdRaw, didKeyFragment, badTimestamps, isExpired, notYetValid, type Ed25519Signer, type PasskeyOwner } from "./core/crypto.js";
import { createPrivateKey, createPublicKey, randomBytes, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { PROTOCOL, LEGACY_TAG, SPEC_VERSION, SPEC_REF, TEST_PROFILE } from "./core/version.js";
import { doorMayFetch, readCapped, DOOR_FETCH_TIMEOUT_MS, doorFetch, FetchBudget } from "./fetch-policy.js";
import { leaflet, leafletHtml, type LeafletInput } from "./leaflet.js";
import type { DoorStore, DoorEvent, DoorState } from "./store.js";
import { WELL_KNOWN_PATH, APP_PROXY_PATH, checkSite, siteOrigin, siteHost, type SiteCheck } from "./discover.js";
import { matchAsk, ASK_COURTESY, MAX_ASK_CHARS, reviewVisitor, reviewText, ownerAskProblems, stripInvisible } from "./outside.js";
import { CalendarStandIn, bookingRef, confirmationMatches, type ReservationArgs } from "./reservations.js";
import { bookingProblem, intersectLimits } from "./core/gate.js";
import type { ServiceContext, ServiceAnswer } from "./core/host.js";
import { summaryDigest, summaryMatches, limitRequestOf, houseSummaryOf, contextRequestProblems as ctxProblemsOf } from "./core/v050.js";
/** Red team phase 1 (§11.1, C269): https, or plain http only on this computer (loopback). */
export function secureEntry(u: string): boolean { try { const x = new URL(u); if (x.protocol === "https:") return true; if (x.protocol !== "http:") return false; const h = x.hostname; return h === "localhost" || h === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(h); } catch { return false; } }
import { HostBudgetKeeper, priceTableMeter, HOST_BUDGET_LINES, type CostMeter, type HostModelEstimate, type ModelUsage, type BudgetTicket, type BudgetScope, type HostBudgetNotice } from "./host-budget.js";
import { ErrandMeter, neverSentMember, acknowledgementOnly, SHOKAI_NEVER_SENT, SHOKAI_ACKNOWLEDGEMENT_ONLY, SHOKAI_ERRAND_BUDGET_REACHED, type ErrandStep, type ErrandLimit } from "./errand.js";
export { signErrandBudget, errandBudgetProblem, ErrandMeter, neverSentMember, acknowledgementOnly, SHOKAI_ERRAND_BUDGET_REACHED, SHOKAI_ERRAND_BUDGET_INVALID,
  SHOKAI_NEVER_SENT, SHOKAI_ACKNOWLEDGEMENT_ONLY, type ErrandBudgetInput, type ErrandStep, type ErrandLimit } from "./errand.js";
export { LEGACY_TAG };
export * from "./system1.js";
export * from "./host-budget.js";
export * from "./budget-store.js";
export { matchAsk, normaliseAsk, NEVER_DISCLOSE_WORDS, ASK_COURTESY, MAX_ASK_CHARS, reviewVisitor, type AskMatch } from "./outside.js";
export { CalendarStandIn, bookingRef, confirmationMatches, CALENDAR_STAND_IN_NOTE, type CalendarFile, type ReservationArgs } from "./reservations.js";
export { bookingProblem, bookingWithin, bookingLimitsOk } from "./core/gate.js";
export { contextRequirementsProblems, contextRequestFor, contextRequestProblems, contextResponseProblems, contextResponseDigest, contextAdmission, MAX_CONTEXT_FIELDS, MAX_CONTEXT_VALUE_CHARS } from "./core/v050.js";
/** v0.5.0 (§7.2, C231): a fresh idempotency key (16 random bytes, base64url) for one act or act_confirmation. */
const idemKey = () => b64u(randomBytes(16));

/** Visit.act(): the error code when the place didn't answer (it may be restarting); whether the act happened is unknown. */
export const SHOKAI_PLACE_UNREACHABLE = "SHOKAI_PLACE_UNREACHABLE";
export type * from "./core/shapes.js";
export type { PlaceConfig, PlacePolicy, ActionPolicy, Ed25519Signer, PasskeyOwner, Out, HostOpts, KeyRegistry, FetchCache };
export { PROTOCOL, SPEC_VERSION, SPEC_REF, TEST_PROFILE, Host, RealVerifier, digestOf, jcs, placeListing, doorPointer };

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const plusDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400e3).toISOString().replace(/\.\d+Z$/, "Z");

// ------------------------------------------------------------------ keys, signing and verification (§2)

/** A representative's Ed25519 key, identified by did:key. Keep the private key on the representative's side only. */
export function generateRepresentativeKey(): Ed25519Signer { return newEd25519(); }
/** The public half of a representative key, for a card someone else signs (e.g. the host-card request). Never the private key. */
export function representativePublic(key: Ed25519Signer): { id: string; key_id: string; public_key: string } { return { id: key.id, key_id: key.key_id, public_key: b64u(key.pubRaw) }; }
const KEY_PREFIX = "shokai-ed25519-pkcs8:";
/**
 * The representative's private key as one line of text, to keep in a secret store: the system keyring is best (on Linux
 * `secret-tool store`, on macOS `security add-generic-password`), else a file readable only by the representative (chmod 600).
 * Never print it, paste it into chat or memory notes, or put it in a card. Load it back with importRepresentativeKey().
 */
export function exportRepresentativeKey(key: Ed25519Signer): string {
  return KEY_PREFIX + b64u(key.priv.export({ format: "der", type: "pkcs8" }) as Buffer);
}
/** The key exportRepresentativeKey() wrote, back as a signer with the same did:key. Throws on anything else (the message never echoes the input). */
export function importRepresentativeKey(text: string): Ed25519Signer {
  const t = String(text ?? "").trim();
  if (!t.startsWith(KEY_PREFIX)) throw new Error("not a Shōkai representative key (expected the text exportRepresentativeKey() wrote)");
  let priv: KeyObject;
  try { priv = createPrivateKey({ key: Buffer.from(t.slice(KEY_PREFIX.length), "base64url"), format: "der", type: "pkcs8" }); }
  catch { throw new Error("not a readable Ed25519 private key"); }
  if (priv.asymmetricKeyType !== "ed25519") throw new Error("not an Ed25519 key");
  const pubRaw = edKeyToRaw(createPublicKey(priv)); const id = didKeyFromEdRaw(pubRaw);
  return { kind: "ed25519", id, key_id: didKeyFragment(id), priv, pubRaw };
}
/** A principal key for a place (an organisation signs its own card and policy with it). */
export const generatePrincipalKey = generateRepresentativeKey;
/**
 * A SOFTWARE stand-in for an owner's passkey (ES256, did:jwk, WebAuthn-shaped signatures), for development and tests only.
 * In production the owner signs with a real passkey in their own browser or device (Appendix A.1); the SDK never holds it.
 */
export function developmentPasskey(): PasskeyOwner { return newPasskeyOwner(); }

/** Sign a payload into the Shōkai envelope {payload, payload_digest (JCS + SHA-256), signatures} (§2.2). */
export function sign<T>(payload: T, signer: Ed25519Signer | PasskeyOwner, at = nowIso()): S.Signed<T> {
  return signer.kind === "passkey" ? makeOwnerSigned(payload, signer, at) : makeSigned(payload, signer, at);
}
/**
 * v0.5.0 (§6.12, provisional): the owner's signed answer to a context request, field by field: `answers` ({name, value}, each value
 * 1–500 characters, the owner's own words) and `declined` (names) must cover every requested field exactly once. Sign it on the
 * owner's own device; the representative only carries it.
 */
export function signContextResponse(owner: Ed25519Signer | PasskeyOwner, req: S.ContextRequest, o: { answers: { name: string; value: string }[]; declined: string[]; at?: string }): S.ContextResponse {
  const body = { type: "context_response" as const, request_id: req.request_id, request_digest: digestOf(req), place: req.place, answers: o.answers, declined: o.declined };
  return { ...body, owner_sig: sign(body, owner, o.at).signatures[0] };
}
export type Verification = { ok: true; signer: string } | { ok: false; why: string };
/**
 * Verify a signed envelope: the digest is the JCS SHA-256 of the payload, and the first signature verifies under the signer's
 * DID (did:key and did:jwk resolve offline; for did:web pass a registry). `expectSigner` pins who must have signed.
 */
export function verifySigned(env: S.Signed<unknown>, opts: { expectSigner?: string; registry?: KeyRegistry; rpId?: string } = {}): Verification {
  if (!env || typeof env !== "object" || !("payload" in env)) return { ok: false, why: "not an envelope" };
  let d: string; try { d = digestOf(env.payload); } catch { return { ok: false, why: "payload is not canonicalisable" }; }
  if (d !== env.payload_digest) return { ok: false, why: "payload_digest mismatch" };
  const sig = env.signatures?.[0]; if (!sig) return { ok: false, why: "unsigned" };
  if (opts.expectSigner && !sameDid(sig.signer, opts.expectSigner)) return { ok: false, why: "unexpected signer" };
  const reg = opts.registry?.get(sig.signer);
  const key = reg ? resolveFromRegistry(reg) : resolveDid(sig.signer);
  if (!key) return { ok: false, why: "signer key not resolvable" };
  const c = checkSig(sig, d, key, opts.rpId);
  return c.ok ? { ok: true, signer: canonDid(sig.signer) } : { ok: false, why: c.why ?? "bad signature" };
}
function resolveFromRegistry(r: { alg: "Ed25519" | "ES256"; public_key: string }) { return parsePublicKey(r.alg, r.public_key); }

// ------------------------------------------------------------------ cards, mandates and vouches (§2.3, §4, §5.1)

export type CardInput = { displayName: string; kind?: S.PrincipalKind; role?: string; purposes: S.PurposeCode[]; actions: string[]; locales?: string[]; validDays?: number;
  /** v0.4.0 (§2.3): which Shōkai card this is: "visitor" (default) for going out, "host" for keeping one place (then `host` is needed). */
  cardKind?: S.CardKind;
  /** v0.4.0 (§2.3): the plain-language summary the owner read before signing, inside the signature. */
  shownToOwner?: { text: string; locale: S.Locale };
  /** v0.4.0 (§2.3, §7.3): "purchase_only" when the owner was told the representative may ask them live to approve a purchase. */
  ownerPrompts?: "purchase_only" | "never";
  /** v0.4.0 (§2.3): a Shōkai host card's binding: the place, the host scope, the house digest and, for an organization, who approved it. */
  host?: { place: S.PlaceBinding; host_scope: S.HostScope; house_digest: string; org_approval?: S.OrgApproval;
    /** v0.5.0 (§2.3, C248): the digest of the house summary (summaryDigestFor); REQUIRED for a v0.5.0 host. */ summary_digest?: string;
    /** v0.5.0 (§7.6): on a host card for an amended setup (door.amendmentFor() gives it). */ setup?: S.RepresentativeCard["setup"] } };
/** v0.5.0 (§9.3, C288): graduated penalties: setup failures back off, only signed misconduct gives an expiring, appealable never. */
export { classify, PenaltyLedger, SETUP_REASON_CODES, MAX_NEVER_DAYS, type PenaltyKind, type PenaltyEvidence, type PenaltyOutcome, type PenaltyLedgerOptions, type Appeal, type MisconductFinding } from "./penalties.js";
/**
 * A representative card signed by its owner (a person's card carries the passkey owner binding, §2.3).
 * `validDays` defaults to 180; the protocol sets no lifetime. Shorter is safer (it limits what a stolen representative key can
 * do, §2.6): the representative skills ask for 90 days or less, so pass `validDays: 90` there.
 */
export function signCard(rep: Ed25519Signer, owner: PasskeyOwner | Ed25519Signer, c: CardInput, platform: Ed25519Signer = newEd25519()): S.SignedCard {
  const at = plusDays(nowIso(), -1 / 1440); const kind = c.kind ?? (owner.kind === "passkey" ? "person" : "company");
  if (!PRINCIPAL_KINDS.includes(kind)) throw new Error("principal.kind must be person|brand|company|system");
  const card: S.RepresentativeCard = { card_id: randomId("card"), protocol: PROTOCOL, representative_id: rep.id,
    principal: { principal_id: owner.id, kind, display_name: c.displayName }, role: c.role ?? `${c.displayName}'s representative`, standing: { tier: "standard" },
    mandate_scope: { purposes: c.purposes, actions: c.actions }, locales: c.locales ?? ["en-US"],
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) }, issued_at: at, expires_at: plusDays(at, c.validDays ?? 180),
    ...(owner.kind === "passkey" ? { owner_binding: { method: "passkey_webauthn" as const, owner_id: owner.id, platform_key: platform.id, rp_id: owner.rpId } as S.RepresentativeCard["owner_binding"] } : {}),
    kind: c.cardKind ?? "visitor", ...(c.shownToOwner ? { shown_to_owner: c.shownToOwner } : {}), ...(c.ownerPrompts ? { owner_prompts: c.ownerPrompts } : {}), ...(c.cardKind === "host" && c.host ? c.host : {}) };
  if (c.cardKind === "host" && !c.host) throw new Error("a Shōkai host card needs `host` (place, host_scope, house_digest; org_approval for an organization), §2.3");
  if (forbiddenMembers(card).length) throw new Error("a Shōkai card never carries a password, code, session or account or card number (§5.4)");
  return sign(card, owner, at);
}
/**
 * What the owner signs in a mandate (§5.1). `limits.max_amount` is the spending allowance: without it the mandate authorises
 * no spending at all (D11), and the non-spending purposes (`visitation`, `invitation`, `introduction`) must not carry one.
 * Validity: `validSeconds` (e.g. 7200 for two hours) wins over `validDays` (default 30 days for signMandate).
 */
export type MandateInput = { /** v0.5.0 (§5.1, §7.3): the mandate this one supersedes (a limit raise). */ supersedes?: S.SignedMandate; /** v0.5.0 (§7.3): the over-limit hold it answers (supersedes.hold). */ supersedesHold?: { hold_id: string; act_digest: string };
  /** v0.5.0 (§5.1): what the owner was shown. */ shownToOwner?: string;
  purpose: S.PurposeCode; statement?: string; actions: string[]; limits?: S.Limits; validDays?: number; validSeconds?: number;
  /** An exact expires_at (wins over validSeconds and validDays); a superseding mandate ends no later than its hold (§7.3). */ expiresAt?: string };
/** A mandate the owner signs: one purpose, the actions allowed, and limits (§5.1). */
export function signMandate(rep: Ed25519Signer, owner: PasskeyOwner | Ed25519Signer, card: S.SignedCard, m: MandateInput): S.SignedMandate {
  // v0.3.0-rc4 (§3.6): valid from now, not back-dated, so a place that restarted without its state seats a mandate signed after it.
  const at = nowIso();
  const until = m.expiresAt ?? (m.validSeconds !== undefined ? plusDays(nowIso(), m.validSeconds / 86400) : plusDays(at, m.validDays ?? 30));
  return sign<S.Mandate>({ mandate_id: randomId("mand"), principal_id: owner.id, representative_id: rep.id, card_id: card.payload.card_id,
    purpose: { code: m.purpose, statement: m.statement ?? `Purpose: ${m.purpose}`, locale: "en-US" }, allowed_actions: m.actions, limits: m.limits ?? {},
    valid_from: at, expires_at: until,
    ...(m.supersedes ? { supersedes: { mandate_id: m.supersedes.payload.mandate_id, mandate_digest: m.supersedes.payload_digest, ...(m.supersedesHold ? { hold: m.supersedesHold } : {}) } } : {}),
    ...(m.shownToOwner ? { shown_to_owner: { text: m.shownToOwner, locale: "en-US" } } : {}) } as S.Mandate, owner, at);
}
/** A vouch: an introducer answers for a representative, for some purposes, with a revocation log it publishes (§4). */
export function signVouch(introducer: Ed25519Signer | PasskeyOwner, introducerName: string, subject: { rep: string; card: S.SignedCard }, v: { purposes: S.PurposeCode[]; revocationLog: string; relationship?: S.Vouch["relationship"]; interest?: S.Vouch["introducer_interest"]; validDays?: number }): S.SignedVouch {
  const at = nowIso();
  return sign<S.Vouch>({ vouch_id: randomId("vouch"), introducer: { principal_id: introducer.id, display_name: introducerName }, subject: { representative_id: subject.rep, card_digest: subject.card.payload_digest },
    scope: { purposes: v.purposes }, revocation_log: v.revocationLog, relationship: v.relationship ?? "known_personally", ...(v.interest ? { introducer_interest: v.interest } : {}),
    issued_at: at, expires_at: plusDays(at, v.validDays ?? 60) }, introducer, at);
}

// ------------------------------------------------------------------ owner helpers: revocation, owner links, real passkeys (§2.6, §2.8, A.1)

/**
 * A card revocation the card's principal signs (§2.6, C191). Publish it at the card's `revocation_url`, deliver it to places
 * as a `card_revocation` message, or sign it now and keep it (`standby: true`) for the day the representative's key is lost.
 */
export function signCardRevocation(owner: PasskeyOwner | Ed25519Signer, card: S.SignedCard, o: { reason?: S.CardRevocation["reason"]; standby?: boolean; at?: string } = {}): S.Signed<S.CardRevocation> {
  if (!sameDid(card.payload.principal.principal_id, owner.id)) throw new Error("only the card's principal can revoke it");
  const at = o.at ?? nowIso();
  return sign<S.CardRevocation>({ card_id: card.payload.card_id, card_digest: card.payload_digest, principal_id: owner.id, revoked_at: at,
    ...(o.reason ? { reason: o.reason } : {}), ...(o.standby ? { standby: true } : {}) }, owner, at);
}
/** The `card_revocation` message body that carries a signed revocation to any place, in any encounter (§2.6). */
export function cardRevocationMessage(revocation: S.Signed<S.CardRevocation>): { type: "card_revocation"; revocation: S.Signed<S.CardRevocation> } {
  return { type: "card_revocation", revocation };
}
/**
 * Link two of the owner's per-place identities for ONE place (§2.8, C196): both passkeys sign, the link names that place as its
 * audience and lasts at most 400 days. Show it only with the owner's consent; a place joins the two records (history and `never`).
 */
export function signOwnerLink(a: PasskeyOwner, b: PasskeyOwner, o: { audience: string; validDays?: number; purpose?: string }): S.Signed<S.OwnerLink> {
  if (sameDid(a.id, b.id)) throw new Error("an owner link joins two different identities");
  const days = o.validDays ?? 365; if (days > 400) throw new Error("an owner link lasts at most 400 days (§2.8)");
  const at = nowIso();
  const payload: S.OwnerLink = { link_id: randomId("link"), owners: [a.id, b.id], audience: o.audience, issued_at: at, expires_at: plusDays(at, days), ...(o.purpose ? { purpose: o.purpose } : {}) };
  const one = makeOwnerSigned(payload, a, at), two = makeOwnerSigned(payload, b, at);
  return { payload, payload_digest: one.payload_digest, signatures: [...one.signatures, ...two.signatures] };
}
/**
 * Signing with a REAL passkey: build the WebAuthn request on the server, run `navigator.credentials.get` in the owner's browser
 * (see `@kigenka/shokai/browser`), then turn the assertion into a Shōkai signature here. The challenge is the payload's digest
 * (base64url of the 32 raw SHA-256 bytes, Appendix A.1); user verification is required.
 */
export function passkeyRequest<T>(payload: T, o: { rpId: string; credentialId?: string }) {
  const payload_digest = digestOf(payload);
  return { payload, payload_digest, publicKey: { challenge: payload_digest.slice(8), rpId: o.rpId, userVerification: "required" as const, timeout: 120000,
    ...(o.credentialId ? { allowCredentials: [{ type: "public-key" as const, id: o.credentialId }] } : {}) } };
}
export type PasskeyAssertion = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string };
/** Wrap a browser passkey assertion (base64url fields) as a signed envelope, and check it against the owner's DID before returning. */
export function signedFromPasskeyAssertion<T>(payload: T, a: PasskeyAssertion, o: { ownerDid: string; rpId: string; at?: string }): S.Signed<T> {
  const payload_digest = digestOf(payload);
  const sig = { alg: "ES256" as const, key_id: o.ownerDid + "#0", signer: o.ownerDid, signed_at: o.at ?? nowIso(), value: a.signature,
    webauthn: { authenticator_data: a.authenticatorData, client_data_json: a.clientDataJSON, credential_id: a.credentialId, rp_id: o.rpId } } as S.Signature;
  const env: S.Signed<T> = { payload, payload_digest, signatures: [sig] };
  const v = verifySigned(env, { expectSigner: o.ownerDid, rpId: o.rpId }); if (!v.ok) throw new Error("passkey assertion does not verify: " + v.why);
  return env;
}

// ------------------------------------------------------------------ doors (§3, §6, §7, §11)

export type DoorAction = ActionPolicy;
/** §7.7 (C274, provisional): the SDK's default caps on costly actions. */
export const COSTLY_ACTION_CAPS = Object.freeze({ per_seat: 20, per_owner_day: 100 });
export type DoorOptions = {
  /** Short slug used in addresses: <base>/places/<name>/entry. */
  name: string;
  displayName: string;
  category?: S.PlaceCategory;
  about?: string;
  how?: string;
  purposes: { code: S.PurposeCode; statement: string }[];
  /** What visitors may do once seated; `data_asks` declares the personal data each action will ask the owner for (§3.1). */
  actions: DoorAction[];
  /** Actions that move money (D11): refused unless the mandate carries a spending limit. */
  spendingActions?: string[];
  /**
   * §7.7 (C274, provisional): caps on costly actions (an act that spends money or opens an account, and a host-model call):
   * default 20 per seat and 100 per visiting owner per day (COSTLY_ACTION_CAPS). A place may lower them; raising one above the
   * default needs `raise: true`, else the door refuses to start (SHOKAI_COSTLY_CAPS_INVALID).
   */
  costlyActionCaps?: { per_seat?: number; per_owner_day?: number; raise?: boolean };
  /** §7.7 (C274): further actions this place counts as costly (for example one that calls a paid outside service). */
  costlyActions?: string[];
  locales?: string[];
  /**
   * Where the lobby's leaflet sends a visitor's owner to set up a representative (§3.3). Default: the env SHOKAI_ONBOARDING_URL,
   * else this door's own setup page at `<baseUrl>/start` (a short local quickstart the door serves; no outside address assumed).
   */
  onboardingUrl?: string;
  /** Where this door is reachable, e.g. http://127.0.0.1:3000/shokai. Used in listings and replies. */
  baseUrl?: string;
  /**
   * v0.5.0 (§3.1.1, site binding): the origin of the website this place belongs to, e.g. "https://lanternmoss.example". The door's
   * Shōkai host card must name it (`place.site`, inside the owner's signature), and the site's own /.well-known/shokai must list this
   * door (door.wellKnown() is that document, with the place's principal_id). Without it the door names no site, and a visitor whose
   * owner named a site won't treat it as that site's door.
   */
  site?: string;
  /**
   * v0.5.0 (§7.5, from P32): questions outside the setup. The owner's signed answers (with the words that match each), the topics
   * the host never discloses, and how long the owner has to answer. Inside the house config (and so the owner's signature). List
   * a `place.ask` action for visitors to ask. A matching ask is answered word for word; a never-disclose topic is declined at once
   * and never sent to the owner; anything else waits for the owner (door.ownerReviews(), door.answerAsk()).
   */
  outsideSetup?: S.OutsideSetup;
  /**
   * v0.5.0 (§7.4): take reservations (reservation.check / make / change / cancel, when listed) against a calendar stand-in: a
   * local JSON file labelled as a stand-in (CalendarFile). The door reads free or busy only, and signs a BookingConfirmation.
   */
  reservations?: { calendarFile: string; refPrefix: string; durationMinutes?: number; item?: string };
  /** The owner's time zone for the times in an owner review (default UTC). */
  ownerTimeZone?: string;
  /**
   * The door's keys. Without `card`, the door signs its own card with `principal` (a place key; made if absent). With `card`,
   * only `rep` is needed and it MUST be the key the card names: the owner's passkey stays on the owner's device.
   */
  keys?: { rep: Ed25519Signer; principal?: Ed25519Signer };
  /**
   * F3 (rc4): the door's card, signed by its owner's passkey: the reference signing page's output (`signed/<name>.json`), one by one
   * or from a one-tap bundle (Appendix A.1, C195). createDoor verifies it as a visitor's door would (§2.1–§2.3, §2.6): the owner's
   * ES256 passkey signature against the card's `owner_binding.rp_id`, the owner binding, the protocol, the validity window, the
   * representative key, and that it covers this door's purposes and actions. It throws `SHOKAI_DOOR_CARD_INVALID` or
   * `SHOKAI_DOOR_CARD_REVOKED`. The door then presents it as its card, and its principal is the owner.
   */
  card?: S.SignedCard | { signed: S.SignedCard };
  /** With `card`: the signing origin you expect (the card's rp_id must equal it), e.g. "sign.example.com". */
  ownerRpId?: string;
  /** With `card`: revocations the owner signed (a withdrawal, or a standby slip delivered). A matching one refuses the card. */
  cardRevocations?: S.Signed<S.CardRevocation>[];
  /**
   * v0.4.0 (§2.3, C206): the person who approved this organization's Shōkai host card, by name and role (e.g. { name: "Ren Okabe",
   * role: "Owner" }). Required when the door signs its own card with a place key (an organization's card); recorded on the card
   * as `org_approval`. createDoor throws SHOKAI_APPROVER_REQUIRED without it. Not used with an owner-signed `card`.
   */
  approvedBy?: { name: string; role: string; approver_id?: string };
  /** v0.4.0 (§7.3): hold a purchase for the visitor's owner's live approval for up to this many seconds (at most 900). Off when absent. */
  purchaseHoldSeconds?: number;
  /** Introducers whose vouches this place honours ("*" = any valid vouch, never for money or accounts). */
  trustedIntroducers?: string[] | "*";
  /** Purposes that need an introduction to be seated. */
  requireVouchFor?: S.PurposeCode[];
  /** Run the conformance test profile (Appendix B): loopback fetches, test decider. Never in production. */
  testProfile?: boolean;
  /** Anything else in the place policy (advanced). */
  policy?: Partial<PlacePolicy>;
  hostOpts?: HostOpts;
  /**
   * v0.3.0-rc4 (§3.6, C192): where the door keeps its durable state (mandate ledgers, nevers, spent nonces, revocations), as JSON.
   * Restored at construction and written (atomically) after every message. Without it the state is in memory only, and the door
   * refuses mandates valid before it started (refuse-on-loss), so a restart can never reset what an owner allowed. If the file is
   * lost, pass hostOpts.stateEpoch (the time it was lost) for the same protection.
   */
  stateFile?: string;
  /**
   * How strict the door is, from easy to strict (a convenience over the policy fields; `policy` still wins). Default "standard".
   * Every preset keeps the protocol's floor: an owner-signed Shōkai visitor card and a mandate for anything personal, and no
   * admission without the door's own Shōkai host card (§2.3). See PRESETS.
   */
  preset?: DoorPreset;
  /** The leaflet's place parts (template "shokai-leaflet/3"): sets the lobby's about/how and the onboarding page's text (§3.3). */
  leaflet?: Omit<LeafletInput, "placeName"> & { placeName?: string };
  /**
   * An async store for the durable state (§3.6) and the visits in progress (encounters, passes, holds, single-use acts), for
   * doors on serverless hosts or with several instances, with no sticky sessions: memoryStore(), fileStore(path) or
   * kvStore({ get, set, cas }). The door loads it before each answer and saves after every message, with a version check: if
   * another instance wrote in between, this answer is withheld and the visitor told to retry (429, §11.1).
   * Use `store` or `stateFile`, not both.
   */
  store?: DoorStore;
  /** Door activity, as it happens: machine fields only, never prose (§12.3). See DoorEvent. */
  onEvent?: (e: DoorEvent) => void;
  /**
   * v0.4.0: how long a finished visit is kept, in seconds after its last message (default 3600; at least 600). Then its encounter,
   * ended pass, counted acts and de-duplication keys are dropped, so the state a door stores stays the size of its recent traffic.
   * What §3.6 says to keep stays as long as it says (greeting nonces up to 7 days, each mandate's use until it expires, `never`
   * bindings, records, revocations). `false` keeps everything (the state then grows with every visit).
   */
  retainFinishedVisitsS?: number | false;
  /**
   * v0.4.0: signed messages whose sent_at is more than this many seconds from the door's clock are discarded unanswered (§2.2
   * informative; RT-C4), so nothing the door has forgotten can be replayed. Default 900 when visits are pruned; `false` = off.
   */
  maxMessageAgeS?: number | false;
  /**
   * §6.11 (provisional): a cost meter for the host representative's model calls, used with the owner's signed host budget. It may
   * only price higher than the owner's price table (the door takes the larger), and a model the table doesn't list is never called
   * under a dollar ceiling. Default: the price table alone.
   */
  costMeter?: CostMeter;
  /** §6.11, test profile only (Appendix B): the clock the host budget reads its day and month from. Ignored without testProfile. */
  hostBudgetClock?: () => Date;
  /**
   * §11.1 (C266, C278, provisional): unverified arrivals (lobby posts, unsigned ritual bodies, listing, house summary and host card
   * reads) allowed per client address per minute; past it, 429 with retry-after. A positive integer; default ANON_RATE_PER_ADDR (60).
   * Counts are in memory: a restart resets them; several instances without a shared counter each apply their own.
   */
  anonRatePerAddr?: number;
  /** §11.1 (C266, C278, provisional): unverified arrivals allowed in total per minute. A positive integer; default ANON_RATE_TOTAL (600). */
  anonRateTotal?: number;
  /**
   * §11.1 (C278): a header your own trusted proxy sets to the client address (e.g. "x-forwarded-for", first entry used). Unset: the
   * socket address is used. Don't set it unless a proxy you control always overwrites the header.
   */
  anonRateAddressHeader?: string;
};

/** v0.5.0 (§7.6): door.amendmentFor() refuses changes it can't prepare (`why` says which). */
export const SHOKAI_AMENDMENT_INVALID = "SHOKAI_AMENDMENT_INVALID" as const;
import { parseStrictJson } from "./strict-json.js";
import { AnonRate, signedArrival } from "./anon-rate.js";
import { NewcomerBudget, SEATS_PER_CARD, SEATS_PER_SOURCE, CLAIM_FAIL_CAP_PER_CARD, CLAIM_BACKOFF_BASE_S, CLAIM_BACKOFF_MAX_S } from "./free-principals.js";
import { readBoundedStream, readBoundedIterable, ShokaiPayloadTooLargeError, ShokaiInvalidUtf8Error } from "./bounded-read.js";
/** Fable review (§3.4): createDoor() caps open encounters by default; pass hostOpts.maxEncounters to change it (0 = no cap, not advised). */
export const DEFAULT_MAX_ENCOUNTERS = 10_000;
/** Fable review: a door served from https on a non-loopback host is a public door; only a local door accepts development passkeys (RFC 2606 rp_ids). @internal */
/** The door's own fetch cache keeps at most this many URLs (oldest dropped first). @internal */
const MAX_FETCHED = 5_000;
/**
 * The sender of a signed arrival, when it counts as authenticated: the signature verifies AND signatures[0].signer is payload.from
 * (§2.2, C184; pre-release review round 2). Anything else (a valid signature by another key included) is unauthenticated. @internal
 */
function verifiedArrival(m: any): string | null {
  try { const from = m?.payload?.from; const signer = m?.signatures?.[0]?.signer;
    if (typeof from !== "string" || typeof signer !== "string" || !sameDid(signer, from)) return null;
    return (verifySigned(m, {}) as any)?.ok ? from : null; } catch { return null; }
}
export { ANON_RATE_PER_ADDR, ANON_RATE_TOTAL } from "./anon-rate.js";
export { ClaimGuard, SeatCaps, NewcomerBudget, codeEntropyBits, hasMinimumCodeEntropy, MIN_CODE_ENTROPY_BITS, CLAIM_FAIL_CAP_PER_CARD,
  CLAIM_FAIL_WINDOW_S, CLAIM_BACKOFF_BASE_S, CLAIM_BACKOFF_MAX_S, SEATS_PER_CARD, SEATS_PER_SOURCE, NEWCOMER_PER_PRINCIPAL, NEWCOMER_PER_SOURCE, SEAT_IDLE_S, FREE_PRINCIPAL_ANSWER,
  type ClaimGuardOptions, type ClaimVerdict, type SeatCapsOptions, type NewcomerBudgetOptions, type SeatOpen } from "./free-principals.js";
/** v0.5.0 (§7.6): an amended setup prepared for the owner's signature. `card` goes to signCard() as is; `readBack` is what they read. */
export type SetupDraft = { amendment_id: string; from_review?: string; changes: S.SetupChange[]; options: DoorOptions; house_digest: string; summary_digest: string;
  setup: NonNullable<S.RepresentativeCard["setup"]>; readBack: string; card: CardInput };
/** From easy to strict. Each maps to policy fields the protocol already has; none changes the wire. */
export type DoorPreset = "open" | "standard" | "strict";
export const PRESETS: Record<DoorPreset, string> = {
  open: "Any visiting representative with an owner-signed Shōkai visitor card and a mandate may be admitted with a pass. Introductions are welcome but never needed; a vouch from anyone counts, never for money or accounts.",
  standard: "The default. As open, but only the introducers this place names count (none until it names some).",
  strict: "Every visiting representative needs an introduction from an introducer this place names, opening an account needs an introduction or this place's own invitation, purchases are held for the visitor's owner to approve live (up to 15 minutes), and passes last at most an hour.",
};
function presetPolicy(preset: DoorPreset, o: DoorOptions): Partial<PlacePolicy> {
  const spends = (o.spendingActions ?? []).length > 0;
  if (preset === "open") return { trusted_introducers: o.trustedIntroducers ?? "*", account_creation: "open" };
  if (preset === "standard") return {};   // the SDK's defaults, unchanged
  const named = Array.isArray(o.trustedIntroducers) ? o.trustedIntroducers : [];
  if (!named.length) throw Object.assign(new Error(`createDoor("${o.name}"): the "strict" preset needs trustedIntroducers: the introducers this place names`), { code: "SHOKAI_PRESET_INVALID" });
  return { require_vouch_for: o.requireVouchFor ?? o.purposes.map((p) => p.code), account_creation: "introduction_or_invitation", seat_ttl_s: 3600,
    ...(spends ? { purchase_hold_s: 900 } : {}) };
}

/** v0.4.0: the host options for pruning finished visits and for message freshness (DoorOptions.retainFinishedVisitsS, maxMessageAgeS). */
function pruneOpts(o: DoorOptions): { retainS?: number; maxMessageAgeS?: number } {
  const keep = o.retainFinishedVisitsS === undefined ? 3600 : o.retainFinishedVisitsS;
  const age = o.maxMessageAgeS === undefined ? (keep === false ? undefined : 900) : o.maxMessageAgeS === false ? undefined : o.maxMessageAgeS;
  return { ...(keep === false ? {} : { retainS: keep }), ...(age === undefined ? {} : { maxMessageAgeS: age }) };
}

/** A Shōkai door: the place's representative at its entrance. Wraps the reference Host (the full ritual, gate and seats). */
export class Door {
  readonly host: Host; readonly keys: { rep: Ed25519Signer; principal?: Ed25519Signer }; readonly base: string; readonly fetched: FetchCache = new Map();
  constructor(readonly opts: DoorOptions) {
    this.base = (opts.baseUrl ?? "http://127.0.0.1:0/shokai").replace(/\/$/, "");
    // Red team phase 1 (§11.1, C269, provisional): a door's addresses are https outside loopback and the test profile.
    if (!opts.testProfile && !secureEntry(this.base)) throw Object.assign(new Error(`SHOKAI_DOOR_INSECURE: baseUrl ${this.base} must be https (plain http only on loopback or with testProfile), §11.1`), { code: "SHOKAI_DOOR_INSECURE" });
    this.checkPublicCard(this.base, opts.card && fromSigningPage<S.RepresentativeCard>(opts.card), opts);
    this.costlyCaps = costlyCapsOf(opts.costlyActionCaps);
    if (opts.site !== undefined) this.site = doorSite(opts);   // §3.1.1: throws SHOKAI_DOOR_SITE_INVALID for anything that isn't an origin
    if (opts.card) {
      opts = { ...opts, card: fromSigningPage<S.RepresentativeCard>(opts.card) as S.SignedCard };
      if (!opts.keys?.rep) throw Object.assign(new Error("door card refused: an owner-signed door card needs keys.rep, the representative key it names"), { code: SHOKAI_DOOR_CARD_INVALID });
      this.keys = { rep: opts.keys.rep };
      const pre = doorConfig(opts, this.keys, this.base);
      const v = verifyDoorCard(opts.card as S.SignedCard, { representativeId: opts.keys.rep.id, rpId: opts.ownerRpId, allowReservedRpIds: !!opts.testProfile || !publicEntryUrl(this.base), revocations: opts.cardRevocations,
        purposes: opts.purposes.map((p) => p.code), actions: opts.actions.map((a) => a.action), entry: entryUrl(this.base, opts.name), houseDigest: houseDigest(pre),
        ...(opts.site !== undefined ? { site: doorSite(opts) } : {}) });
      if (!v.ok) throw Object.assign(new Error(`door card refused: ${v.why}`), { code: v.code });
    } else this.keys = { rep: opts.keys?.rep ?? newEd25519(), principal: opts.keys?.principal ?? newEd25519() };
    (this as { opts: DoorOptions }).opts = opts;
    const cfg = doorConfig(opts, this.keys, this.base);
    if (opts.store && opts.stateFile) throw new Error(`createDoor("${opts.name}"): use store or stateFile, not both`);
    const restored = opts.stateFile && existsSync(opts.stateFile) ? JSON.parse(readFileSync(opts.stateFile, "utf8")) : null;
    // §3.6: memory-only state means refuse-on-loss from construction; a new state file or store means a new place (nothing to lose).
    const epoch = opts.stateFile || opts.store ? undefined : nowIso();
    this.host = new Host(cfg, this.keys.rep, this.keys.principal ?? null, new RealVerifier(), undefined,
      { fetched: this.fetched, entryUrl: entryUrl(this.base, opts.name), inboxUrl: inboxUrl(this.base, opts.name), testProfile: !!opts.testProfile, uniqueActRefs: true,
        ...(epoch ? { stateEpoch: epoch } : {}), maxEncounters: DEFAULT_MAX_ENCOUNTERS, ...(opts.testProfile ? {} : { seatsPerCard: SEATS_PER_CARD, seatsPerSource: SEATS_PER_SOURCE }), claimFailCapPerCard: CLAIM_FAIL_CAP_PER_CARD, claimBackoff: { baseS: CLAIM_BACKOFF_BASE_S, maxS: CLAIM_BACKOFF_MAX_S }, ...pruneOpts(opts), ...(opts.hostOpts ?? {}), service: (a, ctx) => this.serve(a, ctx),
        costlyActCap: (x) => !this.costlyAct(x) ? { reached: false, count: () => {} } : this.costlyCapReached(x.seat_id, x.principal) ? { reached: true } : { reached: false, count: () => this.costlyCount(x.seat_id, x.principal) } });
    if (opts.reservations) this.calendar = new CalendarStandIn(opts.reservations.calendarFile);
    if (restored) this.host.restoreDurable(restored);
    // §6.11: the host budget comes from the signed house config only (this.host.cfg.policy), never from an option at run time.
    const custom = opts.costMeter;
    const meter: CostMeter = (m, u) => { const t = priceTableMeter(this.host.cfg.policy.host_budget?.prices)(m, u); if (t === null || !custom) return t;
      let c: bigint | null = null; try { c = custom(m, u); } catch { c = null; } return c !== null && c > t ? c : t; };
    const clock = opts.testProfile && opts.hostBudgetClock ? opts.hostBudgetClock : () => new Date();
    this.budget = new HostBudgetKeeper(() => this.host.cfg.policy.host_budget, meter, clock, opts.displayName,
      (n) => this.emit({ type: "owner_notice", notice_id: n.notice_id, kind: n.kind, scope: n.scope }));
    if (opts.stateFile && existsSync(opts.stateFile + ".host-budget.json")) this.budget.restore(JSON.parse(readFileSync(opts.stateFile + ".host-budget.json", "utf8")));
    this.save();
    this.ready = opts.store ? this.syncFromStore(true) : Promise.resolve();
  }
  /** Resolves once a `store`'s durable state is loaded. The adapters wait for it; call `await door.ready` before door.post() yourself. */
  readonly ready: Promise<void>;
  /** §3.1.1: the website this door belongs to (an origin), when the owner named one; null otherwise. */
  readonly site: string | null = null;
  private storeVersion = 0;
  /** With a `store`: take in whatever another instance wrote since this one last read. */
  private async syncFromStore(first = false) {
    const st = this.opts.store; if (!st) return; if (!first) await this.ready;
    const r = await st.load(); if (!r || r.version === this.storeVersion) return;
    this.host.restoreDurable(r.state);
    // Visits in progress too: whichever instance a message lands on answers it from the same encounters, passes and holds.
    if (r.state.live) { this.host.restoreLive(r.state.live); this.usedActs = new Map(r.state.live.sdk?.used_acts ?? []); if (r.state.live.sdk?.host_budget) this.budget.restore(r.state.live.sdk.host_budget); }
    this.storeVersion = r.version;
  }
  /** What a store holds for this door: the durable state, and its visits in progress under `live`. */
  private storedState(): DoorState { return { ...this.host.durableState(), live: { ...this.host.liveState(), sdk: { used_acts: [...this.usedActs], ...(this.budget?.active ? { host_budget: this.budget.toJSON() } : {}) } } }; }
  /**
   * Acts the MCP gate has let through (`${from}|${msg_id}` → when), so a signed act is single use at every instance of the door.
   * With a `store` it is written with the visits in progress.
   */
  usedActs = new Map<string, number>();
  /** With a `store`: write the durable state if nobody wrote since we read (false = conflict; this answer must be withheld). */
  private async persist(): Promise<boolean> {
    const st = this.opts.store; if (!st) return true;
    const v = await st.save(this.storedState(), this.storeVersion);
    if (v === null) { this.emit({ type: "busy", why: "store_conflict" }); await this.syncFromStore(); return false; }
    this.storeVersion = v; return true;
  }
  /**
   * Run `fn` against the latest durable state and write the result (a door without a `store` just runs it). Returns false when
   * another instance wrote first: whatever `fn` decided must then not be acted on. Used by the MCP gate around its checks.
   */
  async withStore<T>(fn: () => T): Promise<{ ok: true; value: T } | { ok: false }> {
    if (!this.opts.store) { const value = fn(); this.save(); return { ok: true, value }; }
    await this.syncFromStore(); const value = fn();
    return (await this.persist()) ? { ok: true, value } : { ok: false };
  }
  /**
   * v0.4.0: drop finished visits now (the door also does it as messages arrive, at most every 30 s). With a `store` it runs against
   * the latest state and is written with a version check; `ok: false` means another instance wrote first (try again). Returns
   * what was dropped. A door with retainFinishedVisitsS: false prunes nothing.
   */
  async prune(): Promise<{ ok: true; value: PruneReport | null } | { ok: false }> {
    return this.withStore(() => (this.host.opts.retainS === undefined ? null : this.host.prune()));
  }
  private emit(e: Record<string, unknown> & { type: DoorEvent["type"] }) {
    const f = this.opts.onEvent; if (!f) return;
    try { f({ at: nowIso(), place: this.opts.name, ...e } as DoorEvent); } catch { /* an event hook never changes an answer */ }
  }
  /** Events for one answered arrival: what came in, and what the door said back. Machine fields only. */
  private emitFor(as: "ritual" | "lobby" | "inbox", m: any, env: S.ReplyEnvelope | undefined) {
    if (!this.opts.onEvent) return;
    const inP = m?.payload ?? m; const enc = typeof inP?.encounter_id === "string" ? { encounter_id: inP.encounter_id } : {};
    if (!(inP && typeof inP === "object") || ["greeting", "card_presentation"].includes(inP.type) || typeof m === "string") this.emit({ type: "arrival", as, ...enc });
    for (const x of env?.messages ?? []) {
      const p: any = (x as any)?.payload ?? x; const e2 = typeof p?.encounter_id === "string" ? { encounter_id: p.encounter_id } : enc;
      if (p?.type === "lobby_briefing") this.emit({ type: "leaflet", ...e2 });
      if (p?.type === "invitation_response" || p?.type === "consideration_outcome") {
        this.emit({ type: "decision", decision: p.decision, ...(p.reason_code ? { reason_code: p.reason_code } : {}),
          ...(inP?.purpose?.code ? { purpose: inP.purpose.code } : {}), ...e2 });
        if (p.seat?.seat_id) this.emit({ type: "pass", seat_id: p.seat.seat_id, tools: p.seat.tool_allowlist ?? [], ...(p.seat.expires_at ? { expires_at: p.seat.expires_at } : {}), ...e2 });
      }
      if (p?.type === "farewell") this.emit({ type: "farewell", outcome: p.outcome, ...e2 });
    }
  }
  /** Write the durable state to stateFile, if there is one (atomic: a temp file, then rename). */
  save() {
    const f = this.opts.stateFile; if (!f) return;
    writeFileSync(f + ".tmp", JSON.stringify(this.host.durableState())); renameSync(f + ".tmp", f);
    if (this.budget?.active) { writeFileSync(f + ".host-budget.json.tmp", JSON.stringify(this.budget.toJSON())); renameSync(f + ".host-budget.json.tmp", f + ".host-budget.json"); }
  }
  /** §7.7 (C274): the caps on costly actions in force, and today's counts (per seat; per visiting owner and day, UTC). In memory. */
  readonly costlyCaps!: { per_seat: number; per_owner_day: number };
  private costlySeat = new Map<string, number>(); private costlyOwner = new Map<string, { day: string; n: number }>();
  /** §7.7 (C274): "seat" or "owner" when one more costly action for this seat would pass a cap; null when it may go on. */
  costlyCapReached(seat_id: string, principal: string): "seat" | "owner" | null {
    const day = new Date().toISOString().slice(0, 10); const o = this.costlyOwner.get(canonDid(principal));
    if ((this.costlySeat.get(seat_id) ?? 0) >= this.costlyCaps.per_seat) return "seat";
    return o && o.day === day && o.n >= this.costlyCaps.per_owner_day ? "owner" : null;
  }
  private costlyCount(seat_id: string, principal: string) {
    const day = new Date().toISOString().slice(0, 10); const k = canonDid(principal); const o = this.costlyOwner.get(k);
    this.costlySeat.set(seat_id, (this.costlySeat.get(seat_id) ?? 0) + 1); this.costlyOwner.set(k, { day, n: o && o.day === day ? o.n + 1 : 1 });
    if (this.costlyOwner.size > 100000) this.costlyOwner.delete(this.costlyOwner.keys().next().value!);
  }
  private costlyAct(a: any): boolean {
    const tool = typeof a?.tool === "string" ? a.tool : "";
    return (this.opts.spendingActions ?? []).includes(tool) || (this.opts.costlyActions ?? []).includes(tool) || (!!a?.amount && Number(a.amount.value) > 0) || createsAccount(this.host.cfg.policy as any, tool);
  }
  /** §6.11 (provisional): the owner's host budget meter for this door (its ceilings are the signed house config's `host_budget`). */
  readonly budget!: HostBudgetKeeper;
  /**
   * §6.11 (provisional): before a host-representative model call for a live pass, check the owner's signed host budget. `ok: true`
   * reserves the call at its largest (prompt + max output) until hostBudgetSettle(); `ok: false` means don't call the model: answer
   * the visitor with `text` (a fixed courteous line). The owner has a notice at the ceiling. Admission never needs this check.
   * A door with no host budget refuses (no model call without a signed ceiling); so does a pass that isn't live.
   */
  hostBudgetCheck(seat_id: string, est: HostModelEstimate): { ok: true; ticket: BudgetTicket } | { ok: false; scope: BudgetScope | "unpriced" | "no_budget" | "no_pass"; text: string } {
    if (!this.host.cfg.policy.host_budget) return { ok: false, scope: "no_budget", text: HOST_BUDGET_LINES.unpriced };
    const st = this.host.seats.get(seat_id);
    if (!st || st.unseated || (st.seat.expires_at && Date.parse(st.seat.expires_at) <= Date.now())) return { ok: false, scope: "no_pass", text: HOST_BUDGET_LINES.unpriced };
    const cap = this.costlyCapReached(seat_id, st.principal);   // §7.7 (C274): a host-model call is a costly action
    if (cap) { this.emit({ type: "host_model", status: "closed", seat_id, scope: cap === "seat" ? "per_visit" : "daily" }); return { ok: false, scope: cap === "seat" ? "per_visit" : "daily", text: HOST_BUDGET_LINES[cap === "seat" ? "per_visit" : "daily"] }; }
    const r = this.budget.check(seat_id, est, !this.knownVisitor(st));
    if (r.ok) this.costlyCount(seat_id, st.principal);
    this.emit({ type: "host_model", status: r.ok ? "allowed" : "closed", seat_id, ...(r.ok ? {} : { scope: r.scope }) });
    this.save(); return r;
  }
  /**
   * §6.11 (provisional): whether this pass's owner is known to the place, so its visit doesn't count against the newcomers' share:
   * the owner listed it in the setup (`known_visitors`) or marked it known (hostBudgetRemember), the pass met a trust requirement
   * with a receipt or an introducer, or the door has paid purchases from that owner on 2 or more separate earlier days (C273; one
   * small purchase isn't enough, and a free booking never counts). Everyone else is a newcomer.
   */
  private knownVisitor(st: { principal: string; trust?: { receipts: string[]; introducer?: string } }): boolean {
    const kv = this.host.cfg.policy.host_budget?.known_visitors ?? [];
    if (kv.some((k) => sameDid(k, st.principal))) return true;
    if (st.trust && (st.trust.receipts.length > 0 || !!st.trust.introducer)) return true;
    return this.budget.hasEarned(canonDid(st.principal));
  }
  /** §6.11 (C273): the place's owner marks a visiting owner known (for example a regular customer); it counts at once. */
  hostBudgetRemember(principal_id: string) { this.budget.mark(canonDid(principal_id)); this.save(); }
  /** §6.11: record what an allowed call used (the model service's reported usage; without it the call counts at its largest). */
  hostBudgetSettle(ticket: BudgetTicket, usage?: ModelUsage) { this.budget.settle(ticket, usage); this.save(); }
  /**
   * §6.11 (provisional): one host-representative model call under the owner's host budget. `call` runs only when the budget allows
   * it; pass `est.max_output_tokens` to the model as its output limit. Returns its value, or `closed` with the line for the visitor.
   * A call that throws is counted at its largest (it may have been billed), then the error is passed on.
   */
  async hostTurn<T>(seat_id: string, est: HostModelEstimate, call: (est: HostModelEstimate) => Promise<{ value: T; usage?: ModelUsage }>):
    Promise<{ ok: true; value: T } | { ok: false; scope: BudgetScope | "unpriced" | "no_budget" | "no_pass" | "busy"; text: string }> {
    const c = await this.withStore(() => this.hostBudgetCheck(seat_id, est));
    if (!c.ok) return { ok: false, scope: "busy", text: HOST_BUDGET_LINES.unpriced };   // another instance wrote first: no call
    if (!c.value.ok) return c.value;
    const t = c.value.ticket;
    try { const r = await call(est); await this.withStore(() => this.budget.settle(t, r.usage)); return { ok: true, value: r.value }; }
    catch (e) { await this.withStore(() => this.budget.settle(t)); throw e; }
  }
  /** §6.11: the owner's host-budget notices (alerts and ceilings), newest last. They sit beside ownerReviews(), the owner's inbox. */
  ownerNotices(): HostBudgetNotice[] { return structuredClone(this.budget.notices); }
  /** §6.11: what the host model has used today and this month, in the owner's time zone. */
  hostBudgetUsed() { return this.budget.used(); }
  get name() { return this.opts.name; }
  get repId() { return this.keys.rep.id; }
  /** The door's principal: the owner (with an owner-signed `card`), else the place key that signed its card. */
  get principalId(): string { return this.host.cfg.principal_id; }
  /**
   * Whether the door's own card has been withdrawn: a revocation its owner signed was delivered to the door (a `card_revocation`
   * message, §2.6). A withdrawn door no longer speaks for its owner: its listing is empty and it answers no one (HTTP 503, an
   * empty envelope, retry in a day) until it is started again with a new card.
   */
  /**
   * The owner withdraws this door's card on the door's own computer: hand the door the revocation they signed (§2.6). It is
   * verified like a delivered one (signed by the card's principal); returns whether it was accepted and now applies.
   */
  withdrawCard(revocation: S.Signed<S.CardRevocation> | { signed: S.Signed<S.CardRevocation> }): boolean {
    const ok = this.host.acceptCardRevocation(fromSigningPage<S.CardRevocation>(revocation)); this.save(); return ok && this.cardWithdrawn;
  }
  get cardWithdrawn(): boolean {
    const c = this.host.cfg.card; if (!c?.payload.owner_binding) return false;
    const r = this.host.revokedCards.get(canonDid(c.payload.principal.principal_id) + "|" + c.payload.card_id);
    return !!r && (!r.digest || r.digest === c.payload_digest);
  }
  /**
   * v0.4.0 (§2.3, §3.1): why the door's own Shōkai host card doesn't fit this door now (another place, a changed house config, a
   * missing member), or null. A door with a problem answers no one (HTTP 503) until its owner signs a new host card.
   */
  get hostCardProblem(): string | null { return this.host.hostCardProblem(); }
  /**
   * v0.4.0 (§3.1, C205): change the house config (the policy) of a door that signs its own card with a place key, and re-sign its
   * Shōkai host card over the new config. A door whose card its owner signed can't re-sign: it closes until the owner signs anew.
   */
  changeHouse(policy: Partial<PlacePolicy>) {
    this.host.cfg.policy = { ...this.host.cfg.policy, ...policy };
    if (this.keys.principal) this.host.cfg.card = ownHostCard(this.opts, this.keys, this.base, this.host.cfg);
    this.save();
  }
  // ---------------------------------------------------------------- v0.5.0 §7.4–§7.6: asks, the owner's answers, amendments, bookings
  /** §7.4: the calendar stand-in behind reservations, when the door takes them. */
  readonly calendar?: CalendarStandIn;
  private asks = new Map<string, { review: S.OwnerReview; return_code: string; seat_id: string; rep: string; encounter_id: string; status: "pending" | "answered" | "declined" | "no_answer" }>();
  private draft?: SetupDraft;
  /** The place's own service (§7.2): place.ask from the signed setup, reservation.* against the calendar; anything else to hostOpts.service. */
  private serve(a: any, ctx: ServiceContext): ServiceAnswer | undefined {
    this.sweepAsks(ctx.now);
    if (a.tool === "place.ask" && this.host.cfg.policy.outside_setup) return this.serveAsk(a, ctx);
    if (typeof a.tool === "string" && a.tool.startsWith("reservation.") && this.calendar) return this.serveReservation(a, ctx);
    return this.opts.hostOpts?.service?.(a, ctx);
  }
  private serveAsk(a: any, ctx: ServiceContext): ServiceAnswer {
    const P = this.host.cfg.policy; const os = P.outside_setup!; const v = P.setup_version ?? 1;
    const text = a.arguments?.text;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_ASK_CHARS) return { ok: false, disposition: "not_now", reason_code: "REQUEST_INCOMPLETE" };
    const m = matchAsk(os, text);
    if (m.kind === "never") {
      this.emit({ type: "ask", status: "withheld", seat_id: ctx.seat_id, topic: m.topic, matched_by: "code", encounter_id: ctx.encounter_id });
      return { ok: true, result: { status: "withheld", topic: m.topic, courtesy: ASK_COURTESY.withheld, ...(os.welcome ? { welcome: os.welcome } : {}), setup_version: v, matched_by: "code" } };
    }
    if (m.kind === "answer") {
      this.emit({ type: "ask", status: "answered", seat_id: ctx.seat_id, answer_id: m.answer.answer_id, matched_by: "code", encounter_id: ctx.encounter_id });
      return { ok: true, result: { status: "answered", answer_id: m.answer.answer_id, text: m.answer.text, setup_version: v, matched_by: "code" } };
    }
    // Outside the setup: the owner decides, so the ask must say what it asks for and why (C262). Without both it is refused as
    // incomplete and nothing reaches the owner; the visitor may send it again, complete. Withheld and answered asks need neither.
    const missing = ownerAskProblems(a.arguments);
    if (missing.length) {
      this.emit({ type: "ask", status: "incomplete", seat_id: ctx.seat_id, matched_by: "code", missing, encounter_id: ctx.encounter_id });
      return { ok: false, disposition: "not_now", reason_code: "REQUEST_INCOMPLETE", retry: { kind: "after", not_before: ctx.now } };
    }
    // The pass is kept open until the answer is due, never past its own expiry (§7.5).
    const ask_ref = randomId("ask"); const return_code = `${this.opts.reservations?.refPrefix ?? this.opts.name.slice(0, 2).toUpperCase()}-RC-${b64u(randomBytes(4)).replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase()}`;
    const due = Date.parse(ctx.now) + (os.owner_response_s ?? 86400) * 1e3; const seatEnd = ctx.seat.expires_at ? Date.parse(ctx.seat.expires_at) : Infinity;
    const response_by = new Date(Math.min(due, seatEnd)).toISOString().replace(/\.\d+Z$/, "Z");
    const af = a.arguments.asks_for as S.AskFor; const action = typeof af.action === "string" ? af.action : undefined;
    const asked_for: S.OwnerReview["asked_for"] = { what: af.what.trim(), ...(action ? { action, offered_now: P.actions.some((x) => x.action === action) } : {}),
      untrusted: true, label: "what the visiting agent asks for" };
    const base: Omit<S.OwnerReview, "shown_to_owner"> = { review_id: "rev-" + ask_ref, ask_ref, place: this.principalId, received_at: ctx.now, response_by,
      ask: { text, untrusted: true }, asked_for, agent_reason: { text: String(a.arguments.reason).trim(), untrusted: true, label: "the visiting agent's reason" },
      visitor: reviewVisitor({ representative_id: ctx.representative_id, principal_id: ctx.principal_id, display_name: ctx.visitor?.display_name ?? "(no name given)",
        scope: ctx.visitor?.scope ?? { purposes: [], actions: [] }, purpose: ctx.visitor?.purpose ?? ctx.mandate?.purpose.code ?? "visitation", mandate_limits: ctx.mandate_limits }),
      why_outside: "no_signed_answer", setup: { setup_version: v, house_digest: houseDigest(this.host.cfg) }, choices: ["answer_once", "answer_and_add", "add_action", "decline"] };
    const review: S.OwnerReview = { ...base, shown_to_owner: { text: reviewText(base, this.opts.displayName, this.opts.ownerTimeZone), locale: "en-US" } };
    this.asks.set(ask_ref, { review, return_code, seat_id: ctx.seat_id, rep: ctx.representative_id, encounter_id: ctx.encounter_id, status: "pending" });
    this.emit({ type: "ask", status: "pending_owner", seat_id: ctx.seat_id, ask_ref, matched_by: "code", encounter_id: ctx.encounter_id });
    this.emit({ type: "owner_review", review_id: review.review_id, ask_ref, response_by });
    return { ok: true, result: { status: "pending_owner", ask_ref, courtesy: ASK_COURTESY.pending, response_by, return_code } };
  }
  /** §7.5: the questions waiting for the owner (the owner's inbox). Each says whether the visitor's errand may spend, never how much. */
  ownerReviews(): S.OwnerReview[] { this.sweepAsks(nowIso()); return [...this.asks.values()].filter((x) => x.status === "pending").map((x) => structuredClone(x.review)); }
  /** §7.5: an ask whose answer is due and not given is a no; the visitor is told so in its inbox. */
  sweepAsks(now = nowIso()) {
    for (const [ref, x] of this.asks) if (x.status === "pending" && Date.parse(now) > Date.parse(x.review.response_by)) {
      x.status = "no_answer"; this.deliverAnswer(ref, { status: "no_answer", text: { text: "I couldn't get an answer from the owner in time.", locale: "en-US" } });
    }
  }
  private deliverAnswer(ask_ref: string, o: { status: "answered" | "declined" | "no_answer"; text?: { text: string; locale: string }; decision?: S.Signed<S.OwnerAskDecision> }) {
    const x = this.asks.get(ask_ref)!; const e = this.host.encounters.get(x.encounter_id);
    if (e) { const m = { ...this.host.hdr(e, "ask_answer", x.rep), ask_ref, return_code: x.return_code, seat_id: x.seat_id, status: o.status, ...(o.text ? { text: o.text } : {}),
      ...(o.decision ? { decision: o.decision } : {}), setup_version: this.host.cfg.policy.setup_version ?? 1 };
      this.host.hold({ to: x.rep, message: this.host.wrap(m) }); }
    this.emit({ type: "owner_answer", ask_ref, status: o.status, ...(o.decision ? { choice: o.decision.payload.choice } : {}) });
    this.save();
  }
  /**
   * §7.5: the owner answers a review. The decision is signed by the place's principal (the owner's passkey), never the host
   * representative; a late one is a no. `answer_and_add` / `add_action` also need the amended setup's Shōkai host card, signed in
   * the same passkey tap (door.amendmentFor() prepares it); it is applied first, and the answer goes to the visitor's inbox.
   */
  answerAsk(decision: S.Signed<S.OwnerAskDecision> | { signed: S.Signed<S.OwnerAskDecision> }, o: { card?: S.SignedCard | { signed: S.SignedCard } } = {}):
    { ok: true; status: "answered" | "declined"; setup_version: number } | { ok: false; why: string } {
    const d = fromSigningPage<S.OwnerAskDecision>(decision); const p = d?.payload; const x = p ? this.asks.get(p.ask_ref) : undefined;
    if (!p || !x) return { ok: false, why: "unknown_ask" };
    if (x.status !== "pending") return { ok: false, why: "already_answered" };
    const rpId = this.host.cfg.card?.payload.owner_binding?.rp_id;
    if (!verifySigned(d, { expectSigner: this.principalId, ...(rpId ? { rpId } : {}) }).ok) return { ok: false, why: "not_owner" };
    if (p.review_id !== x.review.review_id) return { ok: false, why: "other_review" };
    if (!["answer_once", "answer_and_add", "add_action", "decline"].includes(p.choice)) return { ok: false, why: "choice" };
    if (p.choice !== "decline" && !p.answer?.text?.trim()) return { ok: false, why: "no_answer" };
    if (typeof p.decided_at !== "string" || Date.parse(p.decided_at) > Date.parse(x.review.response_by) || Date.now() > Date.parse(x.review.response_by) + 300e3) return { ok: false, why: "lapsed" };
    if (p.choice === "answer_and_add" || p.choice === "add_action") {
      if (!o.card || !p.amendment_digest) return { ok: false, why: "no_amendment" };
      if (!this.draft || this.draft.house_digest !== p.amendment_digest || this.draft.from_review !== x.review.review_id) return { ok: false, why: "amendment_mismatch" };
      if (p.choice === "answer_and_add" && this.draft.changes.some((c) => c.op !== "add_answer")) return { ok: false, why: "review_scope" };
      const r = this.amendSetup(o.card); if (!r.ok) return r;
    }
    x.status = p.choice === "decline" ? "declined" : "answered";
    this.deliverAnswer(p.ask_ref, { status: x.status, ...(p.answer ? { text: p.answer } : {}), decision: d });
    return { ok: true, status: x.status, setup_version: this.host.cfg.policy.setup_version ?? 1 };
  }
  /**
   * §7.6: prepare an amended setup for the owner to sign: the next house config (setup_version + 1, naming the current one), the
   * Shōkai host card members it needs, and the read-back the owner sees before the passkey prompt. One `add_action` at most, and
   * from a review only an action that spends nothing. Pass `card` from it to signCard(), then door.amendSetup() or answerAsk().
   */
  amendmentFor(changes: S.SetupChange[], o: { amendment_id?: string; from_review?: string } = {}): SetupDraft {
    const cur = this.host.cfg; const P = cur.policy; const v = P.setup_version ?? 1; const prev = houseDigest(cur);
    const adds = changes.filter((c): c is Extract<S.SetupChange, { op: "add_action" }> => c.op === "add_action");
    const answers = changes.filter((c): c is Extract<S.SetupChange, { op: "add_answer" }> => c.op === "add_answer");
    const bad = (why: string) => { throw Object.assign(new Error(`amendment refused: ${why}`), { code: SHOKAI_AMENDMENT_INVALID, why }); };
    if (!changes.length || adds.length + answers.length !== changes.length) bad("no_changes");
    if (adds.length > 1) bad("one_action_at_a_time");
    for (const c of adds) {
      if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(c.action.action) || P.actions.some((x) => x.action === c.action.action)) bad("action_exists");
      if (!c.action.purposes.length || c.action.purposes.some((pc) => !P.purposes.some((x) => x.code === pc) && c.purpose?.code !== pc)) bad("purpose_not_served");
      const spends = (this.opts.spendingActions ?? []).includes(c.action.action) || !!c.action.limits?.max_amount;
      if (spends && o.from_review) bad("review_scope");   // a review never adds something that spends (§7.6)
    }
    for (const c of answers) if (P.outside_setup?.answers.some((x) => x.answer_id === c.answer.answer_id) || !c.answer.match?.length || !c.answer.text?.text) bad("answer_invalid");
    if (answers.length && !P.outside_setup) bad("no_outside_setup");
    const amendment_id = o.amendment_id ?? randomId("am");
    const os = P.outside_setup ? { ...P.outside_setup, answers: [...P.outside_setup.answers, ...answers.map((c) => ({ ...c.answer, added: { amendment_id, ...(o.from_review ? { from_review: o.from_review } : {}) } }))] } : undefined;
    const purposes = [...this.opts.purposes, ...adds.flatMap((c) => (c.purpose && !this.opts.purposes.some((x) => x.code === c.purpose!.code) ? [c.purpose] : []))];
    const next: DoorOptions = { ...this.opts, card: undefined, purposes, actions: [...this.opts.actions, ...adds.map((c) => ({ ...c.action, data_asks: (c.action.data_asks ?? []) as ActionPolicy["data_asks"] }) as ActionPolicy)],
      ...(os ? { outsideSetup: os } : {}),
      policy: { ...(this.opts.policy ?? {}), ...(os ? { outside_setup: os } : {}), setup_version: v + 1, prev_house_digest: prev, amendment: { amendment_id, ...(o.from_review ? { from_review: o.from_review } : {}), changes } } };
    const refs: S.SetupChangeRef[] = changes.map((c) => (c.op === "add_action" ? { op: "add_action", action: c.action.action } : { op: "add_answer", answer_id: c.answer.answer_id }));
    const house = houseConfigFor({ ...next, baseUrl: this.base });
    const lines = changes.map((c) => c.op === "add_action"
      ? `Add: ${c.action.action}, for ${c.action.purposes.join(", ")}. ${this.opts.displayName} asks the visitor's owner only for: ${(c.action.data_asks ?? []).join(", ") || "nothing"}. ${c.action.limits?.max_amount ? `Up to ${c.action.limits.max_amount.value} ${c.action.limits.max_amount.currency}.` : "Nothing to pay."}`
      : `Add an answer about ${c.answer.topic}: "${c.answer.text.text}"`);
    const readBack = `Change to your setup (version ${v + 1}, replacing version ${v}): ${lines.join(" ")} Everything else stays as you signed it.`;
    const draft: SetupDraft = { amendment_id, ...(o.from_review ? { from_review: o.from_review } : {}), changes, options: next,
      house_digest: houseDigestFor(next, this.principalId, this.base), summary_digest: summaryDigestFor(next, this.base), setup: { version: v + 1, prev_house_digest: prev, changes: refs },
      readBack, card: { displayName: cur.card?.payload.principal.display_name ?? this.opts.displayName, kind: cur.card?.payload.principal.kind, purposes: purposes.map((x) => x.code),
        actions: next.actions.map((x) => x.action), cardKind: "host", validDays: 30, shownToOwner: { text: readBack, locale: "en-US" },
        host: { place: { principal_id: this.principalId, entry: this.entry, ...(this.site ? { site: this.site } : {}) }, host_scope: hostScopeFor(house.policy),
          house_digest: houseDigestFor(next, this.principalId, this.base), summary_digest: summaryDigestFor(next, this.base), setup: { version: v + 1, prev_house_digest: prev, changes: refs } } } };
    this.draft = draft; return draft;
  }
  /**
   * §7.6: serve an owner-signed amended setup without a restart. Refused (and nothing changes) when the card isn't signed by this
   * door's owner (`not_owner`: a host can't widen its own setup), names another setup than the one served now (`stale`), skips a
   * version (`version`), signs a house other than the listed changes make (`unlisted_change`), or its read-back doesn't name each
   * change (`not_shown`). Open passes keep what they were granted; the next request is decided under the new setup.
   */
  amendSetup(card: S.SignedCard | { signed: S.SignedCard }): { ok: true; setup_version: number; house_digest: string } | { ok: false; why: string } {
    const refuse = (why: string) => { this.emit({ type: "amendment_refused", why }); return { ok: false as const, why }; };
    const c = fromSigningPage<S.RepresentativeCard>(card) as S.SignedCard; const p = c?.payload; const d = this.draft;
    if (!p) return refuse("card_invalid");
    // The signature first (a forged card learns nothing else), then which setup it follows (a replayed card is stale), then the draft.
    const rpId = this.host.cfg.card?.payload.owner_binding?.rp_id;
    if (!sameDid(p.principal?.principal_id ?? "", this.principalId) || !verifySigned(c, { expectSigner: this.principalId, ...(rpId ? { rpId } : {}) }).ok) return refuse("not_owner");
    const cur = houseDigest(this.host.cfg); const v = this.host.cfg.policy.setup_version ?? 1;
    if (p.setup?.prev_house_digest !== cur) return refuse("stale");
    if (!d) return refuse("no_draft");
    if (d.setup.prev_house_digest !== cur) return refuse("stale");
    if (p.setup?.version !== v + 1) return refuse("version");
    if (p.house_digest !== d.house_digest || jcs(p.setup.changes) !== jcs(d.setup.changes)) return refuse("unlisted_change");
    const shown = p.shown_to_owner?.text ?? "";
    if (!d.changes.every((ch) => shown.includes(ch.op === "add_action" ? ch.action.action : ch.answer.text.text))) return refuse("not_shown");
    const next = { ...d.options, card: c };
    const v2 = verifyDoorCard(c, { representativeId: this.keys.rep.id, rpId: this.opts.ownerRpId, allowReservedRpIds: !!this.opts.testProfile || !publicEntryUrl(this.base), purposes: next.purposes.map((x) => x.code), actions: next.actions.map((x) => x.action),
      entry: this.entry, houseDigest: d.house_digest, ...(this.site ? { site: this.site } : {}) });
    if (!v2.ok) return refuse("card_invalid");
    const cfg = doorConfig(next, this.keys, this.base);
    if (houseDigest(cfg) !== d.house_digest) return refuse("unlisted_change");
    const problems = this.host.replaceHouse(cfg); if (problems.length) return refuse("house_invalid");
    (this as { opts: DoorOptions }).opts = next; this.draft = undefined;
    this.emit({ type: "setup_amended", setup_version: v + 1, prev_house_digest: cur, house_digest: d.house_digest, changes: d.setup.changes });
    this.save();
    return { ok: true, setup_version: v + 1, house_digest: d.house_digest };
  }
  private serveReservation(a: any, ctx: ServiceContext): ServiceAnswer {
    const R = this.opts.reservations!; const cal = this.calendar!; const tz = cal.timeZone; const args = (a.arguments ?? {}) as ReservationArgs;
    const no = (disposition: S.Disposition, reason_code: S.ReasonCode): ServiceAnswer => ({ ok: false, disposition, reason_code });
    const mine = (id: unknown) => { const b = typeof id === "string" ? cal.find(id) : undefined; return b && sameDid(b.for_principal, ctx.principal_id) && b.status === "confirmed" ? b : undefined; };
    const span = () => { const s = args.booking?.start; const e = args.booking?.end ?? (typeof s === "string" ? new Date(Date.parse(s) + (R.durationMinutes ?? 60) * 60e3).toISOString().replace(/\.\d+Z$/, "Z") : undefined); return { s, e }; };
    if (a.tool === "reservation.check") {
      const { s, e } = span(); if (typeof s !== "string" || !e || !Number.isFinite(Date.parse(s))) return no("not_now", "REQUEST_INCOMPLETE");
      return { ok: true, result: { status: cal.withinHours(s, e) && cal.isFree(s, e) ? "free" : "busy", start: s, end: e, calendar: cal.label } };   // free or busy only
    }
    if (a.tool === "reservation.cancel") {
      const b = mine(args.confirmation_id); if (!b) return no("not_a_fit", "POLICY_DENY");
      cal.update(b.confirmation_id, (x) => { x.status = "cancelled"; });
      return { ok: true, result: { status: "cancelled", confirmation: this.confirmation("cancelled", "reservation.cancel", b.confirmation_id, b, ctx) } };
    }
    if (a.tool !== "reservation.make" && a.tool !== "reservation.change") return no("not_a_fit", "POLICY_DENY");
    const { s, e } = span(); const party = args.booking?.party_size;
    if (typeof s !== "string" || !e) return no("not_now", "REQUEST_INCOMPLETE");
    // The host checked the booking against the limits; with the end the place sets, check again (by code, §7.4).
    const lim = [ctx.seat.limits?.booking, ...(ctx.mandate_limits ? [ctx.mandate_limits.booking] : [])];
    if (bookingProblem({ start: s, end: e, party_size: party }, ...lim)) return no("not_a_fit", "SEAT_SCOPE_EXCEEDED");
    const old = a.tool === "reservation.change" ? mine(args.confirmation_id) : undefined;
    if (a.tool === "reservation.change" && !old) return no("not_a_fit", "POLICY_DENY");
    if (old) cal.update(old.confirmation_id, (x) => { x.status = "cancelled"; });
    if (!cal.withinHours(s, e) || !cal.isFree(s, e)) { if (old) cal.update(old.confirmation_id, (x) => { x.status = "confirmed"; }); return no("not_now", "POLICY_DENY"); }
    const id = bookingRef(R.refPrefix, s, tz, (x) => !!cal.find(x));
    const row = { confirmation_id: id, start: s, end: e, party_size: party as number, ...(typeof args.name_as_given === "string" ? { name_as_given: args.name_as_given.slice(0, 40) } : {}), for_principal: ctx.principal_id, status: "confirmed" as const };
    cal.add(row);
    const status = old ? "changed" : "confirmed";
    const conf = this.confirmation(status, a.tool, id, row, ctx, old?.confirmation_id);
    this.emit({ type: "booking", status, confirmation_id: id, start: s, party_size: row.party_size, encounter_id: ctx.encounter_id });
    return { ok: true, result: { status: "booked", confirmation: conf, calendar: cal.label } };
  }
  private confirmation(status: S.BookingConfirmation["status"], action: string, id: string, b: { start: string; end: string; party_size: number }, ctx: ServiceContext, replaces?: string): S.Signed<S.BookingConfirmation> {
    const card = this.host.cfg.card!; const R = this.opts.reservations!;
    const payload: S.BookingConfirmation = { confirmation_id: id, status, place: { principal_id: this.principalId, entry: this.entry, ...(this.site ? { site: this.site } : {}), display_name: this.opts.displayName },
      host_card_digest: card.payload_digest, host_representative_id: this.keys.rep.id,
      for: { representative_id: ctx.representative_id, principal_id: ctx.principal_id, ...(ctx.mandate ? { mandate_id: ctx.mandate.mandate_id } : {}), seat_id: ctx.seat_id },
      action: action as S.BookingConfirmation["action"], booking: { start: b.start, end: b.end, time_zone: this.calendar!.timeZone, party_size: b.party_size, ...(R.item ? { note: R.item } : {}) },
      ...(replaces ? { replaces } : {}), issued_at: ctx.now };
    return makeSigned(payload, this.keys.rep, ctx.now);
  }
  get entry() { return entryUrl(this.base, this.opts.name); }
  get lobby() { return lobbyUrl(this.base, this.opts.name); }
  get inbox() { return inboxUrl(this.base, this.opts.name); }
  /** Point the door at its real address once the server is listening (listings and replies carry it). */
  private checkPublicCard(base: string, card: unknown, opts = this.opts) {
    if (opts.testProfile || !publicEntryUrl(base)) return;
    const rp = (card as any)?.payload?.owner_binding?.rp_id;
    if (opts.hostOpts?.allowReservedRpIds === true || (typeof rp === "string" && reservedRpId(rp)))
      throw Object.assign(new Error("SHOKAI_DOOR_CARD_INVALID: public doors cannot enable reserved rp_ids or use a development host passkey; use a real host identity (testProfile only for tests)"), { code: SHOKAI_DOOR_CARD_INVALID });
  }
  setBaseUrl(base: string) { const b = base.replace(/\/$/, "");
    // §11.1, C269: the same https rule as the constructor. Reserved rp_ids are judged from the current entry address on every card (core host).
    if (!this.opts.testProfile && !secureEntry(b)) throw Object.assign(new Error(`SHOKAI_DOOR_INSECURE: baseUrl ${b} must be https (plain http only on loopback or with testProfile), §11.1`), { code: "SHOKAI_DOOR_INSECURE" });
    this.checkPublicCard(b, this.host.cfg.card);
    (this as { base: string }).base = b; this.host.opts.entryUrl = this.entry; this.host.opts.inboxUrl = this.inbox;
    // v0.4.0 (§2.3): a door that signs its own Shōkai host card re-signs it for its real entry address.
    if (this.keys.principal) this.host.cfg.card = ownHostCard(this.opts, this.keys, this.base, this.host.cfg); }
  /** GET <base>/places (§3.1). */
  listing(): S.PlaceListing { return placeListing(this.base, this.cardWithdrawn || this.hostCardProblem ? [] : [this.host], nowIso()); }
  private newcomerState?: NewcomerBudget;
  /** §11.1 (C287, RR-08): the newcomer budget for signed traffic from principals with no live seat here (defaults in free-principals.ts). */
  private get newcomers(): NewcomerBudget { return this.newcomerState ??= new NewcomerBudget(); }
  /** A principal (representative) with a live seat at this door has history; anyone else is a newcomer. @internal */
  hasHistory(rep: string): boolean { const now = Date.now();
    for (const st of (this.host as any).seats.values()) if (!st.unseated && sameDid(st.rep, rep) && !(st.seat?.expires_at && Date.parse(st.seat.expires_at) <= now)) return true;
    return false; }
  /** A signed greeting binds a visitor before its card is presented; anonymous/lapsed/closed rituals do not. */
  private hasOpenEncounter(rep: string): boolean {
    const now = Date.now(), idle = (this.host.opts.encounterIdleS ?? 120) * 1000;
    for (const e of this.host.encounters.values()) if (!e.closed && !e.lobby && (e.greetDigest || e.verified) && sameDid(e.visitor, rep)
      && now - Date.parse(e.lastAt ?? "1970-01-01T00:00:00Z") <= idle) return true;
    return false;
  }
  private anonRateState?: AnonRate;
  /** §11.1 (C278): the in-memory counts of unverified arrivals (reset on restart; per instance). */
  private get anonRate(): AnonRate {
    if (!this.anonRateState) this.anonRateState = new AnonRate(this.opts.anonRatePerAddr, this.opts.anonRateTotal);
    return this.anonRateState;
  }
  /** §11.1 (C278): the client address to rate-limit: the configured trusted proxy header if set and present, else the socket address. */
  clientAddressOf(header: (name: string) => string | null | undefined, socketAddress?: string | undefined): string | undefined {
    const h = this.opts.anonRateAddressHeader;
    if (h) { const v = header(h.toLowerCase()); const first = v?.split(",")[0]?.trim(); if (first) return first; }
    return socketAddress || undefined;
  }
  /** GET <base>/ and any unknown address: the machine-readable pointer, never a bare 404 (§3.1). */
  pointer(): S.DoorPointer { return doorPointer(this.base, [this.host]); }
  /** §11.1 (C200): the 404 pointer for a request to one of this door's own addresses names it in `here`, with `method: "POST"`. */
  pointerHere(): S.DoorPointer { return doorPointer(this.base, [this.host], this.host); }
  /** POST <entry> or <lobby>: any arrival gets an answer; prose and malformed bodies get the lobby (§3.1, §11.1). */
  async post(body: unknown, as: "ritual" | "lobby" = "ritual", arrival: { bytes?: number | undefined; source?: string | undefined } = {}): Promise<{ status: number; envelope: S.ReplyEnvelope; retryAfter?: number }> {
    let m: unknown = body;
    if (typeof body === "string") { const sj = parseStrictJson(body); m = sj.ok ? sj.value : null; }
    return this.postParsed(m, as, { ...arrival, bytes: arrival.bytes ?? (typeof body === "string" ? Buffer.byteLength(body, "utf8") : undefined) });
  }
  /** Inbound HTTP bodies are parsed once: the limiter and the host see exactly this same value. */
  private async postParsed(m: unknown, as: "ritual" | "lobby", arrival: { bytes?: number | undefined; source?: string | undefined }): Promise<{ status: number; envelope: S.ReplyEnvelope; retryAfter?: number }> {
    await this.prefetch(m);
    const empty = { protocol: PROTOCOL, messages: [] } as unknown as S.ReplyEnvelope;
    if (this.cardWithdrawn || this.hostCardProblem) { this.emit({ type: "closed", why: this.cardWithdrawn ? "withdrawn" : "host_card" }); return { status: 503, envelope: empty, retryAfter: 86400 }; }
    await this.syncFromStore();
    // The binding's facts about this one arrival (bytes as received, C239; trusted source, C287), set only around the synchronous call.
    const bytes = arrival.bytes;
    this.host.arrivalBytes = bytes; this.host.arrivalSource = arrival.source;
    let env: S.ReplyEnvelope;
    try { try { env = this.host.entryPost(m); } catch { env = this.host.entryPost(null); } } finally { this.host.arrivalBytes = undefined; this.host.arrivalSource = undefined; }
    this.save();
    // With a store, an answer whose state couldn't be written is withheld: the visitor retries (§11.1 429; fail closed).
    if (!(await this.persist())) return { status: 429, envelope: empty, retryAfter: 1 };
    if (this.host.capacityRefused) { this.emit({ type: "busy", why: "capacity" }); return { status: 429, envelope: env, retryAfter: 60 }; }
    this.emitFor(as, m, env);
    return { status: 200, envelope: env };
  }
  /** POST <inbox>: held messages for the signer of a valid inbox_poll (§11.2). */
  pollInbox(body: unknown) { let m: unknown = body; if (typeof body === "string") { const sj = parseStrictJson(body); m = sj.ok ? sj.value : null; } const r = this.host.inboxPost(m); this.save(); return r; }
  /** pollInbox() for a door with a `store` (the adapters use this one). */
  async pollInboxAsync(body: unknown): Promise<{ status: number; body: unknown }> {
    if (typeof body === "string") { const sj = parseStrictJson(body); body = sj.ok ? sj.value : null; }
    return this.pollInboxParsedAsync(body);
  }
  private async pollInboxParsedAsync(body: unknown): Promise<{ status: number; body: unknown }> {
    await this.syncFromStore(); const r = this.host.inboxPost(body); this.save();
    if (!(await this.persist())) return { status: 429, body: { protocol: PROTOCOL, messages: [] } };
    return r as { status: number; body: unknown };
  }
  /**
   * Check one signed act against the seat it names: signature, seat holder, the seat's tools, operations and spending caps (§7).
   * Returns the door's signed act_result, or its signed act_decision (a refusal with a retry).
   */
  authorizeAct(signedAct: unknown): { ok: true; result: S.ActResult } | { ok: false; decision: any } {
    const outs = this.host.handle(signedAct); this.save();
    const msgs = outs.map((o) => o.message?.payload ?? o.message);
    const a: any = (signedAct as any)?.payload ?? signedAct; const tool = typeof a?.tool === "string" ? { tool: a.tool } : {};
    const enc = typeof a?.encounter_id === "string" ? { encounter_id: a.encounter_id } : {};
    const amount = a?.amount && typeof a.amount === "object" ? { amount: { value: String(a.amount.value), currency: String(a.amount.currency) } } : {};
    const r = msgs.find((x) => x.type === "act_result"); if (r?.ok) { this.emit({ type: "act", ok: true, ...tool, ...amount, ...enc });
      // §6.11: a paid purchase (an act with a positive amount) makes its owner known from the next day; a free booking doesn't.
      const st = typeof a?.seat_id === "string" ? this.host.seats.get(a.seat_id) : undefined; if (st && a?.amount && Number(a.amount.value) > 0 && this.budget.active) { this.budget.earn(canonDid(st.principal)); this.save(); }
      return { ok: true, result: r }; }
    const decision = msgs.find((x) => x.type === "act_decision") ?? msgs[0] ?? { type: "act_decision", decision: "deny", reason_code: "SEAT_SCOPE_EXCEEDED" };
    this.emit({ type: "act", ok: false, ...tool, ...(decision?.reason_code ? { reason_code: decision.reason_code } : {}), ...enc });
    return { ok: false, decision };
  }
  /** authorizeAct() for a door with a `store`: an act whose count couldn't be written is refused (retry), never let through. */
  async authorizeActAsync(signedAct: unknown): Promise<{ ok: true; result: S.ActResult } | { ok: false; decision: any }> {
    await this.syncFromStore(); const r = this.authorizeAct(signedAct);
    if (!(await this.persist())) return { ok: false, decision: { type: "act_decision", decision: "deny", reason_code: "HOST_BUSY", retry: { after_s: 1 } } };
    return r;
  }
  /** The seat a seat id names, if it is live. */
  /**
   * v0.5.0 (`door.endSeat`, host-only): end a live seat. The host's farewell is held for the visiting representative's inbox.
   * Returns false for an unknown or already ended seat.
   */
  endSeat(seatId: string): boolean {
    const n = this.host.outbox.length; const ok = this.host.endSeat(seatId);
    if (ok) { for (const o of this.host.outbox.splice(n)) this.host.hold(o); this.save(); }
    return ok;
  }
  seat(seatId: string): S.SeatGrant | undefined { const st = (this.host.seats as Map<string, any>).get(seatId); return st && !st.unseated ? st.seat : undefined; }
  /**
   * The §11.1 binding as one function: the answer for a method and path, or null when the path isn't the door's. Both
   * handleHttp() (Node) and fetch() (Web Request/Response: Hono, Next, Bun, Deno, Workers) use it, so every adapter
   * answers alike. `wellKnown`: also answer GET /.well-known/shokai (the site's discovery file, proposal P26; not part of the v0.5.0 core).
   */
  async respond(method: string, path: string, readBody: () => Promise<string>, o: { wellKnown?: boolean | undefined; clientAddress?: string | undefined } = {}):
    Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
    await this.ready;
    const json = (status: number, x: unknown, h: Record<string, string> = {}) => ({ status, headers: { "content-type": "application/json; charset=utf-8", ...h }, body: JSON.stringify(x) });
    // §11.1 (C266, C278, provisional): unverified arrivals count per client address and in total; past a cap, 429 + retry-after (never a finding).
    const anonRefused = (x: unknown, staticRead = false) => { const w = this.anonRate.take(o.clientAddress, staticRead); return w ? json(429, x, { "retry-after": String(w) }) : null; };
    const emptyEnv = { protocol: PROTOCOL, messages: [] };
    if (o.wellKnown && path === WELL_KNOWN_PATH) return method === "GET" || method === "HEAD" ? json(200, this.wellKnown(), { "cache-control": "max-age=300" }) : json(405, this.wellKnown(), { allow: "GET" });
    const basePath = new URL(this.base).pathname.replace(/\/$/, "");
    if (!(path === basePath || path.startsWith(basePath + "/"))) return null;
    const rest = path.slice(basePath.length) || "/";
    if (method === "GET" && rest === "/") return json(200, this.pointer());
    if (method === "GET" && rest === "/places") return anonRefused({}, true) ?? json(200, this.listing());
    if (method === "GET" && rest === "/start") return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: this.onboardingPage() };
    const ritual = rest === `/places/${this.name}/entry`, lobby = rest === `/places/${this.name}/lobby`, inbox = rest === `/places/${this.name}/inbox`;
    if (method === "POST" && (ritual || lobby || inbox)) {
      // One bounded byte-reader contract (C239, C284): too large → 413, invalid UTF-8 → 400; nothing of either is processed.
      let body: string;
      try { body = await readBody(); } catch (e) {
        if (e instanceof ShokaiPayloadTooLargeError) return json(413, { ...emptyEnv, error: "payload_too_large", code: e.code });
        if (e instanceof ShokaiInvalidUtf8Error) return anonRefused(emptyEnv) ?? json(400, { ...emptyEnv, error: "invalid_utf8", code: e.code });
        throw e;
      }
      const parsed = parseStrictJson(body); const m = parsed.ok ? parsed.value : null;
      if (inbox) { const r = await this.pollInboxParsedAsync(m); return json(r.status, r.body, r.status === 429 ? { "retry-after": "1" } : {}); }
      // A self-generated key proves control, not history. Unbound arrivals still count per address.
      await this.syncFromStore();
      const sender = lobby || !signedArrival(m) ? null : verifiedArrival(m);
      const history = !!sender && this.hasHistory(sender);
      const bound = !!sender && (history || this.hasOpenEncounter(sender));
      if (!bound) { const no = anonRefused(emptyEnv); if (no) return no; }
      // Signed traffic without a live seat also remains subject to the newcomer budget (C287).
      if (sender) { const w = this.newcomers.take(sender, o.clientAddress, history); if (w) return json(429, emptyEnv, { "retry-after": String(w) }); }
      const r = await this.postParsed(m, lobby ? "lobby" : "ritual", { bytes: Buffer.byteLength(body, "utf8"), source: o.clientAddress }); return json(r.status, r.envelope, r.retryAfter ? { "retry-after": String(r.retryAfter) } : {});
    }
    // v0.5.0 (§2.3, C248): the house summary the Shōkai host card's summary_digest names.
    if ((method === "GET" || method === "HEAD") && rest === `/places/${this.name}/entry/house-summary.json`) { const no = anonRefused({}, true); if (no) return no; const h = this.host.houseSummary(); return json(h.status, h.body, h.headers); }
    // Red team phase 1 (§3.2, C268, provisional): the signed Shōkai host card, readable before the ritual.
    if ((method === "GET" || method === "HEAD") && rest === `/places/${this.name}/entry/host-card.json`) { const no = anonRefused({}, true); if (no) return no; const h = this.host.hostCardPublic(); return json(h.status, h.body, h.headers); }
    return json(404, ritual || lobby || inbox ? this.pointerHere() : this.pointer());
  }
  /** A Node http handler for the §11 binding under this door's base path. Returns false if the request isn't for the door. */
  async handleHttp(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body?: string, o: { wellKnown?: boolean | undefined; clientAddress?: string | undefined } = {}): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const clientAddress = o.clientAddress ?? this.clientAddressOf((h) => { const v = req.headers[h]; return Array.isArray(v) ? v[0] : v; }, req.socket?.remoteAddress);
    const r = await this.respond(req.method ?? "GET", path, async () => body ?? (req.method === "POST" ? await readBody(req) : ""), { ...o, clientAddress });
    if (!r) return false;
    res.writeHead(r.status, r.headers); res.end(req.method === "HEAD" ? undefined : r.body); return true;
  }
  /**
   * The door as a Web fetch handler: `(Request) => Promise<Response>`. Answers the door's own paths and GET /.well-known/shokai;
   * anything else gets a plain 404 (put the door's routes in front of your app's, or use door.respond()). The client address for the
   * §11.1 rate limit comes from `anonRateAddressHeader` when set; otherwise only the total limit applies (pass `clientAddress` to respond()).
   */
  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    const clientAddress = this.clientAddressOf((h) => req.headers.get(h));
    // Bounded, fatal-UTF-8 read of the stream (cancelled past the limit), never req.text() (pre-release review round 2, C239, C284).
    const r = await this.respond(req.method, u.pathname, () => readBoundedStream(req.body), { wellKnown: true, clientAddress });
    if (!r) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response(req.method === "HEAD" ? null : r.body, { status: r.status, headers: r.headers });
  }
  /** The DoorPointer a site serves at /.well-known/shokai: the same document as GET <base>/ (§11.1 draft). */
  wellKnown(): S.DoorPointer {
    // v0.5.0 (§3.1.1): a site-bound door's own word names its place with its principal, so a door on another origin can bind to the
    // site. A door with no site leaves it out (a file written before the owner signs would otherwise pin the wrong principal).
    const p = this.pointer(); if (!this.site) return p;
    return { ...p, places: p.places.map((x) => (x.name === this.name ? { ...x, principal_id: this.principalId } : x)) };
  }
  /** The door's onboarding page (`<base>/start`): the leaflet the owner approved, or the default setup page (§3.3). */
  onboardingPage(): string {
    const l = this.opts.leaflet; if (!l) return startPage(this.opts.displayName);
    const placeName = l.placeName ?? this.opts.displayName; return leafletHtml(leaflet({ ...l, placeName }), placeName);
  }
  /** C285 (§12.1): what the door fetches on visitors' behalf is budgeted per target host and per principal. */
  private fetchBudget = new FetchBudget();
  /** The door fetches what it must check itself: vouch revocation logs, allowance status, evidence (§2.5, §4, §5.2). */
  private async prefetch(raw: any) {
    const p = raw?.payload ?? raw; if (!p || typeof p !== "object") return;
    const urls: string[] = [];
    const st = p.allowance?.allowance?.payload?.revocation_status; if (typeof st === "string") urls.push(st);
    const log = p.vouch?.payload?.revocation_log; if (typeof log === "string") urls.push(log);
    // §4.1 (C245) and §4 (C24, C271, C265), conformance pass 3: a Shōkai introduction card is revoked through its introducer's
    // revocation log, which every verifier MUST consult, read for the request it decides. Fetched under the same C285 rules as a
    // vouch's log; a refused, failed or unreadable fetch is recorded as unreachable, so the claim carries no weight (fail closed).
    const icLog = p.introduction_card?.card?.payload?.revocation_log; if (typeof icLog === "string" && !urls.includes(icLog)) urls.push(icLog);
    const crl = p.card?.payload?.revocation_url; if (typeof crl === "string") urls.push(crl);   // v0.3.0-rc4 (§2.6, C191)
    const seat: string[] = this.host.actRevocationUrls(raw);   // red team phase 1 (§2.6, C265): an open seat's card list (verified when seated), re-read
    urls.push(...seat);
    if (!urls.length) return;
    if (this.fetched.size > MAX_FETCHED) { const drop = this.fetched.size - MAX_FETCHED; let i = 0; for (const k of this.fetched.keys()) { if (i++ >= drop) break; this.fetched.delete(k); } }
    const test = !!this.opts.testProfile;
    // C285 (§12.1): fetch only for a principal whose signature verifies. The test profile (loopback only) is excepted.
    let verified = false; try { verified = !!(verifySigned(raw, {} as any) as any)?.ok; } catch { verified = false; }
    const principal = verified ? String(p.card?.payload?.principal_id ?? "verified") : "unverified";
    for (const url of urls) {
      const at = nowIso();
      const forSeat = seat.includes(url);
      // C285 (§12.1) checks, in order:
      // - https only, never the door's own host or network (fetch-policy.ts);
      // - the per-target and per-principal budget;
      // - for a name, the checked and pinned address;
      // - no redirect.
      // A refused fetch is recorded as unreachable (fail closed).
      // Fable review: nothing is recorded for an unverified signer (an absent entry already reads as unreachable), so forged traffic can't grow this map.
      if (!(test || verified || forSeat)) continue;
      if (!doorMayFetch(url, test)) { this.fetched.set(url, { ok: false, at }); continue; }
      let target = ""; try { target = new URL(url).host; } catch { /* doorMayFetch already refused it */ }
      if (!this.fetchBudget.take(target, forSeat && !verified ? "seat" : principal)) { this.fetched.set(url, { ok: false, at }); continue; }
      const got = await doorFetch(url, { testProfile: test });
      if (!got) { this.fetched.set(url, { ok: false, at }); continue; }   // refused, redirected, too large or too slow: unreachable
      let body: unknown; try { body = JSON.parse(got.body.toString("utf8")); } catch { body = undefined; }
      this.fetched.set(url, { ok: got.ok && body !== undefined, at, body, digest: "sha-256:" + b64u(sha256(got.body)) });
    }
  }
}
/** The door's own setup page (the default onboarding_url): a short, honest local quickstart for a visitor's owner (§3.3). */
export function startPage(placeName: string): string {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<!doctype html><meta charset="utf-8"><title>Set up a representative</title><main style="max-width:40rem;font:16px/1.5 system-ui;margin:2rem auto">
<h1>Your agent was turned away politely</h1><p>${esc(placeName)} meets representatives at its door: agents that carry a card their owner signed.
Your agent arrived without one, so it was given this page for you.</p>
<h2>Set up a representative</h2><ol>
<li>Try it first, on your own computer: <code>npx @kigenka/shokai demo</code> (Node 22+) shows a whole visit and the report home, with fictional actors. If you were given a <code>.tgz</code> or the source instead, install that.</li>
<li>Follow the visitor path in QUICKSTART.md, section 6. It ships inside the package, at <code>node_modules/@kigenka/shokai/spec/QUICKSTART.md</code>: <code>createRepresentative()</code> makes your representative's card, you sign it as its owner, and you set what it may do and spend.</li>
<li>Give that representative to the agent you already use. It presents the card at doors like this one, and every visit comes back to you as a report.</li></ol>
<p>Nothing about you was kept from this visit. You can ignore this page; your agent can still browse what is public.</p></main>`;
}
/**
 * One item the reference signing page wrote (`DATA_DIR/signed/<name>.json`, i.e. `{ note, signed }`), or an envelope as is,
 * returned as the signed envelope. Accepts the parsed JSON or its text. Nothing is verified here; verify what you use.
 */
export function fromSigningPage<T = unknown>(item: unknown): S.Signed<T> {
  const x = typeof item === "string" ? JSON.parse(item) : item;
  const env = x && typeof x === "object" && "signed" in (x as object) ? (x as { signed: unknown }).signed : x;
  if (!env || typeof env !== "object" || !("payload" in (env as object))) throw new Error("not a signed item from the signing page");
  return env as S.Signed<T>;
}
/** createDoor() with an owner-signed `card`: the card didn't verify (signature, owner binding, rp_id, protocol, dates, key or scope). */
export const SHOKAI_DOOR_CARD_INVALID = "SHOKAI_DOOR_CARD_INVALID" as const;
/** createDoor() with an owner-signed `card`: the owner has withdrawn that card (a revocation they signed matches it). */
export const SHOKAI_DOOR_CARD_REVOKED = "SHOKAI_DOOR_CARD_REVOKED" as const;
/** v0.4.0 (§2.3, C205): the door's Shōkai host card fingerprints another house config than the one this door would serve. */
export const SHOKAI_HOUSE_CHANGED = "SHOKAI_HOUSE_CHANGED" as const;
/**
 * F3 (rc4): verify a door card its owner signed with a passkey, with the checks a door applies to a visitor's card (§2.1–§2.3, §2.6):
 * strict timestamps; the signature by `principal.principal_id` (ES256 for a person, against `owner_binding.rp_id`, one-tap
 * batches included, A.1/C195); `owner_binding` naming the same owner; the protocol; issued and not expired; the representative key
 * binding `representative_id`; and no matching revocation signed by the owner. Optionally the representative, rp_id and scope it must have.
 */
export function verifyDoorCard(card: S.SignedCard, o: { representativeId?: string; rpId?: string; allowReservedRpIds?: boolean; revocations?: S.Signed<S.CardRevocation>[];
  purposes?: string[]; actions?: string[]; now?: string; entry?: string; houseDigest?: string; /** §3.1.1: the site the card must name. */ site?: string } = {}): { ok: true } | { ok: false; code: typeof SHOKAI_DOOR_CARD_INVALID | typeof SHOKAI_DOOR_CARD_REVOKED | typeof SHOKAI_HOUSE_CHANGED; why: string } {
  const bad = (why: string) => ({ ok: false as const, code: SHOKAI_DOOR_CARD_INVALID, why });
  const p = card?.payload; if (!p || typeof p !== "object") return bad("not a signed card");
  const now = o.now ?? nowIso(); const ob = p.owner_binding; const pid = p.principal?.principal_id;
  if (typeof pid !== "string") return bad("the card names no principal");
  if (!PRINCIPAL_KINDS.includes(p.principal?.kind)) return bad("principal.kind must be person|brand|company|system");
  if (badTimestamps(card).length) return bad("a timestamp is not in the strict form (§2.2)");
  if (p.protocol !== PROTOCOL && p.protocol !== LEGACY_TAG) return bad(`the card is for ${p.protocol}, not ${PROTOCOL} or ${LEGACY_TAG}`);   // v0.5.0 (§11.1): both tags during the window
  if (!ob || ob.method !== "passkey_webauthn" || typeof ob.rp_id !== "string" || !ob.rp_id) return bad("the card has no passkey owner binding with an rp_id");
  if (!(o.allowReservedRpIds ?? !publicEntryUrl(o.entry ?? p.place?.entry)) && reservedRpId(ob.rp_id)) return bad("reserved rp_id: a public door cannot use a development host passkey");
  if (!sameDid(ob.owner_id, pid)) return bad("the owner binding names another owner than the card's principal");
  if (o.rpId !== undefined && ob.rp_id !== o.rpId) return bad(`the card was signed for ${ob.rp_id}, not ${o.rpId}`);
  const sig = card.signatures?.[0]; if (!sig || sig.alg !== "ES256") return bad("the card is not signed with the owner's passkey (ES256)");
  const v = verifySigned(card, { expectSigner: pid, rpId: ob.rp_id }); if (!v.ok) return bad(`the owner's signature doesn't verify (${v.why})`);
  if (notYetValid(p.issued_at, now) || isExpired(p.expires_at, now)) return bad("the card is not valid now (issued_at / expires_at)");
  if (!new RealVerifier().cardKeyBinds(p)) return bad("the card's representative_key doesn't match its representative_id");
  if (o.representativeId && !sameDid(p.representative_id, o.representativeId)) return bad("the card names another representative than this door's key");
  const missP = (o.purposes ?? []).filter((x) => !p.mandate_scope?.purposes?.includes(x as S.PurposeCode));
  const missA = (o.actions ?? []).filter((x) => !p.mandate_scope?.actions?.includes(x));
  if (missP.length || missA.length) return bad(`the card doesn't cover this door's ${[...missP, ...missA].join(", ")}`);
  // v0.4.0 (§2.3): a Shōkai visitor card can't keep a door; a Shōkai host card must be for this place and this house.
  if (p.kind === "visitor") return bad("this is a Shōkai visitor card; a door needs a Shōkai host card (kind \"host\")");
  if (p.kind === "host") {
    if (!p.place || !sameDid(p.place.principal_id, pid)) return bad("the Shōkai host card names no place, or another principal's place");
    if (o.entry && p.place.entry !== o.entry) return bad(`the Shōkai host card is for ${p.place.entry}, not this door's entry ${o.entry}`);
    if (o.site !== undefined && p.place.site !== o.site) return bad(`the Shōkai host card names ${p.place.site ? `the site ${p.place.site}` : "no site"}, not this door's site ${o.site} (§3.1.1)`);
    if (!p.host_scope || !p.shown_to_owner || !p.house_digest) return bad("the Shōkai host card lacks host_scope, shown_to_owner or house_digest (§2.3)");
    const missH = (o.actions ?? []).filter((x) => !p.host_scope!.actions.includes(x));
    if (missH.length) return bad(`the Shōkai host card's host scope doesn't cover ${missH.join(", ")}`);
    if (o.houseDigest && p.house_digest !== o.houseDigest) return { ok: false, code: SHOKAI_HOUSE_CHANGED, why: "the house config changed after the owner signed this Shōkai host card; sign a new one (houseDigestFor)" };
  }
  for (const r of o.revocations ?? []) {
    const rp = r?.payload; if (!rp || rp.card_id !== p.card_id || !sameDid(rp.principal_id, pid) || (rp.card_digest && rp.card_digest !== card.payload_digest)) continue;
    if (verifySigned(r, { expectSigner: pid, rpId: ob.rp_id }).ok) return { ok: false, code: SHOKAI_DOOR_CARD_REVOKED, why: "the owner has withdrawn this card" };
  }
  return { ok: true };
}
export function createDoor(opts: DoorOptions): Door { return new Door(opts); }
/** v0.5.0 (§3.1.1): createDoor() with a `site` that isn't a website origin (https://host[:port], or http on loopback for tests). */
export const SHOKAI_DOOR_SITE_INVALID = "SHOKAI_DOOR_SITE_INVALID" as const;
/** §3.1.1: the door's site in its one serialized form, or a thrown SHOKAI_DOOR_SITE_INVALID. */
function doorSite(o: Pick<DoorOptions, "site" | "name">): string {
  const so = o.site !== undefined ? siteOrigin(o.site) : null;
  const lb = so ? ["127.0.0.1", "localhost", "[::1]"].includes(new URL(so).hostname) : false;
  if (!so || (so !== o.site && so + "/" !== o.site) || (!so.startsWith("https://") && !lb))
    throw Object.assign(new Error(`createDoor("${o.name}"): site must be a website origin such as https://example.com (got ${JSON.stringify(o.site)}), §3.1.1`), { code: SHOKAI_DOOR_SITE_INVALID });
  return so;
}
export async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return readBoundedIterable(req as AsyncIterable<unknown>);   // at most MAX_ADAPTER_BODY bytes, fatal UTF-8 (C239, C284)
}

function doorConfig(o: DoorOptions, k: { rep: Ed25519Signer; principal?: Ed25519Signer }, base: string, withCard = true): PlaceConfig {
  const locales = o.locales ?? ["en-US"]; const at = plusDays(nowIso(), -1 / 1440);
  const lf = o.leaflet ? leaflet({ ...o.leaflet, placeName: o.leaflet.placeName ?? o.displayName }) : undefined;
  const preset = o.preset ?? "standard"; const pp = presetPolicy(preset, o);
  const policy: PlacePolicy = {
    policy_version: `${o.name}-1`, supported_locales: locales, access_mode: "session", category: o.category ?? "x-service",
    purposes: o.purposes.map((p) => ({ code: p.code, statement: { text: p.statement, locale: "en-US" } })),
    actions: o.actions, spending_actions: o.spendingActions ?? [],
    considering: { actions: [], routed_to: { kind: "role", role: "Owner", human: true }, response_days: 14, requires_introduction: true },
    require_vouch_for: o.requireVouchFor ?? [], trusted_introducers: o.trustedIntroducers ?? [],
    lobby: { about: { "en-US": lf?.about ?? o.about ?? `${o.displayName} meets representatives at the door.` },
      how: { "en-US": lf?.how ?? o.how ?? "Greet, present a signed card, introduce yourself (a vouch is optional), then ask within a mandate your owner signed." },
      onboarding_url: o.onboardingUrl ?? process.env.SHOKAI_ONBOARDING_URL ?? `${base}/start`, receipt_ttl_days: 7,
      readiness: [{ code: "card", required: true }, { code: "owner_binding", required: true }, { code: "purpose", required: true }, { code: "introduction", required: preset === "strict" }] },
    receipt_echo_limit: 3, probing_threshold: 3, probing_window_s: 86400, ritual_retry_s: 60, not_a_fit_retry_days: 30, paused_retry_days: 30, enforce_owner_passkey: true,
    ...pp,
    ...(o.purchaseHoldSeconds ? { purchase_hold_s: Math.min(900, o.purchaseHoldSeconds) } : {}),
    ...(o.outsideSetup ? { outside_setup: o.outsideSetup } : {}),
    ...(o.policy ?? {}) };
  // v0.5.0 (§2.3, C248): a v0.5.0 house config carries its house summary; without one in the options it is built from the policy
  // (so it agrees by construction), in the place's own words (its lobby's about), and the owner signs it with the house.
  if (!policy.summary) policy.summary = houseSummaryOf({ name: o.name, display_name: o.displayName, policy }, { statement: policy.lobby.about["en-US"], locale: "en-US" }, SPEC_REF);
  if (o.card) { const c = o.card as S.SignedCard; return { name: o.name, display_name: o.displayName, principal_id: canonDid(c.payload.principal.principal_id), rep_id: k.rep.id, policy, card: c }; }
  const cfg: PlaceConfig = { name: o.name, display_name: o.displayName, principal_id: k.principal!.id, rep_id: k.rep.id, policy };
  return withCard ? { ...cfg, card: ownHostCard(o, k, base, cfg) } : cfg;
}
/** v0.4.0 (§2.3, C206): createDoor() signing an organization's Shōkai host card without `approvedBy` (a named person and their role). */
export const SHOKAI_APPROVER_REQUIRED = "SHOKAI_APPROVER_REQUIRED" as const;
function requireApprover(o: DoorOptions): S.OrgApproval["approver"] {
  const a = o.approvedBy; const ok = (x: unknown) => typeof x === "string" && x.trim().length > 0;
  if (!a || !ok(a.name) || !ok(a.role))
    throw Object.assign(new Error(`createDoor("${o.name}"): an organization's Shōkai host card needs approvedBy: { name, role }, the person who approved it (§2.3). Pass e.g. approvedBy: { name: "Ren Okabe", role: "Owner" }.`), { code: SHOKAI_APPROVER_REQUIRED });
  return { name: a.name.trim(), role: a.role.trim(), ...(a.approver_id ? { approver_id: a.approver_id } : {}) };
}
/** v0.4.0 (§2.3): the Shōkai host card a door signs with its place key: bound to its entry and house config, with who approved it. */
/** v0.4.0 (§2.3): the host scope a door's Shōkai host card needs for this policy: the actions it serves and its duties. */
export function hostScopeFor(P: PlacePolicy): S.HostScope {
  return { actions: [...new Set([...P.actions.map((a) => a.action), ...P.considering.actions])],
    duties: ["seat", "issue_passes", "receipts", "consider", "misconduct_notices", ...(P.purchase_hold_s ? ["hold_purchases" as const] : []),
      ...(P.outside_setup ? ["owner_questions" as const] : []), ...(P.actions.some((a) => a.action.startsWith("reservation.")) ? ["bookings" as const] : [])] };
}
/** v0.4.0 (§2.3): the plain-language summary on a door's Shōkai host card (its shown_to_owner text). */
export function hostCardSummary(o: Pick<DoorOptions, "displayName" | "leaflet">, P: PlacePolicy): string {
  const actions = hostScopeFor(P).actions;
  return `${o.displayName}'s host representative may welcome visiting representatives at ${o.displayName}, admit them with a pass and serve ${actions.join(", ") || "nothing yet"}${P.purchase_hold_s ? `, and hold a purchase up to ${P.purchase_hold_s} seconds for the visitor's owner to approve` : ""}${o.leaflet ? ", and give agents without a Shōkai visitor card the leaflet shown here" : ""}.`;
}
/** v0.4.0 (§2.3): the house config (name, display name, policy) a door with these options serves; the digest adds the owner's DID. */
export function houseConfigFor(o: DoorOptions): { name: string; display_name: string; policy: PlacePolicy } {
  const cfg = doorConfig({ ...o, card: undefined }, { rep: newEd25519(), principal: newEd25519() }, (o.baseUrl ?? "http://127.0.0.1:0/shokai").replace(/\/$/, ""), false);
  return { name: cfg.name, display_name: cfg.display_name, policy: cfg.policy };
}
function ownHostCard(o: DoorOptions, k: { rep: Ed25519Signer; principal?: Ed25519Signer }, base: string, cfg: PlaceConfig): S.SignedCard {
  const at = plusDays(nowIso(), -1 / 1440); const P = cfg.policy;
  const { actions, duties } = hostScopeFor(P);
  return sign<S.RepresentativeCard>({ card_id: "card-" + o.name, protocol: PROTOCOL, representative_id: k.rep.id,
    principal: { principal_id: k.principal!.id, kind: "company", display_name: o.displayName }, role: "Front-door representative", standing: { tier: "principal" },
    mandate_scope: { purposes: o.purposes.map((p) => p.code), actions: o.actions.map((a) => a.action) }, locales: P.supported_locales,
    representative_key: { key_id: k.rep.key_id, alg: "Ed25519", public_key: b64u(k.rep.pubRaw) }, issued_at: at, expires_at: plusDays(at, 365),
    kind: "host", place: { principal_id: k.principal!.id, entry: entryUrl(base, o.name), ...(o.site !== undefined ? { site: doorSite(o) } : {}) }, host_scope: { actions, duties }, house_digest: houseDigest(cfg),
    ...(P.summary ? { summary_digest: summaryDigest(P.summary) } : {}),   // v0.5.0 (§2.3, C248)
    shown_to_owner: { text: hostCardSummary(o, P), locale: "en-US" },
    org_approval: { approver: requireApprover(o), approved_at: at } }, k.principal!, at);
}
/**
 * v0.5.0 (§2.3, C248): the summary_digest an owner's Shōkai host card must carry for a door with these options (the digest of the
 * house summary built from them, or of `policy.summary` when given).
 */
export function summaryDigestFor(o: DoorOptions, baseUrl = o.baseUrl ?? "http://127.0.0.1:0/shokai"): string {
  const cfg = doorConfig({ ...o, card: undefined }, { rep: newEd25519(), principal: newEd25519() }, baseUrl.replace(/\/$/, ""), false);
  return summaryDigest(cfg.policy.summary!);
}
/**
 * v0.4.0 (§2.3, C205): the house digest an owner's Shōkai host card must carry for a door with these options at this base URL:
 * the digest of {name, display_name, principal_id, policy}. Use it to prepare the host card the owner signs on the signing page.
 * A v0.5.0 card carries summaryDigestFor(o) too.
 */
export function houseDigestFor(o: DoorOptions, principalId: string, baseUrl: string): string {
  const cfg = doorConfig({ ...o, card: undefined }, { rep: newEd25519(), principal: newEd25519() }, baseUrl.replace(/\/$/, ""), false);
  return houseDigest({ ...cfg, principal_id: canonDid(principalId) });
}

// ------------------------------------------------------------------ representatives and visits (§3.2, §5.3, §7, §8.2)

export type Transport = ((url: string, body: unknown) => Promise<S.ReplyEnvelope>) & {
  /** v0.5.0 (§2.3, C248): GET a JSON document the door serves (its house summary), when the transport isn't plain HTTP. */
  getJson?: (url: string) => Promise<unknown> };
/** POST JSON to a door address over HTTP (§11). */
export const httpTransport: Transport = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error" });
  const j = await r.json().catch(() => null) as S.ReplyEnvelope | null;
  // §11.1: a 429 (rate or encounter limit), 413 (too large) or 503 (no host card in force) carries an empty ReplyEnvelope. A front that
  // sends another body for those (conformance 2026-11-08, finding 3) is read as that empty envelope, with the status and Retry-After
  // kept for the caller: nothing was answered, nothing is assumed. Any other non-envelope answer is still an error.
  if ((!j || !Array.isArray(j.messages)) && (r.status === 429 || r.status === 413 || r.status === 503))
    return Object.assign({ protocol: PROTOCOL, messages: [] } as S.ReplyEnvelope, { http_status: r.status, ...(r.headers.get("retry-after") ? { retry_after: r.headers.get("retry-after")! } : {}) });
  if (!j || !Array.isArray(j.messages)) throw new Error(`door at ${url} answered ${r.status} without a ReplyEnvelope`);
  return j;
};
/** Talk to a Door object in the same process (tests, examples). */
export const inProcess = (door: Door): Transport => Object.assign(async (_url: string, body: unknown) => (await door.post(body)).envelope, { getJson: doorSummaryGet(door) });
/** v0.5.0 (§2.3, C248): a Door's house summary, as GET <entry>/house-summary.json would serve it, in this process. */
export const doorSummaryGet = (door: Door) => async (url: string) => {
  if (url.endsWith("/host-card.json")) { const c = door.host.hostCardPublic(); if (c.status !== 200) throw new Error(`HTTP ${c.status}`); return c.body; }   // C268
  if (!url.endsWith("/house-summary.json")) throw new Error("only the house summary and host card are served in process");
  const r = door.host.houseSummary(); if (r.status !== 200) throw new Error(`HTTP ${r.status}`); return r.body;
};

// ------------------------------------------------------------------ the representative's mandate ledger (§5.1, §8.2, C176)

/** One visit made under a mandate, with every act tried in it (`local: true` = refused by the representative, never sent). */
export type LedgerVisit = { encounter_id: string; place: string; place_id?: string; at: string; decision?: string; seat_id?: string;
  acts: { tool: string; amount?: S.Money; ok: boolean; at: string; local?: true; interrupted?: true;
    /** v0.5.0 (§7.3, C230): released above the limit under a one-purchase superseding mandate (its mandate_id). */ approved_above?: string }[]; reported_in?: string[] };
/** Everything done under one mandate, at every place. The signed mandate holds no secret (it is what the door sees). */
export type LedgerEntry = { mandate_id: string; mandate: S.SignedMandate; visits: LedgerVisit[] };
/** Where a representative keeps its per-mandate ledger. Keep it as long as the mandates in it are valid. */
export interface MandateLedger { get(mandateId: string): LedgerEntry | undefined; put(entry: LedgerEntry): void; all(): LedgerEntry[] }
/** A ledger in memory: enough for one process. A representative that runs again later needs a ledger that outlives it. */
export function memoryLedger(): MandateLedger {
  const m = new Map<string, LedgerEntry>();
  return { get: (id) => m.get(id), put: (e) => { m.set(e.mandate_id, e); }, all: () => [...m.values()] };
}
/** A ledger in a JSON file, so visits in later runs continue the same mandates' counts. It stores mandates and acts, never keys. */
export function fileLedger(path: string): MandateLedger {
  const load = (): Record<string, LedgerEntry> => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const save = (all: Record<string, LedgerEntry>) => { writeFileSync(path + ".tmp", JSON.stringify(all, null, 2)); renameSync(path + ".tmp", path); };
  return { get: (id) => load()[id], put: (e) => { const all = load(); all[e.mandate_id] = e; save(all); }, all: () => Object.values(load()) };
}
const SCALE = 1000000n;
const fmtUnits = (u: bigint, currency: string): S.Money => {
  const i = u / SCALE; let f = (u % SCALE).toString().padStart(6, "0").replace(/0+$/, ""); if (f.length < 2) f = f.padEnd(2, "0");
  return { value: `${i}.${f}`, currency };
};
/** The mandate's totals across every visit in the ledger, and what is left of its max_amount and max_operations (§5.1, C175). */
export function mandateTotals(e: LedgerEntry): { acts_done: number; acts_refused: number; spent: S.Money[]; remaining?: { amount?: S.Money; operations?: number } } {
  const acts = e.visits.flatMap((v) => v.acts); const done = acts.filter((a) => a.ok);
  const spent = spentOf(done); const L = e.mandate.payload.limits ?? {};
  const cap = parseMoney(L.max_amount_scope === "per_operation" ? (L.session_max_amount ?? L.max_amount) : L.max_amount);
  const remaining: { amount?: S.Money; operations?: number } = {};
  if (cap) { const used = done.reduce((t, a) => { const m = parseMoney(a.amount); return m && m.currency === cap.currency ? t + m.units : t; }, 0n);
    remaining.amount = fmtUnits(cap.units > used ? cap.units - used : 0n, cap.currency); }
  if (L.max_operations !== undefined) remaining.operations = Math.max(0, L.max_operations - done.length);
  return { acts_done: done.length, acts_refused: acts.filter((a) => !a.ok && !a.interrupted).length, spent, ...(Object.keys(remaining).length ? { remaining } : {}) };
}

export type RepresentativeOptions = { ownerName: string; owner?: PasskeyOwner | Ed25519Signer; kind?: S.PrincipalKind; purposes: S.PurposeCode[]; actions: string[]; locales?: string[]; key?: Ed25519Signer;
  /** Where to keep the per-mandate ledger (default: in memory). Use fileLedger(path) when visits under one mandate span runs. */
  ledger?: MandateLedger;
  /** A card the owner already signed for this representative key (to continue earlier mandates, which name their card). */
  card?: S.SignedCard;
  /** v0.4.0 (§2.3, §7.3): "purchase_only" when the owner is told, on the card they sign, that a purchase may be held for their live approval. */
  ownerPrompts?: "purchase_only" | "never" };
/**
 * A representative: its own key, a card its owner signed, and mandates its owner signs for each visit.
 * Without `owner` (or `card`), it makes a development stand-in passkey and signs its own card with it: fine for examples and
 * tests, never for a real owner. For a real owner, pass `key` (importRepresentativeKey) and the `card` the owner signed on a
 * signing page; `isDevelopmentOwner` says which case this is.
 */
export class Representative {
  readonly key: Ed25519Signer; readonly owner: PasskeyOwner | Ed25519Signer; readonly card: S.SignedCard;
  /** True when no owner or card was given, so the card was signed by a development stand-in passkey (examples and tests only). */
  readonly isDevelopmentOwner: boolean;
  /** Every mandate this representative holds and everything done under each (§5.1, C176). */
  readonly ledger: MandateLedger;
  constructor(readonly opts: RepresentativeOptions) {
    this.key = opts.key ?? newEd25519(); this.owner = opts.owner ?? newPasskeyOwner(); this.ledger = opts.ledger ?? memoryLedger();
    this.isDevelopmentOwner = !opts.owner && !opts.card;
    this.card = opts.card ?? signCard(this.key, this.owner, { displayName: opts.ownerName, kind: opts.kind, purposes: opts.purposes, actions: opts.actions, locales: opts.locales,
      ...(opts.ownerPrompts ? { ownerPrompts: opts.ownerPrompts, shownToOwner: { text: opts.ownerPrompts === "purchase_only"
        ? `${opts.ownerName}'s representative may visit places for ${opts.ownerName} within the limits ${opts.ownerName} signs for each errand, and may ask ${opts.ownerName} live to approve a purchase; nothing else waits on ${opts.ownerName}.`
        : `${opts.ownerName}'s representative may visit places for ${opts.ownerName} within the limits ${opts.ownerName} signs for each errand, and never asks ${opts.ownerName} live.`, locale: "en-US" } } : {}) });
  }
  get id() { return this.key.id; }
  /** v0.5.0 (§5.5, C247): the errand budgets this representative keeps, by mandate_id. Never sent to a place. */
  readonly errands = new Map<string, ErrandMeter>();
  /** Keep an owner-signed ErrandBudget for a mandate this representative holds; a second one for the same mandate replaces the first. */
  errandBudget(b: S.Signed<S.ErrandBudget>, o: { rpId?: string } = {}): ErrandMeter {
    const e = this.ledger.get(b.payload?.mandate_id); if (!e) throw Object.assign(new Error("errand budget for a mandate this representative doesn't hold"), { code: "SHOKAI_ERRAND_BUDGET_INVALID" });
    const have = this.errands.get(e.mandate_id);
    if (have) { if (!have.replace(b)) throw Object.assign(new Error("errand budget not kept: not the owner's, or for another mandate"), { code: "SHOKAI_ERRAND_BUDGET_INVALID" }); return have; }
    const m = new ErrandMeter(b, e.mandate, o); this.errands.set(e.mandate_id, m); return m;
  }
  /**
   * v0.5.0 (§5.1, §7.3, C230): have the owner sign the superseding mandate for ONE held purchase above the limit: same purpose,
   * actions and card as `current`, bound to the held act (`supersedes.hold = {hold_id, act_digest}`), `max_amount` exactly the
   * hold's `proposed`, and ending when the hold does. It releases that act only and never becomes a standing higher limit; the
   * place refuses it if it is offered again. A development stand-in signs here; a real owner signs on their own device, from the
   * figures the place stated (SIGNING.md §8). The mandate is not entered in the ledger: the errand stays under `current`.
   */
  supersedingMandate(current: S.SignedMandate, held: Pick<S.ActHeld, "hold_id" | "act_digest" | "expires_at"> & { over_limit: NonNullable<S.ActHeld["over_limit"]> }, shownToOwner: string): S.SignedMandate {
    const c = current.payload;
    if (!held?.over_limit?.proposed) throw Object.assign(new Error("a superseding mandate answers an over-limit hold (act_held with over_limit)"), { code: "SHOKAI_NOT_OVER_LIMIT" });
    const expiresAt = Date.parse(held.expires_at) < Date.parse(c.expires_at) ? held.expires_at : c.expires_at;
    return signMandate(this.key, this.owner, this.card, { purpose: c.purpose.code, statement: c.purpose.statement, actions: c.allowed_actions,
      limits: { ...c.limits, max_amount: { value: held.over_limit.proposed.value, currency: held.over_limit.proposed.currency } }, expiresAt,
      supersedes: current, supersedesHold: { hold_id: held.hold_id, act_digest: held.act_digest }, shownToOwner });
  }
  /**
   * v0.5.0 (§12.4, C255): have the owner sign a request that `place` (its principal DID) delete the raw visitor text and model output
   * of this representative's visits there. Any visit delivers it (`visit.requestDeletion`). A development stand-in signs here.
   */
  deletionRequest(place: string, shownToOwner = "Delete what this place kept of my representative's visits."): S.Signed<S.DeletionRequest> {
    const at = nowIso();
    return sign<S.DeletionRequest>({ request_id: randomId("del"), principal_id: this.owner.id, place, issued_at: at, shown_to_owner: { text: shownToOwner, locale: "en-US" } }, this.owner, at);
  }
  /** Have the owner sign a mandate (a development stand-in here) and enter it in the ledger. */
  mandate(m: MandateInput): S.SignedMandate { const sm = signMandate(this.key, this.owner, this.card, m); this.hold(sm); return sm; }
  /** Enter a mandate the owner signed elsewhere (on their own device) in the ledger. */
  hold(m: S.SignedMandate): LedgerEntry {
    const have = this.ledger.get(m.payload.mandate_id); if (have) return have;
    const e: LedgerEntry = { mandate_id: m.payload.mandate_id, mandate: m, visits: [] }; this.ledger.put(e); return e;
  }
  /** A valid mandate this representative already holds for exactly this purpose, actions and limits, if any (§5.1 C176: reuse it). */
  heldMandate(purpose: S.PurposeCode, actions: string[], limits?: S.Limits): S.SignedMandate | undefined {
    const now = Date.now(); const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
    return this.ledger.all().map((e) => e.mandate).find((m) => m.payload.purpose.code === purpose && same(m.payload.allowed_actions, actions)
      && jcs(m.payload.limits ?? {}) === jcs(limits ?? {}) && Date.parse(m.payload.expires_at) > now + 60e3
      && sameDid(m.payload.principal_id, this.owner.id) && sameDid(m.payload.representative_id, this.key.id) && m.payload.card_id === this.card.payload.card_id);
  }
  /**
   * Visit a place: take its listing entry (from findPlace) or a Door, then run the ritual greeting → card → introduction →
   * invitation_request, and return the visit with the door's answer (§3.2).
   *
   * Before any request is sent, the visit checks the place against the listing entry it followed (§3.1 "Pointers are hints",
   * C104): every message from the place must be signed by the listing's `representative_id`; the place's card must be signed
   * by the listing's `principal_id`, name that representative, bind its key, and carry a possession proof over this visit's
   * nonce. On a mismatch the visit ends with no request sent: `visit.placeCheck.ok` is false and `visit.seated` is false.
   *
   * To spend, ask for purpose "purchase" with `limits.max_amount` (Money, e.g. {value: "10.00", currency: "USD"}); the same
   * limits go into the mandate the owner signs and into the request. Without max_amount nothing that moves money is seated.
   * The mandate is valid for `mandate.validSeconds` (default 1 day) and carries `mandate.statement` if given.
   *
   * A mandate's limits are for the whole errand, across visits (§5.1, C175, C176). The visit presents, in this order: `useMandate`
   * (one the owner signed); else a valid mandate this representative already holds for the same purpose, actions and limits
   * (so a second visit continues the first one's count); else a new one. `mandate: { fresh: true }` always has a new one signed.
   * Everything done is entered in the representative's ledger, and the visit's report covers every visit under the mandate.
   */
  async visit(to: VisitTarget | Door, ask: VisitAsk): Promise<Visit> {
    const le = to instanceof Door ? to.listing().places[0] : undefined;
    const target: VisitTarget = to instanceof Door ? { entry: to.entry, representative_id: to.repId, principal_id: to.principalId, display_name: to.opts.displayName, actions: le?.actions,
      ...(le?.house_digest ? { house_digest: le.house_digest } : {}), ...(le?.spec_ref ? { spec_ref: le.spec_ref } : {}), ...(le?.accepted_tags ? { accepted_tags: le.accepted_tags } : {}) } : to;
    const transport = ask.transport ?? (to instanceof Door ? inProcess(to) : httpTransport);
    // v0.5.0 (§11.1, C254): the wire tag for this visit, from the listing entry it followed; never a downgrade from a v0.5.0 place.
    // Editor decision H1(c) (C298, pass 3): the mandate this visit will present is chosen first (a pure lookup; nothing signed yet), so
    // its own signed min_protocol is read with ask.minProtocol before any tag is chosen, and the higher floor wins.
    const held = ask.useMandate ?? (ask.mandate?.fresh ? undefined : this.heldMandate(ask.purpose, ask.actions, ask.limits));
    const minProtocol = ownerFloor(ask.minProtocol, (held?.payload as { min_protocol?: unknown } | undefined)?.min_protocol);
    const tag = chooseWireTag(target, ask.wireTag, { spending: ask.limits?.max_amount !== undefined, minProtocol });
    const v = new Visit(this, target.entry, target.representative_id, transport, target.display_name, target, tag);
    // v0.5.0 (§2.3, C248): how the house summary is read before the request: the caller's getter, the Door itself in this process,
    // or a GET of <entry>/house-summary.json (same origin as the entry the visit already talks to).
    v.summaryGet = ask.houseSummary ?? (to instanceof Door ? doorSummaryGet(to) : transport.getJson);
    v.acceptSummary = ask.acceptSummary;
    v.requireHttps = !ask.transport && !(to instanceof Door);   // C269: the default HTTP transport talks only to https (or loopback)
    v.hostCardGet = ask.houseSummary ? undefined : (to instanceof Door ? doorSummaryGet(to) : transport.getJson);   // C268
    v.siteAsk = ask.site; v.siteFetch = ask.siteFetch; v.unboundSite = ask.unboundSite ?? "stop"; v.contextResponse = ask.contextResponse;
    if (to instanceof Door) v.inboxPost = async (_u, b) => (await to.pollInboxAsync(b)).body;
    const mandate = held ?? this.mandate({ purpose: ask.purpose, actions: ask.actions, limits: ask.limits, statement: ask.mandate?.statement, validSeconds: ask.mandate?.validSeconds ?? 86400 });
    const entry = this.hold(mandate); v.mandateReused = !!held && entry.visits.length > 0;
    // v0.5.0 (§5.5, C247): no new visit for an errand its budget stopped, nor one that would pass max_visits.
    const meter = this.errands.get(mandate.payload.mandate_id); const stopped = meter?.stopped(); if (stopped) throw errandStop(stopped);
    meter?.count({ visits: 1 });
    await v.ritual(mandate, ask.actions, ask.limits, ask.vouch ?? null, ask.why);
    if (v.transcript.some((m) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "invitation_request")) {
      entry.visits.push({ encounter_id: v.encounterId, place: placeLabel(target.principal_id, target.display_name, v.placeCheck.ok && !v.placeCheck.unchecked), ...(target.principal_id ? { place_id: target.principal_id } : {}),
        at: nowIso(), ...(v.decision ? { decision: v.decision } : {}), ...(v.seat ? { seat_id: v.seat.seat_id } : {}), acts: [] });
      this.ledger.put(entry);
    }
    return v;
  }
}
export function createRepresentative(opts: RepresentativeOptions): Representative { return new Representative(opts); }
/**
 * Where a visit goes: a listing entry from findPlace (preferred), or the same fields by hand. `principal_id` is what the place's
 * card must be signed by; without it the visit can't check the place and ends before any request (§3.1, C104).
 */
export type VisitTarget = { entry: string; representative_id: string; principal_id?: string; display_name?: string; actions?: S.PlaceAction[];
  /** v0.4.0 (§3.1): the house digest the listing entry names; the place's Shōkai host card must carry the same. */
  house_digest?: string;
  /** v0.5.0 (§11.1, C254): the listing entry's spec_ref and accepted_tags, which choose the wire tag (no downgrade). */
  spec_ref?: S.SpecRef; accepted_tags?: string[] };
/** v0.5.0 (§11.1, C254): a downgrade to shokai/0.3 with a place that speaks shokai/0.5 is refused. */
export const SHOKAI_NO_DOWNGRADE = "SHOKAI_NO_DOWNGRADE";
const versionBelow05 = (v: unknown) => typeof v === "string" && /^0\.[0-4](\.|$)/.test(v);
/**
 * v0.5.0 (§11.1 "Choosing a tag", "No downgrade", C254): shokai/0.5, unless the listing entry names a spec_ref.version below 0.5.0
 * and no accepted_tags that include shokai/0.5; then shokai/0.3. `wish` ("shokai/0.3") is honoured only for such a place.
 */
export function chooseWireTag(t: Pick<VisitTarget, "spec_ref" | "accepted_tags">, wish?: S.ProtocolVersion,
  guard?: { spending?: boolean; minProtocol?: string }): S.ProtocolVersion {
  const speaks05 = !versionBelow05(t.spec_ref?.version ?? "0.5.0") || (t.accepted_tags ?? []).includes(PROTOCOL);
  const listedOld = !!t.spec_ref && versionBelow05(t.spec_ref.version) && !(t.accepted_tags ?? []).includes(PROTOCOL);
  // Editor decision H1(c) (C298, pass 3): the owner's floor is read FIRST, before the caller's wish or the listing. A floor this
  // representative can't meet (above shokai/0.5) ends the visit before anything is sent; a floor above shokai/0.3 rules 0.3 out.
  const floor = guard?.minProtocol;
  if (floor !== undefined && compareWireTags(PROTOCOL, floor) < 0)
    throw Object.assign(new Error(`not sent: you require ${floor} (min_protocol), and this representative speaks at most ${PROTOCOL}`), { code: SHOKAI_NO_FALLBACK });
  const no03 = floor !== undefined && compareWireTags(LEGACY_TAG, floor) < 0;
  if (wish === LEGACY_TAG && t.spec_ref && speaks05)
    throw Object.assign(new Error("not sent: this place speaks shokai/0.5 (its listing says so), and a visit never moves it to shokai/0.3 (§11.1)"), { code: SHOKAI_NO_DOWNGRADE });
  // Nothing listed to compare: §11.1 "Choosing a tag" says a v0.5.0 visitor MUST start with shokai/0.5 unless the listing it followed
  // names an older version; a caller's wish for shokai/0.3 is honoured only when the owner's floor allows it (H1(c): MUST NOT speak 0.3).
  if (wish === LEGACY_TAG && !t.spec_ref) return no03 ? PROTOCOL : LEGACY_TAG;
  if (!listedOld) return PROTOCOL;
  // Editor decision H1 (C298): no fallback to shokai/0.3 on its own when the visit can spend, or below the owner's min_protocol.
  // An explicit `wish` of shokai/0.3 is the owner allowing it for this visit (H1(b)); min_protocol is never overridden (H1(c)).
  if (no03)
    throw Object.assign(new Error(`not sent: the place offered only shokai/0.3, which you ruled out (min_protocol ${floor})`), { code: SHOKAI_NO_FALLBACK });
  if (guard?.spending && wish !== LEGACY_TAG)
    throw Object.assign(new Error("not sent: the place offered only shokai/0.3; I didn't fall back because this visit can spend (allow it with wireTag: \"shokai/0.3\")"), { code: SHOKAI_NO_FALLBACK });
  return LEGACY_TAG;
}
/** Editor decision H1(c) (C298): the owner's floor for a visit, the higher of the visit's own `minProtocol` setting and the mandate's
 *  signed `min_protocol`. A value that isn't a Shōkai wire tag ends the visit before anything is sent (SHOKAI_BAD_TAG): it is never
 *  ignored (H1(e), C300). */
export function ownerFloor(...floors: unknown[]): string | undefined {
  let best: string | undefined;
  for (const f of floors) {
    if (f === undefined) continue;
    if (typeof f !== "string") throw Object.assign(new Error(`not sent: min_protocol ${JSON.stringify(f)} is not a Shōkai wire tag`), { code: "SHOKAI_BAD_TAG" });
    compareWireTags(f, LEGACY_TAG);   // throws SHOKAI_BAD_TAG on a malformed tag
    if (best === undefined || compareWireTags(f, best) > 0) best = f;
  }
  return best;
}
/** Editor decision H1 (C298): a visit refused because it would have fallen back to shokai/0.3. */
export const SHOKAI_NO_FALLBACK = "SHOKAI_NO_FALLBACK";
/** Editor decision H1(a) (C299): numeric order of wire tags; every shokai/0.N is below shokai/1 (the whole 1.x line). Never string order. */
export function compareWireTags(a: string, b: string): number {
  const key = (t: string): [number, number] => {
    const m = /^shokai\/(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/.exec(t);
    if (!m) throw Object.assign(new Error(`not a Shōkai wire tag: ${t}`), { code: "SHOKAI_BAD_TAG" });
    return m[1] === "0" ? [0, Number(m[2] ?? 0)] : [Number(m[1]), 0];
  };
  const [x, y] = [key(a), key(b)];
  return x[0] - y[0] || x[1] - y[1];
}
export type VisitAsk = {
  purpose: S.PurposeCode; actions: string[];
  /** The limits the owner signs and the request asks for: max_amount (Money) to spend, max_amount_scope ("per_seat" default, or
   *  "per_operation" with an optional session_max_amount), max_operations, max_session_s. */
  limits?: S.Limits;
  /** The mandate's own text and validity (seconds; default 86400 = 1 day). A seat never outlives its mandate (§7.1). */
  mandate?: { statement?: string; validSeconds?: number; fresh?: boolean };
  /** A mandate the owner already signed (e.g. on their device) to present, instead of reusing or signing one (§5.1). */
  useMandate?: S.SignedMandate;
  vouch?: S.SignedVouch | null; why?: string; transport?: Transport;
  /**
   * v0.5.0 (§11.1, C254; editor decision H1(b), C298): ask for "shokai/0.3". Default: chosen from the listing (shokai/0.5 unless the
   * listing names a spec_ref.version below 0.5.0 and no accepted_tags with shokai/0.5). Asking for shokai/0.3:
   * - with a place whose listing says it speaks shokai/0.5: refused before anything is sent (SHOKAI_NO_DOWNGRADE);
   * - with a place whose listing names an older version: allowed, and it is the owner allowing the fallback for this visit even when
   *   it can spend (without it, a spending visit to such a place is refused with SHOKAI_NO_FALLBACK);
   * - with a target that lists no spec_ref: honoured, unless the owner's floor (`minProtocol` or the mandate's `min_protocol`) is
   *   above shokai/0.3; then the visit speaks shokai/0.5.
   * The owner's floor always wins over this setting (H1(c)).
   */
  wireTag?: S.ProtocolVersion;
  /**
   * Editor decision H1(c)–(f) (C298, C300, C301): the owner's floor for this visit, for example "shokai/0.5". It is read with the
   * presented mandate's signed `min_protocol` (when it has one) before any tag is chosen, and the higher of the two applies. Wire tags
   * compare numerically (H1(a), C299: shokai/0.10 is above shokai/0.9). This setting stays on this computer: it isn't written into
   * the mandate; to tell the place, sign `min_protocol` into the mandate (and list it in its `crit`).
   * - A value that isn't a Shōkai wire tag ends the visit before anything is sent (SHOKAI_BAD_TAG); it is never ignored (H1(e)).
   * - A floor above shokai/0.5, the highest tag this representative speaks, ends the visit before anything is sent (SHOKAI_NO_FALLBACK).
   * - A floor above shokai/0.3 means this visit never speaks shokai/0.3: a place that offers only shokai/0.3 is refused
   *   (SHOKAI_NO_FALLBACK).
   */
  minProtocol?: string;
  /** v0.5.0 (§2.3, C248): fetch <entry>/house-summary.json yourself (e.g. through your own client). Default: the Door in this process, or a GET of that URL. */
  houseSummary?: (url: string) => Promise<unknown>;
  /** v0.5.0 (§2.3, C248, C250): read the place's house summary before the request; return true to go on, or why the owner wouldn't accept it (the visit withdraws). */
  acceptSummary?: (summary: S.HouseSummary) => true | string;
  /**
   * v0.5.0 (§3.1.1, site binding): the website the owner named, e.g. "https://lanternmoss.example". Before any request, the visit
   * reads that site's own /.well-known/shokai and checks that it lists this door and that the place's verified Shōkai host card
   * names that site. If not, the visit ends with no request sent ("this door doesn't show that it belongs to <site>"). Without it,
   * a Shōkai host card that names a site is checked against that site's file the same way.
   */
  site?: string;
  /** §3.1.1: how the site's file is fetched (default: global fetch, https only; `allowLoopbackHttp` for local tests). */
  siteFetch?: { fetch?: (url: string, init?: RequestInit) => Promise<Response>; allowLoopbackHttp?: boolean };
  /** §3.1.1: for an errand that spends nothing, go on into a door that isn't bound to the named site (it is reported as unverified). Default: stop. */
  unboundSite?: "stop" | "continue";
  /**
   * v0.5.0 (§6.12, provisional): the owner's signed answer to a context request the place sent on an earlier visit ("before entry"),
   * presented with the request. The representative never writes it: the owner answers or declines field by field and signs.
   */
  contextResponse?: S.ContextResponse;
};
/** Find a place in a door's listing (GET <base>/places). */
export async function findPlace(base: string, name?: string): Promise<S.PlaceListingEntry> {
  const r = await fetch(base.replace(/\/$/, "") + "/places"); const l = await r.json() as S.PlaceListing;
  const p = name ? l.places.find((x) => x.name === name) : l.places[0]; if (!p) throw new Error(`no place ${name ?? ""} at ${base}`);
  return p;
}

const LIMIT_WORDS: Record<ErrandLimit, string> = { max_tokens: "token limit", max_minutes: "time limit", max_visits: "visit limit", expires_at: "end date" };
/** v0.5.0 (§5.5): the local refusal of anything but a farewell once the errand budget stopped the errand. Nothing is sent. */
const errandStop = (limit: ErrandLimit) => Object.assign(new Error(`not sent: the errand budget's ${limit} stopped this errand; only a farewell goes out now, and the errand comes home (§5.5)`),
  { code: SHOKAI_ERRAND_BUDGET_REACHED, bringHome: true as const, limit });
const errandStopDecision = (limit: ErrandLimit) => ({ type: "act_decision", decision: "deny", refused_by: "representative", by: "errand_budget", bringHome: true as const, limit,
  why: `the errand budget's ${limit} stopped this errand: nothing more is sent except a farewell (§5.5)` });

/**
 * v0.5.0 (§7.3 "Checking the figures", SIGNING.md §8): why the figures of a LimitRequest the place stated don't match what the
 * representative knows, or null. Checked before the owner is asked, by the representative and by the signing page:
 * - `limit` is the owner's signed ceiling: the mandate's `max_amount`, or the seat's when that is lower (never above the mandate's);
 * - `current` is what the representative's own ledger counts against it (acts let through plus ordinary holds still open);
 * - `proposed − current` is the amount of the held act the representative sent (and the hold's own `amount`, when given).
 * On a mismatch the owner is shown nothing to approve; the hold lapses and the mismatch is reported home.
 */
export function limitRequestProblem(req: Pick<S.LimitRequest, "limit" | "current" | "proposed"> & Partial<Pick<S.LimitRequest, "seat" | "mandate">>, k: {
  mandate: S.SignedMandate; seatLimit?: S.Money; current: S.Money; actAmount: S.Money; heldAmount?: S.Money;
  /** Whole-mandate ledger when checking both totals (C175). Required when `req.mandate` is present (R10-M2). */ mandateCurrent?: S.Money;
}): string | null {
  const lim = parseMoney(req.limit), cur = parseMoney(req.current), pro = parseMoney(req.proposed), act = parseMoney(k.actAmount);
  const mcap = parseMoney(k.mandate.payload.limits?.max_amount); const scap = parseMoney(k.seatLimit); const mine = parseMoney(k.current);
  if (!lim || !cur || !pro || !act || !mcap || !mine) return "a figure is missing or not an amount";
  if (new Set([lim.currency, cur.currency, pro.currency, act.currency, mcap.currency, mine.currency]).size !== 1) return "the figures are not all in the mandate's currency";
  const want = scap && scap.currency === mcap.currency && scap.units < mcap.units ? scap.units : mcap.units;
  if (lim.units !== want) return `the place's limit (${money(req.limit)}) isn't the ceiling the owner signed (${money(fmtUnits(want, mcap.currency))})`;
  if (cur.units !== mine.units) return `the place's current figure (${money(req.current)}) isn't what this representative's ledger counts (${money(k.current)})`;
  if (pro.units - cur.units !== act.units) return `proposed minus current (${money(fmtUnits(pro.units - cur.units, pro.currency))}) isn't the amount of the held act (${money(k.actAmount)})`;
  const ha = parseMoney(k.heldAmount); if (k.heldAmount !== undefined && (!ha || ha.currency !== act.currency || ha.units !== act.units)) return "the hold names another amount than the act sent";
  // Dual totals (per-visit and whole-mandate): when the place stated them, they MUST match the representative's ledgers.
  if (req.seat) {
    const sl = parseMoney(req.seat.limit), sc = parseMoney(req.seat.current);
    if (!sl || !sc) return "a seat figure is missing or not an amount";
    const seatWant = scap && scap.currency === mcap.currency ? scap.units : mcap.units;
    if (sl.units !== seatWant) return `the place's seat limit (${money(req.seat.limit)}) isn't the seat ceiling the owner signed`;
    if (sc.units !== mine.units) return `the place's seat current (${money(req.seat.current)}) isn't this visit's ledger (${money(k.current)})`;
  }
  if (req.mandate) {
    const ml = parseMoney(req.mandate.limit), mc = parseMoney(req.mandate.current);
    if (!ml || !mc) return "a mandate figure is missing or not an amount";
    if (ml.units !== mcap.units) return `the place's mandate limit (${money(req.mandate.limit)}) isn't the mandate ceiling the owner signed`;
    if (k.mandateCurrent === undefined) return "the mandate current figure wasn't supplied";
    const mMine = parseMoney(k.mandateCurrent);
    if (!mMine || mc.units !== mMine.units) return `the place's mandate current (${money(req.mandate.current)}) isn't this mandate's ledger (${money(k.mandateCurrent)})`;
  }
  return null;
}

/** One encounter: every message sent and received, the decision, the seat, and acts within it. */
export class Visit {
  readonly encounterId = randomId("enc"); private seq = 0; private hostNonce = ""; readonly transcript: { dir: "out" | "in"; message: any }[] = [];
  response?: any; seat?: S.SeatGrant; acts: { tool: string; amount?: S.Money; ok: boolean; args?: Record<string, unknown>; result?: unknown; decision?: unknown; local?: true; offer_outcome?: S.OfferOutcomeCode; interrupted?: "unreachable" | "seat_gone";
    /** v0.5.0 (§7.3, C230): released above the limit under this one-purchase superseding mandate. */ approved_above?: string;
    /** v0.5.0 (§7.3 "Checking the figures"): the place's over-limit figures didn't match; the owner was asked nothing. */ limit_mismatch?: string }[] = [];
  /** Ordinary holds this visit opened that may still reserve their amount at the place (§7.3), by hold_id. */
  private openHolds = new Map<string, { amount: S.Money; expires_at: string }>();
  /**
   * v0.5.0 (§7.3): what the representative's own record counts against a limit in `currency`: acts let through (under the whole
   * mandate, or in this seat only when the seat's cap is the lower one) plus ordinary holds still open (each until its end plus 5 s).
   */
  ledgerCurrent(currency: string, seatOnly = false): S.Money {
    const acts = seatOnly || !this.ledgerEntry ? this.acts : this.ledgerEntry.visits.flatMap((x) => x.acts); let u = 0n;
    for (const a of acts) if (a.ok) { const m = parseMoney(a.amount); if (m && m.currency === currency) u += m.units; }
    const now = Date.now();
    for (const h of this.openHolds.values()) { if (Date.parse(h.expires_at) + 5000 < now) continue; const m = parseMoney(h.amount); if (m && m.currency === currency) u += m.units; }
    return fmtUnits(u, currency);
  }
  /** Set when the visit was interrupted: the place stopped answering, or no longer knew this seat (e.g. it restarted). Knock again. */
  interrupted: null | "unreachable" | "seat_gone" = null;
  private hostSaid: { text: string; locale: string; untrusted: true }[] = []; private readiness?: S.ReadinessRequirement[];
  /** The lobby's onboarding_url, if one came. Shown to the owner by its origin; never opened by the representative (§3.3). */
  onboardingUrl?: string;
  /** The mandate presented in this visit (what the owner signed for it). */
  mandateSent?: S.SignedMandate;
  /** True when this visit presented a mandate already used in an earlier visit (its limits continue from there, §5.1 C175). */
  mandateReused = false;
  /**
   * Check a tool against the seat's tool_allowlist before sending an act (default on). The door checks it too; this keeps the
   * representative from attempting a tool its seat doesn't include. Set false to send anyway (e.g. to test a door).
   */
  checkSeatLocally = true;
  /**
   * Check what remains of the mandate before sending an act (default on; §5.1 C176 requires it of a representative). Set false
   * only to test a door's own enforcement (C175); a representative acting for an owner keeps it on.
   */
  checkMandateLocally = true;
  /** Keep signed objects a place returns from a tool (a visit stamp, a receipt) for the report home (§8.2, C178). Default on. */
  keepSigned = true;
  /** Signed objects received in this visit and kept for the owner (§8.2, C178): reported as `brought_back`. */
  readonly broughtBack: BroughtBack[] = [];
  /** The ledger entry of this visit's mandate: every visit and act under it (§5.1, C176). */
  get ledgerEntry(): LedgerEntry | undefined { return this.mandateSent ? this.rep.ledger.get(this.mandateSent.payload.mandate_id) : undefined; }
  /**
   * The amount an act moves, if any (§5.1: only actions in spending_actions move money). An `amount` on an action the place's
   * listing marks `spends: false` (a quote, a browse) is not money spent and doesn't count against the mandate. When the listing
   * says nothing about the tool, the amount counts (the owner's limit errs on the safe side).
   */
  spendOf(tool: string, args: Record<string, unknown> = {}): S.Money | undefined {
    if (!args.amount) return undefined;
    const a = this.target?.actions?.find((x) => x.action === tool);
    return a && a.spends === false ? undefined : args.amount as S.Money;
  }
  private logAct(tool: string, ok: boolean, amount?: S.Money, local?: true, interrupted?: true, approvedAbove?: string) {
    const e = this.ledgerEntry; const lv = e?.visits.find((x) => x.encounter_id === this.encounterId); if (!e || !lv) return;
    lv.acts.push({ tool, ...(amount ? { amount } : {}), ok, at: nowIso(), ...(local ? { local } : {}), ...(interrupted ? { interrupted } : {}), ...(approvedAbove ? { approved_above: approvedAbove } : {}) }); this.rep.ledger.put(e);
  }
  /**
   * The representative's own check before an act is sent (§5.1, C176): null if it fits what remains of the mandate, else why not.
   * The door checks too (C175); this keeps the representative from attempting what its owner didn't allow.
   */
  beyondMandate(tool: string, args: Record<string, unknown> = {}): string | null { return this.mandateProblem(tool, args)?.why ?? null; }
  /** beyondMandate with its kind: "amount" is the only one an over-limit hold can take home to the owner (§7.3). */
  private mandateProblem(tool: string, args: Record<string, unknown> = {}): { why: string; kind: "operations" | "currency" | "amount" | "booking" } | null {
    const e = this.ledgerEntry; if (!e) return null; const t = mandateTotals(e); const left = t.remaining;
    // v0.5.0 (§7.4): a booking must fit the window and party size the owner signed, before it is sent.
    if (tool === "reservation.make" || tool === "reservation.change" || "booking" in args) {
      const bk = (args.booking ?? {}) as { start?: unknown; end?: unknown; party_size?: unknown }; const why = bookingProblem(bk, e.mandate.payload.limits?.booking);
      if (why) return { kind: "booking", why: why === "outside_window" ? "that time is outside the window the owner allowed" : why === "party_too_large" ? "that party is larger than the owner allowed"
        : why === "no_booking_limits" ? "the errand names no booking window" : "the booking isn't complete (a start time and a party size)" };
    }
    if (left?.operations !== undefined && left.operations < 1) return { kind: "operations", why: `the mandate's ${e.mandate.payload.limits.max_operations} actions are used up` };
    const amt = parseMoney(this.spendOf(tool, args)); const capLeft = parseMoney(left?.amount);
    if (amt && amt.units > 0n && capLeft && amt.currency !== capLeft.currency)
      return { kind: "currency", why: `${money(args.amount as S.Money)} is not in the mandate's currency (${capLeft.currency}); the owner allowed ${money(e.mandate.payload.limits.max_amount!)}` };
    if (amt && amt.units > 0n && capLeft && amt.units > capLeft.units)
      return { kind: "amount", why: `${money(args.amount as S.Money)} is more than the ${money(left!.amount!)} left of the mandate` };
    return null;
  }
  /** The local seat check (when `checkSeatLocally`): null if the tool is in the seat's tool_allowlist, else why not. */
  outsideSeat(tool: string): string | null {
    if (!this.checkSeatLocally || !this.seat) return null;
    const allowed = this.seat.tool_allowlist ?? [];
    return allowed.includes(tool) ? null : `${tool} is not in this seat (it allows ${allowed.length ? allowed.join(", ") : "no tools"})`;
  }
  /** Everything the representative checks before it sends an act: the seat's tools, then what remains of the mandate. */
  beforeSend(tool: string, args: Record<string, unknown> = {}): { why: string; by: "seat" | "mandate" } | null {
    const s = this.outsideSeat(tool); if (s) return { why: s, by: "seat" };
    const m = this.checkMandateLocally ? this.beyondMandate(tool, args) : null; return m ? { why: m, by: "mandate" } : null;
  }
  /**
   * Keep a signed object the place gave (§8.2, C178). It is verified against the place's listed principal_id; one that doesn't
   * verify is kept with verified: false, never trusted. The same object given twice is kept once (marked again).
   */
  keep(envelope: S.Signed<unknown>, opts: { tool?: string; again?: boolean; /** A message the place's representative signed (§11.2 inbox): verified against the listed representative_id. */ byRepresentative?: true } = {}): BroughtBack | undefined {
    if (!isEnvelope(envelope)) return undefined;
    const prior = this.broughtBack.find((b) => b.payload_digest === envelope.payload_digest);
    if (prior) { if (opts.again) prior.again = true; return prior; }
    const pid = opts.byRepresentative ? this.hostId : this.target?.principal_id; const v = pid ? verifySigned(envelope, { expectSigner: pid }) : { ok: false as const, why: "no principal_id" };
    const p: any = envelope.payload; const kind = typeof p?.type === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(p.type) ? p.type : "signed object";
    const rawLabel = typeof p?.serial_label === "string" ? p.serial_label : typeof p?.label === "string" ? p.label : undefined;
    const label = rawLabel && /^[A-Za-z0-9][A-Za-z0-9 .#:_-]{0,23}$/.test(rawLabel) ? rawLabel : undefined;
    const b: BroughtBack = { item_id: `bb${this.broughtBack.length + 1}`, kind, ...(label ? { label } : {}), ...(opts.tool ? { from_tool: opts.tool } : {}), at: nowIso(),
      signed_by: String(envelope.signatures[0].signer), payload_digest: envelope.payload_digest, verified: v.ok, ...(v.ok && pid ? { verified_against: pid } : {}),
      ...(opts.again ? { again: true } : {}), envelope };
    this.broughtBack.push(b); return b;
  }
  /** Find signed objects in a tool's result (an MCP result's JSON text blocks, or an act_result's result) and keep them. */
  keepFrom(tool: string, result: unknown) {
    if (!this.keepSigned || result === undefined || result === null) return;
    for (const f of findEnvelopes(result)) this.keep(f.envelope, { tool, again: f.again });
  }
  /**
   * The visitor-side check of the place against its listing entry (§3.1, C104). `ok: false` means the visit ended before any
   * request was sent; `why` says what didn't match. `checked` lists what was verified. When the place answered before it showed
   * its card (an early deny), nothing could be checked: `ok` is false, `checked` is empty and `unchecked` is true.
   */
  readonly placeCheck: { ok: boolean; why?: string; checked: string[]; unchecked?: true; problem?: PlaceCardProblem; report?: string;
    /** v0.5.0 (§3.1.1): the site check, when the owner named a site or the place's Shōkai host card names one (`claimed`). */
    site?: SiteCheck & { claimed?: true; continued?: true } } = { ok: true, checked: [] };
  /** v0.5.0 (§3.1.1): see VisitAsk.site, siteFetch and unboundSite. */
  siteAsk?: string; siteFetch?: VisitAsk["siteFetch"]; unboundSite: "stop" | "continue" = "stop"; contextResponse?: S.ContextResponse;
  /** v0.5.0 (§3.1.1): the site this door is verified against (its own /.well-known/shokai lists it, and its Shōkai host card names it), else null. */
  get verifiedSite(): string | null { const s = this.placeCheck.site; return this.placeCheck.ok && s?.ok ? s.site : null; }
  /** v0.4.0 (§2.6): revocation lists this visit fetched (or was handed) for the place's Shōkai host card. */
  readonly fetched: FetchCache = new Map();
  private spending = false;
  private myNonce = ""; private hostCard?: S.SignedCard;
  constructor(readonly rep: Representative, readonly entry: string, readonly hostId: string, private transport: Transport, readonly hostName?: string, readonly target?: VisitTarget,
    /** v0.5.0 (§11.1, C254): the wire tag this visit speaks. */ readonly tag: S.ProtocolVersion = PROTOCOL) {}
  /** v0.5.0 (§2.3, C248): how the house summary is fetched (see VisitAsk.houseSummary), and the owner's acceptance check. */
  summaryGet?: (url: string) => Promise<unknown>; acceptSummary?: (summary: S.HouseSummary) => true | string;
  /** Red team phase 1: C269 https required (default transport); C268 the published host card, read before our card is shown. */
  requireHttps = false; hostCardGet?: (url: string) => Promise<unknown>; publishedCardDigest?: string;
  /** v0.5.0 (§2.3, C248): the house summary read before the request (its digest matched the Shōkai host card's summary_digest). */
  summaryRead?: S.HouseSummary;
  /** v0.5.0 (§2.3, §11.1): why this visit withdrew before its request (farewell `withdrawn`), if it did. */
  withdrew?: string;
  private placeFails(why: string) { if (this.placeCheck.ok) { (this.placeCheck as { ok: boolean }).ok = false; this.placeCheck.why = why; } }
  /** The place answered before it showed its card: nothing about it was checked, so the check can't count as passed. */
  private placeUnchecked() { if (this.placeCheck.ok && !this.placeCheck.checked.some((c) => !c.endsWith("(C268)"))) {   // C268: the published card alone proves no possession
    this.placeFails("the place answered before it showed its card, so nothing about it was checked"); this.placeCheck.unchecked = true; } }
  /** A ritual message header for this encounter (§2.2). */
  /** R3-01 (§2.4, C292): under shokai/0.5 a possession proof names the door it is for (its listed representative); undefined under 0.3. */
  audience(): string | undefined { return this.tag === PROTOCOL ? this.hostId : undefined; }
  message(type: string, body: Record<string, unknown>): any {
    return { protocol: this.tag, encounter_id: this.encounterId, msg_id: `${this.encounterId}-v${++this.seq}`, sent_at: nowIso(), from: this.rep.id, to: this.hostId, type, ...body };
  }
  signed(m: any) { return makeSigned(m, this.rep.key, m.sent_at); }
  async send(m: any): Promise<any[]> {
    // v0.5.0 (§5.5 C247, "Stopping on the wire"): once the errand budget stopped the errand, only a farewell goes out.
    const stop = m?.type !== "farewell" ? this.errandStopped() : undefined;
    if (stop) throw errandStop(stop);
    // v0.5.0 (§5.5 C247, §8.3 C251, §7.3 C230): an ErrandBudget, ReturnPrefs or notify_at never goes to a place.
    const never = neverSentMember(m);
    if (never) throw Object.assign(new Error(`not sent: ${never} is kept by the representative and never sent to a place (§5.5, §8.3, §7.3)`), { code: SHOKAI_NEVER_SENT, member: never });
    // v0.5.0 (§6.6, C249): no acknowledgement-only messages.
    if (acknowledgementOnly(m)) throw Object.assign(new Error("not sent: an acknowledgement-only message (§6.6); the next message with a decision or a fact acknowledges it"), { code: SHOKAI_ACKNOWLEDGEMENT_ONLY });
    const w = this.signed(m); this.transcript.push({ dir: "out", message: w });
    const env = await this.transport(this.entry, w); const out = env.messages.map((x: any) => x?.payload ?? x);
    for (const x of env.messages) {
      this.transcript.push({ dir: "in", message: x });
      // §3.1 / C104: everything the place says must be signed by the representative its listing names.
      const v = verifySigned(x, { expectSigner: this.hostId });
      if (!v.ok) this.placeFails(`a message from the place is not signed by the representative its listing names (${v.why})`);
      else if (!sameDid((x as any).payload?.from, this.hostId)) this.placeFails("a message from the place names another sender than its listing's representative");
      // §2.2 (C197): the visitor names the encounter; a reply in an encounter the place named itself is outside this visit.
      else if ((x as any).payload?.encounter_id !== this.encounterId) this.placeFails(`the place answered in another encounter (${String((x as any).payload?.encounter_id).slice(0, 40)}), not the one this visit named (§2.2)`);
    }
    for (const x of out) {
      if (x.type === "greeting" && x.nonce) this.hostNonce = x.nonce;
      if (x.type === "card_presentation" && x.card) {
        if (this.publishedCardDigest && x.card.payload_digest !== this.publishedCardDigest) this.placeFails("the card the place presented isn't the one it published before the visit (§3.2, C268)");
        this.hostCard = x.card;
      }
      if (x.courtesy?.text) this.hostSaid.push({ text: x.courtesy.text, locale: x.courtesy.locale, untrusted: true });
      if (x.type === "invitation_response") { this.response = x; if (x.seat) this.seat = x.seat; if (x.readiness_requirements) this.readiness = x.readiness_requirements; }
      if (x.type === "lobby_briefing" && typeof x.onboarding_url === "string") this.onboardingUrl = x.onboarding_url;
    }
    return out;
  }
  async ritual(mandate: S.SignedMandate, actions: string[], limits: S.Limits | undefined, vouch: S.SignedVouch | null, why?: string) {
    this.mandateSent = mandate; this.myNonce = randomId("n"); this.spending = !!(limits?.max_amount ?? mandate.payload.limits?.max_amount);
    if (this.requireHttps && !secureEntry(this.entry)) return this.placeFails("the place's entry isn't https (and isn't on this computer), so what we'd say could be read on the way: I didn't greet it (§11.1, C269)");
    // §3.1 (review 4 R4-05): an entry without principal_id or representative_id is malformed; the visit ends before the greeting.
    if (!this.target?.principal_id) return this.placeFails("no principal_id to check the place against: pass the listing entry from findPlace (§3.1)");
    if (!this.hostId) return this.placeFails("the listing entry names no representative_id, so there is no representative to greet (§3.1)");
    await this.send(this.message("greeting", { locales: this.rep.card.payload.locales, nonce: this.myNonce }));
    if (!this.hostNonce && !this.response) this.placeFails("the place's listed representative did not answer the greeting");
    if (!this.placeCheck.ok) return;
    // Red team phase 1 (§3.2, C268, provisional): under shokai/0.5, check the place's published Shōkai host card before showing ours.
    if (this.tag === PROTOCOL && this.hostCardGet && !(await this.precheckHostCard())) return;
    const card = this.rep.card; const aud = this.audience(); const proof = makeSigned(possessionPayload(this.encounterId, this.hostNonce, aud), this.rep.key, nowIso()).signatures[0];
    await this.send(this.message("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id, ...(aud ? { audience: aud } : {}) } }));
    if (!this.placeCheck.ok) return;
    if (this.response) { this.placeUnchecked(); return; }   // the place has already answered (e.g. a deny for this card): no request follows
    await this.fetchPlaceRevocations();
    this.checkHostCard();
    if (!this.placeCheck.ok) return;
    // v0.5.0 (§3.1.1): the door against the website it belongs to, before anything is asked.
    if (!(await this.checkSiteBinding())) return;
    // v0.5.0 (§11.1 "No downgrade", C254): a visit under shokai/0.3 with a place whose verified Shōkai host card says shokai/0.5 ends here.
    if (this.tag === LEGACY_TAG && this.hostCard?.payload.protocol === PROTOCOL) return this.withdraw("the place's verified Shōkai host card says it speaks shokai/0.5, so I didn't fall back to shokai/0.3");
    // v0.5.0 (§2.3, C248, C250): under shokai/0.5, read the house summary (digest checked against the Shōkai host card) before the request.
    if (this.tag === PROTOCOL && this.hostCard?.payload.kind === "host") {
      const sum = await this.houseSummary(this.summaryGet);
      if (!sum.ok) return this.withdraw(`I couldn't read the place's house rules before asking: ${sum.why}`);
      this.summaryRead = sum.summary;
      const ok = this.acceptSummary ? this.acceptSummary(sum.summary) : true;
      if (ok !== true) return this.withdraw(`the place's house rules say something you told me not to accept: ${ok}`);
    }
    await this.send(this.message("introduction", { vouch }));
    await this.send(this.message("invitation_request", { card_digest: card.payload_digest, mandate, ...(vouch ? { vouch_digest: vouch.payload_digest } : {}),
      ...(this.contextResponse && this.tag === PROTOCOL ? { context_response: this.contextResponse } : {}),
      proposal: { request: { actions, ...(limits ? { limits } : {}) }, value_to_counterparty: { text: why ?? "A short visit on my owner's behalf.", locale: "en-US" }, etiquette_register: "first_meeting" } }));
  }
  /**
   * v0.5.0 (§3.1.1): check the door against the site the owner named (or, if none, the site its Shōkai host card names). False
   * when the visit must end here with no request sent: the place check fails with the plain reason, and a farewell `withdrawn` goes.
   */
  private async checkSiteBinding(): Promise<boolean> {
    const card = this.hostCard?.payload; if (!card || card.kind !== "host") return true;
    const named = this.siteAsk; const claimed = card.place?.site; const target = named ?? claimed;
    if (!target) return true;   // nothing named and nothing claimed: the report names the place by its key, unverified (§2.1)
    const r = await checkSite(target, card as Parameters<typeof checkSite>[1], this.siteFetch ?? {});
    const host = siteHost(r.site ?? target);
    if (r.ok) { this.placeCheck.site = named ? r : { ...r, claimed: true }; this.placeCheck.checked.push(r.via === "app_proxy" ? `${host}'s home page names its shop app's door file (${host}${APP_PROXY_PATH}), which lists this door, and its Shōkai host card names ${host} (§3.1.1, the provisional app-proxy rule)` : `${host}'s own /.well-known/shokai lists this door, and its Shōkai host card names ${host} (§3.1.1)`); return true; }
    const goOn = !this.spending && (named ? this.unboundSite === "continue" : r.why === "site_unreachable");
    this.placeCheck.site = { ...r, ...(named ? {} : { claimed: true as const }), ...(goOn ? { continued: true as const } : {}) };
    if (goOn) { this.placeCheck.checked.push(`not verified against ${host} (${r.why}); the errand spends nothing, so the visit went on and is reported as unverified (§3.1.1)`); return true; }
    this.placeFails(`this door doesn't show that it belongs to ${host}: ${SITE_WORDS[r.why](host)}`);
    try { await this.send(this.message("farewell", { outcome: "withdrawn", courtesy: { locale: "en-US", locale_match: "exact", register: "first_meeting", text: "Thank you." } })); } catch { /* the place may be gone */ }
    return false;
  }
  /** End the visit before any request: the farewell `withdrawn`, and the reason for the report home (§2.3, §11.1). */
  // (SITE_WORDS below: the plain words for each §3.1.1 failure)
  private async withdraw(why: string) { this.withdrew = why; try { await this.farewell("withdrawn"); } catch { /* the place may be gone; the visit still ends */ } }
  /** §3.1 (C104): the place's card must match the listing entry this visit followed, and prove possession of its key now. */
  /** Red team phase 1 (§3.2, C268, provisional): the place's published Shōkai host card, checked before our card is shown. */
  private async precheckHostCard(): Promise<boolean> {
    const t = this.target!; let c: any;
    try { c = await this.hostCardGet!(this.entry.replace(/\/$/, "") + "/host-card.json"); }
    catch (e) { this.placeFails(`I couldn't read the place's Shōkai host card before showing yours (${String((e as Error)?.message ?? e).slice(0, 80)}); a shokai/0.5 door publishes it at <entry>/host-card.json (§3.2, C268)`); return false; }
    const sig = c && typeof c === "object" && c.payload ? verifySigned(c, { expectSigner: t.principal_id }) : { ok: false as const, why: "not a signed card" };
    const p = c?.payload; const now = nowIso();
    const why = !sig.ok ? `not signed by the listed principal (${(sig as any).why})` : p.kind !== "host" ? "not a Shōkai host card"
      : !sameDid(p.principal?.principal_id, t.principal_id!) ? "it names another principal" : !sameDid(p.representative_id, this.hostId) ? "it names another representative than the listing"
      : !new RealVerifier().cardKeyBinds(p) ? "its key doesn't match its representative id" : p.place?.entry !== t.entry ? `it is for ${p.place?.entry}, not ${t.entry}`
      : (notYetValid(p.issued_at, now) || isExpired(p.expires_at, now)) ? "it isn't valid now" : null;
    if (why) { this.placeFails(`the place's published Shōkai host card doesn't check out (${why}), so I didn't show your card (§3.2, C268)`); return false; }
    this.publishedCardDigest = c.payload_digest; this.placeCheck.checked.push("its published Shōkai host card, before showing ours (C268)"); return true;
  }
  private checkHostCard() {
    const c = this.hostCard; const t = this.target!;
    if (!c) return this.placeFails("the place did not present its card");
    const sig = verifySigned(c, { expectSigner: t.principal_id });
    if (!sig.ok) return this.placeFails(`the place's card is not signed by the principal its listing names (${sig.why})`);
    this.placeCheck.checked.push("card signed by the listed principal_id");
    if (!sameDid(c.payload.principal?.principal_id, t.principal_id!)) return this.placeFails("the place's card names another principal than its listing");
    if (!sameDid(c.payload.representative_id, this.hostId)) return this.placeFails("the place's card names another representative than its listing");
    const verifier = new RealVerifier();
    if (!verifier.cardKeyBinds(c.payload)) return this.placeFails("the place's card key doesn't match its representative id");
    const cp = this.transcript.map((m) => m.message?.payload ?? m.message).find((m) => m?.type === "card_presentation" && m?.card === c);
    // Review 4 R4-04 (§2.4, C292): under shokai/0.5 the place's proof names this representative as its audience, and is checked over it.
    const myAud = this.tag === PROTOCOL ? this.rep.card.payload.representative_id : undefined;
    if (myAud && !sameDid(String((cp?.possession_proof as any)?.audience ?? ""), myAud)) return this.placeFails("the place's possession proof isn't addressed to me (no audience, or another party's): it may be relayed, so I didn't go in (§2.4, C292)");
    if (!cp?.possession_proof || !verifier.possession(cp.possession_proof, c.payload, this.encounterId, this.myNonce, myAud)) return this.placeFails("the place's possession proof doesn't verify over this visit's nonce (a copied card?)");
    this.placeCheck.checked.push("card names the listed representative_id and binds its key", "possession proof over this visit's nonce", "every message signed by the listed representative_id");
    // v0.4.0 (§2.3, §2.6, §3.1; C203–C207): a Shōkai host card for this place and this house, not withdrawn.
    const r = visitorPlaceCardCheck(verifier, c, { principal_id: t.principal_id!, entry: t.entry, ...(t.house_digest ? { house_digest: t.house_digest } : {}),
      actions: (t.actions ?? []).filter((a) => a.needs !== "considering").map((a) => a.action), fetched: this.fetched, spending: this.spending });
    if (!r.ok) { this.placeCheck.problem = r.problem; this.placeCheck.report = r.report; return this.placeFails(r.report); }
    this.placeCheck.checked.push(r.legacy ? "a v0.3.0 place card (no kind), read as a Shōkai host card" : "a Shōkai host card for this place and its house config");
    if (r.revocation === "clear") this.placeCheck.checked.push("the place's host card is not withdrawn");
    if (r.revocation === "unreachable") this.placeCheck.checked.push("the place's withdrawal list couldn't be fetched (not spending, so the visit went on)");
  }
  /** v0.4.0 (§2.6, C207): fetch the place's host-card withdrawal list itself (https only, capped), unless it was handed one. */
  private async fetchPlaceRevocations() {
    const url = this.hostCard?.payload?.revocation_url; if (typeof url !== "string" || this.fetched.has(url)) return;
    const at = nowIso();
    if (!doorMayFetch(url, false)) { this.fetched.set(url, { ok: false, at }); return; }
    // Fable review (§12.1): the same DNS-checked, address-pinned, no-redirect, size- and time-capped fetch the door uses.
    try { const got = await doorFetch(url, { testProfile: false }); if (!got) { this.fetched.set(url, { ok: false, at }); return; }
      let body: unknown; try { body = JSON.parse(got.body.toString("utf8")); } catch { body = undefined; }
      this.fetched.set(url, { ok: got.ok && body !== undefined, at, body });
    } catch { this.fetched.set(url, { ok: false, at }); }
  }
  get decision(): string | undefined { return this.response?.decision; }
  /**
   * v0.5.0 (§6.12, provisional): the context request the place sent with its answer, if any: data for the owner, never an
   * instruction. Take it home; the owner answers or declines each field (what and why shown) and signs (`ContextResponse`).
   */
  /** Red team phase 1 (§6.12, C267): a context request is brought home only when it matches what the owner signed (the house summary's
   *  context_requirements, read under shokai/0.5); otherwise it is dropped and the report says why. */
  get contextRequest(): S.ContextRequest | undefined { const r = this.response?.context_request; return r && !this.contextRequestRefusal().length ? r : undefined; }
  contextRequestRefusal(): string[] {
    const r = this.response?.context_request; if (!r || !this.summaryRead) return [];
    return ctxProblemsOf(r, this.summaryRead.context_requirements, this.summaryRead.name).filter((x) => x !== "expires_at");
  }
  /** The nonce in the place's last greeting (for possession proofs). */
  get lastHostNonce(): string { return this.hostNonce; }
  get seated(): boolean { return !!this.seat && this.placeCheck.ok; }
  /** Sign an act within the seat without sending it (for the MCP gate's Shokai-Act header). */
  signAct(tool: string, args: Record<string, unknown> = {}): S.Signed<S.Act> {
    if (!this.seat) throw new Error("not seated");
    return this.signed(this.message("act", { seat_id: this.seat.seat_id, tool, arguments: args }));
  }
  /** Send an act to the door and record the door's answer (§7.2). */
  async act(tool: string, args: Record<string, unknown> = {}, opts: { contextResponse?: S.ContextResponse } = {}) {
    if (!this.seat) throw new Error("not seated");
    const stop = this.errandStopped(); if (stop) return errandStopDecision(stop);
    const pre = this.beforeSend(tool, args);
    const spend = this.spendOf(tool, args);
    if (pre) { this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, local: true }); this.logAct(tool, false, spend, true);
      return { type: "act_decision", decision: "deny", refused_by: "representative", by: pre.by, why: pre.why }; }
    let out: any[];
    try { out = await this.send(this.message("act", { seat_id: this.seat.seat_id, tool, arguments: args, ...(this.tag === PROTOCOL ? { idempotency_key: idemKey() } : {}),
      ...(opts.contextResponse && this.tag === PROTOCOL ? { context_response: opts.contextResponse } : {}) })); }
    catch (err) {
      if ((err as { code?: string })?.code === SHOKAI_ERRAND_BUDGET_REACHED) throw err;
      // The place didn't answer (it may be restarting, or asleep). Whether the act happened is unknown: never repeat a spending act
      // blindly; knock again, and check the place's own record (or the report) first.
      this.interrupted = "unreachable"; this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, interrupted: "unreachable" }); this.logAct(tool, false, spend, undefined, true);
      throw Object.assign(new Error(`${tool}: the place didn't answer (${(err as Error)?.message ?? err}); it may be restarting. Whether it was done is unknown; knock again for a new visit, and check before repeating anything that spends.`), { code: SHOKAI_PLACE_UNREACHABLE });
    }
    const r = out.find((x) => x.type === "act_result"); const d = out.find((x) => x.type === "act_decision");
    // §7.2 / §3.6: live seats need not survive a restart; a seat the place no longer knows is not_a_fit / SEAT_SCOPE_EXCEEDED. For a
    // tool this seat did allow, that means the visit was interrupted: start a new visit (the mandate's ledger at the place is kept).
    const gone = !!d && d.disposition === "not_a_fit" && d.reason_code === "SEAT_SCOPE_EXCEEDED" && this.seat.tool_allowlist.includes(tool);
    if (gone) this.interrupted = "seat_gone";
    // §10: at a door, the answer to an offer is an offer_outcome. accepted / kept_for_later = the door took the offer (done);
    // declined / declined_reported = refused. Its code is kept so the report home can say what the door did.
    const o = !r && !d ? out.find((x) => x.type === "offer_outcome") : undefined;
    const ok = r ? !!r.ok : o ? o.outcome === "accepted" || o.outcome === "kept_for_later" : false;
    this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok, args, result: r?.result, decision: d, ...(o ? { offer_outcome: o.outcome as S.OfferOutcomeCode } : {}), ...(gone ? { interrupted: "seat_gone" as const } : {}) });
    this.logAct(tool, ok, spend, undefined, gone ? true : undefined);
    if (r?.ok) this.keepFrom(tool, r.result);
    return r ?? d ?? o;
  }
  /**
   * v0.4.0 (§7.3, C212, C213): a purchase held for the owner's live approval. Allowed only when this representative's Shōkai visitor
   * card disclosed it (`ownerPrompts: "purchase_only"`) and the act spends; anything else is refused here, before anything is sent.
   * The place answers `act_held`; `approve(held)` asks the owner and returns their passkey `approve_purchase` consent over
   * {kind: "act", id: hold_id, digest: act_digest}, or null to decline (nothing is sent: silence is no and the hold lapses).
   */
  async actWithOwner(tool: string, args: Record<string, unknown>, approve: (held: S.ActHeld) => Promise<S.Signed<S.OwnerConsent> | null>,
    o: { /** v0.5.0 (§7.3, C230): take an over-limit hold home as a LimitRequest; the owner answers with a superseding mandate, or null. */
         raiseLimit?: (request: S.LimitRequest, held: S.ActHeld) => Promise<S.SignedMandate | null> } = {}) {
    if (!this.seat) throw new Error("not seated");
    const stop = this.errandStopped(); if (stop) return errandStopDecision(stop);
    const spend = this.spendOf(tool, args); const amt = parseMoney(spend);
    const why = this.rep.card.payload.owner_prompts !== "purchase_only" ? "this representative's Shōkai visitor card didn't tell its owner it may ask them live (owner_prompts)"
      : !amt || amt.units === 0n ? "a live owner prompt is only for a purchase (§7.3)" : null;
    if (why) return { type: "act_decision", decision: "deny", refused_by: "representative", by: "owner_prompts", why };
    // §7.3 (v0.5.0): with raiseLimit, an act that passes only the mandate's amount is sent to be held over the limit (call home at the limit).
    const seatPre = this.outsideSeat(tool); const mp = this.checkMandateLocally ? this.mandateProblem(tool, args) : null;
    const pre = seatPre ? { why: seatPre, by: "seat" as const } : mp && !(mp.kind === "amount" && o.raiseLimit) ? { why: mp.why, by: "mandate" as const } : null;
    if (pre) { this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, local: true }); this.logAct(tool, false, spend, true);
      return { type: "act_decision", decision: "deny", refused_by: "representative", by: pre.by, why: pre.why }; }
    const out = await this.send(this.message("act", { seat_id: this.seat.seat_id, tool, arguments: args, hold_for_owner: true, ...(this.tag === PROTOCOL ? { idempotency_key: idemKey() } : {}) }));
    const held = out.find((x) => x.type === "act_held") as S.ActHeld | undefined;
    if (!held) { const d = out.find((x) => x.type === "act_decision"); this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, decision: d }); this.logAct(tool, false, spend); return d; }
    const declined = (w: string) => { this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, decision: { held, declined_by_owner: true } }); this.logAct(tool, false, spend);
      return { type: "act_decision", decision: "deny", refused_by: "owner", why: w }; };
    let body: Record<string, unknown>; let raised: S.SignedMandate | undefined;
    if (held.over_limit) {
      // The LimitRequest goes home (never to the place; it has no notify_at). Silence or null is no: nothing is sent and the hold lapses.
      // §7.3: LimitRequest.place is the place's verified identifier (its principal DID; a did:web's domain), never a display name.
      const req = limitRequestOf(verifiedPlaceId(this.target?.principal_id ?? this.hostId), held as S.ActHeld & { over_limit: NonNullable<S.ActHeld["over_limit"]> });
      // §7.3 "Checking the figures": before the owner is asked, the place's figures are checked against the owner's signed mandate,
      // this representative's own ledger and the act it sent. On a mismatch the owner is shown nothing to approve; the hold lapses.
      if (o.raiseLimit && this.mandateSent && spend) {
        const seatCap = this.seat.limits?.max_amount; const mc = parseMoney(this.mandateSent.payload.limits?.max_amount), sc = parseMoney(seatCap);
        const seatOnly = !!(mc && sc && sc.currency === mc.currency && sc.units < mc.units);
        const bad = limitRequestProblem(req, { mandate: this.mandateSent, seatLimit: seatCap, current: this.ledgerCurrent(amt!.currency, seatOnly), mandateCurrent: this.ledgerCurrent(amt!.currency, false), actAmount: spend, heldAmount: held.amount });
        if (bad) { this.acts.push({ tool, amount: spend, ok: false, args, decision: { held, limit_mismatch: bad }, limit_mismatch: bad }); this.logAct(tool, false, spend);
          return { type: "act_decision", decision: "deny", refused_by: "representative", by: "limit_request", why: `the place's over-limit figures don't match: ${bad}. The owner was asked nothing; the hold lapses (§7.3)` }; }
      }
      const nm = o.raiseLimit ? await o.raiseLimit(req, held) : null;
      if (!nm) return declined("the owner didn't raise the limit");
      raised = nm; body = { mandate: nm };
    } else {
      if (spend) this.openHolds.set(held.hold_id, { amount: spend, expires_at: held.expires_at });   // reserved at the place until released or lapsed
      const consent = await approve(held);
      if (!consent) return declined("the owner didn't approve the purchase");
      body = { consent };
    }
    const o2 = await this.send(this.message("act_confirmation", { seat_id: this.seat.seat_id, hold_id: held.hold_id, ...body, ...(this.tag === PROTOCOL ? { idempotency_key: idemKey() } : {}) }));
    if (o2.some((x) => x.type === "act_result" || (x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"))) this.openHolds.delete(held.hold_id);
    const r = o2.find((x) => x.type === "act_result"); const d = o2.find((x) => x.type === "act_decision");
    // §7.3 "No standing raise": the errand stays under the seat's mandate; this one act is recorded as approved above its limit.
    const above = raised && r?.ok ? raised.payload.mandate_id : undefined;
    this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: !!r?.ok, args, result: r?.result, decision: d, ...(above ? { approved_above: above } : {}) }); this.logAct(tool, !!r?.ok, spend, undefined, undefined, above);
    if (r?.ok) this.keepFrom(tool, r.result);
    return r ?? d;
  }
  /**
   * v0.5.0 (§12.4, C255): deliver the owner's signed DeletionRequest to this place. The place answers `held` (answer_by within 30
   * days) and later holds a deletion_receipt for the owner and this representative; `pollInbox` brings it home.
   */
  async requestDeletion(req: S.Signed<S.DeletionRequest>) {
    if (this.tag !== PROTOCOL) throw Object.assign(new Error("a deletion_request is a v0.5.0 message: not sent under shokai/0.3"), { code: SHOKAI_NEVER_SENT });
    const out = await this.send(this.message("deletion_request", { request: req }));
    return out.find((x) => x.type === "held") as S.HeldNotice | undefined;
  }
  /**
   * §11.2: poll this place's inbox for messages held for this representative (a deletion_receipt, a closing farewell). Signed
   * messages the place signed are kept for the owner (`brought_back`). `post` sends the poll (default: the Door in this process when
   * the visit was given one, else an HTTP POST to the inbox address the place stated).
   */
  async pollInbox(post?: (url: string, body: unknown) => Promise<unknown>): Promise<any[]> {
    const lb = this.transcript.map((m) => m.message?.payload ?? m.message).find((m) => typeof m?.inbox === "string");
    const url = lb?.inbox ?? this.entry.replace(/\/entry$/, "/inbox");
    const poll = this.signed(this.message("inbox_poll", {}));
    const send = post ?? this.inboxPost ?? (async (u: string, b: unknown) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(DOOR_FETCH_TIMEOUT_MS), redirect: "error" }); return r.json(); });
    const res: any = await send(url, poll); const msgs: any[] = Array.isArray(res?.messages) ? res.messages : Array.isArray(res?.body?.messages) ? res.body.messages : [];
    const kept: any[] = [];
    for (const x of msgs) { const v = verifySigned(x, { expectSigner: this.hostId }); if (!v.ok) continue; kept.push(x.payload); if (this.keepSigned) this.keep(x, { byRepresentative: true }); }
    return kept;
  }
  // ---------------------------------------------------------------- v0.5.0 §7.4–§7.6 (visiting side)
  /** The place's Shōkai host card this visit checked at the door (§2.3), if it showed one. */
  get placeHostCard(): S.SignedCard | undefined { return this.hostCard; }
  /**
   * §7.5: ask the place something (`place.ask`). If the owner's signed setup doesn't answer it, it goes to the owner, and then it
   * must say what it asks for (`asksFor`: plain words, or `{ what, action? }`) and why (`reason`), both the agent's own words,
   * shown to the owner labelled as such (C262). Without them the place refuses it as incomplete (`missing` names what to add) and
   * nothing reaches the owner. A well-behaved agent always gives both.
   */
  async ask(text: string, o: { asksFor?: string | S.AskFor; reason?: string } = {}): Promise<{ status: "answered" | "withheld" | "pending_owner" | "refused"; result?: any; decision?: any; missing?: string[] }> {
    const asks_for = typeof o.asksFor === "string" ? { what: o.asksFor } : o.asksFor;
    const args: S.PlaceAskArguments = { text, ...(asks_for ? { asks_for } : {}), ...(o.reason !== undefined ? { reason: o.reason } : {}) };
    const r: any = await this.act("place.ask", args);
    if (r?.type === "act_result" && r.ok && r.result && typeof r.result.status === "string") return { status: r.result.status, result: r.result };
    const missing = r?.reason_code === "REQUEST_INCOMPLETE" ? ownerAskProblems(args) : [];
    return { status: "refused", decision: r, ...(missing.length ? { missing } : {}) };
  }
  /**
   * §7.5: the owner's answer to an ask that went to them, from this visit's inbox. The message must be signed by the place's
   * representative; an owner decision inside it must be signed by the place's principal (the owner), never the representative.
   */
  async ownerAnswer(ask_ref: string, o: { tries?: number; waitMs?: number } = {}): Promise<{ status: "answered" | "declined" | "no_answer"; text?: string; setup_version: number; owner_signed: boolean; choice?: string } | null> {
    for (let i = 0; i < (o.tries ?? 1); i++) {
      if (i) await new Promise((r) => setTimeout(r, o.waitMs ?? 1000));
      const kept = await this.pollInbox(); const m = [...kept, ...this.inboxSeen].find((x) => x?.type === "ask_answer" && x.ask_ref === ask_ref);
      for (const x of kept) if (x?.type === "ask_answer") this.inboxSeen.push(x);
      if (!m) continue;
      const d = m.decision; const owner = this.target?.principal_id;
      const signed = !!d && !!owner && verifySigned(d, { expectSigner: owner }).ok && d.payload?.ask_ref === ask_ref;
      if (m.status !== "no_answer" && !signed) return { status: "no_answer", setup_version: m.setup_version, owner_signed: false };   // an unsigned "yes" is not the owner's
      return { status: m.status, ...(m.text?.text ? { text: m.text.text } : {}), setup_version: m.setup_version, owner_signed: signed, ...(signed ? { choice: d.payload.choice } : {}) };
    }
    return null;
  }
  private inboxSeen: any[] = [];
  /**
   * §7.6: whether this visit's Shōkai host card is the amended setup that follows `prior` (a host card this representative checked
   * on an earlier visit): the same place and principal, the next version, naming `prior`'s house digest, and listing its changes.
   */
  setupFollows(prior: S.SignedCard): { ok: true; version: number; changes: S.SetupChangeRef[] } | { ok: false; why: string } {
    const c = this.hostCard?.payload; const p = prior?.payload;
    if (!c || !p) return { ok: false, why: "no_host_card" };
    if (!this.placeCheck.ok) return { ok: false, why: "place_not_checked" };
    if (!sameDid(c.principal.principal_id, p.principal.principal_id) || c.place?.entry !== p.place?.entry || (c.place?.site ?? null) !== (p.place?.site ?? null)) return { ok: false, why: "another_place" };
    if (!verifySigned(prior, { expectSigner: p.principal.principal_id }).ok) return { ok: false, why: "prior_unsigned" };
    const s = c.setup; const pv = p.setup?.version ?? 1;
    if (!s) return { ok: false, why: "no_setup_chain" };
    if (s.prev_house_digest !== p.house_digest) return { ok: false, why: "stale" };
    if (s.version !== pv + 1) return { ok: false, why: "version" };
    if (!Array.isArray(s.changes) || !s.changes.length) return { ok: false, why: "no_changes" };
    return { ok: true, version: s.version, changes: s.changes };
  }
  /**
   * §7.4: check a BookingConfirmation the place gave: signed by the representative its listing names, under the Shōkai host card this
   * visit checked (its digest), for this place (principal, entry, and its verified site when there is one), for this representative,
   * and for the booking asked (start, end, party size). Kept in brought_back (§8.2) either way, with verified as checked.
   */
  bookingConfirmation(env: unknown, asked?: { start: string; end?: string; party_size: number }): { ok: true; confirmation: S.BookingConfirmation } | { ok: false; why: string } {
    if (!isEnvelope(env)) return { ok: false, why: "not_signed" };
    const e = env as S.Signed<S.BookingConfirmation>; const c = e.payload; const card = this.hostCard;
    const res = ((): { ok: true; confirmation: S.BookingConfirmation } | { ok: false; why: string } => {
      if (!verifySigned(e, { expectSigner: this.hostId }).ok) return { ok: false, why: "not_signed_by_the_place" };
      if (!card || c.host_card_digest !== card.payload_digest || !sameDid(c.host_representative_id, this.hostId)) return { ok: false, why: "another_host_card" };
      if (!sameDid(c.place?.principal_id ?? "", card.payload.principal.principal_id) || c.place.entry !== card.payload.place?.entry) return { ok: false, why: "another_place" };
      if (this.verifiedSite && c.place.site !== this.verifiedSite) return { ok: false, why: "another_site" };
      if (!sameDid(c.for?.representative_id ?? "", this.rep.id)) return { ok: false, why: "not_for_me" };
      if (asked && !confirmationMatches(c, asked)) return { ok: false, why: "not_what_was_asked" };
      return { ok: true, confirmation: c };
    })();
    const b = this.keep(e, { byRepresentative: true }); if (b && !res.ok) b.verified = false;
    return res;
  }
  /** Set by visit() for a Door in this process. */
  inboxPost?: (url: string, body: unknown) => Promise<unknown>;
  /** v0.5.0 (§5.5, C247): count a step of this errand's effort (model tokens, minutes) against its budget, if the owner set one. */
  effort(step: ErrandStep): void { this.errandMeter?.count(step); }
  /** v0.5.0 (§5.5, C247): the meter of this visit's errand, when the owner set a budget for its mandate. */
  get errandMeter(): ErrandMeter | undefined { const id = this.mandateSent?.payload.mandate_id; return id ? this.rep.errands.get(id) : undefined; }
  /** v0.5.0 (§5.5): the limit that stopped this visit's errand, if one did. Then only a farewell is sent (outcome taken_home). */
  errandStopped(): ErrandLimit | undefined { return this.errandMeter?.stopped(); }
  /**
   * v0.5.0 (§2.3, C248): the place's compact house summary, relied on only when its digest matches the Shōkai host card's
   * summary_digest. `get` fetches <entry>/house-summary.json (default: https only, capped, by the door fetch policy).
   */
  async houseSummary(get?: (url: string) => Promise<unknown>): Promise<{ ok: true; summary: S.HouseSummary } | { ok: false; why: string }> {
    const card = this.hostCard?.payload; if (!card) return { ok: false, why: "the place hasn't shown its card" };
    if (!card.summary_digest) return { ok: false, why: "the place's host card names no summary_digest" };
    const url = this.entry.replace(/\/$/, "") + "/house-summary.json";
    // The address is the entry's own origin, which this visit already talks to: it is fetched as the entry is (http on loopback
    // included, for local doors), capped, with no redirects. Anything else goes through the door fetch policy.
    const fetchIt = get ?? (async (u: string) => { if (new URL(u).origin !== new URL(this.entry).origin && !doorMayFetch(u, false)) throw new Error("not fetched (door fetch policy)");
      const r = await fetch(u, { signal: AbortSignal.timeout(DOOR_FETCH_TIMEOUT_MS), redirect: "error" }); const buf = await readCapped(r); if (!r.ok || !buf) throw new Error(`HTTP ${r.status}`);
      return JSON.parse(buf.toString("utf8")); });
    let body: unknown; try { body = await fetchIt(url); } catch (e) { return { ok: false, why: `the summary couldn't be fetched (${(e as Error).message})` }; }
    return summaryMatches(card, body) ? { ok: true, summary: body as S.HouseSummary } : { ok: false, why: "the served summary doesn't match the host card's summary_digest" };
  }
  /** Record an act performed elsewhere (e.g. through the MCP gate) so the report home includes it. */
  recordAct(tool: string, ok: boolean, args: Record<string, unknown> = {}, local?: true) {
    const spend = this.spendOf(tool, args);
    this.acts.push({ tool, ok, args, ...(spend ? { amount: spend } : {}), ...(local ? { local } : {}) });
    this.logAct(tool, ok, spend, local);
  }
  async farewell(outcome?: "completed" | "withdrawn" | "taken_home") {
    // §5.5: a farewell after the errand budget stopped the errand says the errand was taken home, unless the caller says otherwise.
    outcome ??= this.errandStopped() ? "taken_home" : "completed";
    return this.send(this.message("farewell", { outcome, courtesy: { locale: "en-US", locale_match: "exact", register: "first_meeting", text: "Thank you." } }));
  }
  /** The visit report home, rendered from machine fields only, in the owner's locale and IANA time zone (§8.2). */
  report(locale = "en-US", opts: ReportOptions = {}): S.VisitReport { return visitReport(this, locale, opts); }
}

export type ReportOptions = {
  /** The owner's IANA time zone, e.g. "America/Los_Angeles" (§8.2, D10). Default: this machine's zone. */
  timeZone?: string;
  /** What brought_back carries for each signed object: the envelope itself (default) or only a reference (its payload_digest). */
  broughtBack?: "envelope" | "reference";
};
/** A signed object received in a visit and kept for the owner (§8.2, C178). */
export type BroughtBack = NonNullable<S.VisitReport["brought_back"]>[number];
function isEnvelope(x: any): x is S.Signed<unknown> {
  return !!x && typeof x === "object" && "payload" in x && typeof x.payload_digest === "string" && Array.isArray(x.signatures) && x.signatures.length > 0 && typeof x.signatures[0]?.signer === "string";
}
/** Signed envelopes inside a value (depth-limited), with the `again` flag of the object that holds each; JSON text blocks are parsed. */
function findEnvelopes(x: unknown, depth = 0, again?: boolean): { envelope: S.Signed<unknown>; again?: boolean }[] {
  if (depth > 6 || x === null || x === undefined) return [];
  if (typeof x === "string") { const t = x.trim(); if (depth > 3 || !t.startsWith("{") || t.length > 200_000) return []; try { return findEnvelopes(JSON.parse(t), depth + 1, again); } catch { return []; } }
  if (typeof x !== "object") return [];
  if (isEnvelope(x)) return [{ envelope: x, ...(again ? { again } : {}) }];
  const o: any = x; const ag = typeof o.again === "boolean" ? o.again : again;
  const kids = Array.isArray(o) ? o : Object.entries(o).filter(([k]) => !(k === "data" && o.type === "image")).map(([, v]) => v);
  return kids.flatMap((k: unknown) => findEnvelopes(k, depth + 1, ag));
}
const money = (m: S.Money) => `${m.value} ${m.currency}`;
/** Sum of the amounts of the acts that went through, per currency, as exact decimal strings (D10: never floating point). */
function spentOf(acts: { amount?: S.Money; ok: boolean }[]): S.Money[] {
  const by = new Map<string, { units: bigint; scale: number }>();
  for (const a of acts) {
    if (!a.ok || !a.amount || typeof a.amount.value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(a.amount.value)) continue;
    const [i, f = ""] = a.amount.value.split("."); const cur = by.get(a.amount.currency) ?? { units: 0n, scale: 0 };
    const scale = Math.max(cur.scale, f.length); const up = (u: bigint, from: number) => u * 10n ** BigInt(scale - from);
    by.set(a.amount.currency, { units: up(cur.units, cur.scale) + up(BigInt(i + f), f.length), scale });
  }
  return [...by].map(([currency, { units, scale }]) => {
    const str = units.toString().padStart(scale + 1, "0");
    return { value: scale ? `${str.slice(0, -scale)}.${str.slice(-scale)}` : str, currency };
  });
}
const when = (iso: string, locale: string, timeZone?: string) => {
  try { return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso)); }
  catch { return iso; }
};
const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? "") : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * Build the VisitReport a representative sends its owner after a visit (§8.2), from machine fields only: the decision, the seat
 * and its limits, the acts and their amounts, what was shared (the card, the mandate, each act's arguments), the data asks the
 * place declared for the seated actions, and what happens if the owner says nothing. Host text is quoted as untrusted.
 */
/**
 * How a report names a place (§8.2, §3.1 C104): by the identifier the visit verified (its principal DID: a did:web's domain, or a
 * short key), and its display name only as the place's own unverified claim. A did:key door can call itself anything.
 */
/** v0.5.0 (§7.3): the place's verified identifier for owner-facing records (LimitRequest.place): a did:web's domain, else its DID. */
export function verifiedPlaceId(principalId: string): string {
  return principalId.startsWith("did:web:") ? decodeURIComponent(principalId.slice(8).split(":")[0]) : principalId;
}
/**
 * v0.5.0 (§8.2 "After a one-purchase raise", C176, C230): what was spent, worded so a total that includes purchases the owner
 * approved above the limit never reads as spending above what they allowed. Null when no act was approved above it.
 */
export function spentAboveText(acts: { amount?: S.Money; ok: boolean; approved_above?: string }[], cap: S.Money | undefined): string | null {
  const above = acts.filter((a) => a.ok && a.approved_above && a.amount); if (!above.length || !cap) return null;
  const total = spentOf(acts.filter((a) => a.ok)); const within = spentOf(acts.filter((a) => a.ok && !a.approved_above));
  const t = total.find((m) => m.currency === cap.currency); if (!t) return null;
  const w = within.find((m) => m.currency === cap.currency) ?? { value: "0", currency: cap.currency };
  const what = above.length === 1 ? `one purchase of ${money(above[0].amount!)} that you approved above it` : `${above.length} purchases (${list(above.map((a) => money(a.amount!)))}) that you approved above it, one at a time`;
  return `Spent ${money(t)}: ${money(w)} within your ${money(cap)} limit, and ${what}.`;
}
/** v0.5.0 (§3.1.1): each site-binding failure in plain words, for the owner. */
const SITE_WORDS: Record<Exclude<SiteCheck, { ok: true }>["why"], (host: string) => string> = {
  not_the_sites_file: (h) => `I couldn't read ${h}'s own door file from ${h} itself`, site_unreachable: (h) => `${h}'s own site couldn't be read`,
  no_site_on_card: () => "its Shōkai host card names no website", card_names_another_site: () => "its Shōkai host card names another website",
  not_listed_by_site: (h) => `${h}'s own site doesn't list this door`, entry_mismatch: (h) => `${h}'s own site doesn't list this door`,
  principal_not_named: (h) => `${h}'s own site doesn't name this door's owner`, principal_mismatch: (h) => `${h}'s own site names another owner for this door`,
  no_site_named: () => "no website was named" };
/** v0.5.0 (§3.1.1): a door verified against its site is named by the site's host, with its display name as its own words. */
export function sitePlaceLabel(site: string, displayName: string | undefined): string {
  const h = siteHost(site); displayName = displayName === undefined ? undefined : stripInvisible(displayName); return displayName ? `${h} ("${displayName}", its door verified against ${h})` : `${h} (its door verified against ${h})`;
}
export function placeLabel(principalId: string | undefined, displayName: string | undefined, verified: boolean): string {
  const id = !principalId ? undefined : principalId.startsWith("did:web:") ? decodeURIComponent(principalId.slice(8).split(":")[0])
    : `the place with key …${principalId.split("#")[0].slice(-8)}`;
  const shown = displayName === undefined ? undefined : stripInvisible(displayName); const name = shown ? `"${shown}"` : undefined;
  if (id && verified) return name ? `${id} (claims to be ${name}; not verified)` : id;
  return name ? `a place that claims to be ${name} (not verified)` : "an unverified place";
}
export function visitReport(v: Visit, locale = "en-US", opts: ReportOptions = {}): S.VisitReport {
  const r = v.response ?? {}; const owner = v.rep.owner.id;
  const host = v.verifiedSite ? sitePlaceLabel(v.verifiedSite, v.hostName) : placeLabel(v.target?.principal_id, v.hostName, v.placeCheck.ok && !v.placeCheck.unchecked); const at = nowIso(); const reportId = randomId("rep");
  const tz = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const outcome: S.VisitReport["outcome"] = { ...(r.decision ? { decision: r.decision } : {}), ...(r.disposition ? { disposition: r.disposition } : {}), ...(r.retry ? { retry: r.retry } : {}),
    ...(r.conditions ? { conditions: r.conditions } : {}), ...(r.consideration_ref ? { consideration_ref: r.consideration_ref } : {}), ...(r.response_by ? { response_by: r.response_by } : {}) };
  const okActs = v.acts.filter((a) => a.ok).length; const cut = v.acts.filter((a) => a.interrupted).length; const refused = v.acts.length - okActs - cut;
  // §8.2 (C176): the report covers every visit and act under this visit's mandate, not only this visit.
  const entry = v.ledgerEntry; const totals = entry ? mandateTotals(entry) : undefined;
  const earlier = entry ? entry.visits.filter((x) => x.encounter_id !== v.encounterId) : [];
  const spent = spentOf(v.acts); const L = v.seat?.limits; const cap = L?.max_amount;
  const mcap = entry?.mandate.payload.limits?.max_amount;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const mandateText = !entry || !earlier.length ? "" : ` This was visit ${earlier.length + 1} under the mandate you signed. Earlier: ${list(earlier.map((x) => {
      const ok = x.acts.filter((a) => a.ok); const sp = spentOf(ok);
      return `${x.place_id && x.place_id === v.target?.principal_id ? "here" : `at ${x.place}`}, ${n(ok.length, "action")} done${x.acts.length - ok.length ? `, ${x.acts.length - ok.length} refused` : ""}${sp.length ? `, ${list(sp.map(money))} spent` : ""}`; }))}. `
    + `In all under this mandate: ${n(totals!.acts_done, "action")} done, ${totals!.acts_refused} refused; `
    + (spentAboveText(entry!.visits.flatMap((x) => x.acts), mcap)?.replace(/^Spent/, "spent")
      ?? `spent ${totals!.spent.length ? list(totals!.spent.map(money)) : "nothing"}${mcap ? ` of the ${money(mcap)} allowed, ${money(totals!.remaining!.amount!)} left` : ""}.`);
  const raisedText = mandateText ? null : spentAboveText(v.acts, mcap ?? cap);
  const spentText = mandateText ? "" : raisedText ? raisedText : spent.length ? `Spent ${list(spent.map(money))}${cap && spent.length === 1 && spent[0].currency === cap.currency ? ` of the ${money(cap)} allowed` : ""}.`
    : v.seat && cap ? `Spent nothing of the ${money(cap)} allowed.` : "";
  const limitBits = [cap ? `up to ${money(cap)}${L?.max_amount_scope === "per_operation" ? " per action" : ""}` : "no spending",
    ...(L?.max_operations !== undefined ? [`at most ${L.max_operations} action${L.max_operations === 1 ? "" : "s"}`] : []),
    ...(L?.max_session_s !== undefined ? [`for ${Math.round(L.max_session_s / 60)} minutes`] : [])];
  const seatActions = v.seat?.tool_allowlist ?? [];
  // §8.2 (C178): what the representative brought back, from its own record (kind and label only when they are plain tokens).
  const bb = v.broughtBack; const bbText = !bb.length ? "" : ` I brought back ${list(bb.map((b) => `a signed ${b.kind === "signed object" ? "object" : `"${b.kind}"`}${b.label ? ` (${b.label})` : ""}`
    + `${b.again ? ", given again (the one from before)" : ""}${b.verified ? ", checked against the place's listed principal" : ", which did NOT verify against the place's listed principal, so don't rely on it"}`))}.`;
  // §10: what the door did with each offer, from its signed offer_outcome codes.
  const OW: Record<string, string> = { accepted: "accepted it", kept_for_later: "kept it for later", declined: "declined it", declined_reported: "declined it and reported it" };
  const offers = v.acts.filter((a) => a.offer_outcome);
  const offerText = !offers.length ? "" : ` ${list(offers.map((a) => {
    const item = (a.args?.offer as { item?: unknown } | undefined)?.item; const it = typeof item === "string" && /^[\p{L}\p{N} .,'&()-]{1,80}$/u.test(item) ? `"${item}"` : "an offer";
    return `${offers.indexOf(a) === 0 ? "The door" : "the door"} ${OW[a.offer_outcome!] ?? a.offer_outcome} (${it})`; }))}.`;
  const nU = v.acts.filter((a) => a.interrupted === "unreachable").length, nG = v.acts.filter((a) => a.interrupted === "seat_gone").length;
  const acts_ = (k: number) => `${k === 1 ? "One action" : `${k} actions`}`;
  const interruptedText = !v.interrupted ? "" : `${nG ? ` ${acts_(nG)} ${nG === 1 ? "wasn't" : "weren't"} carried out: the place no longer knew my seat (probably a restart).` : ""}`
    + `${nU ? ` ${acts_(nU)} got no answer (the place may have been restarting), so I can't tell whether ${nU === 1 ? "it" : "they"} went through.` : ""}`
    + " The visit was interrupted. I'll knock again for a new visit, and won't repeat a purchase until I've checked; what was spent under your mandate still counts.";
  // §3.3 (clarification, 2026-10-28): what the place asks the owner is the place's own text, so it is quoted and attributed to the
  // place's key, never said in the representative's voice; its setup link is shown by origin and never opened by the representative.
  const clean = (t: unknown) => typeof t === "string" ? stripInvisible(t).replace(/[\u0000-\u001f\u007f\u2028\u2029"“”]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const asked = ((v as any).readiness as S.ReadinessRequirement[] | undefined ?? []).map((x) => clean(x.owner_text?.text)).filter(Boolean);
  const ob = v.onboardingUrl ? (() => { try { const u = new URL(v.onboardingUrl!); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } })() : null;
  // v0.5.0 (§6.12): a context request is the place's own words, quoted with each field's what and why, for the owner to answer or decline.
  const cqBad = v.contextRequestRefusal(); const cq = v.contextRequest; const ctxText = cqBad.length ? ` It asked for more about you than its signed house rules declare (${cqBad.slice(0, 3).join(", ")}), so I didn't bring that request home.` : !cq || !Array.isArray(cq.fields) ? "" : ` It asked for a little more about you before ${r.decision === "grant" ? "going on" : "letting me in"} (its own words, quoted; I didn't answer anything): `
    + cq.fields.slice(0, 12).map((f) => `"${clean(f?.what)}" (why: "${clean(f?.why)}")${f?.required ? ", required" : ""}`).join("; ") + `. It keeps answers ${cq.retention_days ? `for ${cq.retention_days} days` : "only for the visit"}. You can answer or decline each one.`;
  const placeAskedText = ctxText + (asked.length ? ` It asked you, in its own words as its key signed them (quoted, not checked by me): ${asked.map((t) => `"${t}"`).join(" ")}.` : "")
    + (ob ? ` It points to a setup page at ${ob}. I won't open it; open it yourself only if you trust ${ob}.` : "");
  let text: string;
  const siteNo = v.placeCheck.site && !v.placeCheck.site.ok && !v.placeCheck.ok;
  if (siteNo) text = `I didn't go in: ${v.placeCheck.why}. It may be a lookalike${v.hostName ? ` (it calls itself "${v.hostName}", which is only its own claim)` : ""}. Nothing was asked for and nothing was done.`;
  else if (!v.placeCheck.ok && !v.placeCheck.unchecked) text = `I didn't go in: ${host} didn't match its listing (${v.placeCheck.why}). Nothing was asked for and nothing was done.`;
  else if (v.withdrew) text = `I didn't ask ${host} for anything: ${v.withdrew}. I said goodbye and left; nothing was done.`;
  else if (r.decision === "grant") text = `${host} admitted me with a pass for ${list(seatActions.map((a) => `"${a}"`))}, ${list(limitBits)}. `
    + `I did ${okActs} action${okActs === 1 ? "" : "s"}${refused ? `; ${refused} ${refused === 1 ? "was" : "were"} refused` : "; none were refused"}. ${spentText}`.trim() + offerText + mandateText + bbText + interruptedText + ctxText;
  else if (r.decision === "deny") text = `${host} didn't seat me (${r.disposition}${r.reason_code ? ", " + r.reason_code : ""})${r.retry?.kind === "after" && r.retry?.not_before ? `; I may try again after ${when(r.retry.not_before, locale, tz)}` : r.retry?.kind === "with_credential" ? `; it would need: ${list(r.retry.credentials ?? [])}` : r.retry?.kind === "never" ? "; I won't try again" : ""}. Nothing was done.` + placeAskedText;
  else if (r.decision === "conditional") text = `${host} would seat me only if conditions are met; nothing was done.`;
  else if (r.decision === "considering") text = `${host} is considering the request${r.response_by ? ` and will answer by ${when(r.response_by, locale, tz)}` : ""}; nothing happens until it answers, and no answer by then means no.`;
  else text = `No decision from ${host}; nothing was done.`;
  // v0.5.0 (§11.1 "No downgrade", C254): a visit under shokai/0.3 says what it didn't have.
  // v0.5.0 (§7.3 "Checking the figures"): an over-limit hold whose figures didn't match was never put to the owner.
  const mism = v.acts.filter((a) => a.limit_mismatch).length;
  if (mism) text += ` ${mism === 1 ? "A purchase above your limit was" : `${mism} purchases above your limit were`} held, but the place's figures didn't match what you signed and what I counted, so I didn't ask you to approve ${mism === 1 ? "it" : "them"} and let the hold lapse.`;
  // v0.5.0 (§5.5, C247): what the errand used against the owner's budget, and the limit that stopped it.
  const meter = entry ? v.rep.errands.get(entry.mandate_id) : undefined; const errandUsed = meter?.usage();
  if (errandUsed?.stopped_by) text += ` I stopped when the next step would have passed your errand budget's ${LIMIT_WORDS[errandUsed.stopped_by]}, and brought the errand home with what it has.`;
  if (v.tag === LEGACY_TAG && v.decision) text += " This visit used the older shokai/0.3 protocol, so v0.5.0's protections (the over-limit hold, idempotent repeats, the house summary, named outside classifiers) didn't apply.";
  text = text.charAt(0).toUpperCase() + text.slice(1);   // a sentence can start with "the place with key …"
  // What the owner's side disclosed: the card (always), the mandate (when a request was sent) and each act's arguments.
  const cp = v.rep.card.payload; const sentRequest = v.transcript.some((m) => (m.message?.payload ?? m.message)?.type === "invitation_request");
  const shared: NonNullable<S.VisitReport["shared"]> = [];
  if (v.transcript.some((m) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "card_presentation")) shared.push({ via: "card", items: [
    { field: "owner_display_name", value: cp.principal.display_name }, { field: "owner_id", value: cp.principal.principal_id }, { field: "role", value: cp.role },
    { field: "representative_id", value: cp.representative_id }, { field: "card_scope", value: `${cp.mandate_scope.purposes.join(", ")}: ${cp.mandate_scope.actions.join(", ")}` }] });
  if (sentRequest && v.mandateSent) { const m = v.mandateSent.payload; shared.push({ via: "mandate", items: [
    { field: "purpose", value: m.purpose.code }, { field: "allowed_actions", value: m.allowed_actions.join(", ") },
    ...(m.limits?.max_amount ? [{ field: "max_amount", value: money(m.limits.max_amount) }] : []), { field: "expires_at", value: m.expires_at }] }); }
  for (const a of v.acts) if (a.args && Object.keys(a.args).length) shared.push({ via: "act", tool: a.tool, items: Object.entries(a.args).map(([field, val]) => ({ field, value: typeof val === "string" ? val : JSON.stringify(val) })) });
  const declared = (v.target?.actions ?? []).filter((a) => seatActions.includes(a.action));
  const asks = [...new Set(declared.flatMap((a) => a.data_asks ?? []))];
  const asksText = !v.seat ? "" : declared.length ? (asks.length ? ` For these actions the place said it would ask you for: ${list(asks)}.` : " Its listing said these actions ask you for nothing beyond the card.") : "";
  const nextText = !v.placeCheck.ok && !v.placeCheck.unchecked ? "Nothing is waiting for you. I won't go back to this address unless you tell me to."
    : r.decision === "grant" ? "Nothing is waiting for your approval. If you'd like me to go back or do more, tell me; I won't act until you do."
    : r.decision === "considering" ? "Nothing to do now. I'll tell you when the place answers."
    : "Review what the place asked for; I won't try again until you say so.";
  const under_mandate: S.VisitReport["under_mandate"] = entry && totals ? { mandate_id: entry.mandate_id, purpose: entry.mandate.payload.purpose.code,
    limits: entry.mandate.payload.limits ?? {}, expires_at: entry.mandate.payload.expires_at,
    visits: entry.visits.map((x) => ({ ...x, acts: x.acts.map(({ local: _l, ...a }) => a) })), ...totals } : undefined;
  // Mark the visits this report covers, so a later report can say which reports already did (§8.2, C176).
  if (entry) { for (const x of entry.visits) x.reported_in = [...(x.reported_in ?? []), reportId]; v.rep.ledger.put(entry); }
  return { report_id: reportId, representative_id: v.rep.id, owner_id: owner, host: { display_name: host, ...(v.target?.principal_id ? { principal_id: v.target.principal_id } : {}) }, visited_at: at, outcome,
    outcome_rendered: { text: stripInvisible(text), locale }, ...(errandUsed ? { errand_used: errandUsed } : {}),
    voice: { text: `On ${when(at, locale, tz)} I visited ${host} for you. ${text} I showed them the card you signed (your display name "${cp.principal.display_name}" and your owner ID)${sentRequest ? " and one mandate" : ""}.${asksText} If you don't reply, nothing happens.`, locale },
    ...(v.seat ? { seat: { actions: v.seat.tool_allowlist, ...(v.seat.limits ? { limits: v.seat.limits } : {}) } } : {}),
    acts: v.acts.map((a) => ({ tool: a.tool, ...(a.amount ? { amount: a.amount } : {}), ok: a.ok })), ...(spent.length ? { spent } : {}), shared, ...(under_mandate ? { under_mandate } : {}),
    ...(bb.length ? { brought_back: bb.map(({ envelope, ...b }) => (opts.broughtBack === "reference" ? b : { ...b, envelope })) } : {}),
    host_said: ((v as any).hostSaid as { text: string; locale: string; untrusted: true }[]).map((h) => ({ ...h, text: stripInvisible(h.text) })), taken_home: [], offers_declined: [],
    ...((v as any).readiness ? { readiness_requirements: (v as any).readiness } : {}),
    next_step: { text: nextText, requires_owner_approval: true, if_no_reply: "nothing_happens" } };
}

export { possessionPayload, randomId };
// v0.4.0 drop-in door: the leaflet template, stores and events.
export { LEAFLET_TEMPLATE, LEAFLET_TITLE, LEAFLET_SHARED, leaflet, leafletHtml, leafletProblems, type LeafletInput, type Leaflet } from "./leaflet.js";
export { memoryStore, fileStore, kvStore, type DoorStore, type StoredState, type DoorState, type DoorEvent } from "./store.js";
export { discover, doorBase, shokaiLinks, shokaiLinkTag, siteOrigin, bindToSite, checkSite, siteHost, WELL_KNOWN_PATH, APP_PROXY_PATH, MAX_DISCOVERY_BYTES, MAX_SHOKAI_LINKS, type Discovery, type SiteBinding, type SiteBindingFailure, type SiteCheck } from "./discover.js";
export { shokaiDoor, nextDoor, ShokaiRawBodyError, ShokaiPayloadTooLargeError, MAX_ADAPTER_BODY } from "./adapters.js";
export { ShokaiInvalidUtf8Error } from "./bounded-read.js";
export { HOUSE_FORMAT, checkHouse, houseToDoorOptions, previewHouse, hostCardRequest, fillHostCardItem, signHostCardForDevelopment, type House, type HouseAction, type HouseProblem } from "./house.js";

/** §7.7 (C274): the caps a door runs with: the defaults, lowered freely, raised only with `raise: true`. */
export function costlyCapsOf(o: DoorOptions["costlyActionCaps"]): { per_seat: number; per_owner_day: number } {
  const out = { per_seat: o?.per_seat ?? COSTLY_ACTION_CAPS.per_seat, per_owner_day: o?.per_owner_day ?? COSTLY_ACTION_CAPS.per_owner_day };
  for (const k of ["per_seat", "per_owner_day"] as const) {
    if (!Number.isInteger(out[k]) || out[k] < 0) throw Object.assign(new Error(`SHOKAI_COSTLY_CAPS_INVALID: costlyActionCaps.${k} must be a whole number of 0 or more (§7.7)`), { code: "SHOKAI_COSTLY_CAPS_INVALID" });
    if (out[k] > COSTLY_ACTION_CAPS[k] && o?.raise !== true) throw Object.assign(new Error(`SHOKAI_COSTLY_CAPS_INVALID: costlyActionCaps.${k} ${out[k]} is above the default ${COSTLY_ACTION_CAPS[k]}; raise it only explicitly, with raise: true (§7.7)`), { code: "SHOKAI_COSTLY_CAPS_INVALID" });
  }
  return out;
}
/** v0.5.0 (§5.2, C286): the host's own cap on spending drawn from an allowance grant, per period window and per seat. */
export { AllowanceLedger, type AllowanceRef, type GrantSpendUnits as GrantSpend, type CapVerdict } from "./core/ext050.js";
export { toCents, AllowanceLedger as DecimalAllowanceLedger } from "./allowance-cap.js";
/** v0.5.0 (Conventions, C289): must-understand members (`crit`) and fail-closed reading of unknown enum values. */
export { checkCritical, readDecision, readDisposition, readReasonCode, readRetryKind, actOnType, RESTRICTIVE_MEMBERS, KNOWN_DECISIONS, KNOWN_DISPOSITIONS, KNOWN_RETRY_KINDS, type CritVerdict } from "./critical.js";
