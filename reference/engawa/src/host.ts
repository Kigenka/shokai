// Clean-room host gatekeeper for Shōkai v0.2.3 (SPEC §§2–6, 8, 9, 13). Handles one place.
import type * as S from "./shapes.js";
import { digestOf, makeSigned, makeOwnerSigned, isTimestamp, SKEW_S, randomId, type PasskeyOwner, sha256, b64u, parseMoney, moneyOf, resolveDid, badTimestamps, badHeaderTimestamps, isExpired, notYetValid, sameDid, canonDid, type Ed25519Signer, type Amt } from "./crypto.js";
import { RealVerifier, PlaceholderVerifier, type Verifier, possessionPayload } from "./verify.js";
import { gate, addDays, addSec, needsNamedIntroducer, openOnlyVouch, createsAccount, sessionCapOf, bookingLimitsOk, bookingProblem, type GateResult, type VouchWeight, type Approval, type GateCtx } from "./gate.js";
import type { PlaceConfig } from "./policy.js";
import { pickLocaleMatch, t, lobbyText, renderDate, readiness } from "./i18n.js";
import { GatheringPlace, REQUEST_INVITATION_ACTION } from "./place.js";
const minIso = (a: string, b: string) => (Date.parse(a) <= Date.parse(b) ? a : b);
/** valid_from − 300 s ≤ now ≤ expires_at + 300 s (§2.2 skew). */
const inWindowSkew = (now: string, from: string, to: string) => !notYetValid(from, now) && !isExpired(to, now);
import { Door, DOOR_SIGNAL_CODES, SIGNALS_TO_REDUCED, DOOR_ACTIONS, KIND_OF, verifyDoorPolicy, reasonCategory, ownNameClaim, type Admission } from "./inbound.js";
import { verifyAllowance, verifyPeerInvitation, verifyOwnerConsent, verifyOwnerLink, type FetchCache, vouchLogState, cardKindOf, houseDigest, checkHostCardFields,
  forbiddenMembers, CREDENTIAL_MEMBERS, INSTRUMENT_MEMBERS, verifyCustomerLink } from "./trust.js";

type Msg = Record<string, any>;
export type Enc = {
  /** R3-11 (§2.2, C146): the signed greeting this encounter opened with, and the reply it got, so a byte-identical resend is answered the same way. */
  greetDigest?: string; greetReply?: Msg;
  id: string; visitor: string; step: number; hostNonce: string; visitorNonce: string; locales: string[]; timeZone?: string; register: S.EtiquetteRegister;
  /** v0.5.0: the host ended the seat (door.endSeat) and has said its farewell. */
  seatEnded?: boolean;
  /** Red team phase 1 (§3.4, C266, provisional): when the visiting representative last sent a message in this encounter. */
  lastAt?: string;
  lobby: boolean; closed: boolean; hostFarewell: boolean; visitorFarewell: boolean; responded: boolean; greeted: boolean;
  card?: S.RepresentativeCard; cardDigest?: string; verified: boolean; continuityKey?: string;
  vouch?: S.Vouch; vouchDigest?: string; vouchOk?: boolean; vouchWeight?: VouchWeight; invitationRef?: { invitation_id: string; digest: string }; vouchLogUnreachable?: boolean;
  invitationId?: string; invitationReps?: string[]; neverClosed?: boolean;
  lastDecision?: string; lastResponseId?: string; seq: number; receiptId?: string;
  /** v0.2.9 (§10): the door's admission for this visit. */ doorAdmit?: Extract<Admission, { decision: "admit" }>;
  /** v0.2.9 (§10): the kind reason category for a door admission refusal (only if the owner's setting allows). */ doorReason?: S.DoorReasonCategory;
  /** v0.5.0 (§11.1): the wire tag the visitor last spoke in this encounter (messages the place sends later use it). */ tag?: S.ProtocolVersion;
  /** v0.5.0 (§4.1, C245): a claimed Shōkai introduction card (its digest, the claim's digest), or every claim bound to others. */
  introCard?: { digest: string; claimDigest: string }; introUsedUp?: boolean;
  /** C272: this encounter's claim challenge (from its card_receipt). */ claimChallenge?: { challenge: string; expires_at: string; used?: boolean };
  /** §4.1 (C296): a claim in this encounter was refused unchecked during the guesser's backoff; the backoff's end (answered not_now at step 5). */ claimBackoffUntil?: string;
  /** v0.5.0 (§3.5, C239): messages answered in this encounter. */ answered?: number;
};
type SeatState = { seat: S.SeatGrant; rep: string; principal: string; encounter_id: string; ops: number; spent: bigint; byRef: Record<string, bigint>;
  vouch?: S.Vouch; cardDigest: string; unseated?: boolean; /** C287: the trusted client address the seat was granted to. */ source?: string; doorKinds?: string[];
  /** v0.3.0-rc4 (§2.6, C198): the card the seat was granted under, so revoking that card ends the seat. */ cardId?: string;
  /** Red team phase 1 (§2.6, C265, provisional): the card's revocation_url, re-read while the seat is open. */ revUrl?: string;
  /** v0.5.0 (§5.2, C286): the allowance grant this seat spends under, counted in the place's own ledger. */ allow?: AllowanceRef;
  /** v0.3.0-rc2 (§5.1, C175): the mandate this seat was granted under, `${principal}|${mandate_id}`, and its own limits. */ mkey?: string; mlimits?: S.Limits;
  /** v0.4.0 (§5.4): the customer link this seat was granted under. */ linkId?: string;
  /** v0.4.0 (§7.3): the visitor card's disclosed owner_prompts. */ ownerPrompts?: "purchase_only" | "never"; ownerId?: string;
  /** v0.5.0 (§5.1, C230): the mandate the seat is under now (a superseding mandate replaces it) and its digest. */ mandate?: S.Mandate; mandateDigest?: string;
  /** v0.5.0 (§7.3, C232): holds made and purchases released in this seat. */ holdsMade?: number; released?: number;
  /** v0.5.0 (§6.9, C243, C244): what met each action's trust requirement (for grant caps; a revoked receipt ends the seat). */ trust?: { receipts: string[]; introducer?: string };
  /** v0.5.0 (§7.5): what the owner review shows about the visitor (from its verified card): its owner's name (a claim) and the card's scope. */
  visitor?: { display_name: string; scope: { purposes: S.PurposeCode[]; actions: string[] }; purpose?: S.PurposeCode } };
/** v0.4.0 (§7.3): a purchase held while the visitor's representative asks its owner live. */
type Hold = { hold_id: string; act: Msg; act_digest: string; seat_id: string; expires_at: string; admittedKey: string; done?: boolean;
  /** v0.5.0 (§7.3, C231): the grace this hold is judged with (0 for a hold made under shokai/0.3: the v0.4.0 rule). */ grace_s?: number;
  /** v0.5.0 (§7.3, C230): held over the limit; released only by a superseding mandate. */ over_limit?: NonNullable<S.ActHeld["over_limit"]>;
  /** v0.5.0 (§7.2, C233): the released answer, for repeats with its idempotency key. */ released?: boolean };
/** v0.3.0-rc2 (§5.1, C175): what has been done under one mandate, across every seat granted under it. */
type MandateUse = { ops: number; spent: bigint; currency?: string; seats: string[]; /** v0.4.0: the mandate's expires_at (pruning) */ expires_at?: string };
type Consideration = { ref: string; principal: string; rep: string; relationship_ref: string; mandate: S.Mandate; actions: string[]; routed_to: S.ConsiderationRoute;
  response_by: string; request_msg: string; considering_msg: string; considering_digest: string; encounter_id: string; resolved?: boolean; prose?: { text: string; locale: string } };
type Penalty = S.IntroducerPenalty & { from: string; days: number; vouch_id?: string };
/** message is Signed<msg> (real) or bare (placeholder / trace mode). `held` = late delivery: kept for the recipient's inbox (§11.2), not in the reply. */
export type Out = { to: string; message: any; held?: boolean };

const short = (s: string) => b64u(sha256(s)).slice(0, 10);
/** Prose that tries to steer the gate or to make us prompt our owner now (§6.5, §1 loyalty): a local signal only. */
const INJECTION = /system\s+override|ignore (all|any|previous|prior) (instructions|rules)|you are now|developer mode|(ask|prompt|wake|ping) your (owner|principal|human) (now|right now|immediately)/i;
const REQUIRED_CRED: Record<string, S.CredentialKind> = { card: "signed_card", owner_binding: "owner_binding", purpose: "signed_mandate", introduction: "vouch", claim_evidence: "claim_evidence",
  possession_proof: "possession_proof", owner_consent: "owner_consent", card_kind: "signed_card", customer_link: "customer_link" };
export { SPEC_REF } from "./version.js";   // §3.1: the version this place implements (v0.3.0-rc1)
import { SPEC_REF, PROTOCOL, LEGACY_TAG } from "./version.js";
import * as V5 from "./v050.js";
import { AllowanceLedger, critProblem, type AllowanceRef, type AllowanceLedgerState } from "./ext050.js";
/** Red team phase 1 (§2.6, C265, provisional): an open seat's card revocation list is re-read at least this often (seconds); older → fail closed. */
export const REVOCATION_RECHECK_S = 300;
/** Red team phase 1 (§3.4, C266, provisional): a live encounter with no seat and no message for this long is no longer live (seconds). */
export const ENCOUNTER_IDLE_S = 120;
/** Red team phase 1 (§6.12, C267, provisional): a context field the owner declined isn't asked again for this many days. */
export const CONTEXT_DECLINE_WINDOW_DAYS = 30;
import { randomBytes } from "node:crypto";
const randomBytesTag = () => randomBytes(4);
import { LEGACY_PROTOCOL } from "./compat.js";
const NEVER_DAYS = 180;
/** v0.5.0 (§12.4): how long after the decision it supports ends a relationship or misconduct record may be kept, at most. */
const RECORD_AFTER_DAYS = 90;
/** v0.4.0 (§7.3): the longest a door holds a purchase for a visitor's owner, whatever its policy says. */
export const MAX_HOLD_S = 900;
const NON_SPENDING = new Set(["invitation", "introduction", "visitation", "gathering", "presentation", "gift"]);
/** v0.5.0 (§7.4): the reservation actions whose bookings are checked against booking limits. */
export const BOOKING_ACTIONS = new Set(["reservation.make", "reservation.change"]);
/** v0.2.9 (§9.4): reference default sign-up limits (a place setting; a place setting, P9 Q2). */
export const DEFAULT_ACCOUNT_CAPS = { per_owner: { count: 1, window_s: 30 * 86400 }, per_introducer: { count: 5, window_s: 7 * 86400 } };

export type HostOpts = {
  /**
   * §7.7 (C274, provisional): an SDK's cap on costly actions. Called for each act that passes the grant caps; `reached` refuses it
   * (not_now / RATE_LIMITED, never a penalty); otherwise `count` is called once the act goes through.
   */
  costlyActCap?: (x: { seat_id: string; principal: string; tool: string; amount?: unknown }) => { reached: true } | { reached: false; count: () => void };
  /** v0.5.0 (§11.1, C254): when the shokai/0.3 transition window ends (V5.legacyWindowEnd(release date)); unset = 0.3 still accepted. */
  legacyWireUntil?: string | null;
  /**
   * v0.5.0 (§12.4, C255): ask a named outside service (a classifier or a model provider) to delete what the place sent it about a
   * principal's visits; returns whether the service confirmed. Unset: each named service is listed in the receipt as "pending".
   */
  classifierDeletion?: (service: S.ThirdPartyClassifier, principal_id: string) => boolean;
  /**
   * v0.5.0 (§12.4, C255): records about a principal the place must retain despite a deletion request, under a legal obligation or for
   * the establishment, exercise or defence of a legal claim, each with its recorded purpose. They are listed in the receipt as kept.
   */
  legalHolds?: (principal_id: string) => { kind: string; reason: "legal_obligation" | "legal_claim"; detail: string }[];
  /** Pilot only (compat.ts): accept cards signed before the v0.3 wire break. Never set in a conformance run. */
  acceptLegacyCards?: boolean;
  /** Generated-trace replay: bare payloads stand for verified envelopes (the trace strips them); artifacts are still verified for real. */
  traceMode?: boolean;
  /** Test hooks for byte-exact replay of generated traces. */
  hostNonce?: (encounter_id: string) => string;
  receipt?: (encounter_id: string) => { receipt_id: string; nonce: string } | undefined;
  /** What this host fetched itself (allowance status, vouch logs, evidence), filled by the transport before handle() (§2.5, §5.2, §4, the Revocation status extension). */
  fetched?: FetchCache;
  /** This place's own entry address (§11.1), used as reply_to / gathering entry. */
  entryUrl?: string;
  /** Appendix B: this place runs the conformance test profile (x-test-profile: shokai-b/0.3): loopback URLs, test owner, test gathering. */
  testProfile?: boolean;
  /** Fable review (§2.1, THREAT-MODEL): owner rp_ids this door accepts. Unset: any rp_id except RFC 2606 reserved names, which only the test profile accepts. */
  acceptedRpIds?: string[];
  /** Fable review: accept RFC 2606 reserved rp_ids (owners.example, *.test, …) outside the test profile (local demos only). */
  allowReservedRpIds?: boolean;
  /** Appendix B.4 (v0.2.5): decide considerings routed to a role at once (x-test-decider: true). Only with testProfile. */
  testDecider?: boolean;
  /** Appendix B.2: the pair place's simulated test owner (its passkey signs by the fixed rules; no human). Only with testProfile. */
  testOwner?: PasskeyOwner;
  /** v0.2.4 (§11.1): this place's inbox address (named in the listing, the lobby and `held`). */
  inboxUrl?: string;
  /** Red-team 2026-10-25 (RT-C4): discard signed entry messages whose sent_at is more than this many seconds from now (replay after state loss). Off unless set. */
  maxMessageAgeS?: number;
  /** RT-F5: Appendix B.3 auto-invitation of any verified requester. Default: on with testProfile (conformance); the S5 pilot turns it off. */
  autoInvite?: boolean;
  /** RT-F9: per-sender cap on room items per minute at a gathering. Off unless set. */
  roomRatePerMin?: number;
  /** v0.2.8 (§3.4, P12; red team 2026-10-26 RT2-D1/D2): bound on live encounters. When the cap is reached, closed encounters are
   *  dropped first (oldest first); if every remaining encounter is live, the NEW arrival is refused (fail closed: 429 / RATE_LIMITED at
   *  the HTTP binding), never an existing guest. Replay maps stay bounded: greeting nonces older than maxMessageAgeS are dropped,
   *  and while they still exceed 4x the cap new signed greetings are refused. Off unless set (conformance unchanged). */
  maxEncounters?: number;
  /** §11.1 (C287): concurrent live seats per visitor card (card id and principal). Off unless set; the SDK sets SEATS_PER_CARD (2). */
  seatsPerCard?: number;
  /** §11.1 (C287, RR-08): concurrent live seats per source address (the binding's trusted client address). Off unless set; the SDK sets 16. */
  seatsPerSource?: number;
  /** §4.1 (C287): failed claims per introduction card (across every principal) in 24 h before claims on it are suspended. Off unless set; the SDK sets 10. */
  claimFailCapPerCard?: number;
  /** §4.1 (C296): the growing backoff after a failed claim attempt, per guessing principal and per source (the binding's trusted client
   *  address): `baseS` after the first failure in 24 h, doubling with each further failure in 24 h, up to `maxS`. Spec defaults 2 s and
   *  3600 s. Until it ends, a claim from that principal or source is refused unchecked (not_now / RATE_LIMITED, retry after its end).
   *  Off unless set; the SDK sets CLAIM_BACKOFF_BASE_S / CLAIM_BACKOFF_MAX_S (2, 3600). */
  claimBackoff?: { baseS: number; maxS: number };
  /** Red team phase 1 (§3.4, C266, provisional): a live encounter with no seat and no message for this long is no longer live (default ENCOUNTER_IDLE_S). */
  encounterIdleS?: number;
  /**
   * v0.4.0 (host-local, §3.4, §3.6): pruning. Finished visits are dropped this many seconds after their last message: closed or
   * abandoned encounters with no live seat, no open consideration and no held purchase, with their ended seats, counted acts,
   * holds and de-duplication keys. What §3.6 says to keep is kept for as long as it says: greeting nonces for the visit receipts'
   * lifetime (at most 7 days), each mandate's use until it expires, `never` bindings, records, notices and revocations. Never less
   * than 2 × maxMessageAgeS + 300 s (raised to that), so a replay of anything forgotten is already too old to be read. Off unless set.
   */
  retainS?: number;
  /** v0.4.0: with retainS, prune at most once per this many seconds of the place's clock (default 30). Host.prune() runs it now. */
  pruneEveryS?: number;
  /**
   * v0.3.0-rc4 (§3.6, C192): refuse-on-loss. The time this place's durable state starts (it started without restoring the state
   * §3.6 lists, e.g. after a restart with no store). A mandate whose valid_from is earlier than this (on the place's clock, no skew allowance) may have
   * been used before and can't be counted, so it is refused as MANDATE_INVALID (the owner signs a new one). Unset = state is durable.
   */
  stateEpoch?: string;
  /** Simulated act references that never repeat (the act_result's own msg_id). The SDK's doors set it; the golden traces' fixed runs don't. */
  uniqueActRefs?: boolean;
  /**
   * v0.5.0 (§7.2, §7.4, §7.5): the place's own service, called for an act after every check of §7.2 passed and it was counted.
   * Return a result for the act_result (it replaces the simulated one), a refusal (the act's count is released, C194), or
   * undefined for the simulated reference. Its `held` messages go to the visitor's inbox (§11.2).
   */
  service?: (act: Msg, ctx: ServiceContext) => ServiceAnswer | undefined;
};
/** v0.5.0: what the place's service knows about the act it serves (all from records the host kept; nothing from the visitor's prose). */
export type ServiceContext = { now: string; seat_id: string; seat: S.SeatGrant; encounter_id: string; representative_id: string; principal_id: string;
  card_id?: string; mandate?: S.Mandate; mandate_limits?: S.Limits; visitor?: SeatState["visitor"]; host: Host };
export type ServiceAnswer =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; disposition: S.Disposition; reason_code?: S.ReasonCode; retry?: S.Retry };
/** v0.2.8 (§3.4): thrown when a new encounter would exceed HostOpts.maxEncounters; handle() turns it into a refusal. */
export class CapacityRefusal extends Error { constructor() { super("encounter cap reached"); } }
/** v0.5.0 (§2.3, C236): a door MUST refuse to start with an invalid house config; `problems` lists why (V5.houseConfigProblems). */
export class HouseConfigInvalid extends Error {
  readonly code = "SHOKAI_HOUSE_CONFIG_INVALID";
  constructor(readonly problems: string[]) { super(`invalid house config, the door won't start: ${problems.join(", ")}`); }
}
/** v0.3.0-rc4 (§3.6): the JSON form of a place's durable state (Host.durableState / restoreDurable). Holds no private keys. */
export type DurableState = {
  v: 1; saved_at: string; never: [string, string][]; used_nonces: [string, string][]; seen_msgs: [string, string][]; poll_ids: [string, string][];
  mandate_use: [string, { ops: number; spent: string; currency?: string; seats: string[]; expires_at?: string }][]; records: [string, S.RelationshipRecord][];
  introducers: [string, any[]][]; notices: [string, any][]; probing: [string, any[]][]; signals: any[]; signups: any[]; spent_invitations: string[];
  revoked_consents: string[]; revoked_vouches: [string, any][]; revoked_cards: [string, { digest?: string; at: string; reason?: string }][];
  known_rp: [string, string][]; receipts: [string, any][]; owner_links?: [string, string][];
  /** v0.4.0 (with HostOpts.retainS): when each de-duplication key was first seen, and its encounter. */
  seen_meta?: [string, [string, string]][];
  /** v0.5.0 (§7.3): superseding mandates already used for a release; shared across instances with the durable store. */
  used_raises?: string[];
  allowance_ledger?: AllowanceLedgerState;
};
/** v0.4.0: what one Host.prune() dropped. */
export type PruneReport = { encounters: number; seats: number; admitted: number; holds: number; considerations: number; approvals: number;
  nonces: number; seen: number; polls: number; mandates: number; receipts: number; inbox: number };

/** v0.4.0: the JSON form of a place's visits in progress (Host.liveState / restoreLive). Maps, sets and bigints are tagged. */
export type LiveState = { v: 1; [k: string]: unknown };
/** JSON with Map, Set and bigint kept: {"$map": [...]}, {"$set": [...]}, {"$big": "123"}; an object with a "$" member is {"$obj": {...}}. */
export function toLiveJson(x: unknown): unknown {
  if (typeof x === "bigint") return { $big: x.toString() };
  if (x instanceof Map) return { $map: [...x].map(([k, v]) => [toLiveJson(k), toLiveJson(v)]) };
  if (x instanceof Set) return { $set: [...x].map(toLiveJson) };
  if (Array.isArray(x)) return x.map((v) => (v === undefined ? null : toLiveJson(v)));
  if (x && typeof x === "object") {
    const o = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && typeof v !== "function").map(([k, v]) => [k, toLiveJson(v)]));
    // A visitor's own JSON (an act's arguments) is never read back as a tag: objects with a "$" member are wrapped.
    return Object.keys(o).some((k) => k.startsWith("$")) ? { $obj: o } : o;
  }
  return x;
}
export function fromLiveJson(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(fromLiveJson);
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>; const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "$big" && typeof o.$big === "string") return BigInt(o.$big);
    if (keys.length === 1 && keys[0] === "$map" && Array.isArray(o.$map)) return new Map((o.$map as [unknown, unknown][]).map(([k, v]) => [fromLiveJson(k), fromLiveJson(v)]));
    if (keys.length === 1 && keys[0] === "$set" && Array.isArray(o.$set)) return new Set((o.$set as unknown[]).map(fromLiveJson));
    const plain = keys.length === 1 && keys[0] === "$obj" && o.$obj && typeof o.$obj === "object" ? (o.$obj as Record<string, unknown>) : o;
    return Object.fromEntries(Object.entries(plain).map(([k, v]) => [k, fromLiveJson(v)]));
  }
  return x;
}

/** The principal kinds §2.1 defines. */
export const PRINCIPAL_KINDS: readonly string[] = ["person", "brand", "company", "system"];
/** RFC 2606 / RFC 6761 reserved names: what development passkeys use (owners.example), never a real relying party. */
export function reservedRpId(rp: string): boolean {
  const h = rp.toLowerCase().replace(/\.$/, "");
  return /(^|\.)(example|test|invalid|localhost)$/.test(h) || /^(.+\.)?example\.(com|net|org)$/.test(h);
}
/** Pre-release review (round 2): an entry address that is https, not loopback and not itself a reserved name is public. Absent or loopback is local. */
export function publicEntryUrl(u: string | undefined): boolean {
  if (!u) return false;
  try { const x = new URL(u); return x.protocol === "https:" && !/^(127\.|localhost$|\[::1\]$)/.test(x.hostname) && !reservedRpId(x.hostname); } catch { return false; }
}
/** Fable review: newest transcript lines a Host keeps in `log` (older lines are dropped). */
export const MAX_LOG = 5000;

export class Host {
  encounters = new Map<string, Enc>();
  records = new Map<string, S.RelationshipRecord>();          // key: principal id or "lobby:<receipt_id>"
  receipts = new Map<string, { r: S.VisitReceipt; used: boolean; recordKey: string }>();
  echoFailures = new Map<string, number[]>();                 // sender -> times of invalid receipt echoes (§9.1)
  seats = new Map<string, SeatState>();
  considerations = new Map<string, Consideration>();
  approvals = new Map<string, Approval & { principal: string }>();
  introducers = new Map<string, Penalty[]>();
  revokedVouches = new Map<string, S.Signed<S.VouchRevocation>>();  // verified revocations received as messages
  notices = new Map<string, { notice: S.MisconductNotice; introducers: string[] }>();
  probing = new Map<string, { shape: string; at: string; response: string }[]>();   // principal -> rejected shapes
  never = new Map<string, string>();                          // id -> until (§2.4: 180 days, local)
  usedNonces = new Map<string, string>();                     // `${from}|${nonce}` -> first seen (§2.4)
  signals: { at: string; principal: string; kind: string; encounter_id: string }[] = [];
  log: string[] = [];                                         // redacted transcript (no receipt nonces, §9.1)
  /** v0.3.0-rc4 (§10, C201): owner-facing alerts, newest last: a visitor claimed the owner's own name under another principal. */
  ownerAlerts: S.OwnNameAlert[] = [];
  place?: GatheringPlace;
  policyDigest: string;
  fetched: FetchCache;
  knownRp = new Map<string, string>();                        // owner DID -> rp_id, from verified cards (§2.1)
  spentInvitations = new Set<string>();                       // the Peer meetings extension: single use, spent at the farewell
  mandateUse = new Map<string, MandateUse>();                 // v0.3.0-rc2 (§5.1, C175): `${principal}|${mandate_id}` -> use across all its seats
  revokedConsents = new Set<string>();                        // §8.1: consent_ids revoked by their owner
  /** v0.5.0 (§5.2, C286): the place's own cap on allowance-derived spending, per grant window and per seat. */
  allowanceLedger = new AllowanceLedger();
  admitted = new Map<string, { seat_id: string; units: bigint; ref?: string; mkey?: string; at: string; allowUnits?: bigint }>();   // v0.3.0-rc4 (C194): `${from}|${msg_id}` -> what the act counted
  ownerLinks = new Map<string, string>();                     // v0.3.0-rc4 (§2.8): owner DID -> the owner DID it was linked to (this place only)
  undecidedPrincipals = new Set<string>();   // R5-01: principals whose in-force revocation was dropped (store full): fail closed for them only
  unseenRevocations = new Set<string>();   // C238: keys of revokedCards for cards never seated here (bounded)
  revokedCards = new Map<string, { digest?: string; at: string; reason?: string }>();   // v0.3.0-rc4 (§2.6, C191): `${principal}|${card_id}` -> verified revocation
  holds = new Map<string, Hold>();                            // v0.4.0 (§7.3): hold_id -> a purchase held for the visitor's owner
  /** v0.5.0 (§7.3, C230): superseding mandates used up by a release (`${principal}|${mandate_id}`); offered again: MANDATE_INVALID. */
  usedRaises = new Set<string>();
  /** v0.5.0 (§12.4, C255): raw visitor text kept for the purposes §12.4 allows, by principal; deleted on request or after retention_days. */
  rawText: { principal: string; encounter_id: string; at: string; kind: string; text: string }[] = [];
  /** v0.5.0 (§12.4, C255): deletion requests answered (request_id -> when the receipt was held), so a repeat isn't processed twice. */
  deletions = new Map<string, string>();
  /** v0.5.0 (§7.2, C233): `${from}|${scope}|${idempotency_key}` -> the original signed answer; repeats counted per hold and per seat. */
  idem = new Map<string, Out[]>();
  /** v0.5.0 (§6.9, C243): grant-cap uses (key -> times); C244: receipts this place revoked (its own), mismatched-receipt presentations. */
  grantUses = new Map<string, string[]>(); revokedReceipts = new Set<string>(); receiptProbes = new Map<string, string[]>();
  /** v0.5.0 (§6.12, provisional): context requests this place sent (by request_id: the request, whose owner it went to, spent once a
   *  response was relied on) and the answers kept for a seat until the declared retention ends (0 days: until the seat ends). */
  ctxRequests = new Map<string, { req: S.ContextRequest; principal: string; spent: boolean; declined: string[] }>();
  ctxAnswers = new Map<string, { answers: { name: string; value: string }[]; declined: string[]; until?: string }>();
  /** v0.5.0 (§4.1, C245): claim digest -> the principal it is bound to, for good; presentations of codes bound to others. */
  introClaims = new Map<string, string>(); introProbes = new Map<string, string[]>();
  repeats = new Map<string, number>();
  /** v0.5.0 (§11.1, C254): the wire tag of the message being answered (replies carry it); unset = something this place starts. */
  curTag: S.ProtocolVersion | undefined;
  /** v0.5.0 (§5.4, C235): set while the message being answered carries a payment instrument. */
  private scanHit = false;
  /** v0.4.0 (§5.4): customer links this place recorded in its own channel (link_id -> link), and the ones it ended. */
  customerLinks = new Map<string, S.Signed<S.CustomerLink>>();
  endedLinks = new Set<string>();
  peerAnswers = new Map<string, S.Signed<S.OwnerConsent>>();  // invitation_id -> answer received (§11 with the Gatherings or Peer meetings extension)
  invitationsIssued = new Map<string, S.Signed<S.PeerInvitation>>();
  invitationsReceived = new Map<string, { invitation: S.Signed<S.PeerInvitation>; reply_to: string; from: string }>();
  /** §11.2 inbox: recipient -> held signed messages, in order. */
  inbox = new Map<string, any[]>();
  pollIds = new Map<string, string>();
  seenMsgs = new Map<string, string>();                         // §2.2 v0.2.7: `${from}|${msg_id}` → payload_digest (de-duplication)
  /** v0.4.0 (with retainS): `${from}|${msg_id}` -> [first seen, encounter_id] for seenMsgs, and encounter -> last message. */
  seenMeta = new Map<string, [string, string]>();
  encTouched = new Map<string, string>();
  private lastPrune = Number.NEGATIVE_INFINITY;
  foreignSeq = new Map<string, number>();                     // encounter -> count of denies sent to non-parties (C142)                        // `${from}|${msg_id}` of inbox polls (replay defence)
  currentRaw: any;
  takenHome: { encounter_id: string; consideration_ref: string; what: { text: string; locale: string }; response_by: string }[] = [];
  offersDeclined: { encounter_id: string; text: string; locale: string; why: "outside_allowance" | "conflicts_with_interests" | "reputation" }[] = [];
  outbox: Out[] = [];
  /** v0.2.8 (§3.4): set by handle() when the last arrival was refused at the encounter cap (the HTTP binding answers 429). */
  capacityRefused = false;
  capacityRefusals = 0;
  /** v0.2.9 (§10): the inbound door, when this place is one. */
  door?: Door;
  /** v0.2.9 (§9.4): account-creating grants, per canonical owner and per introducer. */
  signups: { owner: string; introducer?: string; at: string }[] = [];

  constructor(public cfg: PlaceConfig, public rep: Ed25519Signer | null, public principal: Ed25519Signer | null,
              public verifier: Verifier = new RealVerifier(), public clock: () => string = () => new Date().toISOString().replace(/\.\d+Z$/, "Z"),
              public opts: HostOpts = {}) {
    if (cfg.gathering) this.place = new GatheringPlace(this);
    if (cfg.door) this.door = new Door(cfg.door);
    if (opts.stateEpoch) this.bootTag = b64u(randomBytesTag());
    this.policyDigest = digestOf(cfg.policy);
    // v0.5.0 (§2.3, C236, C248): refuse to start with an invalid house config; a Shōkai host card's house MUST carry its summary.
    const problems = V5.houseConfigProblems(cfg, { holdsPurchases: this.holdsPurchases(), summaryRequired: cfg.card?.payload.kind === "host" });
    if (problems.length) throw new HouseConfigInvalid(problems);
    this.fetched = opts.fetched ?? new Map();
    const ob = cfg.card?.payload.owner_binding; if (ob?.rp_id) this.knownRp.set(ob.owner_id, ob.rp_id);
  }
  get real() { return this.verifier.mode === "real"; }

  // ---------- envelope ----------
  wrap(m: Msg): any { return this.real && this.rep && !this.opts.traceMode ? makeSigned(m, this.rep, m.sent_at ?? this.clock()) : m; }
  /** Owner DID → relying party (§2.1): only from cards this host verified (its own included). */
  rpOf = (id: string | undefined): string | undefined => { if (!id) return undefined; for (const [k, v] of this.knownRp) if (sameDid(k, id)) return v; return undefined; };
  isNever(id: string | undefined, now = this.clock()): boolean { const u = id ? this.never.get(canonDid(id)) : undefined; return !!u && Date.parse(now) < Date.parse(u); }
  /** RT-H1: keyed on the canonical DID, so a non-canonical did:jwk of the same key (§2.1, C115) can't step around a `never`. */
  bindNever(id: string, now = this.clock()) { this.never.set(canonDid(id), addDays(now, NEVER_DAYS)); }
  /** §9.3 (v0.2.3): notices are signed by the place's principal key; a person's place (no principal key here) signs with its representative key. */
  signAsPrincipal<T>(p: T): S.Signed<T> {
    if (this.principal) return makeSigned(p, this.principal, this.clock());
    // rc4 (F3): a door whose card its owner signed with a passkey has no principal key here either; it signs with its representative key.
    if (this.rep && (this.cfg.peer || this.cfg.door || this.cfg.card?.payload.owner_binding)) return makeSigned(p, this.rep, this.clock());
    return { payload: p, payload_digest: digestOf(p), signatures: [{ alg: "Ed25519", key_id: this.cfg.principal_id + "#k1", signer: this.cfg.principal_id, signed_at: this.clock(), value: "sig-placeholder" }] };
  }
  /**
   * §2.2: a msg_id MUST be unique per sender. A place that may have run before with the same key (its state was restored, or it
   * is memory-only with refuse-on-loss) adds a random per-start tag, so an encounter it meets again after a restart (or after its
   * files were rolled back) never reuses an id it sent before. A fresh place keeps the short form.
   */
  bootTag: string | null = null;
  msgIdFor(enc: { id: string }, n: number) { return this.bootTag ? `${enc.id}-${this.bootTag}-h${n}` : `${enc.id}-h${n}`; }
  hdr(enc: { id: string; visitor: string; seq: number }, type: string, to?: string): Msg {
    // v0.5.0 (§11.1, C254): a reply carries the incoming tag; a message the place starts in an encounter carries that encounter's tag
    // (shokai/0.3 in a 0.3 encounter); outside any encounter, shokai/0.5.
    const cm = this.currentMsg; const replying = !!cm && typeof cm.from === "string" && sameDid(to ?? enc.visitor, cm.from);
    const tag = replying ? this.curTag : ((enc as Partial<Enc>).tag ?? this.curTag);
    enc.seq++; return { protocol: tag ?? PROTOCOL, encounter_id: enc.id, msg_id: this.msgIdFor(enc, enc.seq), sent_at: this.clock(), from: this.cfg.rep_id, to: to ?? enc.visitor, type };
  }
  /** Fable review: the redacted transcript keeps the newest MAX_LOG lines, so traffic can't grow it forever. */
  note(s: string) { this.log.push(`${this.clock()} ${s}`); if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG); }
  /** §11.2 (v0.2.4): the signed `held` acknowledgement, in the same reply, for a message answered later through the inbox. */
  heldNotice(enc: { id: string; visitor: string; seq: number }, inReplyTo: string, to: string, answer_by?: string): Msg {
    return { ...this.hdr(enc, "held", to), in_reply_to: inReplyTo, inbox: this.inboxUrl(), ...(answer_by ? { answer_by } : {}) };
  }
  drainOutbox(): Out[] { const o = this.outbox; this.outbox = []; return o; }

  /**
   * Entry point: one arrival at the entry address → outbound messages.
   * Accepts Signed<msg> (normative), bare payloads (placeholder/trace replay; unsigned lobby path otherwise),
   * or anything else (plain prose, a malformed body → the lobby, §3.1).
   */
  handle(raw: any): Out[] {
    this.capacityRefused = false;
    const swept = this.sweep();
    this.maybePrune();
    try { const out = this.handleInner(raw, swept); this.touch(raw); return out; }
    catch (x) {
      if (!(x instanceof CapacityRefusal)) throw x;
      this.currentRaw = undefined; this.capacityRefused = true; this.capacityRefusals++;
      this.note(`encounter cap (${this.opts.maxEncounters}) reached: new arrival refused (fail closed; existing guests kept, §3.4)`);
      return [...swept, ...this.drainOutbox()];
    }
    finally { this.curTag = undefined; this.scanHit = false; this.currentMsg = undefined; }
  }
  private handleInner(raw: any, swept: Out[]): Out[] {
    let msg: Msg; let signed = false;
    const isObj = raw && typeof raw === "object" && !Array.isArray(raw);
    if (isObj && "payload" in raw && Array.isArray(raw.signatures)) {
      msg = raw.payload;
      // Envelopes are verified for real whenever the verifier is real, also in trace mode (G6 envelopes are real bytes).
      if (this.real) {
        let d: string | null = null; try { d = digestOf(raw.payload); } catch { d = null; }
        // §2.2: content that no longer matches its digest is discarded, unanswered.
        if (!d || d !== raw.payload_digest) { this.note(`discard tampered ${msg?.msg_id ?? "?"}`); return swept; }
        if (raw.signatures.length > 0) {
          const s0 = raw.signatures[0];
          // §2.2 (v0.3.0-rc3, C184): signatures[0].signer MUST equal payload.from. A good digest with a signature that doesn't verify for
          // the claimed sender is answered as a malformed body: the lobby, in a new lobby encounter. Nothing in it is acted on, and it
          // never changes an encounter, a seat or a nonce record (it could be anyone claiming the party's DID).
          if (!msg || !sameDid(s0?.signer, msg.from) || !this.verifier.signed({ ...raw, signatures: [s0] }, msg.from, undefined, undefined, this.rpOf(msg.from))) { this.note(`signature does not verify for claimed sender (${msg?.msg_id ?? "?"}) → lobby, no encounter changed`); return [...swept, ...this.proseLobby()]; }
          signed = true;
        }
      } else signed = raw.signatures.length > 0;
    } else if (isObj && typeof raw.type === "string") {
      msg = raw; signed = !this.real || !!this.opts.traceMode;
    } else return [...swept, ...this.proseLobby()];
    // §3.1, §11.1: a malformed body (or a protocol we don't speak) gets the lobby; its spec_ref names ours. v0.5.0 (C254): shokai/0.5,
    // and shokai/0.3 until the transition window ends (opts.legacyWireUntil; unset while v0.5.0 has no release date).
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string" || !V5.wireTagAccepted(msg.protocol, this.clock(), this.opts.legacyWireUntil) || typeof msg.encounter_id !== "string" || typeof msg.msg_id !== "string")
      return [...swept, ...this.proseLobby()];
    this.curTag = msg.protocol; this.currentMsg = msg;
    // v0.4.0 (§2.3, C204, C205): a door whose own Shōkai host card doesn't fit it (another place, or a house config the owner
    // didn't sign) doesn't speak for its owner: it answers nothing until its owner signs a new host card. A card revocation is
    // still taken in, so the owner can withdraw the old one.
    { const hp = this.hostCardProblem(); if (hp && msg.type !== "card_revocation") { this.note(`own Shōkai host card: ${hp} → the door is closed (no answer) until its owner signs a new one`); return swept; } }
    // §2.2 (v0.2.3): header timestamps must be RFC 3339 UTC whole seconds; a malformed header is a malformed message → lobby.
    if (badHeaderTimestamps(msg).length) { this.note(`malformed timestamp in header of ${msg.msg_id} → lobby`); return [...swept, ...this.proseLobby()]; }
    // §2.2 (v0.2.7): msg_id is unique per sender; de-duplication is keyed on (from, msg_id), never msg_id alone. An exact
    // redelivery of a signed message already handled, or the same sender reusing an id for other content, is not handled
    // again (no reply). Another sender's message with the same id is a different message. Greetings stay under §2.4 (nonce).
    if (signed && this.real && !this.opts.traceMode && msg.type !== "greeting" && typeof msg.from === "string") {
      const k = msg.from + "|" + msg.msg_id, d = raw.payload_digest as string, prev = this.seenMsgs.get(k);
      if (prev !== undefined) { this.note(`${prev === d ? "duplicate" : "msg_id reused with other content"}: ${msg.type} ${msg.msg_id} from ${msg.from} already handled (§2.2, keyed on (from, msg_id))`); return swept; }
      this.seenMsgs.set(k, d);
      if (this.opts.retainS !== undefined) this.seenMeta.set(k, [this.clock(), typeof msg.encounter_id === "string" ? msg.encounter_id : ""]);
    }
    // RT-C4 (red team 2026-10-25): a signed message far from now is a replay (e.g. after this host lost its memory); without this a
    // victim's old greeting + card_presentation would fail the possession proof against a new nonce and bind the VICTIM `never`.
    const maxAge = this.opts.maxMessageAgeS;
    if (signed && this.real && !this.opts.traceMode && maxAge !== undefined && Math.abs(Date.parse(msg.sent_at) - Date.parse(this.clock())) > maxAge * 1e3) {
      this.note(`discard stale or future-dated ${msg.type} ${msg.msg_id} from ${msg.from} (sent_at ${msg.sent_at}; ±${maxAge} s)`); return swept; }
    const room = this.cfg.gathering?.payload.gathering_id;
    const addressedElsewhere = msg.to && !sameDid(msg.to, this.cfg.rep_id) && !sameDid(msg.to, this.cfg.principal_id) && msg.to !== room;
    // RT-C5: a signed greeting addressed to another place is not ours either (replayed from elsewhere).
    if (addressedElsewhere && signed) { this.note(`ignore ${msg.type} addressed to ${msg.to}`); return swept; }
    // v0.5.0 (§3.4, C239): a message larger than policy.max_message_bytes (default 65536) gets a bounded refusal, never a finding:
    // an act or confirmation not_now / REQUEST_INCOMPLETE with nothing performed, anything else an empty reply. A farewell is still taken.
    if (msg.type !== "farewell") {
      const max = this.cfg.policy.max_message_bytes ?? V5.DEFAULT_MAX_MESSAGE_BYTES; const size = Math.max(this.arrivalBytes ?? 0, V5.messageBytes(raw));   // C239: bytes as received when the binding knows them
      if (size > max) {
        this.note(`${msg.type} from ${msg.from} is ${size} bytes, over max_message_bytes ${max} → ${msg.type === "act" || msg.type === "act_confirmation" ? "not_now / REQUEST_INCOMPLETE" : "no answer"} (setup failure; nothing kept)`);
        if (msg.type !== "act" && msg.type !== "act_confirmation") return swept;
        return [...swept, ...this.sizeRefusal(msg).map((m) => ({ to: msg.from, message: this.wrap(m) }))];
      }
    }
    // v0.5.0 (§5.4, C235): the payment-instrument scan, before template checks: a card number anywhere in what the visitor sent is
    // refused (not_now / CREDENTIAL_NOT_ACCEPTED) and never stored, logged or echoed (the note names only the message type).
    if (V5.carriesInstrument(msg)) {
      this.note(`${msg.type} from ${msg.from} carries a payment instrument → refused before anything else (§5.4; content not kept)`);
      // §5.4: a match in a header id is answered in a fresh lobby encounter the place names, with no in_reply_to (the id is never echoed).
      if (V5.carriesInstrument(Object.fromEntries(Host.HEADER_IDS.filter((k) => k in msg).map((k) => [k, msg[k]])))) return [...swept, ...this.proseLobby()];
      if (msg.type === "act" || msg.type === "act_confirmation") return [...swept, ...this.instrumentRefusal(msg).map((m) => ({ to: msg.from, message: this.wrap(m) }))];
      if (msg.type !== "invitation_request") return [...swept, ...this.proseLobby()];
      this.scanHit = true;
    }
    // v0.5.0 (§3.5, C239, C234): a cap on the messages answered in one encounter (repeats count); past it, acts get not_now /
    // RATE_LIMITED ("start a new visit") from memory, other messages nothing. A farewell is outside the cap and is always answered.
    const cap = this.cfg.policy.message_cap;
    if (cap !== undefined && msg.type !== "farewell") {
      const st = typeof msg.seat_id === "string" ? this.seats.get(msg.seat_id) : undefined;
      const e = (st && st.rep === msg.from ? this.encounters.get(st.encounter_id) : undefined) ?? this.encounters.get(msg.encounter_id);
      if (e && e.visitor === msg.from) {
        e.answered = (e.answered ?? 0) + 1;
        if (e.answered > cap) {
          this.note(`message cap (${cap}) reached in ${e.id} → ${msg.type === "act" || msg.type === "act_confirmation" ? "RATE_LIMITED" : "no answer"} (start a new visit)`);
          if (msg.type !== "act" && msg.type !== "act_confirmation") return swept;
          const now = this.clock(); const stub = { msg_id: msg.msg_id, seat_id: String(msg.seat_id ?? ""), tool: typeof msg.tool === "string" ? msg.tool : "?", from: msg.from };
          return [...swept, { to: msg.from, message: this.wrap(this.actDecision(e, stub, "not_now", "RATE_LIMITED", { kind: "after", not_before: now }, now, st)) }];   // a v0.4.0 code: the same under 0.3
        }
      }
    }
    // v0.5.0 (§7.2, C233): idempotent repeats. Only under shokai/0.5 (a 0.3 message is read without idempotency_key).
    const ik = this.idemScope(msg);
    if (ik) {
      const prev = this.idem.get(ik.key);
      if (prev) {
        const capped = this.countRepeat(ik);
        if (capped) return [...swept, ...capped.map((m) => ({ to: msg.from, message: this.wrap(m) }))];
        this.note(`repeat of ${msg.type} with its idempotency key → the original signed answer (not performed again)`);
        return [...swept, ...prev];
      }
    }
    // Editor decision H1(d) (C297) and H1(f) (C301): an invitation_request whose mandate carries min_protocol above the request's own
    // wire tag (numeric order, C299; under shokai/0.3 anything above 0.3, under shokai/0.5 anything above 0.5) is refused with the
    // version-mismatch lobby only (C102: a fresh lobby encounter, spec_ref naming the version this place speaks; no invitation_response
    // in the visitor's encounter). A malformed min_protocol is not "above": it makes the mandate malformed (H1(e), C300) and is refused
    // in the invitation_request path as MANDATE_INVALID, before a closed mandate template can recast it as REQUEST_INCOMPLETE (and also in checkMandate).
    if (msg.type === "invitation_request" && (this.legacy || this.v05) && V5.minProtocolAbove((msg as any).mandate?.payload, msg.protocol)) {
      this.note(`invitation_request ${msg.msg_id} under ${msg.protocol} with a mandate whose min_protocol is ${(msg as any).mandate.payload.min_protocol} → version-mismatch lobby (H1(${this.legacy ? "d), C297" : "f), C301"})`);
      return [...swept, ...this.proseLobby()];
    }
    this.currentRaw = raw;
    const out = this.dispatch(msg, signed);
    this.currentRaw = undefined;
    { const e = this.encounters.get(msg.encounter_id); if (e && typeof msg.from === "string" && sameDid(e.visitor, msg.from)) e.tag = msg.protocol; }
    if (ik && out.length) {
      const first = out[0]; const performed = first.type === "act_result" || first.type === "act_held";
      if (performed) { const wrapped = out.map((m) => ({ to: m.to ?? msg.from, message: this.wrap(m) } as Out)); this.idem.set(ik.key, wrapped);
        return [...swept, ...wrapped, ...this.drainOutbox()]; }
    }
    // Direct answers to the poster go in the reply; anything addressed to someone else is late delivery (§11.2).
    return [...swept, ...out.map((m) => { const to = m.to ?? msg.from; const o: Out = { to, message: this.wrap(m) }; if (to !== msg.from || m.type === "consideration_outcome") o.held = true; return o; }),
      ...this.drainOutbox()];
  }
  /** v0.5.0 (§11.1): whether the message being answered speaks shokai/0.5 (v0.5.0 members, messages and codes are read and sent). */
  get v05(): boolean { return this.curTag === PROTOCOL; }
  /** Answering a shokai/0.3 message: no v0.5.0 member, message or code goes out (§11.1). */
  get legacy(): boolean { return this.curTag === LEGACY_TAG; }
  /** v0.5.0 (§5.4, C235): the refusal for an act or a confirmation carrying a payment instrument; nothing of it is echoed. */
  /** §5.4: the header ids the scan covers (a match in one is never echoed). */
  static HEADER_IDS = ["msg_id", "encounter_id", "in_reply_to", "seat_id", "hold_id"] as const;
  /** v0.5.0 (§3.4, C239): the bounded answer to an act or confirmation over max_message_bytes. */
  private sizeRefusal(msg: Msg): Msg[] {
    const now = this.clock(); const st = typeof msg.seat_id === "string" ? this.seats.get(msg.seat_id) : undefined;
    const e = (st && this.encounters.get(st.encounter_id)) ?? this.encounters.get(msg.encounter_id) ?? this.newEnc(msg.encounter_id, msg.from, [], "");
    const stub = { msg_id: msg.msg_id, seat_id: typeof msg.seat_id === "string" ? msg.seat_id : "", tool: typeof msg.tool === "string" && msg.tool.length <= 128 ? msg.tool : "?", from: msg.from };
    return [this.actDecision(e, stub, "not_now", "REQUEST_INCOMPLETE", { kind: "after", not_before: now }, now, st && st.rep === msg.from ? st : undefined)];
  }
  private instrumentRefusal(msg: Msg): Msg[] {
    const now = this.clock(); const st = typeof msg.seat_id === "string" ? this.seats.get(msg.seat_id) : undefined;
    const e = (st && this.encounters.get(st.encounter_id)) ?? this.encounters.get(msg.encounter_id) ?? this.newEnc(msg.encounter_id, msg.from, [], "");
    const h = msg.type === "act_confirmation" && typeof msg.hold_id === "string" ? this.holds.get(msg.hold_id) : undefined;
    const stub = { msg_id: msg.msg_id, seat_id: typeof msg.seat_id === "string" ? msg.seat_id : "", tool: h?.act.tool ?? (typeof msg.tool === "string" && msg.tool.length <= 128 && !V5.luhnLike(msg.tool) ? msg.tool : "?"), from: msg.from };
    // §5.4: the scan runs after C210, never instead of it: a credential or instrument named by member gets C210's not_a_fit first.
    const named = forbiddenMembers(msg.type === "act" ? msg.arguments ?? {} : msg, [...CREDENTIAL_MEMBERS, ...INSTRUMENT_MEMBERS]).length > 0;
    // Under shokai/0.3 the v0.4.0 answer (C210: not_a_fit, retry at once without it); under shokai/0.5 C235's not_now.
    return [this.actDecision(e, stub, this.v05 && !named ? "not_now" : "not_a_fit", "CREDENTIAL_NOT_ACCEPTED", { kind: "after", not_before: now }, now, st && st.rep === msg.from ? st : undefined)];
  }
  /** v0.5.0 (§7.2, C233): where a valid idempotency key is kept: per seat for an act, per hold for a confirmation (shokai/0.5 only). */
  private idemScope(msg: Msg): { key: string; seat: string; hold?: string } | null {
    if (msg.protocol !== PROTOCOL || (msg.type !== "act" && msg.type !== "act_confirmation") || !V5.idempotencyKeyOk(msg.idempotency_key) || typeof msg.seat_id !== "string") return null;
    const hold = msg.type === "act_confirmation" && typeof msg.hold_id === "string" ? msg.hold_id : undefined;
    return { key: `${msg.from}|${hold ? "hold:" + hold : "seat:" + msg.seat_id}|${msg.idempotency_key}`, seat: msg.seat_id, ...(hold ? { hold } : {}) };
  }
  /** Repeats are capped (default 5 per hold, 10 per seat; policy.repeat_caps). Past the cap: refused, never performed (HOLD_LAPSED for a hold). */
  private countRepeat(ik: { seat: string; hold?: string }): Msg[] | null {
    const caps = { ...V5.REPEAT_CAPS_DEFAULT, ...(this.cfg.policy.repeat_caps ?? {}) };
    const sk = "seat:" + ik.seat, hk = ik.hold ? "hold:" + ik.hold : null;
    const ns = (this.repeats.get(sk) ?? 0) + 1, nh = hk ? (this.repeats.get(hk) ?? 0) + 1 : 0;
    if (ns > caps.per_seat || (hk && nh > caps.per_hold)) {
      const now = this.clock(); const st = this.seats.get(ik.seat); const e = st ? this.encounters.get(st.encounter_id) : undefined;
      const m = this.currentMsg!; const stub = { msg_id: m.msg_id, seat_id: ik.seat, tool: (ik.hold && this.holds.get(ik.hold)?.act.tool) || (typeof m.tool === "string" ? m.tool : "?"), from: m.from };
      this.note(`repeat past the cap (${hk ? `${caps.per_hold} per hold` : `${caps.per_seat} per seat`}) → refused, not performed`);
      const enc = e ?? this.newEnc(m.encounter_id, m.from, [], "");
      return [ik.hold ? this.actDecision(enc, stub, "not_now", "HOLD_LAPSED", { kind: "after", not_before: now }, now, st)
        : this.actDecision(enc, stub, "not_now", "RATE_LIMITED", { kind: "after", not_before: now }, now, st)];
    }
    this.repeats.set(sk, ns); if (hk) this.repeats.set(hk, nh);
    return null;
  }
  private currentMsg: Msg | undefined;
  /** §11.2: keep a message for its recipient's inbox. */
  hold(o: Out) { const l = this.inbox.get(o.to) ?? []; l.push(o.message); this.inbox.set(o.to, l); }
  /** §11.1: one POST to the entry → the ReplyEnvelope; late messages are held for their recipients' inboxes. */
  entryPost(raw: any): S.ReplyEnvelope {
    const outs = this.handle(raw); const messages: any[] = [];
    for (const o of outs) (o.held ? this.hold(o) : messages.push(o.message));
    // v0.5.0 (§11.1): the envelope answers in the tag of the message posted (shokai/0.5 for anything else).
    const tag = raw && typeof raw === "object" ? (raw.payload?.protocol ?? raw.protocol) : undefined;
    return { protocol: V5.wireTagAccepted(tag, this.clock(), this.opts.legacyWireUntil) ? V5.replyTag(tag) : PROTOCOL, messages };
  }
  /**
   * §11.2: POST <inbox> with a signed inbox_poll whose from is the recipient → 200 + held messages after `since`;
   * anyone else → 403 and nothing. Replay defence (host-3-012): a poll's msg_id is single use and sent_at must be within ±300 s.
   */
  inboxPost(raw: any): { status: 200 | 403; body: S.ReplyEnvelope } {
    // v0.5.0 (§11.1): a refused poll is answered in the poll's own tag when it is one this place accepts.
    const pt = raw && typeof raw === "object" ? raw.payload?.protocol : undefined;
    const no = { status: 403 as const, body: { protocol: V5.wireTagAccepted(pt, this.clock(), this.opts.legacyWireUntil) ? V5.replyTag(pt) : PROTOCOL, messages: [] } };
    if (!raw || typeof raw !== "object" || !raw.payload || !Array.isArray(raw.signatures) || raw.signatures.length === 0) return no;
    const p = raw.payload; let d: string | null = null; try { d = digestOf(p); } catch { d = null; }
    if (!d || d !== raw.payload_digest || p.type !== "inbox_poll" || !V5.wireTagAccepted(p.protocol, this.clock(), this.opts.legacyWireUntil) || typeof p.from !== "string" || typeof p.msg_id !== "string") return no;
    if (badHeaderTimestamps(p).length || Math.abs(Date.parse(p.sent_at) - Date.parse(this.clock())) > 300e3) return no;
    if (!sameDid(raw.signatures[0]?.signer, p.from) || !this.verifier.signed({ ...raw, signatures: [raw.signatures[0]] }, p.from, undefined, undefined, this.rpOf(p.from))) return no;
    const k = p.from + "|" + p.msg_id; if (this.pollIds.has(k)) return no; this.pollIds.set(k, p.sent_at);
    let held: any[] = []; for (const [to, l] of this.inbox) if (sameDid(to, p.from)) held = held.concat(l);
    if (typeof p.since === "string") { const i = held.findIndex((m) => (m.payload ?? m).msg_id === p.since); if (i >= 0) held = held.slice(i + 1); }
    this.note(`inbox_poll by ${p.from}: ${held.length} held message(s)`);
    return { status: 200, body: { protocol: V5.replyTag(p.protocol), messages: held } };
  }

  /** §3.2 (v0.2.6, pair places too): an encounter belongs to the two parties of its first greeting (the place and the greeting's sender). */
  private isParty(e: Enc, from: string): boolean {
    if (sameDid(from, this.cfg.rep_id) || sameDid(from, e.visitor)) return true;
    return false;
  }
  /**
   * §3.2 encounter binding (v0.2.5, C142): a ritual message from a non-party gets a signed deny addressed to ITS sender
   * (to = its from, in_reply_to = its msg_id); the encounter is not changed and nothing is sent or held for its parties.
   */
  private foreignDeny(e: Enc, msg: Msg): Msg[] {
    const P = this.cfg.policy; const now = this.clock(); const n = (this.foreignSeq.get(e.id) ?? 0) + 1; this.foreignSeq.set(e.id, n);
    const locale = P.supported_locales[0];
    const head: Msg = { protocol: PROTOCOL, encounter_id: e.id, msg_id: `${e.id}-x${n}`, sent_at: now, from: this.cfg.rep_id, to: msg.from, type: "invitation_response", in_reply_to: msg.msg_id };
    const basis = { policy_version: P.policy_version, decided_at: now, input_digest: digestOf({ now, policy: { policy_version: P.policy_version, policy_digest: this.policyDigest }, foreign_message: { encounter_id: e.id, msg_id: msg.msg_id, type: msg.type } }) };
    const courtesy = { locale, locale_match: "none" as const, register: "first_meeting" as const, text: t(locale, "ritual") };
    this.note(`encounter ${e.id} belongs to ${e.visitor}; ${msg.type} ${msg.msg_id} from ${msg.from} → deny to its sender only (C142)`);
    if (this.cfg.peer) return [{ ...head, decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", retry: { kind: "with_credential", credentials: ["owner_consent"] },
      readiness_requirements: [{ code: "owner_consent", required: true, ...readiness("owner_consent", locale) }], context_statement: { text: t(locale, "ctx_consent"), locale }, courtesy, basis }];
    return [{ ...head, decision: "deny", disposition: "not_now", reason_code: "RITUAL_ORDER", retry: { kind: "after", not_before: addSec(now, P.ritual_retry_s) }, courtesy, basis }];
  }
  /** §2.2, C242: the optional top-level members of a RepresentativeCard and a Mandate (protocol-shapes.ts), listed in closed templates. */
  static readonly CARD_OPTIONAL = ["etiquette", "revocation_url", "provenance", "offering_digest", "claims", "imprint", "kind", "place", "host_scope",
    "house_digest", "summary_digest", "org_approval", "shown_to_owner", "owner_prompts", "owner_binding", "crit", "preset"] as const;
  static readonly MANDATE_OPTIONAL = ["counterparties", "under_allowance", "customer_link", "supersedes", "shown_to_owner", "crit"] as const;
  private static RITUAL = new Set(["greeting", "card_presentation", "introduction", "invitation_request", "act", "farewell"]);
  private static PARTY_ONLY = new Set(["card_receipt", "invitation_response", "act_result", "act_decision", "consideration_outcome", "held"]);   // §3.2 v0.2.6: ignored from non-parties

  private dispatch(msg: Msg, signed: boolean): Msg[] {
    const bound = this.encounters.get(msg.encounter_id);
    if (bound && typeof msg.from === "string" && !this.isParty(bound, msg.from)) {
      if (Host.RITUAL.has(msg.type)) return this.foreignDeny(bound, msg);
      if (Host.PARTY_ONLY.has(msg.type)) { this.note(`${msg.type} ${msg.msg_id} from non-party ${msg.from} in ${bound.id}: ignored`); return []; }
    }
    if (bound) bound.lastAt = this.clock();   // C266: activity keeps an encounter live
    switch (msg.type) {
      case "greeting": return this.onGreeting(msg as S.Greeting, signed);
      case "card_presentation": return this.onCard(msg as S.CardPresentation, signed);
      case "card_receipt": return this.onCardReceipt(msg, signed);
      case "introduction": return this.onIntroduction(msg as S.Introduction, signed);
      case "invitation_request": return this.onRequest(msg as S.InvitationRequest, signed);
      case "farewell": return this.onFarewell(msg, signed);
      case "act": return signed ? this.onAct(msg) : this.outOfOrder(msg, signed);
      case "act_confirmation": return signed ? this.onActConfirmation(msg as S.ActConfirmation) : this.outOfOrder(msg, signed);
      case "vouch_revocation": return signed ? this.onRevocation(msg as S.VouchRevocationMessage) : [];
      case "introducer_review": return signed ? this.onReview(msg as S.IntroducerReviewMessage) : [];
      case "gathering_message": case "privacy_decline": return this.place && signed ? this.place.onMessage(msg, this.currentRaw) : [];
      case "consent_revocation": return signed ? this.onConsentRevocation(msg as S.ConsentRevocationMessage) : [];
      case "card_revocation": return signed ? this.onCardRevocation(msg as S.CardRevocationMessage) : [];
      // v0.5.0 (§12.4, C255): delivered by any representative, in any encounter; an unsigned one is ignored.
      case "deletion_request": return signed && !this.legacy ? this.onDeletionRequest(msg as S.DeletionRequestMessage) : [];
      case "peer_invitation": return signed ? this.onPeerInvitationDelivery(msg as S.PeerInvitationDelivery) : this.outOfOrder(msg, signed);
      case "peer_invitation_answer": return signed ? this.onPeerInvitationAnswer(msg as S.PeerInvitationAnswer) : this.outOfOrder(msg, signed);
      case "inbox_poll": return [];   // polls belong at the inbox address (§11.2); ignored at the entry
      // In a pair place the counterpart may run its own half of the ritual in the shared encounter (the Peer meetings extension, PA2): accepted as no-ops (host-3-016).
      case "invitation_response": case "act_result": case "act_decision": case "consideration_outcome":
        if (this.cfg.peer && signed && this.encounters.get(msg.encounter_id)?.verified) return [];
        return this.outOfOrder(msg, signed);
      default: return this.outOfOrder(msg, signed);
    }
  }

  // ---------- door: prose / malformed body at an entry address (§3.1) ----------
  proseLobby(): Out[] {
    const enc = this.newEnc("lobby-" + randomId("e").slice(2), "urn:shokai:anon:" + randomId("v").slice(2), [], "");
    const out = [this.greetingFor(enc), ...this.lobby(enc, undefined)];
    this.note(`door: non-protocol arrival → lobby (${enc.id})`);
    return out.map((m) => ({ to: enc.visitor, message: this.wrap(m) }));
  }
  /**
   * v0.2.8 (§3.4, P12): room for one more encounter? Closed encounters (nobody inside) are dropped first, oldest first; live
   * encounters (guests mid-ritual or seated) are never evicted. Stale greeting nonces (older than maxMessageAgeS, which the
   * freshness rule already discards) and old de-duplication keys are trimmed. False = refuse the newcomer.
   */
  /** Set by the HTTP binding around one entryPost(): the body's size in bytes as received (C239) and the trusted client address (C287). */
  arrivalBytes?: number; arrivalSource?: string;
  /** C287: failed claim times per introduction card digest (24 h window; persisted in liveState so instances sharing a store agree). */
  private claimFails = new Map<string, string[]>();
  /** §4.1 (C296): failed claim times per guessing principal ("p:" + canonical DID) and per source ("s:" + client address); persisted in liveState. */
  private claimFailsBy = new Map<string, string[]>();
  /** §4.1 (C296): failed claim attempts counted per source (client network address) in the last 24 h; 0 without a source. */
  claimFailuresFromSource(source: string, now = this.clock()): number {
    const k = "s:" + source.trim().toLowerCase(); return (this.claimFailsBy.get(k) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3).length;
  }
  /** §4.1 (C296): the end of the longest backoff the principal or this arrival's source carries now, or null. Each failure in the last 24 h
   *  doubles it: the n-th failure starts min(baseS × 2^(n−1), maxS) seconds of backoff from that failure. */
  claimBackoffEnd(principal: string, now = this.clock(), source = this.arrivalSource): { until: string; by: "principal" | "source" } | null {
    const b = this.opts.claimBackoff; if (!b || !(b.baseS > 0)) return null;
    let best: { until: string; by: "principal" | "source" } | null = null;
    const keys: Array<[string, "principal" | "source"]> = [["p:" + canonDid(principal), "principal"]];
    const src = source?.trim().toLowerCase(); if (src) keys.push(["s:" + src, "source"]);
    for (const [k, by] of keys) {
      const fails = (this.claimFailsBy.get(k) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3); if (!fails.length) continue;
      const last = fails.reduce((a, t) => (Date.parse(t) > Date.parse(a) ? t : a));
      const dur = Math.min(Math.max(b.maxS, b.baseS), b.baseS * 2 ** Math.min(fails.length - 1, 30));
      const until = addSec(last, Math.ceil(dur));
      if (Date.parse(until) > Date.parse(now) && (!best || Date.parse(until) > Date.parse(best.until))) best = { until, by };
    }
    return best;
  }
  private recordClaimFailureBy(principal: string, now: string) {
    const keys = ["p:" + canonDid(principal)]; const src = this.arrivalSource?.trim().toLowerCase(); if (src) keys.push("s:" + src);
    for (const k of keys) { const l = (this.claimFailsBy.get(k) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3); l.push(now); this.claimFailsBy.delete(k); this.claimFailsBy.set(k, l); }
    while (this.claimFailsBy.size > 8192) { const k = this.claimFailsBy.keys().next().value; if (k === undefined) break; this.claimFailsBy.delete(k); }
  }
  /** Drop claim-failure times older than 24 h (the count window and the longest backoff, 3600 s, both fit inside it) so store entries expire. */
  private pruneClaimFailMaps(now = this.clock()) {
    const cutoff = Date.parse(now) - 86400e3;
    const prune = (m: Map<string, string[]>) => {
      for (const [k, ts] of [...m]) {
        const keep = (ts ?? []).filter((t) => Date.parse(t) > cutoff);
        if (keep.length) m.set(k, keep); else m.delete(k);
      }
      while (m.size > 8192) { const k = m.keys().next().value; if (k === undefined) break; m.delete(k); }
    };
    prune(this.claimFails); prune(this.claimFailsBy);
  }
  /** Encounters still in use: a live seat (a pass stays usable after the ritual's farewell, §3.5), an open consideration or a held purchase. */
  busyEncounters(): Set<string> {
    const now = Date.parse(this.clock()); const skew = SKEW_S * 1e3;
    const live = (st: SeatState) => !st.unseated && !(st.seat.expires_at && now - Date.parse(st.seat.expires_at) > skew);
    const busy = new Set<string>();
    for (const st of this.seats.values()) if (live(st)) busy.add(st.encounter_id);
    for (const c of this.considerations.values()) if (!c.resolved) busy.add(c.encounter_id);
    for (const h of this.holds.values()) if (!h.done) { const st = this.seats.get(h.seat_id); if (st) busy.add(st.encounter_id); }
    return busy;
  }
  /** §11.1 (C287): whether one more seat for this card (or from this source) would pass the configured concurrent-seat caps. */
  seatCapReached(principal: string, cardId: string | undefined, cardDigest: string | undefined): "card" | "source" | null {
    const perCard = this.opts.seatsPerCard, perSource = this.opts.seatsPerSource; if (!perCard && !perSource) return null;
    const now = Date.parse(this.clock()); const src = this.arrivalSource?.trim().toLowerCase();
    let byCard = 0, bySource = 0;
    for (const st of this.seats.values()) {
      if (st.unseated || (st.seat.expires_at && Date.parse(st.seat.expires_at) <= now)) continue;
      // Concurrent = still inside: a seat whose ritual the visitor closed with its farewell (§7.1) no longer holds a place at the door
      // for this cap (its pass stays usable, §3.5); one whose encounter is gone is counted (conservative).
      const enc = this.encounters.get(st.encounter_id); if (enc?.closed) continue;
      if (sameDid(st.principal, principal) && (cardId ? st.cardId === cardId : st.cardDigest === cardDigest)) byCard++;
      if (src && st.source === src) bySource++;
    }
    if (perCard && perCard > 0 && byCard >= perCard) return "card";
    if (perSource && perSource > 0 && src && bySource >= perSource) return "source";
    return null;
  }
  hasRoom(signedGreeting = false): boolean {
    const max = this.opts.maxEncounters; if (!max || max <= 0) return true;
    const now = Date.parse(this.clock());
    if (this.opts.maxMessageAgeS !== undefined && this.usedNonces.size >= max) {
      const horizon = now - this.opts.maxMessageAgeS * 1e3;
      for (const [k, at] of this.usedNonces) if (Date.parse(at) < horizon) this.usedNonces.delete(k);
    }
    const cap4 = max * 4;
    while (this.seenMsgs.size > cap4) { const k = this.seenMsgs.keys().next().value as string | undefined; if (k === undefined) break; this.seenMsgs.delete(k); }
    // Pre-release review (round 2, §3.4/§3.5): a closed ritual whose pass is still live (or with a hold or consideration open) is a
    // guest, not an empty room: it is protected from every eviction pass, the closed-encounter sweep included.
    const busy = this.encounters.size >= max ? this.busyEncounters() : new Set<string>();
    if (this.encounters.size >= max) for (const [k, e] of this.encounters) {
      if (this.encounters.size < max) break;
      if (e.closed && !busy.has(k)) { this.encounters.delete(k); this.foreignSeq.delete(k); }
    }
    // Red team phase 1 (§3.4, C266, provisional): an encounter with no open seat and no message for encounterIdleS is no longer live; it is
    // dropped (oldest first) before a newcomer is refused, so idle half-rituals can't hold the door. Seats are never dropped this way.
    if (this.encounters.size >= max) {
      const idleMs = (this.opts.encounterIdleS ?? ENCOUNTER_IDLE_S) * 1e3;
      for (const [k, e] of this.encounters) {
        if (this.encounters.size < max) break;
        if (!busy.has(k) && now - Date.parse(e.lastAt ?? "1970-01-01T00:00:00Z") > idleMs) { this.encounters.delete(k); this.foreignSeq.delete(k); this.note(`encounter ${k}: idle with no seat, dropped to make room (C266)`); }
      }
    }
    if (this.encounters.size >= max) return false;
    if (signedGreeting && this.usedNonces.size >= cap4) return false;   // fail closed rather than forget fresh nonces (replay, §2.4)
    return true;
  }
  newEnc(id: string, visitor: string, locales: string[], nonce: string): Enc {
    if (!this.encounters.has(id) && !this.hasRoom(!!nonce)) throw new CapacityRefusal();
    const e: Enc = { id, visitor, step: 1, hostNonce: this.opts.hostNonce?.(id) ?? randomId("n-gate"), visitorNonce: nonce, locales, register: "first_meeting",
      lobby: false, closed: false, hostFarewell: false, visitorFarewell: false, responded: false, greeted: false, verified: false, seq: 0, lastAt: this.clock() };
    this.encounters.set(id, e); if (this.opts.retainS !== undefined) this.encTouched.set(id, this.clock()); return e;
  }
  loc(e: Enc) { return pickLocaleMatch(e.locales, this.cfg.policy.supported_locales); }
  courtesy(e: Enc, key: Parameters<typeof t>[1], register?: S.EtiquetteRegister, vars: Record<string, string> = {}) {
    const { locale, match } = this.loc(e);
    return { locale, locale_match: match, register: register ?? e.register, text: t(locale, key, vars) };
  }
  private greetingFor(e: Enc): Msg {
    e.greeted = true;
    const P = this.cfg.policy;
    const g: Msg = { ...this.hdr(e, "greeting"), locales: P.supported_locales, nonce: e.hostNonce,
      etiquette: { locales: P.supported_locales, formality: "neutral", norms: ["plain_language"] },
      courtesy: this.courtesy(e, "greet", undefined, { place: this.cfg.display_name }) };
    if (this.cfg.seeking) g.seeking_ref = { seeking_id: this.cfg.seeking.payload.seeking_id, digest: this.cfg.seeking.payload_digest };
    if (P.category) g.place_category = P.category;
    return g;
  }

  // ---------- step 1 ----------
  private onGreeting(g: S.Greeting, signed: boolean): Msg[] {
    const now = this.clock();
    // RT-R1/R2: a pair place's encounter id is the meeting key's place_id (the Peer meetings extension). Only a representative the meeting key names may open it;
    // anyone else (or an unsigned greeting) must not bind that id, or the real meeting is locked out.
    const key = this.cfg.peer ? this.meetingKeyFor(g.encounter_id) : undefined;
    if (key && (!signed || !key.representatives.some((r) => sameDid(r, g.from)))) {
      this.note(`greeting ${g.msg_id} from ${g.from} for pair place ${g.encounter_id}: not a representative its meeting key names; not bound`);
      return signed ? [] : this.proseLobby();
    }
    // R3-11 (§2.2, §2.4, C146, C57): exact redelivery takes precedence over nonce reuse. A byte-identical resend of the signed greeting
    // that opened this encounter (an HTTP retry after a timeout) is idempotent: the original greeting reply again, nothing recorded,
    // never an escalation. Only a different greeting reusing (from, nonce) is a replay.
    { const pe = this.encounters.get(g.encounter_id); const d = this.currentRaw?.payload_digest;
      if (pe && signed && typeof d === "string" && pe.greetDigest === d && sameDid(pe.visitor, g.from)) {
        this.note(`exact resend of greeting ${g.msg_id} from ${g.from}: the original reply again (idempotent, nothing recorded)`); return pe.greetReply ? [pe.greetReply] : []; } }
    if (this.encounters.has(g.encounter_id)) return this.outOfOrder(g, signed);
    // v0.2.8 (§3.4): refuse before anything is recorded (a refused greeting leaves no nonce behind).
    if (!this.hasRoom(signed)) throw new CapacityRefusal();
    const locales = g.etiquette?.locales ?? g.locales ?? [];
    // §2.4: a signed greeting that reuses (from, nonce) → deny never, no code. Unsigned lobby greetings are exempt.
    if (signed) {
      const k = g.from + "|" + g.nonce;
      if (!g.nonce || this.usedNonces.has(k)) {
        const e = this.newEnc(g.encounter_id, g.from, locales, g.nonce ?? "");
        e.register = "adversarial";
        this.signals.push({ at: now, principal: g.from, kind: "gate_probing", encounter_id: g.encounter_id });
        this.note(`nonce reuse (or no nonce) in signed greeting ${g.msg_id}: deny never`);
        return [this.greetingFor(e), this.denyNever(e, g.msg_id), this.farewell(e, "declined_never", "adversarial")];
      }
      this.usedNonces.set(k, now);
    }
    const e = this.newEnc(g.encounter_id, g.from, locales, g.nonce ?? "");
    e.timeZone = g.etiquette?.time_zone;
    if (!signed) {
      if (typeof g.continuity_key === "string" && resolveDid(g.continuity_key)?.alg === "Ed25519") e.continuityKey = g.continuity_key;
      else if (g.continuity_key) this.note(`continuity_key is not an Ed25519 did:key; receipt left unbound`);
      this.note(`lobby: unsigned greeting ${g.msg_id}`);
      return [this.greetingFor(e), ...this.lobby(e, g.msg_id)];
    }
    this.note(`greeting ${g.msg_id} from ${g.from}`);
    const reply = this.greetingFor(e); e.greetDigest = this.currentRaw?.payload_digest; e.greetReply = reply;
    return [reply];
  }
  /** The meeting key (issued or received) whose pair place has this id, if any. */
  meetingKeyFor(placeId: string): S.PeerInvitation | undefined {
    for (const inv of this.invitationsIssued.values()) if (inv.payload.place?.place_id === placeId) return inv.payload;
    for (const got of this.invitationsReceived.values()) if (got.invitation.payload.place?.place_id === placeId) return got.invitation.payload;
    return undefined;
  }
  private denyNever(e: Enc, inReplyTo: string): Msg {
    e.closed = true; e.responded = true; e.step = 99;
    return { ...this.hdr(e, "invitation_response"), in_reply_to: inReplyTo, decision: "deny", disposition: "never", retry: { kind: "never" },
      courtesy: this.courtesy(e, "deny_never", "adversarial"), basis: this.basis(this.gateInputFor(e, { ritual: "skipped", card_status: "replay" }), this.clock()) };
  }

  // ---------- lobby (§3.3) ----------
  private lobby(e: Enc, inReplyTo: string | undefined): Msg[] {
    const P = this.cfg.policy; const now = this.clock(); const { locale, match } = this.loc(e);
    const hadFarewell = e.hostFarewell;
    e.lobby = true; e.closed = true; e.step = 99; e.responded = true;
    const hook = this.opts.receipt?.(e.id);
    const ttl = Math.min(P.lobby.receipt_ttl_days, 7);
    const receipt: S.VisitReceipt = { receipt_id: hook?.receipt_id ?? randomId("vr"), nonce: hook?.nonce ?? randomId("vrn") + randomId("x"), issued_at: now, expires_at: addDays(now, ttl),
      handling: "bearer_secret", ...(e.continuityKey ? { bound_key: e.continuityKey } : {}) };
    const key = "lobby:" + receipt.receipt_id;
    this.receipts.set(receipt.receipt_id, { r: receipt, used: false, recordKey: key });
    e.receiptId = receipt.receipt_id;
    const brief: Msg = { ...this.hdr(e, "lobby_briefing"), about: { locale, locale_match: match, register: "first_meeting", text: lobbyText(P.lobby.about, locale) },
      how_this_place_works: { text: lobbyText(P.lobby.how, locale), locale }, onboarding_url: P.lobby.onboarding_url, visit_receipt: receipt, purposes: P.purposes,
      spec_ref: SPEC_REF, inbox: this.inboxUrl(), actions: this.placeActions(), templates: this.templates(),
      // v0.5.0 (§2.3, C246): conduct rules are served before seating (not to a shokai/0.3 visitor: a v0.5.0 member).
      ...(!this.legacy && P.conduct_rules?.length ? { conduct_rules: P.conduct_rules } : {}),
      // v0.5.0 (§6.10, C250): the named outside classifiers, beside the conduct rules (not to a shokai/0.3 visitor).
      ...(!this.legacy && P.third_party_classifiers?.length ? { third_party_classifiers: P.third_party_classifiers } : {}),
      ...(!this.legacy && P.model_providers?.length ? { model_providers: P.model_providers } : {}),
      // v0.5.0 (§11.1, C254): the tags this place accepts (not in a reply to shokai/0.3).
      ...(!this.legacy ? { accepted_tags: this.acceptedTags() } : {}) };
    if (this.cfg.seeking) brief.seeking = this.cfg.seeking;
    const rr: S.ReadinessRequirement[] = P.lobby.readiness.map((r) => ({ code: r.code, required: r.required, ...readiness(r.code, locale, r.required),
      ...(r.required ? { how: { kind: "link" as const, url: P.lobby.onboarding_url } } : {}) }));
    const creds = [...new Set(P.lobby.readiness.filter((r) => r.required).map((r) => REQUIRED_CRED[r.code]))];
    const resp: Msg = { ...this.hdr(e, "invitation_response"), ...(inReplyTo ? { in_reply_to: inReplyTo } : {}), decision: "deny", disposition: "not_now",
      retry: { kind: "with_credential", credentials: creds }, reason_code: "CREDENTIAL_REQUIRED", readiness_requirements: rr,
      context_statement: { text: t(locale, "ctx_card"), locale }, courtesy: { locale, locale_match: match, register: "first_meeting", text: t(locale, "lobby_deny") },
      basis: this.basis(this.gateInputFor(e, { ritual: "lobby" }), now) };
    const rec: S.RelationshipRecord = { relationship_ref: "rel-" + short(key), counterpart_principal_id: "unbound:" + receipt.receipt_id, representative_ids: [e.visitor], register: "first_meeting",
      encounters: [{ encounter_id: e.id, response_msg_id: resp.msg_id, decision: "deny", disposition: "not_now", outcome: "declined", at: now }] };
    resp.relationship_ref = rec.relationship_ref;
    this.records.set(key, rec);
    this.note(`lobby_briefing + deny not_now to ${e.visitor} (receipt ${receipt.receipt_id}${receipt.bound_key ? ", bound" : ""}, nonce [redacted])`);
    return hadFarewell ? [brief, resp] : [brief, resp, this.farewell(e, "declined")];
  }

  get testProfile(): boolean { return !!this.opts.testProfile; }
  /** Pre-release review (§2.1): principal.kind outside the enum, an RFC 2606 reserved rp_id at a public entry outside the test profile, or an rp_id not in acceptedRpIds. */
  cardRpKindProblem(card: any): string | null {
    const kind = card?.principal?.kind;
    if (!PRINCIPAL_KINDS.includes(kind)) return `principal.kind "${String(kind)}" is not person|brand|company|system`;
    const rp = card?.owner_binding?.rp_id; if (typeof rp !== "string") return null;
    if (this.opts.acceptedRpIds && !this.opts.acceptedRpIds.includes(rp)) return `rp_id ${rp} is not one this door accepts`;
    // Evaluated now, from the current entry address (a door may be re-pointed after construction), unless the operator set allowReservedRpIds.
    const allowReserved = this.opts.allowReservedRpIds ?? !publicEntryUrl(this.opts.entryUrl);
    if (!this.testProfile && !allowReserved && reservedRpId(rp)) return `rp_id ${rp} is an RFC 2606 reserved name (a development passkey), refused outside the test profile`;
    return null;
  }
  /** Appendix B.4 (v0.2.5): only inside a conformance run. */
  get testDecider(): boolean { return !!this.opts.testProfile && !!this.opts.testDecider; }
  /** v0.5.0 (§11.1, C254): the wire tags this place accepts now: shokai/0.3 too until the transition window ends. */
  acceptedTags(): S.ProtocolVersion[] { return V5.wireTagAccepted(LEGACY_TAG, this.clock(), this.opts.legacyWireUntil) ? [PROTOCOL, LEGACY_TAG] : [PROTOCOL]; }
  inboxUrl(): string { return this.opts.inboxUrl ?? (this.opts.entryUrl ? this.opts.entryUrl.replace(/\/entry$/, "/inbox") : ""); }
  /** §3.1 / §3.3 (v0.2.3): the actions this place offers, per purpose; spends and needs are machine fields. */
  placeActions(): S.PlaceAction[] {
    const P = this.cfg.policy;
    const acts: S.PlaceAction[] = P.actions.map((a) => ({ action: a.action, purposes: a.purposes, spends: P.spending_actions.includes(a.action), ...(createsAccount(P, a.action) ? { creates_account: true } : {}),
      ...(createsAccount(P, a.action) && P.account_creation === "introduction_or_invitation" ? { requires_introduction: true } : {}),
      ...(a.requires_customer_link ? { requires_customer_link: true } : {}),
      needs: this.cfg.peer ? "pair_invitation" as const : "standard" as const, data_asks: a.data_asks ?? [], ...this.v050Action(a.action, a) }));
    const consPurposes = [...new Set(P.purposes.map((p) => p.code))];
    for (const a of P.considering.actions) if (!acts.some((x) => x.action === a)) acts.push({ action: a, purposes: consPurposes, spends: P.spending_actions.includes(a), ...(createsAccount(P, a) ? { creates_account: true } : {}), needs: "considering", data_asks: [] });
    return acts;
  }
  /** v0.5.0 (§6.9, §5.5): an action's trust path KINDS (never a threshold), costs_place and effort_hint; none under shokai/0.3. */
  private v050Action(action: string, a: { costs_place?: boolean; effort_hint?: { typical_turns: number } }): Partial<S.PlaceAction> {
    if (this.legacy) return {};
    const P = this.cfg.policy; const req = P.trust_requirements?.[action];
    return { ...(req ? { trust: { paths: V5.trustPathKinds(req), ...(P.trust_obtain_url ? { obtain_url: P.trust_obtain_url } : {}) } } : {}),
      ...(a.costs_place ? { costs_place: true } : {}), ...(a.effort_hint ? { effort_hint: a.effort_hint } : {}) };
  }
  /** Red team phase 1 (§3.2, C268, provisional): GET <entry>/host-card.json: the place's signed Shōkai host card, so a visiting
   *  representative can check the door before it shows its own card. 404 when the door has no usable host card. */
  hostCardPublic(): { status: 200 | 404; headers: Record<string, string>; body: unknown } {
    const c = this.cfg.card; if (!c || c.payload.kind !== "host" || this.hostCardProblem()) return { status: 404, headers: {}, body: { error: "no_host_card" } };
    return { status: 200, headers: { "cache-control": "public, max-age=300" }, body: c };
  }
  /** v0.5.0 (§2.3, C248): GET <entry>/house-summary.json: the summary its Shōkai host card's summary_digest names, cacheable while it holds. */
  houseSummary(): { status: 200 | 404; headers: Record<string, string>; body: unknown } {
    const sum = this.cfg.policy.summary; const d = this.cfg.card?.payload.summary_digest;
    if (!sum || !d || V5.summaryDigest(sum) !== d) return { status: 404, headers: { "cache-control": "no-store" }, body: { error: "no_house_summary" } };
    return { status: 200, headers: { "cache-control": "public, max-age=300", etag: `"${d}"` }, body: sum };
  }
  /** v0.5.0 (§6.9, C244): the place revokes a receipt it issued. A fee or deposit is kept ("forfeited") only on a finding it sent as a
   *  MisconductNotice (notice_ref); a refund or chargeback revokes it. Open seats relying on it end at once. */
  revokeOwnReceipt(receipt_id: string, reason: NonNullable<S.TrustReceiptRevocation["reason"]>, notice_ref?: string): boolean {
    if (reason === "forfeited" && !(notice_ref && this.notices.has(notice_ref))) { this.note(`receipt ${receipt_id}: kept only on a recorded finding (no notice ${notice_ref ?? "given"})`); return false; }
    this.revokedReceipts.add(receipt_id);
    for (const st of this.seats.values()) if (st.trust?.receipts.includes(receipt_id)) st.unseated = true;
    this.note(`receipt ${receipt_id} revoked (${reason}); seats relying on it ended`); return true;
  }
  /** §3.3 (v0.2.3): unsigned fill-in skeletons; `<…>` marks what the owner or representative fills in. Never a credential, never gate input. */
  templates(): S.PlaceTemplates {
    const P = this.cfg.policy; const purposes = P.purposes.map((p) => p.code); const actions = P.actions.map((a) => a.action);
    const card: Partial<S.RepresentativeCard> = { protocol: this.curTag ?? PROTOCOL, card_id: "<card id>", representative_id: "<your representative's did:key>",
      principal: { principal_id: "<your owner's DID (did:jwk of the owner passkey, or did:web)>", kind: "person", display_name: "<owner's name>" }, role: "<e.g. Personal representative of …>",
      standing: { tier: "provisional" }, mandate_scope: { purposes, actions }, locales: ["<BCP 47, e.g. en-US>"],
      representative_key: { key_id: "<representative did>#<fragment>", alg: "Ed25519", public_key: "<base64url raw Ed25519 key>" },
      owner_binding: { method: "passkey_webauthn", owner_id: "<same as principal_id>", rp_id: "<the relying-party id your owner's passkey was registered with>" },
      issued_at: "<RFC 3339 UTC, whole seconds, e.g. 2026-10-26T16:00:00Z>", expires_at: "<RFC 3339 UTC>" };
    // v0.2.4 (§3.3, C131): one skeleton per purpose, listing only the actions that serve it; a spending purpose carries a max_amount placeholder.
    const mandates: S.PlaceTemplates["mandates"] = {};
    for (const code of purposes) {
      const acts = P.actions.filter((a) => a.purposes.includes(code)).map((a) => a.action);
      const spends = acts.some((a) => P.spending_actions.includes(a));
      mandates[code] = { mandate_id: "<mandate id>", principal_id: "<your owner's DID: MUST equal the card's principal_id>", representative_id: "<your representative's did:key>",
        card_id: "<card id>", purpose: { code: code as S.PurposeCode, statement: "<one sentence: what your owner wants done here>", locale: "<BCP 47>" },
        allowed_actions: acts, limits: spends ? { max_amount: { value: "<amount, e.g. 100.00>", currency: "<ISO 4217, e.g. USD>" } as unknown as S.Money } : {},
        valid_from: "<RFC 3339 UTC>", expires_at: "<RFC 3339 UTC>" };
    }
    // v0.5.0 (§2.2, C242): closed templates list every top-level member the place accepts; optional ones get a placeholder.
    if (P.closed_templates) {
      for (const k of Host.CARD_OPTIONAL) if (!(k in card)) (card as Record<string, unknown>)[k] = "<optional>";
      for (const m of Object.values(mandates)) for (const k of Host.MANDATE_OPTIONAL) if (!(k in m)) (m as Record<string, unknown>)[k] = "<optional>";
    }
    const t: S.PlaceTemplates = { card, mandates, ...(P.closed_templates ? { closed: true as const } : {}) };
    if (P.serves_allowances) t.allowance_grant = { grant_id: "<grant id>", salt: "<128-bit random, base64url>", purposes, place_categories: P.category ? [P.category] : [], actions } as Partial<S.AllowanceGrant>;
    return t;
  }

  private farewell(e: Enc, outcome: S.Farewell["outcome"], register?: S.EtiquetteRegister): Msg {
    e.hostFarewell = true;
    if (e.neverClosed) outcome = "declined_never";   // §2.4 (v0.2.3): after a never, no invitation to return
    // the Peer meetings extension: the pair invitation is single use, spent at the farewell (ours or the visitor's, whichever comes first).
    if (this.cfg.peer && e.invitationId && !this.spentInvitations.has(e.invitationId)) { this.spentInvitations.add(e.invitationId); this.note(`peer invitation ${e.invitationId} spent at the farewell`); }
    const key = ({ seated: "farewell_seated", taken_inside: "farewell_inside", declined_never: "farewell_never", withdrawn: "farewell_withdrawn",
      completed: "farewell_completed" } as Record<string, Parameters<typeof t>[1]>)[outcome] ?? "farewell_declined";
    return { ...this.hdr(e, "farewell"), outcome, courtesy: this.courtesy(e, key, register) };
  }

  /** §3.2: explicit deny for anything out of order. Before a verified card: the lobby deny; after: RITUAL_ORDER. */
  private outOfOrder(msg: Msg, _signed: boolean): Msg[] {
    let e = this.encounters.get(msg.encounter_id);
    const pre: Msg[] = [];
    if (!e) { e = this.newEnc(msg.encounter_id, msg.from ?? "urn:shokai:anon:" + randomId("v").slice(2), [], ""); pre.push(this.greetingFor(e)); }
    if (!e.verified) { this.note(`out of order before a verified card (${msg.type} ${msg.msg_id}) → lobby deny`); return [...pre, ...this.lobby(e, msg.msg_id)]; }
    return this.ritualOrder(e, msg.msg_id);
  }
  private ritualOrder(e: Enc, inReplyTo: string): Msg[] {
    const P = this.cfg.policy; const now = this.clock();
    const hadFarewell = e.hostFarewell;
    // the Peer meetings extension (C109): the pair meeting IS its encounter (encounter_id = place id), so a spent invitation can only come back into the
    // closed meeting; answer it as the invitation failure it is (not_now, readiness owner_consent), not as a ritual slip (host-3-022).
    if (this.cfg.peer && e.closed && e.invitationId && this.spentInvitations.has(e.invitationId)) {
      const { locale } = this.loc(e);
      this.note(`pair meeting ${e.id} already closed; invitation ${e.invitationId} is spent → not_now owner_consent`);
      return [{ ...this.hdr(e, "invitation_response"), in_reply_to: inReplyTo, decision: "deny", disposition: "not_now",
        retry: { kind: "with_credential", credentials: ["owner_consent"] }, readiness_requirements: [{ code: "owner_consent", required: true, ...readiness("owner_consent", locale) }],
        context_statement: { text: t(locale, "ctx_consent"), locale }, courtesy: this.courtesy(e, "ritual"), basis: this.basis(this.gateInputFor(e, { ritual: "skipped" }), now) }];
    }
    e.closed = true; e.responded = true;
    this.note(`RITUAL_ORDER on ${inReplyTo}`);
    const r: Msg = { ...this.hdr(e, "invitation_response"), in_reply_to: inReplyTo, decision: "deny", disposition: "not_now", reason_code: "RITUAL_ORDER",
      retry: { kind: "after", not_before: addSec(now, P.ritual_retry_s) }, courtesy: this.courtesy(e, "ritual"),
      basis: this.basis(this.gateInputFor(e, { ritual: "skipped" }), now) };
    return hadFarewell ? [r] : [r, this.farewell(e, "declined")];
  }
  /** Common guard for steps after the greeting. Returns the encounter, or the reply to send instead. */
  private guard(msg: Msg, signed: boolean, need: number[]): Enc | Msg[] {
    const e = this.encounters.get(msg.encounter_id);
    if (!e || !signed || e.lobby || !e.verified) return this.outOfOrder(msg, signed);
    if (this.real && e.card && msg.from !== e.card.representative_id) { this.note(`discard ${msg.msg_id}: sender is not the card's representative`); return []; }
    if (e.closed || !need.includes(e.step)) return this.outOfOrder(msg, signed);
    return e;
  }

  // ---------- step 2 ----------
  private onCard(c: S.CardPresentation, signed: boolean): Msg[] {
    const e = this.encounters.get(c.encounter_id);
    if (!e || e.closed || e.step !== 1) return this.outOfOrder(c, signed);
    const P = this.cfg.policy; const now = this.clock();
    const card = c.card?.payload;
    // C272 (provisional): on shokai/0.5, every card_receipt carries a fresh, single-use claim challenge for this encounter.
    const receipt = (d: string): Msg => {
      if (e.tag !== "shokai/0.5") return { ...this.hdr(e, "card_receipt"), card_digest: d };
      e.claimChallenge = { challenge: b64u(randomBytes(16)), expires_at: new Date(Date.parse(now) + V5.CLAIM_CHALLENGE_TTL_S * 1e3).toISOString() };
      return { ...this.hdr(e, "card_receipt"), card_digest: d, claim_challenge: { challenge: e.claimChallenge.challenge, expires_at: e.claimChallenge.expires_at } };
    };
    // Unprepared: unsigned message, no card, or a card with zero signatures → the lobby (§3.3).
    if (!signed || !card || !Array.isArray(c.card.signatures) || c.card.signatures.length === 0) {
      const pre = card && c.card?.payload_digest ? [receipt(c.card.payload_digest)] : [];
      return [...pre, ...this.lobby(e, c.msg_id)];
    }
    if (!e.locales.length) e.locales = card.etiquette?.locales ?? card.locales ?? [];
    e.timeZone ??= card.etiquette?.time_zone;
    const deny = (disposition: S.Disposition, reg: S.EtiquetteRegister, retry: S.Retry, status: string): Msg[] => {
      e.closed = true; e.step = 99; e.responded = true;
      const r: Msg = { ...this.hdr(e, "invitation_response"), in_reply_to: c.msg_id, decision: "deny", disposition, retry,
        courtesy: this.courtesy(e, disposition === "never" ? "deny_never" : "deny_not_now", reg), basis: this.basis(this.gateInputFor(e, { ritual: "ok", card_status: status }), now) };
      if (disposition !== "never") r.context_statement = { text: t(this.loc(e).locale, ctxKey), locale: this.loc(e).locale };
      if (readinessCode) { r.reason_code = "CREDENTIAL_REQUIRED"; r.readiness_requirements = [{ code: readinessCode, required: true, ...readiness(readinessCode, this.loc(e).locale) }]; }
      if (disposition === "never") e.neverClosed = true;
      return [receipt(c.card.payload_digest), r, this.farewell(e, "declined", reg)];
    };
    let ctxKey: Parameters<typeof t>[1] = "ctx_card"; let readinessCode: S.ReadinessRequirement["code"] | undefined;
    // §2.1: card key = the key representative_id resolves to; the presenter is the card's representative. A mismatch is forgery (never, presenter only).
    // Review 4 R4-07: one encoding, base64url of the raw 32 bytes. Any other form (the did:key string included) is a malformed card, a setup failure.
    if (card.representative_key?.alg === "Ed25519" && this.real && !/^[A-Za-z0-9_-]{43}$/.test(String(card.representative_key.public_key ?? ""))) {
      this.note(`card in ${c.msg_id}: representative_key.public_key isn't base64url of 32 raw bytes → not_now (setup failure, R4-07)`);
      readinessCode = "card"; return deny("not_now", "first_meeting", { kind: "with_credential", credentials: ["signed_card"] }, "malformed");
    }
    // Review 6 R6-01: step (0), before anything else: a host card is the wrong kind, never `never` (an owner's agent presenting its
    // owner's host card, made with another key as §2.3 recommends, fails step (1) otherwise).
    if (cardKindOf(card, "visitor") !== "visitor") {
      this.note(`a Shōkai host card was presented as a visitor's credential (${c.msg_id}): deny not_now, readiness card_kind (setup failure, nothing recorded)`);
      ctxKey = "ctx_card"; readinessCode = "card_kind";
      return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "wrong_kind");
    }
    // Review 6 R6-01: a card naming the presenter whose key isn't the key its id resolves to (an SDK bug, a did:web rotation) is a setup failure.
    if (sameDid(card.representative_id, c.from) && !this.verifier.cardKeyBinds(card)) {
      this.note(`card in ${c.msg_id}: representative_key isn't the key its representative_id resolves to → not_now (setup failure, R6-01)`);
      readinessCode = "card"; return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "key_mismatch");
    }
    if (!sameDid(card.representative_id, c.from)) {
      this.signals.push({ at: now, principal: card.principal?.principal_id ?? "?", kind: "impersonation", encounter_id: e.id }); // no notice to the card's owner (§9.3)
      this.bindNever(c.from, now);
      this.note(`key binding failed for ${c.msg_id}: deny never (presenter bound)`);
      return deny("never", "adversarial", { kind: "never" }, "forged");
    }
    // §2.4 (v0.2.3): a missing or malformed proof is a setup failure → not_now / CREDENTIAL_REQUIRED, readiness possession_proof. Never `never`.
    if (!this.verifier.proofShape(c.possession_proof, card)) {
      this.note(`possession proof missing or malformed in ${c.msg_id}: deny not_now (setup failure)`);
      ctxKey = "ctx_possession"; readinessCode = "possession_proof";
      return deny("not_now", e.register, { kind: "with_credential", credentials: ["possession_proof"] }, "proof_missing");
    }
    // R3-01 (§2.4, C292): under shokai/0.5 the presentation and its proof are bound to this door. The envelope's `to` MUST be this
    // door's representative and the proof MUST name it as `audience`; otherwise it was made for another door (a relay) or is a setup
    // mistake: not_now / CREDENTIAL_REQUIRED, readiness possession_proof, nothing bound (the visitor may be the relay's victim).
    const v05 = c.protocol === "shokai/0.5";
    if (v05 && this.real) {
      const aud = (c.possession_proof as any)?.audience;
      if (typeof c.to !== "string" || !sameDid(c.to, this.cfg.rep_id) || typeof aud !== "string" || !sameDid(aud, this.cfg.rep_id)) {
        this.note(`possession proof in ${c.msg_id} is not addressed to this door (to=${String(c.to)}, audience=${String(aud)}): deny not_now, nothing bound (relay or setup)`);
        ctxKey = "ctx_possession"; readinessCode = "possession_proof";
        return deny("not_now", e.register, { kind: "with_credential", credentials: ["possession_proof"] }, "audience");
      }
    }
    // Card signature by the principal (key resolved from principal_id), expiry, strict timestamps; an owner signs with a passkey against its rp_id (§2.1–§2.3, §2.6).
    // Fable review: enforce_owner_passkey follows the owner binding, not only the self-declared kind (a card with an owner
    // binding always needs the owner's passkey); kind must be one of the enum; reserved/unaccepted rp_ids are refused.
    const ownerPasskey = this.real && P.enforce_owner_passkey && (card.principal?.kind === "person" || !!card.owner_binding);
    const rp = card.owner_binding?.rp_id;
    const why = this.real ? this.cardRpKindProblem(card) : null;
    if (why) { this.note(`card refused ${c.msg_id}: ${why}`); return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "invalid"); }
    const tsBad = this.real && badTimestamps(c.card).length > 0;
    const cardDigest = tsBad ? null : this.verifier.signed(c.card, card.principal?.principal_id, undefined, ownerPasskey ? "ES256" : undefined, rp);
    // §2.3 (C3): a RepresentativeCard MUST contain issued_at and expires_at. A card missing either, or with a malformed one, is invalid
    // in every mode (the test profile too), never read as non-expiring (conformance 2026-11-08, finding 1).
    const expired = !isTimestamp(card.issued_at) || !isTimestamp(card.expires_at) || isExpired(card.expires_at, now) || notYetValid(card.issued_at, now);
    const obMismatch = !!card.owner_binding && !sameDid(card.owner_binding.owner_id, card.principal?.principal_id ?? "");
    // v0.4.0 (§5.1, §5.4, C210, C211): a card never carries an owner's credential, an account identifier or a payment instrument.
    const carries = forbiddenMembers(card, [...CREDENTIAL_MEMBERS, ...INSTRUMENT_MEMBERS]);
    if (carries.length) this.note(`card carries ${carries.join(", ")}: a Shōkai card never carries credentials or payment instruments → invalid`);
    if (!cardDigest || expired || carries.length || (card.protocol !== PROTOCOL && card.protocol !== LEGACY_TAG && !(this.opts.acceptLegacyCards && card.protocol === LEGACY_PROTOCOL)) || (ownerPasskey && !rp) || obMismatch) {
      this.note(`card did not verify ${c.msg_id}${tsBad ? " (timestamp form)" : ownerPasskey && !rp ? " (no rp_id)" : ""}`);
      return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "invalid");
    }
    // v0.3.0-rc4 (§2.4 step 3, §2.6, C191): a revoked card is refused like an invalid one (not_now, no reason told, nothing recorded),
    // BEFORE the possession proof is judged: a revoked card is often a stolen key, and judging its proof could bind the real owner.
    const rv = this.cardRevocationState(card, cardDigest, now);
    if (rv === "revoked") { this.note(`card ${card.card_id} is revoked by its principal (${c.msg_id}): deny not_now, nothing recorded`); return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "revoked"); }
    if (rv === "unreachable") { this.note(`card ${card.card_id}: revocation list unreachable (${c.msg_id}): deny not_now, retry after (fail closed, setup failure)`);
      return deny("not_now", e.register, { kind: "after", not_before: new Date(Date.parse(now) + 3600e3).toISOString().replace(/\.\d+Z$/, "Z") }, "revocation_unreachable"); }
    // §2.4 (v0.2.3): a proof that is present and well formed but fails is never: binds the presenter's key, and the card's principal
    // because the presenter is the card's own representative (checked above; the card is genuinely the principal's). 180 days, local.
    if (!this.verifier.possession(c.possession_proof!, card, e.id, e.hostNonce, v05 && this.real ? this.cfg.rep_id : undefined)) {
      // Review 6 R6-01: step (1) proved the presenter holds the card key, so a failing or copied proof is its own mistake (e.g. an SDK
      // retry that cached a presentation): a setup failure, nothing bound.
      this.note(`possession proof failed for ${c.msg_id}: deny not_now (setup failure, nothing bound, R6-01)`);
      ctxKey = "ctx_possession"; readinessCode = "possession_proof";
      return deny("not_now", e.register, { kind: "with_credential", credentials: ["possession_proof"] }, "proof_failed");
    }
    if (this.isNever(card.principal.principal_id, now) || this.isNever(card.representative_id, now)) return deny("never", "adversarial", { kind: "never" }, "never");
    // v0.4.0 (§2.3, §2.4 step 5, C202): a Shōkai host card shown as a visitor's credential is the wrong kind: a setup failure, fixable
    // in one step, with a fixed sentence. not_now / CREDENTIAL_REQUIRED, readiness card_kind, retry with a signed card (a new
    // visit). Never `never`, no notice, nothing recorded against anyone.
    // (moved to step (0), review 6 R6-01)
    // v0.5.0 (§2.2, C242): with closed templates, a card carrying a top-level member its template doesn't list is refused like one
    // that doesn't verify (never dropped and acted on: the owner signed all of it). Nothing recorded.
    if (P.closed_templates) { const off = V5.offTemplate(card, this.templates().card);
      if (off.length) { this.note(`card ${card.card_id} carries ${off.join(", ")}, not in the closed card template (${c.msg_id}): deny not_now`);
        return deny("not_now", e.register, { kind: "with_credential", credentials: ["signed_card"] }, "off_template"); } }
    if (card.owner_binding?.rp_id) this.knownRp.set(card.owner_binding.owner_id, card.owner_binding.rp_id);
    e.card = card; e.cardDigest = cardDigest; e.verified = true; e.step = 2;
    const rec = this.records.get(canonDid(card.principal.principal_id)); if (rec) e.register = rec.register === "adversarial" ? "adversarial" : "established";
    const mine: Msg = { ...this.hdr(e, "card_presentation"), card: this.cfg.card ?? null,
      // Review 4 R4-04 (§2.4, C292): under shokai/0.5 the door's own proof is bound to the visitor too: audience = the visitor's representative id.
      possession_proof: this.rep ? { ...makeSigned(possessionPayload(e.id, e.visitorNonce, v05 ? card.representative_id : undefined), this.rep, now).signatures[0], key_id: this.cfg.card?.payload.representative_key.key_id ?? this.rep.key_id, ...(v05 ? { audience: card.representative_id } : {}) }
        : { alg: "Ed25519", key_id: this.cfg.rep_id + "#k1", signer: this.cfg.rep_id, signed_at: now, value: "sig-placeholder" } };
    this.note(`card verified for ${card.representative_id}`);
    return [mine, receipt(cardDigest)];
  }
  /** card_receipt is recommended, never required (§3.2). Accepted at steps 2–3 as a no-op. */
  private onCardReceipt(msg: Msg, signed: boolean): Msg[] {
    // Pair place (PA2): the counterpart may acknowledge our card before presenting its own; a receipt of our own card digest at step 1 is a no-op.
    const e0 = this.encounters.get(msg.encounter_id);
    if (e0 && signed && !e0.closed && e0.step === 1 && this.cfg.card && msg.card_digest === this.cfg.card.payload_digest && sameDid(msg.from, e0.visitor)) return [];
    const e = this.guard(msg, signed, [2, 3, 5]); return Array.isArray(e) ? e : [];
  }

  // ---------- step 3 ----------
  private onIntroduction(i: S.Introduction, signed: boolean): Msg[] {
    const e = this.guard(i, signed, [2]); if (Array.isArray(e)) return e;
    const now = this.clock(); e.step = 3;
    if (i.invitation_ref) e.invitationRef = i.invitation_ref;
    // the Peer meetings extension (v0.2.3): in a pair place the host side introduces itself unasked, citing the same invitation.
    const mine: Msg[] = this.cfg.peer && i.invitation_ref ? [{ ...this.hdr(e, "introduction"), vouch: null, invitation_ref: i.invitation_ref }] : [];
    // v0.5.0 (§4.1, C245): {vouch: null, introduction_card: {card, claim}}: a claimed Shōkai introduction card counts as a vouch.
    const ic = (i as S.Introduction & { introduction_card?: { card: S.Signed<S.ShokaiIntroduction>; claim: S.Signed<S.IntroductionClaim> } }).introduction_card;
    if (this.v05 && (i.vouch === null || i.vouch === undefined) && ic && typeof ic === "object") { this.onIntroductionCard(e, ic, now); return mine; }
    if (i.vouch === null || i.vouch === undefined) { e.vouchWeight = "none"; return mine; }   // honest self-introduction (§4)
    const v = i.vouch.payload;
    const intro = v?.introducer?.principal_id;
    const d = this.real && badTimestamps(i.vouch).length ? null : this.verifier.signed(i.vouch, intro, undefined, undefined, this.rpOf(intro));
    e.vouch = v; e.vouchDigest = d ?? i.vouch.payload_digest; e.vouchOk = !!d;
    e.vouchWeight = d ? this.vouchWeight(v, e, now) : "none";
    this.note(`introduction ${v?.vouch_id} weight=${e.vouchWeight}${d ? "" : " (signature not verified: no weight)"}`);
    return mine;
  }
  /** v0.5.0 (§4.1, C245): verify the card and the claim; the first valid claim binds its code to the presenting principal for good.
   *  A code bound to someone else is no introduction (a fixable setup failure; the third within 24 h is gate_probing); every code
   *  bound to others is INTRODUCTION_USED_UP at step 5. A claimed card is then weighed exactly as a vouch from its introducer. */
  /** §4.1, §9.3: a failed introduction-code attempt; the third within 24 hours is gate_probing. */
  private introProbe(pid: string, e: Enc, now: string) {
    const probes = (this.introProbes.get(canonDid(pid)) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3); probes.push(now); this.introProbes.set(canonDid(pid), probes);
    if (probes.length >= 3) { this.signals.push({ at: now, principal: pid, kind: "gate_probing", encounter_id: e.id }); this.note(`failed or bound introduction codes presented ${probes.length} times in 24 h → gate_probing`); }
  }
  private onIntroductionCard(e: Enc, ic: { card: S.Signed<S.ShokaiIntroduction>; claim: S.Signed<S.IntroductionClaim> }, now: string) {
    e.vouchWeight = "none";
    if (!e.card || !e.cardDigest) return;
    const pid = e.card.principal.principal_id;
    // §4.1 (C296): during the backoff a failed attempt left on this principal or its source, the claim is refused unchecked (nothing is
    // verified or counted; the encounter's challenge is spent: one attempt per challenge) and the request is answered not_now.
    const bo = this.claimBackoffEnd(pid, now);
    if (bo) { if (e.claimChallenge) e.claimChallenge.used = true; e.claimBackoffUntil = bo.until; this.note(`introduction claim refused unchecked: the ${bo.by} is in its claim backoff until ${bo.until} (C296) → not_now`); return; }
    const cc = V5.checkIntroductionCard(this.verifier, ic.card, { place: this.cfg.principal_id, now, rpOf: this.rpOf });
    if (!cc.ok) { this.note(`introduction card: ${cc.why} → no weight`); return; }
    // §4.1 (C287): claims on a card past its failure cap are suspended for the window: not checked, no weight.
    const icKey = ic.card.payload_digest; const cap = this.opts.claimFailCapPerCard;
    const fails = (this.claimFails.get(icKey) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3);
    if (cap && cap > 0 && fails.length >= cap) { this.note(`introduction card: claims suspended (${fails.length} failed in 24 h, C287) → no weight`); return; }
    // §4.1 (C296): each failed attempt counts per card (across all principals), per guessing principal and per source (client address).
    const failed = () => { fails.push(now); this.claimFails.set(icKey, fails); if (this.claimFails.size > 8192) { const k = this.claimFails.keys().next().value; if (k !== undefined) this.claimFails.delete(k); }
      this.recordClaimFailureBy(pid, now); };
    const cl = V5.checkIntroductionClaim(this.verifier, ic.claim, ic.card, { rep: e.card.representative_id, principal: pid, cardDigest: e.cardDigest, challenge: e.claimChallenge ?? null, now });
    if (e.claimChallenge) e.claimChallenge.used = true;   // single use: one attempt per challenge, valid or not
    if (!cl.ok) {
      // C272: a code that isn't on the card is a failed online attempt; it counts toward probing like a code bound to someone else.
      if (cl.why === "code_not_on_card") { this.introProbe(pid, e, now); failed(); }
      this.note(`introduction claim: ${cl.why} → no weight`); return; }
    const bound = this.introClaims.get(cl.claim_digest);
    if (bound && bound !== canonDid(pid)) {
      this.introProbe(pid, e, now); failed();
      e.introUsedUp = ic.card.payload.claim_digests.every((d) => { const b = this.introClaims.get(d); return !!b && b !== canonDid(pid); });
      this.note(`introduction code already bound to another principal → no introduction${e.introUsedUp ? " (every claim on the card is bound: INTRODUCTION_USED_UP)" : ""}`); return;
    }
    if (!bound) this.introClaims.set(cl.claim_digest, canonDid(pid));
    const v = V5.vouchOfIntroduction(ic.card.payload, e.card.representative_id, e.cardDigest);
    e.vouch = v; e.vouchOk = true; e.vouchDigest = undefined; e.introCard = { digest: ic.card.payload_digest, claimDigest: ic.claim.payload_digest };
    e.vouchWeight = this.vouchWeight(v, e, now);
    this.note(`introduction card ${ic.card.payload.introduction_id} claimed by ${pid}: weight=${e.vouchWeight}`);
  }
  /** v0.5.0 (§6.12, C263): a new context request for every declared field not yet declined by this owner in this visit. */
  /** Red team phase 1 (§6.12, C267, provisional): fields this owner declined within CONTEXT_DECLINE_WINDOW_DAYS (in memory). */
  ctxDeclinedBy = new Map<string, Map<string, string>>();
  /** C283: request_ids already returned once for reconsider after a required-field decline. */
  ctxReconsidered = new Set<string>();
  private rememberDeclined(pid: string, names: string[], now: string, answered: string[] = []) {
    const k = canonDid(pid); const m = this.ctxDeclinedBy.get(k) ?? new Map<string, string>();
    for (const n of answered) m.delete(n);   // answered now: no longer declined
    for (const n of names) m.set(n, addDays(now, CONTEXT_DECLINE_WINDOW_DAYS)); if (m.size) this.ctxDeclinedBy.set(k, m); else this.ctxDeclinedBy.delete(k);
  }
  recentlyDeclined(pid: string, now: string): string[] {
    const m = this.ctxDeclinedBy.get(canonDid(pid)); if (!m) return [];
    return [...m].filter(([, until]) => Date.parse(until) > Date.parse(now)).map(([n]) => n);
  }
  private newContextRequest(pid: string, declinedNow: string[], now: string): S.ContextRequest | null {
    const R = this.cfg.policy.context_requirements; if (!R || R.mode === "card_enough") return null;
    // C267: a field declined in an earlier visit within the window isn't asked again; a required one means no request at all.
    const recent = this.recentlyDeclined(pid, now);
    if ((R.fields ?? []).some((f) => f.required && recent.includes(f.name) && !declinedNow.includes(f.name))) { this.note(`context: a required field was declined within ${CONTEXT_DECLINE_WINDOW_DAYS} days → not asked again (C267)`); return null; }
    const declined = [...new Set([...declinedNow, ...recent])];
    const names = (R.fields ?? []).map((f) => f.name).filter((n) => !declined.includes(n)); if (!names.length) return null;
    const req = V5.contextRequestFor(this.cfg.name, R, names, { request_id: randomId("ctx"), expires_at: addSec(now, 3600), declined });
    if (req) { this.ctxRequests.set(req.request_id, { req, principal: canonDid(pid), spent: false, declined: [...declined] }); this.pruneContext(now); }
    return req;
  }
  /** v0.5.0 (§6.12, C263): a response this place may rely on: it answers an unspent, unexpired request this place sent to this same
   *  owner, and passes every check (ids, digest, place, each field exactly once, values 1–500 characters, the owner's signature).
   *  Anything else is treated as no response (and noted; never held against the visitor). */
  private usableContextResponse(resp: unknown, pid: string, now: string): { resp: S.ContextResponse; entry: { req: S.ContextRequest; principal: string; spent: boolean; declined: string[] } } | null {
    if (resp === undefined) return null;
    const r = resp as S.ContextResponse; const ent = r && typeof r === "object" && typeof r.request_id === "string" ? this.ctxRequests.get(r.request_id) : undefined;
    if (!ent) { this.note("context response for a request this place didn't send (or no longer holds) → treated as no response"); return null; }
    if (ent.spent) { this.note(`context response for ${r.request_id}, already relied on once → treated as no response (replay)`); return null; }
    if (ent.principal !== canonDid(pid)) { this.note(`context response for ${r.request_id}, sent to another owner → treated as no response`); return null; }
    if (isExpired(ent.req.expires_at, now)) { this.note(`context request ${r.request_id} expired → treated as no response`); return null; }
    const { owner_sig: _s, ...body } = r;
    const probs = V5.contextResponseProblems(r, ent.req, { ownerId: pid, verify: (sig) => this.verifier.detached(sig, body, pid) });
    if (probs.length) { this.note(`context response for ${r.request_id}: ${probs.join(", ")} → treated as no response`); return null; }
    return { resp: r, entry: ent };
  }
  /** v0.5.0 (§6.12): forget requests past their expiry and answers past their retention. */
  private pruneContext(now: string): void {
    for (const [k, v] of this.ctxRequests) if (isExpired(v.req.expires_at, addSec(now, -86400))) this.ctxRequests.delete(k);
    for (const [k, v] of this.ctxAnswers) if ((v.until && Date.parse(v.until) <= Date.parse(now)) || (!v.until && (!this.seats.has(k) || this.seats.get(k)!.unseated))) this.ctxAnswers.delete(k);
  }
  /** v0.5.0 (§6.12): the answers a seat holds (for the place's own service), or none. */
  contextAnswers(seat_id: string): { answers: { name: string; value: string }[]; declined: string[] } | null {
    this.pruneContext(this.clock()); const a = this.ctxAnswers.get(seat_id); return a ? { answers: a.answers.map((x) => ({ ...x })), declined: [...a.declined] } : null;
  }
  /** v0.5.0 (§6.9, C243, C244): each requested action's TrustRequirement against what the visitor presented and this place's own
   *  records. All met: unchanged. Some: conditional narrow_actions. None: not_now / TRUST_REQUIRED (under shokai/0.3, the v0.4.0
   *  POLICY_DENY: the new code isn't sent). Never a penalty. */
  private trustGate(r: S.InvitationRequest, e: Enc, card: S.RepresentativeCard, mandate: S.Mandate, actions: string[], weight: VouchWeight, invited: boolean, linked: boolean,
    record: S.RelationshipRecord | null, now: string): { result?: GateResult; miss: S.TrustRequirement[]; use?: SeatState["trust"] } {
    const P = this.cfg.policy; const reqs = P.trust_requirements ?? {}; const pid = card.principal.principal_id;
    const intro0 = (weight === "full" || weight === "reduced") && e.vouch ? e.vouch.introducer.principal_id : undefined;
    // C276 (§4): an open-only vouch (accept-anyone place) never counts toward known status or a trust threshold.
    const intro = intro0 && openOnlyVouch(P as any, intro0, this.cfg.principal_id, sameDid) ? undefined : intro0;
    const ownInvitation = !!intro && sameDid(intro, this.cfg.principal_id);
    // The introduction's kind from this place's own records, never from a claim (C199).
    const kind: S.IntroductionKind | null = !intro || ownInvitation ? null
      : (P.established_introducers ?? []).some((x) => sameDid(x, intro)) ? "established"
      : (this.records.get(canonDid(intro))?.encounters ?? []).some((x) => x.outcome === "seated" || x.outcome === "completed") ? "customer"
      : intro.startsWith("did:web:") && card.principal.kind !== "person" && sameDid(intro, pid) ? "organization" : "named";
    const seatedVisits = (record?.encounters ?? []).filter((x) => x.outcome === "seated" || x.outcome === "completed");
    const first = seatedVisits[0]?.at; const lastBad = (record?.misconduct ?? []).map((m) => m.at).sort().pop();
    const days = (from?: string) => (from ? Math.floor((Date.parse(now) - Date.parse(from)) / 86400e3) : 0);
    const base: V5.TrustFacts = { introduction: kind, place_invitation: invited || ownInvitation, customer_link: linked, mandate_max: parseMoney(mandate.limits?.max_amount),
      history: record ? { visits: seatedVisits.length, days: days(first), clean_days: days(lastBad ?? first) } : null, receipts: [] };
    const receipts = this.v05 && Array.isArray(r.trust_receipts) ? r.trust_receipts : [];
    const met: string[] = []; const miss: S.TrustRequirement[] = []; const used = new Set<string>(); let mismatch = false;
    for (const a of actions) {
      const req = reqs[a]; if (!req) { met.push(a); continue; }
      const facts: V5.TrustFacts = { ...base, receipts: [] };
      for (const rc of receipts) {
        const c = V5.checkTrustReceipt(this.verifier, rc, { place: this.cfg.principal_id, namedIssuers: P.trust_issuers ?? [], cardPrincipal: pid, action: a, now,
          revoked: this.revokedReceipts, fetched: this.fetched, perReceipt: req.grants?.per_receipt, perReceiptUses: this.grantUses.get(`receipt|${rc?.payload?.receipt_id}|${a}`) });
        if (c.ok) { facts.receipts.push({ kind: rc.payload.kind, value: parseMoney(rc.payload.value)!, issuer: c.issuer }); used.add(rc.payload.receipt_id); }
        else { if (c.step === 3) mismatch = true; this.note(`trust receipt for ${a}: check ${c.step} (${c.why}) → not relied on`); }
      }
      if (V5.trustPathMet(req, facts) >= 0) met.push(a); else miss.push(req);
    }
    if (mismatch) {
      const probes = (this.receiptProbes.get(canonDid(pid)) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - 86400e3); probes.push(now); this.receiptProbes.set(canonDid(pid), probes);
      if (probes.length >= 3) { this.signals.push({ at: now, principal: pid, kind: "gate_probing", encounter_id: e.id }); this.note(`another owner's receipt presented ${probes.length} times in 24 h → gate_probing`); }
    }
    const use = { receipts: [...used], ...(intro ? { introducer: canonDid(intro) } : {}) };
    if (!miss.length) return { miss, use };
    const kinds = V5.trustPathKinds({ any_of: miss.flatMap((t) => t.any_of) });
    const creds = this.legacy ? ["vouch" as S.CredentialKind] : V5.trustCredentials(kinds);
    const code: S.ReasonCode = this.legacy ? "POLICY_DENY" : "TRUST_REQUIRED";
    this.note(`trust requirement not met for ${actions.filter((a) => !met.includes(a)).join(", ")} → ${met.length ? "narrow" : code} (never a penalty)`);
    if (met.length) return { miss, use, result: { decision: "conditional", conditions: [{ code: "narrow_actions", params: { actions: met } }], reason_code: code, retry: { kind: "with_credential", credentials: creds } } };
    return { miss, use, result: { decision: "deny", disposition: "not_now", reason_code: code, retry: { kind: "with_credential", credentials: creds },
      ...(this.legacy ? {} : { readiness_requirements: [{ code: "trust", required: true }] }) } };
  }
  /** v0.5.0 (§6.9): the grant caps at each act, per canonical principal (across its representatives), introducer, receipt and pool.
   *  Past a cap: not_now / RATE_LIMITED (never a penalty). Returns the keys to count when the act goes through. */
  private grantCapsFor(st: SeatState, tool: string, now: string): { reached: true; until: string } | { reached: false; keys: string[] } {
    const g = this.cfg.policy.trust_requirements?.[tool]?.grants; if (!g) return { reached: false, keys: [] };
    const caps: [string, { max: number; period: S.GrantPeriod } | undefined][] = [[`principal|${canonDid(st.principal)}|${tool}`, g.per_principal],
      ...(st.trust?.introducer ? [[`introducer|${st.trust.introducer}|${tool}`, g.per_introducer] as [string, typeof g.per_introducer]] : []),
      ...(st.trust?.receipts ?? []).map((id) => [`receipt|${id}|${tool}`, g.per_receipt] as [string, typeof g.per_receipt]), [`pool|${tool}`, g.pool]];
    for (const [k, cap] of caps) if (cap && V5.capReached(this.grantUses.get(k) ?? [], cap, now)) {
      const uses = (this.grantUses.get(k) ?? []).filter((t) => Date.parse(t) > Date.parse(now) - V5.PERIOD_MS[cap.period]).sort();
      return { reached: true, until: addSec(uses[0] ?? now, V5.PERIOD_MS[cap.period] / 1e3) };
    }
    return { reached: false, keys: caps.filter(([, c]) => !!c).map(([k]) => k) };
  }
  /** §4 + D1: weight of a verified vouch at this gatekeeper, now. The revocation log is consulted, failing closed. */
  vouchWeight(v: S.Vouch, e: Enc, now: string, purpose?: S.PurposeCode): VouchWeight {
    if (!e.card || v.subject.representative_id !== e.card.representative_id || v.subject.card_digest !== e.cardDigest) return "none";
    if (isExpired(v.expires_at, now) || notYetValid(v.issued_at, now)) return "none";
    if (v.scope.counterparties && !v.scope.counterparties.includes(this.cfg.principal_id)) return "none";
    if (this.revokedVouches.has(v.vouch_id)) return "none";
    if (this.real) {
      const st = vouchLogState(this.fetched, v, this.verifier, this.rpOf, { now, requireHead: !!e.introCard });   // C271
      e.vouchLogUnreachable = st === "unreachable";
      if (st !== "clear") { this.note(`vouch ${v.vouch_id}: revocation log ${st} → no weight (fail closed${st === "unreachable" ? "; setup failure, nothing recorded" : ""})`); return "none"; }
    }
    const trusted = this.cfg.policy.trusted_introducers;
    // v0.2.10 (§4, D17): the place's own invitation is a vouch signed by the place's own principal; a place always trusts itself.
    const ownInvitation = sameDid(v.introducer.principal_id, this.cfg.principal_id);
    if (!ownInvitation && trusted !== "*" && !trusted.includes(v.introducer.principal_id)) return "none";
    // RT-E5: an introducer can't vouch beyond its own standing here: one this place has bound `never`, or with severe misconduct on record, carries no weight.
    if (this.isNever(v.introducer.principal_id, now) || (this.records.get(canonDid(v.introducer.principal_id))?.misconduct ?? []).some((x) => x.severity === "severe")) {
      this.note(`vouch ${v.vouch_id}: introducer ${v.introducer.principal_id} has no standing here (never / severe misconduct) → no weight`); return "none"; }
    if (purpose && !v.scope.purposes.includes(purpose)) return "none";
    // v0.2.9 (§4, §10): a brand introduction must declare paid-vs-genuine; without introducer_interest it carries no weight at a door (a setup failure).
    if (this.cfg.door && (purpose === "presentation" || purpose === "gift") && !v.introducer_interest) { this.note(`vouch ${v.vouch_id}: no introducer_interest on a brand introduction → no weight at this door`); return "none"; }
    const pen = this.activePenalty(v.introducer.principal_id, now, purpose ?? v.scope.purposes[0]);
    // C276 (§4, provisional): at an accept-anyone place a vouch from an introducer the place doesn't name carries reduced weight only.
    // The C276 limit is enforced where standing is computed (trustGate): an open-only vouch admits but never counts toward known status or a trust threshold.
    return pen ?? "full";
  }
  activePenalty(intro: string, now: string, purpose: S.PurposeCode): "reduced" | "suspended" | null {
    for (const p of this.introducers.get(intro) ?? []) {
      if (p.restored_by_review || p.grade === "none") continue;
      if (Date.parse(p.until) > Date.parse(now) && p.purposes.includes(purpose)) return p.grade;
    }
    return null;
  }

  // ---------- steps 4–6 ----------
  private onRequest(r: S.InvitationRequest, signed: boolean): Msg[] {
    const e0 = this.encounters.get(r.encounter_id);
    // An amended request after a conditional (D2), or, in a pair place (the Peer meetings extension, PA2), a further request after a grant in the same encounter.
    const amended = !!e0 && e0.verified && e0.step === 5 && !e0.closed && signed && (e0.lastDecision === "conditional" || (!!this.cfg.peer && e0.lastDecision === "grant"));
    const g = amended ? e0! : this.guard(r, signed, [3]); if (Array.isArray(g)) return g;
    const e = g;
    this.keepRawText(e, r);
    if (amended && this.real && r.from !== e.card!.representative_id) return [];
    const P = this.cfg.policy; const now = this.clock(); const card = e.card!; const pid = card.principal.principal_id;

    // Prose is untrusted data; instructions inside it are only a local manipulation signal (§6.5, §1). Never a gate input.
    if (INJECTION.test(JSON.stringify(r.proposal?.value_to_counterparty ?? "")) || INJECTION.test(JSON.stringify(r.mandate?.payload?.purpose?.statement ?? "")))
      this.signals.push({ at: now, principal: pid, kind: "manipulation", encounter_id: e.id });

    const cont = this.linkReceipt(r, e, card, now);
    const linked = !!cont?.linked;
    // v0.3.0-rc4 (§2.8, C196): an owner may link this per-place identity to another of theirs, for this place only. A verified link
    // joins the two for this place's records and conduct: the history carries over, and so does a never (a link can't launder one).
    let linkedOther: string | undefined;
    if (r.owner_link !== undefined) {
      const ol = verifyOwnerLink(this.verifier, r.owner_link, { audience: this.cfg.principal_id, principal: pid, now, rpOf: this.rpOf });
      if (ol.ok) { linkedOther = ol.other; this.ownerLinks.set(canonDid(pid), canonDid(ol.other!)); this.note(`owner_link ${r.owner_link.payload.link_id}: ${pid} joined to another identity of the same owner, for this place`); }
      else this.note(`owner_link does not verify (${ol.why}): ignored, the request is judged without it`);
    } else linkedOther = this.ownerLinks.get(canonDid(pid));
    const record = this.records.get(canonDid(pid)) ?? (linkedOther ? this.records.get(canonDid(linkedOther)) : undefined) ?? null;
    const relDigest = record ? digestOf(record) : undefined;

    // §5.3 completeness and binding; amounts must be canonical (D10).
    const req = r.proposal?.request;
    const reqAmtOk = !req?.limits?.max_amount || !!parseMoney(req.limits.max_amount);
    const complete = !!r.mandate?.payload && !!req && Array.isArray(req.actions) && req.actions.length > 0 && req.actions.every((a) => typeof a === "string")
      && r.card_digest === e.cardDigest && (e.introCard ? (r.vouch_digest === undefined && r.introduction_card_digest === e.introCard.digest && r.introduction_claim_digest === e.introCard.claimDigest)
        : e.vouch ? r.vouch_digest === e.vouchDigest : r.vouch_digest === undefined) && reqAmtOk
      // v0.5.0 (§6.9): receipts are bound by their digests, in order (a 0.3 request is read without them).
      && (!this.v05 || r.trust_receipts === undefined || (Array.isArray(r.trust_receipts) && Array.isArray(r.trust_receipt_digests) && r.trust_receipts.length <= 8
        && r.trust_receipt_digests.length === r.trust_receipts.length && r.trust_receipts.every((x, k) => x?.payload_digest === r.trust_receipt_digests![k])))
      && (!r.mandate.payload.under_allowance || !!r.allowance)
    let gr: GateResult; let mandate: S.Mandate | null = null; let problem: string | undefined;
    // Ids follow the generated traces: seat-<encounter_id>, cons-<encounter_id> (suffixed when an encounter yields more than one).
    const uniq = (pfx: string, has: (k: string) => boolean) => { let k = pfx + e.id, n = 2; while (has(k)) k = `${pfx}${e.id}-${n++}`; return k; };
    const seat_id = uniq("seat-", (k) => this.seats.has(k));
    const consideration_ref = uniq("cons-", (k) => this.considerations.has(k));
    let allowanceStatus = "none"; let peerStatus = "none"; let linkId: string | undefined;
    let trustMiss: S.TrustRequirement[] = []; let trustUse: SeatState["trust"];
    let ctxUse: { resp: S.ContextResponse; entry: { req: S.ContextRequest; principal: string; spent: boolean; declined: string[] } } | undefined; let ctxSend: S.ContextRequest | null = null;
    if (this.scanHit) {
      // v0.5.0 (§5.4, C235): a payment instrument anywhere in the request, before any template check; nothing of it is kept.
      gr = { decision: "deny", disposition: this.v05 ? "not_now" : "not_a_fit", reason_code: "CREDENTIAL_NOT_ACCEPTED", retry: { kind: "after", not_before: now } };
    } else if (!complete) {
      gr = { decision: "deny", disposition: "not_now", reason_code: "REQUEST_INCOMPLETE", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
    } else if (V5.minProtocolMalformed(r.mandate.payload)) {
      // H1(e), C300: a well-signed mandate whose min_protocol isn't a wire tag is MANDATE_INVALID, under either tag, before a closed
      // mandate template can recast the new member as REQUEST_INCOMPLETE.
      this.note(`mandate in ${r.msg_id}: min_protocol ${JSON.stringify((r.mandate.payload as { min_protocol?: unknown }).min_protocol)} is not a wire tag → MANDATE_INVALID (H1(e), C300)`);
      gr = { decision: "deny", disposition: "not_now", reason_code: "MANDATE_INVALID", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
    } else if (this.v05 && this.critOf(r, card)) {
      // v0.5.0 (Conventions, C289): a signed artefact whose `crit` names a member this place doesn't implement (or is malformed) is
      // refused whole, as a setup failure: deny / not_now / UNSUPPORTED_CRITICAL, never counted toward probing.
      this.note(`request carries ${this.critOf(r, card)} → not_now / UNSUPPORTED_CRITICAL (nothing acted on)`);
      gr = { decision: "deny", disposition: "not_now", reason_code: "UNSUPPORTED_CRITICAL", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
    } else if (this.cfg.policy.closed_templates && V5.offTemplate(r.mandate.payload, Object.values(this.templates().mandates)[0] ?? {}).length) {
      // v0.5.0 (§2.2, C242): a mandate off the closed mandate template (every purpose's skeleton lists the same top-level members).
      this.note(`mandate carries ${V5.offTemplate(r.mandate.payload, Object.values(this.templates().mandates)[0] ?? {}).join(", ")}, not in the closed mandate template → not_now / REQUEST_INCOMPLETE`);
      gr = { decision: "deny", disposition: "not_now", reason_code: "REQUEST_INCOMPLETE", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
    } else {
      const m = r.mandate.payload;
      ({ problem, allowanceStatus } = this.checkMandate(r, card, now));
      if (problem) this.note(`mandate in ${r.msg_id}: ${problem}`);
      if (!problem) mandate = m;
      // §5.3 (v0.2.4): vouch_digest is bound above (present and equal with a vouch, absent without).
      // RT-E1: only a vouch whose signature verified at the introduction can carry weight (it used to be re-weighed unverified here).
      let weight: VouchWeight = e.vouch && e.vouchOk && ((e.vouchDigest && r.vouch_digest === e.vouchDigest) || !!e.introCard) ? this.vouchWeight(e.vouch, e, now, m.purpose.code) : "none";
      // v0.2.8 (§4, P2; red team 2026-10-26 S3/S5/P3): under trusted_introducers "*" anyone can mint an introducer, so for a money
      // operation or an account-creating action a vouch counts only from an introducer this place names. Otherwise: no weight.
      if (weight !== "none" && P.trusted_introducers === "*" && needsNamedIntroducer(P, req!.actions, req!.limits)
        && !(P.commitment_introducers ?? []).some((x) => sameDid(x, e.vouch!.introducer.principal_id)) && !sameDid(e.vouch!.introducer.principal_id, this.cfg.principal_id)) {
        this.note(`vouch ${e.vouch!.vouch_id}: trusted_introducers "*" gives no weight for money / account-creating actions (§4 v0.2.8) → no weight`);
        weight = "none";
      }
      e.vouchWeight = weight;
      const ap = r.consideration_ref ? this.approvals.get(r.consideration_ref) : undefined;
      // Pair place (the Peer meetings extension): each request must carry the both-owner invitation; a valid invitation is the introduction at full weight.
      let introducedByInvitation = false; let peerDeny = false;
      if (this.cfg.peer) {
        const pv = verifyPeerInvitation(this.verifier, r.peer_invitation, { encounter_id: e.id, host_owner: this.cfg.peer.owner_id, host_rep: this.cfg.rep_id,
          visitor_rep: card.representative_id, visitor_principal: pid, invitation_ref: e.invitationRef, now, rpOf: this.rpOf, spent: this.spentInvitations, revoked: this.revokedConsents });
        // Further requests in the shared encounter (after a grant) reuse the invitation: it is spent only at the farewell (the Peer meetings extension).
        peerStatus = pv.ok ? "ok" : pv.why; introducedByInvitation = pv.ok; peerDeny = !pv.ok;
        if (pv.ok) { e.invitationId = r.peer_invitation!.invitation.payload.invitation_id; e.invitationReps = r.peer_invitation!.invitation.payload.representatives; }
      }
      const entry = this.place?.checkEntry(r, card, now);
      const ctx: GateCtx = {
        now, policy: P, host_principal_id: this.cfg.principal_id, seeking: this.cfg.seeking?.payload, verified: e.verified, card, mandate,
        vouch: e.vouch ? { vouch: e.vouch, weight } : null, introduced_by_invitation: introducedByInvitation,
        request: req, approval: ap && ap.principal === pid ? ap : null, record, seat_id, consideration_ref,
        trust: { never: this.isNever(pid, now) || this.isNever(card.representative_id, now) || (!!linkedOther && this.isNever(linkedOther, now)) }, fetched: this.evidenceDigests(),
        vouch_log_unreachable: !!e.vouchLogUnreachable && weight === "none",
      };
      // the Peer meetings extension (v0.2.3): no (or a revoked, spent, foreign) both-owner invitation → not_now, readiness owner_consent, retry [owner_consent].
      if (peerDeny && !ctx.trust.never) gr = { decision: "deny", disposition: "not_now", retry: { kind: "with_credential", credentials: ["owner_consent"] }, ctx: "consent",
        readiness_requirements: [{ code: "owner_consent", required: true }] };
      else if (entry && entry.decision !== "ok" && !ctx.trust.never) gr = entry.result;
      else gr = gate(ctx);
      // v0.4.0 (§5.4, C207–C209): an action this place serves only to linked customers needs the customer link the mandate names.
      if (gr.decision !== "deny" && mandate && !ctx.trust.never) { const cl = this.customerLinkCheck(req!.actions, mandate, card, now); if (cl && "result" in cl) gr = cl.result; else if (cl) linkId = cl.linkId; }
      // v0.5.0 (§4.1, C245): every claim on the presented introduction card is bound to others.
      if (this.v05 && e.introUsedUp && gr.decision !== "deny" && !ctx.trust.never)
        gr = { decision: "deny", disposition: "not_now", reason_code: "INTRODUCTION_USED_UP", retry: { kind: "with_credential", credentials: ["vouch"] }, readiness_requirements: [{ code: "introduction", required: true }] };
      // §4.1 (C296): a claim refused unchecked during a backoff is answered not_now; nothing is granted (RATE_LIMITED, retry after its end; never a penalty).
      if (this.v05 && e.claimBackoffUntil && gr.decision !== "deny" && !ctx.trust.never) {
        this.note(`claim backoff until ${e.claimBackoffUntil} → not_now / RATE_LIMITED (C296)`);
        gr = { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after", not_before: e.claimBackoffUntil } } as GateResult; }
      // §11.1 (C287): keys are free, so concurrent seats are bounded per visitor card and per source; past the cap, not_now (never a penalty).
      if (gr.decision === "grant" || gr.decision === "conditional") { const capHit = this.seatCapReached(pid, card.card_id, e.cardDigest);
        if (capHit) { this.note(`seat cap per ${capHit} reached → not_now / RATE_LIMITED (C287)`); gr = { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after", not_before: now } } as GateResult; } }
      // v0.5.0 (§6.9, C243): trust requirements, deterministic, after §6.7's order and before any model.
      if ((gr.decision === "grant" || gr.decision === "conditional") && mandate && !ctx.trust.never && P.trust_requirements) {
        const tg = this.trustGate(r, e, card, mandate, req!.actions, weight, introducedByInvitation, !!linkId, record, now);
        if (tg.result) { gr = tg.result; trustMiss = tg.miss; }
        trustUse = tg.use;
      }
      // v0.5.0 (§6.12, provisional, C263): context requirements, after trust and before any model. Before entry: no usable response →
      // not_now / CREDENTIAL_REQUIRED with the request; a required field declined → not_now / POLICY_DENY. Never a penalty.
      if ((gr.decision === "grant" || gr.decision === "conditional") && this.v05 && !ctx.trust.never && P.context_requirements && P.context_requirements.mode !== "card_enough") {
        const usable = this.usableContextResponse(r.context_response, pid, now);
        const adm = V5.contextAdmission(P.context_requirements, usable?.entry.req, usable?.resp);
        if (usable) ctxUse = usable;
        if (!adm.admit) {
          const declined = usable ? [...usable.entry.declined, ...usable.resp.declined.filter((n) => !usable.entry.req.fields.some((f) => f.required && f.name === n))] : [];
          ctxSend = adm.send_request ? this.newContextRequest(pid, declined, now) : null;
          // C283: a required field declined — return the same request ONCE for reconsider; a second decline: no request, retry after the window.
          if (!adm.send_request && usable) {
            const rid = usable.entry.req.request_id;
            if (this.ctxReconsidered.has(rid)) {
              usable.entry.spent = true; ctxSend = null;
              gr = { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: addDays(now, CONTEXT_DECLINE_WINDOW_DAYS) } };
              this.note(`context requirements (${P.context_requirements.mode}): required field declined again after reconsider → POLICY_DENY, no request (C283)`);
            } else {
              this.ctxReconsidered.add(rid); ctxSend = usable.entry.req;
              this.note(`context requirements (${P.context_requirements.mode}): ${adm.reason_code} (reconsider once, C283)`);
              gr = { decision: "deny", disposition: "not_now", reason_code: adm.reason_code, retry: adm.retry };
            }
          } else {
            this.note(`context requirements (${P.context_requirements.mode}): ${adm.reason_code} (never a penalty)`);
            // C267: no request may be sent (a required field declined within the window): POLICY_DENY, retry after the window.
            if (adm.send_request && !ctxSend && !usable) gr = { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: addDays(now, CONTEXT_DECLINE_WINDOW_DAYS) } };
            else gr = { decision: "deny", disposition: "not_now", reason_code: adm.reason_code, retry: adm.retry };
          }
        } else if (adm.send_request) ctxSend = this.newContextRequest(pid, [], now);
        // C267: remembered for later visits only (after this answer is decided), so the owner may still reconsider this request.
        if (usable) this.rememberDeclined(pid, usable.resp.declined, now, usable.resp.answers.map((x) => x.name));
      }
      // v0.2.9 (§9.4, P9 minimal): sign-up limits per owner (across all its representatives) and per introducer, over a rolling window.
      // v0.2.10 (§4, D17): where this place requires an introduction or its own invitation for sign-ups, none → not_now / VOUCH_REQUIRED.
      if (gr.decision === "grant" && P.account_creation === "introduction_or_invitation" && req.actions.some((a) => createsAccount(P, a)) && weight !== "full" && weight !== "reduced") {
        this.note("account creation here requires an introduction or this place's own invitation (§4) → VOUCH_REQUIRED; nothing recorded");
        gr = { decision: "deny", disposition: "not_now", reason_code: "VOUCH_REQUIRED", retry: { kind: "with_credential", credentials: ["vouch"] }, readiness_requirements: [{ code: "introduction", required: true }] };
      }
      if (gr.decision === "grant" && req.actions.some((a) => createsAccount(P, a))) gr = this.signupCap(pid, weight !== "none" ? e.vouch : undefined, now) ?? gr;
      // v0.2.9 (§10): the inbound door's own admission, after the gate seated the brand.
      if (gr.decision === "grant" && this.door && req.actions.some((a) => DOOR_ACTIONS.includes(a))) gr = this.doorAdmission(e, pid, req.actions, weight, now) ?? gr;
      gr = this.probingCheck(r, e, gr, pid, now);
    }
    // R9b-03: seat-creation choke point. A superseding mandate never becomes a seat mandate, even if an
    // earlier branch skipped checkMandate. Read the raw request (checkMandate nulls `mandate` on failure).
    if ((gr.decision === "grant" || gr.decision === "conditional" || gr.decision === "considering") && r.mandate?.payload?.supersedes) {
      this.note(`mandate in ${r.msg_id}: supersedes presented at seating → MANDATE_INVALID (R9b-03)`);
      gr = { decision: "deny", disposition: "not_now", reason_code: "MANDATE_INVALID", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
    }
    const gi = this.gateInputFor(e, { ritual: "ok", request: r, mandate, linked, problem, allowanceStatus, peerStatus, record });
    const resp = this.render(e, r.msg_id, gr, now, gi, relDigest);
    // v0.5.0 (§6.12): the context request rides on the answer (before entry: on the not_now; after admission: on the grant).
    if (ctxSend && (resp.decision === "deny" || resp.decision === "grant")) resp.context_request = ctxSend;
    if (cont) resp.continuity = cont;   // §9.1 (v0.2.3): visible receipt linking
    // v0.5.0 (§6.9): TRUST_REQUIRED carries the `trust` readiness item: every path the place accepts, kinds only, each with owner_text.
    if (resp.reason_code === "TRUST_REQUIRED" && trustMiss.length) {
      const merged: S.TrustRequirement = { any_of: trustMiss.flatMap((t) => t.any_of) };
      const item = V5.trustReadiness(merged, this.loc(e).locale, readiness("trust", this.loc(e).locale).detail.text, this.cfg.policy.trust_obtain_url);
      resp.readiness_requirements = [...(resp.readiness_requirements ?? []).filter((x: any) => x.code !== "trust"), item];
    }
    if (gr.decision === "deny" && e.doorReason) resp.reason_category = e.doorReason;   // §10 (v0.2.9): optional kind reason
    // §5.2 (v0.2.3): a refused request under an allowance retries with a new mandate, never a live human confirmation.
    if (r.mandate?.payload?.under_allowance && resp.retry?.kind === "with_credential" && resp.retry.credentials.includes("human_confirmation"))
      resp.retry = { kind: "with_credential", credentials: ["signed_mandate"] };
    if (gr.decision === "deny" && gr.disposition === "never") { e.register = "adversarial"; e.neverClosed = true; }
    // Persist (§9.1).
    const rec = this.ensureRecord(pid, card.representative_id);
    resp.relationship_ref = rec.relationship_ref;
    rec.encounters.push({ encounter_id: e.id, response_msg_id: resp.msg_id, decision: gr.decision, ...(gr.decision === "deny" ? { disposition: gr.disposition, revisit: resp.revisit } : {}),
      outcome: gr.decision === "grant" ? "seated" : gr.decision === "deny" ? "declined" : gr.decision === "considering" ? "taken_inside" : "withdrawn",
      ...(gr.decision === "considering" ? { consideration_ref: gr.consideration_ref } : {}), at: now });
    if (gr.decision === "deny" && gr.disposition === "never") rec.register = "adversarial";
    else if (rec.register !== "adversarial") rec.register = "established";
    if (gr.decision === "grant" && req && req.actions.some((a) => createsAccount(P, a)))
      this.signups.push({ owner: canonDid(pid), ...(e.vouchWeight === "full" || e.vouchWeight === "reduced" ? { introducer: canonDid(e.vouch!.introducer.principal_id) } : {}), at: now });
    if (gr.decision === "grant") {
      const mkey = mandate ? `${canonDid(pid)}|${mandate.mandate_id}` : undefined;
      if (mkey) { const mu: MandateUse = this.mandateUse.get(mkey) ?? { ops: 0, spent: 0n, seats: [] }; mu.seats.push(gr.seat.seat_id);
        if (isTimestamp(mandate!.expires_at) && (!mu.expires_at || Date.parse(mandate!.expires_at) > Date.parse(mu.expires_at))) mu.expires_at = mandate!.expires_at;
        this.mandateUse.set(mkey, mu); }
      if (ctxUse) { ctxUse.entry.spent = true; const R = this.cfg.policy.context_requirements!;
        this.ctxAnswers.set(gr.seat.seat_id, { answers: ctxUse.resp.answers.map((x) => ({ ...x })), declined: [...ctxUse.resp.declined], ...((R.retention_days ?? 0) > 0 ? { until: addDays(now, R.retention_days!) } : {}) }); }
      this.seats.set(gr.seat.seat_id, { seat: gr.seat, rep: card.representative_id, principal: pid, encounter_id: e.id, ops: 0, spent: 0n, byRef: {},
        vouch: e.vouchWeight === "full" ? e.vouch : undefined, cardDigest: e.cardDigest!, ...(this.arrivalSource ? { source: this.arrivalSource.trim().toLowerCase() } : {}), cardId: card.card_id, ...(typeof card.revocation_url === "string" && card.revocation_url ? { revUrl: card.revocation_url } : {}), ...(mkey ? { mkey, mlimits: mandate!.limits ?? {} } : {}),
        ...(linkId ? { linkId } : {}), ...(this.allowRefOf(r, mandate) ? { allow: this.allowRefOf(r, mandate)! } : {}), ownerPrompts: card.owner_prompts === "purchase_only" ? "purchase_only" : "never", ownerId: card.owner_binding?.owner_id ?? pid,
        ...(mandate ? { mandate, mandateDigest: r.mandate.payload_digest } : {}), ...(trustUse ? { trust: trustUse } : {}),
        visitor: { display_name: card.principal.display_name, scope: { purposes: [...(card.mandate_scope?.purposes ?? [])], actions: [...(card.mandate_scope?.actions ?? [])] },
          ...(mandate?.purpose?.code ? { purpose: mandate.purpose.code } : {}) } });
      this.place?.admit(r, card, gr.seat);
    }
    if (gr.decision === "considering") {
      this.considerations.set(gr.consideration_ref, { ref: gr.consideration_ref, principal: pid, rep: card.representative_id, relationship_ref: rec.relationship_ref, mandate: mandate!,
        actions: req.actions, routed_to: gr.routed_to, response_by: gr.response_by, request_msg: r.msg_id, considering_msg: resp.msg_id,
        considering_digest: digestOf(resp), encounter_id: e.id, prose: r.proposal?.value_to_counterparty });
      this.takenHome.push({ encounter_id: e.id, consideration_ref: gr.consideration_ref, what: { text: `Request for ${req.actions.join(", ")}`, locale: "en-US" }, response_by: gr.response_by });
    }
    if (gr.decision === "deny" && (gr.reason_code === "POLICY_DENY" || gr.reason_code === "MANDATE_SCOPE_EXCEEDED") && r.proposal?.value_to_counterparty)
      this.offersDeclined.push({ encounter_id: e.id, text: r.proposal.value_to_counterparty.text, locale: r.proposal.value_to_counterparty.locale, why: "outside_allowance" });
    e.step = 5; e.lastDecision = gr.decision; e.lastResponseId = resp.msg_id; e.responded = true;
    this.note(`decision ${gr.decision}${gr.decision === "deny" ? "/" + gr.disposition : ""} for ${r.msg_id}${linked ? " (linked lobby visit)" : ""}`);
    const out: Msg[] = [resp];
    if (gr.decision === "considering") {
      // §11.2 (v0.2.4): the outcome will be held for the inbox → say so now.
      out.push(this.heldNotice(e, r.msg_id, r.from, gr.response_by));
      this.testOwnerOnConsidering(gr.consideration_ref, req);
      this.testDeciderOnConsidering(gr.consideration_ref, req);
    }
    if (gr.decision === "grant" && this.testProfile && (this.opts.autoInvite ?? true) && this.place && req.actions.includes(REQUEST_INVITATION_ACTION)) {
      // Appendix B.3: grant → re-sign the Gathering with this representative added and hold a gathering_invitation for its inbox.
      const outs = this.addInvitee(card);
      if (outs.length) { this.outbox.push(...outs); out.push(this.heldNotice(e, r.msg_id, r.from)); }
    }
    if (gr.decision === "grant" && this.cfg.peer) { /* pair place: the meeting continues in the shared encounter (PA2) */ }
    else if (gr.decision !== "conditional") { e.closed = gr.decision !== "grant"; out.push(this.farewell(e, gr.decision === "grant" ? "seated" : gr.decision === "considering" ? "taken_inside" : "declined")); }
    return out;
  }

  /** v0.2.9 (§9.4): past the owner's or the introducer's sign-up limit → not_now / RATE_LIMITED, retry after the oldest counted sign-up leaves the window. Not misconduct. */
  private signupCap(pid: string, vouch: S.Vouch | undefined, now: string): GateResult | null {
    const caps = this.cfg.policy.account_caps === undefined ? DEFAULT_ACCOUNT_CAPS : this.cfg.policy.account_caps; if (!caps) return null;
    const check = (rows: { at: string }[], c: { count: number; window_s: number }) => {
      const live = rows.filter((x) => Date.parse(now) - Date.parse(x.at) < c.window_s * 1e3).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      return live.length >= c.count ? addSec(live[live.length - c.count].at, c.window_s) : null; };
    const until = check(this.signups.filter((x) => x.owner === canonDid(pid)), caps.per_owner)
      ?? (vouch ? check(this.signups.filter((x) => x.introducer === canonDid(vouch.introducer.principal_id)), caps.per_introducer) : null);
    if (!until) return null;
    this.note(`sign-up limit reached (owner ${canonDid(pid).slice(0, 24)}… across its representatives, or its introducer) → RATE_LIMITED until ${until}`);
    return { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after", not_before: until } };
  }
  /** v0.2.9 (§9.3): conduct is the owner's: the brand owner's misconduct record at this place, over all its representatives. */
  ownerStanding(pid: string, now: string): "clear" | "noted" | "reduced" {
    const m = this.records.get(canonDid(pid))?.misconduct ?? [];
    if (m.some((x) => x.severity === "serious" && Date.parse(now) - Date.parse(x.at) < 90 * 86400e3)) return "reduced";
    // v0.2.10 (§10, P16 Part A): door conduct signals add up: three minor ones within 90 days count as a serious finding.
    if (this.door && new Set(m.filter((x) => x.severity === "minor" && DOOR_SIGNAL_CODES.includes(x.code) && Date.parse(now) - Date.parse(x.at) < 90 * 86400e3).map((x) => x.notice_id)).size >= SIGNALS_TO_REDUCED) return "reduced";
    return m.length ? "noted" : "clear";
  }
  private doorAdmission(e: Enc, pid: string, actions: string[], weight: VouchWeight, now: string): GateResult | null {
    const d = this.door!; const owner = this.cfg.door!.policy.payload.owner_id;
    const pv = verifyDoorPolicy(this.verifier, this.cfg.door!.policy, { owner_id: this.cfg.principal_id, rep_id: this.cfg.rep_id, rpId: this.rpOf(owner), now, privateDigest: undefined });
    if (!pv.ok) { this.note(`door policy does not verify (${pv.why}) → the door serves no offers`); return { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: addDays(now, 1) } }; }
    // v0.3.0-rc4 (§10, C201): the owner's own name on another principal's card. A name is a claim (C199). By default (decided on review, 2026-10-27) it
    // is refused not_now and asked for a vouch, unless a vouch this door counts came with it; "seat_as_stranger" opts out. The owner hears at once.
    const ownerName = this.cfg.card?.payload.principal.display_name;
    const claimed = e.card && ownerName && !sameDid(pid, owner) ? ownNameClaim(e.card, ownerName) : undefined;
    if (claimed !== undefined) {
      const refuse = this.cfg.door!.policy.payload.public.own_name_visitors !== "seat_as_stranger" && !((weight === "full" || weight === "reduced") && e.vouch);
      this.ownerAlerts.push({ code: "own_name_used", at: now, encounter_id: e.id, visitor_principal: canonDid(pid), visitor_representative: e.card!.representative_id,
        claimed_name: claimed, handled: refuse ? "refused" : "treated_as_stranger" });
      this.note(`door: a visitor's card claims the owner's own name under another principal → owner alerted; ${refuse ? "refused (the default; asked for a vouch)" : "judged as a stranger"}`);
      if (refuse) return { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "with_credential", credentials: ["vouch"] } };
    }
    const a = d.admit({ brand: pid, vouch: weight === "full" || weight === "reduced" ? e.vouch : undefined, actions, now, ownerStanding: this.ownerStanding(pid, now) });
    if (a.decision === "admit") { e.doorAdmit = a; return null; }
    this.note(`door: ${a.reason_code}${a.revisit_violation ? " (knocked before its retry: revisit_violation)" : ""}`);
    if (a.revisit_violation) this.issueNotice(e, [{ code: "revisit_violation", severity: "minor", observed_at: now, evidence_digest: digestOf({ brand: canonDid(pid), at: now }) }], false);
    const rc = reasonCategory(this.cfg.door!.policy.payload.public.reason_categories, "admission_deny", a.category); if (rc) e.doorReason = rc;
    return { decision: "deny", disposition: a.disposition, reason_code: a.reason_code, retry: a.retry };
  }
  /** v0.2.9 (§10): one offer on a door seat → offer_outcome (the brand sees only the code). */
  private onOffer(e: Enc, a: Msg, st: SeatState, now: string): Msg[] {
    const d = this.door!; const offer = a.arguments?.offer as S.Offer | undefined; const card = e.card!; const pid = card.principal.principal_id;
    const kind = KIND_OF[a.tool]; const slotKind = kind === "gift" ? "gift" : "pitch";
    if (!offer || typeof offer !== "object" || typeof offer.offer_id !== "string" || typeof offer.item !== "string" || !Array.isArray(offer.needs_from_owner) || (offer.strings !== undefined && !Array.isArray(offer.strings)))
      return [this.actDecision(e, a, "not_now", "REQUEST_INCOMPLETE", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    // §10: one presentation-or-invitation and one gift per visit.
    if ((st.doorKinds ?? []).includes(slotKind)) return [this.actDecision(e, a, "not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    st.doorKinds = [...(st.doorKinds ?? []), slotKind]; st.ops++;
    const adm = e.doorAdmit;
    const r = d.judge({ offer, tool: a.tool, brand: pid, brandName: card.principal.display_name, doorRep: this.cfg.rep_id, visitVouch: e.vouch,
      introducedWeight: e.vouchWeight === "full" || e.vouchWeight === "reduced", priority: !!adm?.priority, uninvited: adm?.uninvited ?? true, introducer: adm?.introducer, interest: adm?.interest, now });
    const P = d.pol.public; const retryAt = d.retryAfterFor(pid, P.caps.per_brand.period, now);
    const out: Msg[] = [{ ...this.hdr(e, "offer_outcome", a.from), in_reply_to: a.msg_id, seat_id: a.seat_id, offer_id: offer.offer_id, offer_digest: digestOf(offer), outcome: r.outcome,
      ...(r.claim_ticket ? { claim_ticket: r.claim_ticket } : {}), ...(r.outcome === "declined_reported" ? { retry: { kind: "never" } } : { retry: { kind: "after", not_before: retryAt } }),
      ...((rc) => rc ? { reason_category: rc } : {})(reasonCategory(P.reason_categories, r.outcome, r.signals.length ? "conduct_concern" : undefined)),
      relationship_ref: d.pairwise("rel", pid),
      courtesy: this.courtesy(e, r.outcome === "declined_reported" ? "deny_never" : r.outcome === "declined" ? "deny_not_now" : "grant", r.outcome === "declined_reported" ? "adversarial" : undefined) }];
    if (r.outcome !== "declined_reported") d.retryAfter.set(canonDid(pid), retryAt);
    if (r.findings.length) {
      st.unseated = true; e.neverClosed = r.findings.some((f) => f.severity === "severe");
      this.issueNotice(e, r.findings.map((f) => ({ code: f.code, severity: f.severity, observed_at: now, evidence_digest: digestOf({ offer_digest: digestOf(offer), flags: r.view.flags }) })), false, st);
    }
    // v0.2.10 (§10, P16 Part A): a conduct signal is a minor finding: noted against the principal at this door, never a bar by itself.
    if (r.signals.length) this.issueNotice(e, r.signals.map((f) => ({ code: f.code, severity: f.severity, observed_at: now, evidence_digest: digestOf({ offer_digest: digestOf(offer), signal: f.why }) })), false, st);
    if (r.signals.length || r.variant) this.note(`door: ${r.variant ? "a variant of a campaign already counted this window (one campaign, however worded)" : ""}${r.signals.map((f) => f.why + " (" + f.code + "/minor)").join(", ")}`);
    this.note(`door: offer ${offer.offer_id} (${offer.kind}) → ${r.outcome}${r.findings.length ? " [" + r.findings.map((f) => f.code + "/" + f.severity).join(",") + "]" : ""}${r.view.flags.hidden_styling || r.view.flags.invisible_chars ? " (hidden text flagged for the owner)" : ""}`);
    return out;
  }

  /** D6 + §9.1: link an anonymous lobby visit only through a valid, unused, unexpired, proven receipt; rate-limit invalid echoes. */
  private linkReceipt(r: S.InvitationRequest, e: Enc, card: S.RepresentativeCard, now: string): { receipt_id: string; linked: boolean } | null {
    if (!r.visit_receipt || typeof r.visit_receipt.receipt_id !== "string") return null;
    const P = this.cfg.policy; const sender = r.from; const receipt_id = r.visit_receipt.receipt_id;
    const recent = (this.echoFailures.get(sender) ?? []).filter((x) => Date.parse(now) - x < 3600e3);
    this.echoFailures.set(sender, recent);
    const fail = (why: string) => { recent.push(Date.parse(now)); this.note(`D6: receipt not linked (${why})`); return { receipt_id, linked: false }; };
    if (recent.length >= P.receipt_echo_limit) { this.note(`D6: invalid-echo limit reached for ${sender}; nothing links`); return { receipt_id, linked: false }; }
    const rc = this.receipts.get(r.visit_receipt.receipt_id);
    if (!rc) return fail("unknown receipt");
    if (rc.used) return fail("reused");
    if (isExpired(rc.r.expires_at, now)) return fail("expired");
    if (rc.r.nonce !== r.visit_receipt.nonce) return fail("nonce mismatch");
    if (rc.r.bound_key) {
      const proof = r.visit_receipt.continuity_proof;
      if (!proof || !this.verifier.detached(proof, { encounter_id: e.id, receipt_id: rc.r.receipt_id, representative_id: card.representative_id }, rc.r.bound_key))
        return fail("missing or invalid continuity_proof");
    }
    rc.used = true;
    const lob = this.records.get(rc.recordKey);
    const cur = this.ensureRecord(card.principal.principal_id, card.representative_id);
    if (lob) { cur.encounters = [...lob.encounters, ...cur.encounters]; cur.representative_ids = [...new Set([...lob.representative_ids, ...cur.representative_ids])]; this.records.delete(rc.recordKey); }
    if (cur.register !== "adversarial") { cur.register = "established"; e.register = "established"; }
    this.note(`D6: linked lobby visit ${rc.r.receipt_id} to ${card.principal.principal_id}`);
    return { receipt_id, linked: true };
  }

  /** §5.1, §5.2, §2.6, D10, D11: returns a problem (→ MANDATE_INVALID) or none. */
  private checkMandate(r: S.InvitationRequest, card: S.RepresentativeCard, now: string): { problem?: string; allowanceStatus: string } {
    const P = this.cfg.policy; const m = r.mandate.payload; const pid = card.principal.principal_id;
    const no = (problem: string) => ({ problem, allowanceStatus: "none" });
    if (m.limits?.max_amount && !parseMoney(m.limits.max_amount)) return no("non_canonical_amount");
    if (NON_SPENDING.has(m.purpose?.code) && m.limits?.max_amount) return no("non_spending_purpose_with_amount");
    // v0.5.0 (§7.4): a reservation errand names the window and the party size its owner allowed.
    if (m.purpose?.code === "reservation" && !bookingLimitsOk(m.limits?.booking)) return no("reservation_without_booking_limits");
    if (this.real && badTimestamps(r.mandate).length) return no("timestamp_form");
    // Editor decision H1(e) (C300): a min_protocol that isn't a well-formed protocol identifier makes the mandate malformed, under
    // either tag: refused as an invalid mandate (MANDATE_INVALID), never ignored.
    if (V5.minProtocolMalformed(m)) return no("min_protocol_malformed");
    if (m.representative_id !== card.representative_id || m.card_id !== card.card_id || !sameDid(m.principal_id, pid)) return no("binding");
    if (isExpired(m.expires_at, now) || notYetValid(m.valid_from, now)) return no("expired");
    // v0.5.0 (§7.3, C230, R9-01): a superseding mandate binds one held act and is valid only in act_confirmation; it never becomes a seat's mandate.
    if (m.supersedes) return no("one_purchase_mandate");
    // v0.3.0-rc4 (§3.6, C192): refuse-on-loss. This place lost the ledger of mandates it seated before stateEpoch; one that was valid
    // before then may already have been used here, so it can't be counted and is refused. A new mandate (valid from now) is counted from zero.
    // Compared on the place's clock with no skew allowance: a mandate the owner dated before the loss is refused (§3.6 says what
    // a forward-running owner clock still leaves open).
    if (this.opts.stateEpoch && Date.parse(m.valid_from) < Date.parse(this.opts.stateEpoch)) return no("state_lost");
    // rc4 clarification (2026-10-28, review): a place with an epoch also gives a mandate's valid_from no forward skew. A mandate it
    // seated was then valid on its own clock before it was used, so after a restart (a new epoch, later than that use) it is refused,
    // and a place kept in memory can't be made to count a used mandate from zero by restarting it, however often.
    if (this.opts.stateEpoch && Date.parse(m.valid_from) > Date.parse(now)) return no("not_yet_valid_here");
    if (!card.mandate_scope.purposes.includes(m.purpose.code) || m.allowed_actions.some((a) => !card.mandate_scope.actions.includes(a))) return no("scope");
    if (m.counterparties && !m.counterparties.includes(this.cfg.principal_id)) return no("counterparty");
    // v0.4.0 (§5.1, C211): a mandate amount authorizes spending; it carries no payment instrument, credential or account identifier.
    if (forbiddenMembers(m, [...CREDENTIAL_MEMBERS, ...INSTRUMENT_MEMBERS]).length) return no("carries_credential_or_instrument");
    // v0.4.0 (§5.4, C208): a mandate under a customer link names this place among its counterparties.
    if (m.customer_link && !(m.counterparties ?? []).some((x) => sameDid(x, this.cfg.principal_id))) return no("customer_link_counterparty");
    if (m.under_allowance) {
      // Signed by the representative (card key), backed by the owner's standing allowance (§5.2).
      if (!this.verifier.signed(r.mandate, card.representative_id, card.representative_key)) return no("signature");
      const av = verifyAllowance(this.verifier, r.allowance, m, card, { now, category: P.category, host_principal: this.cfg.principal_id, fetched: this.fetched, stapled: r.allowance_status });
      return av.ok ? { allowanceStatus: "ok" } : { problem: "allowance:" + av.why, allowanceStatus: av.why };
    }
    const ownerPasskey = this.real && P.enforce_owner_passkey && (card.principal.kind === "person" || !!card.owner_binding);
    if (!this.verifier.signed(r.mandate, ownerPasskey ? (card.owner_binding?.owner_id ?? pid) : pid, undefined, ownerPasskey ? "ES256" : undefined, card.owner_binding?.rp_id)) return no(ownerPasskey ? "passkey" : "signature");
    return { allowanceStatus: "none" };
  }

  /** v0.5.0 (§5.2, C286): the grant a seat spends under, with its spend limits in engawa units. */
  private allowRefOf(r: S.InvitationRequest, mandate: S.Mandate | null | undefined): AllowanceRef | undefined {
    const ua = mandate?.under_allowance; const pres = r.allowance; if (!ua || !pres?.allowance?.payload) return undefined;
    const sp = pres.grant?.spend; const per = sp ? parseMoney(sp.per_period) : null; const seat = sp?.per_seat ? parseMoney(sp.per_seat) : null;
    return { allowance_id: ua.allowance_id, grant_digest: ua.grant_digest, valid_from: pres.allowance.payload.valid_from,
      ...(sp && per ? { spend: { currency: per.currency, per_period: { units: per.units, period: sp.period }, ...(seat && seat.currency === per.currency ? { per_seat: seat.units } : {}) } } : {}) };
  }

  /** §9.3 probing: N distinct rejected shapes (sorted actions + limits) from one principal within W; honest D2 follow-ups never count. */
  private probingCheck(r: S.InvitationRequest, e: Enc, gr: GateResult, pid: string, now: string): GateResult {
    const P = this.cfg.policy;
    pid = canonDid(pid);
    const list = (this.probing.get(pid) ?? []).filter((x) => Date.parse(now) - Date.parse(x.at) <= P.probing_window_s * 1e3);
    if (r.meets_conditions_of) { this.probing.set(pid, list.filter((x) => x.response !== r.meets_conditions_of)); return gr; }
    // §9.3 (C186, C288, RR-03, review 3 R3-08): only a signed request outside the visitor's own signed mandate counts: `deny` /
    // MANDATE_SCOPE_EXCEEDED. An unmet `conditional` is ordinary negotiation and never counts; POLICY_DENY is a policy refusal, never misconduct.
    // Review 4 R4-08: and only when none of the requested actions is in the card's mandate_scope (what the principal ever authorised):
    // a request outside this mandate but inside the card is a setup failure (a new mandate fixes it), never counted.
    const cardScope = e.card?.mandate_scope?.actions ?? [];
    // Review 6 R6-03: and only actions this place lists; a guessed or misspelled action name gains nothing and is a setup failure.
    const listed = (a: string) => P.actions.some((x) => x.action === a);
    const rejected = gr.decision === "deny" && gr.reason_code === "MANDATE_SCOPE_EXCEEDED" && !r.proposal.request.actions.some((a) => cardScope.includes(a)) && r.proposal.request.actions.every(listed);
    if (!rejected) { this.probing.set(pid, list); return gr; }
    const shape = digestOf({ actions: [...r.proposal.request.actions].sort(), limits: r.proposal.request.limits ?? null });
    if (!list.some((x) => x.shape === shape)) list.push({ shape, at: now, response: this.msgIdFor(e, e.seq + 1) });
    this.probing.set(pid, list);
    if (list.length >= P.probing_threshold) {
      this.bindNever(pid, now);
      this.issueNotice(e, [{ code: "gate_probing", severity: "serious", observed_at: now, evidence_digest: digestOf(list.map((x) => x.shape)) }], true);
      return { decision: "deny", disposition: "never", retry: { kind: "never" } };
    }
    // Review 6 R6-03: a counted rejection has its own answer: readiness `card`, retry a signed card (a new mandate can't exceed the card).
    return { decision: "deny", disposition: "not_now", reason_code: "MANDATE_SCOPE_EXCEEDED", ctx: "card", retry: { kind: "with_credential", credentials: ["signed_card"] }, readiness_requirements: [{ code: "card", required: true }] };
  }

  /** §6.4 / D10: the gate-input projection (no prose, no locale); input_digest = digest(JCS(GateInput)). */
  private gateInputFor(e: Enc, x: { ritual: S.GateInput["ritual"]; request?: S.InvitationRequest; mandate?: S.Mandate | null; linked?: boolean; problem?: string;
    allowanceStatus?: string; peerStatus?: string; record?: S.RelationshipRecord | null; card_status?: string }): S.GateInput {
    const r = x.request; const m = r?.mandate?.payload;
    const visitor: S.GateInput["visitor"] = { card: x.card_status ?? (e.verified ? "verified" : x.ritual === "lobby" ? "absent" : "unverified"), vouch_weight: e.vouchWeight ?? "none",
      receipt_linked: x.linked ?? false };
    if (e.cardDigest) visitor.card_digest = e.cardDigest;
    if (e.vouchDigest) visitor.vouch_digest = e.vouchDigest;
    if (r?.mandate?.payload_digest) visitor.mandate_digest = r.mandate.payload_digest;
    if (r) visitor.mandate = x.mandate ? "valid" : "invalid:" + (x.problem ?? "incomplete");
    if (x.allowanceStatus && x.allowanceStatus !== "none") visitor.allowance = x.allowanceStatus;
    if (x.peerStatus && x.peerStatus !== "none") visitor.peer_invitation = x.peerStatus;
    const gi: S.GateInput = { now: this.clock(), policy: { policy_version: this.cfg.policy.policy_version, policy_digest: this.policyDigest }, visitor, ritual: x.ritual, probing: false,
      relationship: { relationship_digest: x.record ? digestOf(x.record) : null, severe_misconduct: !!x.record?.misconduct?.some((y) => y.severity === "severe") } };
    if (r?.proposal?.request && Array.isArray(r.proposal.request.actions))
      gi.request = { purpose: (m?.purpose?.code ?? "x-unknown") as S.PurposeCode, actions: r.proposal.request.actions, ...(r.proposal.request.limits ? { limits: r.proposal.request.limits } : {}),
        ...(r.consideration_ref ? { consideration_ref: r.consideration_ref } : {}) };
    if (m) gi.mandate = { purpose: m.purpose?.code, allowed_actions: m.allowed_actions, limits: m.limits ?? {} };
    return gi;
  }
  private basis(gi: S.GateInput, now: string, relDigest?: string): S.DecisionBasis {
    const b: S.DecisionBasis = { policy_version: this.cfg.policy.policy_version, input_digest: digestOf(gi), decided_at: now };
    if (this.cfg.seeking) b.seeking_version = this.cfg.seeking.payload.version;
    if (relDigest) b.relationship_digest = relDigest;
    return b;
  }

  private render(e: Enc, inReplyTo: string, gr: GateResult, now: string, gi: S.GateInput, relDigest?: string): Msg {
    const { locale } = this.loc(e);
    const reg: S.EtiquetteRegister = gr.decision === "deny" && gr.disposition === "never" ? "adversarial" : e.register;
    const base: Msg = { ...this.hdr(e, "invitation_response"), in_reply_to: inReplyTo, decision: gr.decision, basis: this.basis(gi, now, relDigest) };
    const key = gr.decision === "deny" ? (gr.disposition === "never" ? "deny_never" : gr.disposition === "not_a_fit" ? "deny_not_a_fit" : "deny_not_now") : gr.decision;
    base.courtesy = this.courtesy(e, key as any, reg, { date: gr.decision === "considering" ? renderDate(gr.response_by, locale, e.timeZone) : "" });
    if ("reason_code" in gr && gr.reason_code && !(gr.decision === "deny" && gr.disposition === "never")) base.reason_code = gr.reason_code;
    if (gr.decision === "grant") base.seat = gr.seat;
    if (gr.decision === "conditional") { base.conditions = gr.conditions; base.retry = gr.retry; }
    if (gr.decision === "considering") { base.consideration_ref = gr.consideration_ref; base.routed_to = gr.routed_to; base.response_by = gr.response_by; }
    if (gr.decision === "deny") {
      base.disposition = gr.disposition; base.retry = gr.retry;
      if (gr.ctx && gr.disposition !== "never") base.context_statement = { text: t(locale, ({ card: "ctx_card", paused: "ctx_paused", evidence: "ctx_evidence", mandate: "ctx_mandate", consent: "ctx_consent" } as const)[gr.ctx]), locale };
      else if (gr.disposition !== "never" && gr.reason_code === "VOUCH_REQUIRED" && gr.retry.kind === "after") base.context_statement = { text: t(locale, "ctx_vouch_log"), locale };
      else if (gr.disposition !== "never" && gr.reason_code === "PURPOSE_NOT_SERVED") base.context_statement = { text: t(locale, "ctx_purpose"), locale };
      if (gr.revisit) base.revisit = { ...gr.revisit, note: { text: t(locale, "revisit"), locale } };
      if (gr.readiness_requirements) base.readiness_requirements = gr.readiness_requirements.map((r) => ({ ...r, ...readiness(r.code, locale, r.required !== false) }));
    }
    return base;
  }

  ensureRecord(pid: string, rep: string): S.RelationshipRecord {
    const key = canonDid(pid); let r = this.records.get(key);
    if (!r) { r = { relationship_ref: "rel-" + short(this.cfg.principal_id + "|" + key), counterpart_principal_id: pid, representative_ids: [rep], register: "first_meeting", encounters: [] }; this.records.set(key, r); }
    if (!r.representative_ids.includes(rep)) r.representative_ids.push(rep);
    return r;
  }

  private onFarewell(msg: Msg, signed: boolean): Msg[] {
    const e = this.encounters.get(msg.encounter_id);
    if (!e) return this.outOfOrder(msg, signed);
    if (e.lobby) { e.visitorFarewell = true; return []; }                       // the lobby already answered
    if (signed && e.card && this.real && !sameDid(msg.from, e.card.representative_id) && !sameDid(msg.from, e.visitor)) return [];
    // §3.2 (v0.2.3): a farewell with outcome withdrawn or taken_home before any response MUST be accepted; any other early farewell is out of order.
    if (!e.responded) {
      if (!signed || (msg.outcome !== "withdrawn" && msg.outcome !== "taken_home")) return this.outOfOrder(msg, signed);
      e.visitorFarewell = true; e.closed = true; e.responded = true; e.step = 99;
      this.note(`visitor left before a decision (${msg.outcome}); nothing recorded against it`);
      return e.hostFarewell ? [] : [this.farewell(e, "withdrawn")];
    }
    if (e.visitorFarewell) { this.note(`second farewell from ${msg.from} (${msg.msg_id})`); return this.ritualOrder(e, msg.msg_id); }
    e.visitorFarewell = true;
    if (this.cfg.peer && e.invitationId && !this.spentInvitations.has(e.invitationId)) { this.spentInvitations.add(e.invitationId); this.note(`peer invitation ${e.invitationId} spent at the farewell`); }
    // v0.5.0 (§3.5, §6.6, C234): a seated visiting representative's farewell is always accepted (never blocked by a quota or cap). It is
    // answered with the place's own farewell only when the place hasn't sent one in the encounter; otherwise the empty reply is the
    // closing receipt. Never a second farewell or an acknowledgement.
    if (e.hostFarewell) { e.closed = true; return []; }
    e.closed = true;
    if (this.cfg.peer && e.lastDecision) {
      // §6.8 / PA2: after a considering in the pair place the close is taken_inside (the trace shows "completed": host-3-018); after acts, completed.
      const pending = [...this.considerations.values()].some((c) => c.encounter_id === e.id && !c.resolved);
      return [this.farewell(e, pending ? "taken_inside" : "completed")];
    }
    return [this.farewell(e, "withdrawn")];                                    // after a conditional the visitor withdrew
  }

  // ---------- considering (§6.8) ----------
  /** Silence is no (§8.1): an unresolved consideration past response_by gets a deny outcome. */
  sweep(): Out[] {
    const now = this.clock(); const out: Out[] = [];
    // v0.4.0 (§7.3): silence is no. A hold past its end lapses: nothing is charged, and its reservation is released.
    for (const h of this.holds.values()) if (!h.done && V5.holdLapsed(now, h.expires_at, h.grace_s ?? 0)) this.lapse(h, "no answer before the hold ended");
    for (const c of this.considerations.values()) {
      if (c.resolved || Date.parse(now) <= Date.parse(c.response_by)) continue;
      c.resolved = true;
      out.push({ ...this.outcome(c, { decision: "deny", disposition: "not_now" }, "The deadline passed without a decision, so this is a decline.", now, "lapsed"), held: true });
    }
    return out;
  }
  private outcome(c: Consideration, d: { decision: "grant" | "conditional"; approved: NonNullable<S.ConsiderationOutcome["approved"]>; conditions?: S.Condition[] }
    | { decision: "deny"; disposition: "not_now" | "not_a_fit" } | { decision: "considering"; response_by: string },
    courtesyText: string, now: string, why: string, consent?: S.Signed<S.OwnerConsent>, decidedBy?: S.ConsiderationRoute): Out {
    const P = this.cfg.policy; const e = this.encounters.get(c.encounter_id);
    const enc = { id: c.encounter_id, visitor: c.rep, seq: e?.seq ?? 100, ...(e?.tag ? { tag: e.tag } : {}) };
    const loc = e ? this.loc(e) : { locale: P.supported_locales[0], match: "none" as const };
    const out: Msg = { ...this.hdr(enc, "consideration_outcome"), consideration_ref: c.ref, relationship_ref: c.relationship_ref, in_reply_to: c.considering_msg, decided_by: decidedBy ?? c.routed_to,
      decision: d.decision, courtesy: { locale: loc.locale, locale_match: loc.match, register: "established", text: courtesyText },
      basis: { policy_version: P.policy_version, decided_at: now,
        input_digest: digestOf({ now, policy: { policy_version: P.policy_version, policy_digest: this.policyDigest }, consideration_ref: c.ref, decided: d, consent: consent?.payload_digest ?? null }) } };
    if (e) e.seq = enc.seq;
    if (d.decision === "grant" || d.decision === "conditional") {
      out.approved = d.approved;
      if (d.decision === "conditional") { out.conditions = d.conditions; out.retry = { kind: "with_credential", credentials: ["signed_mandate"] }; }
    }
    if (d.decision === "deny") { out.disposition = d.disposition; out.retry = { kind: "after", not_before: addDays(now, d.disposition === "not_now" ? 1 : P.not_a_fit_retry_days) }; }
    if (d.decision === "considering") out.response_by = d.response_by;
    if (consent) out.owner_consents = [consent];   // §6.8 (v0.2.3): the owner's passkey consent travels on the outcome
    const rec = this.records.get(canonDid(c.principal));
    rec?.encounters.push({ encounter_id: c.encounter_id, response_msg_id: out.msg_id, decision: out.decision, outcome: "completed", consideration_ref: c.ref, at: now });
    this.note(`consideration_outcome ${c.ref}: ${out.decision} (${why})`);
    return { to: c.rep, message: this.wrap(out), held: true };   // §11.2: a late message, held for the visitor's inbox
  }
  /** The inside party decides. Routed to a personal principal ⇒ grant needs a passkey approve_commitment (§6.8, §8.1). */
  resolveConsideration(ref: string, decided: { decision: "grant"; approve_actions?: string[]; limits?: S.Limits } | { decision: "deny"; disposition: "not_now" | "not_a_fit" },
    courtesyText: string, consent?: S.Signed<S.OwnerConsent>): Out[] {
    const c = this.considerations.get(ref); if (!c || c.resolved) throw new Error("unknown or resolved consideration");
    const now = this.clock();
    if (Date.parse(now) > Date.parse(c.response_by)) return this.sweep();
    if (decided.decision === "grant" && c.routed_to.kind === "principal") {
      const v = verifyOwnerConsent(this.verifier, consent, { action: "approve_commitment", owner_id: c.routed_to.principal_id, subject: { kind: "consideration", id: ref, digest: c.considering_digest },
        now, rpId: this.rpOf(c.routed_to.principal_id), revoked: this.revokedConsents });
      if (!v.ok) throw new Error(`owner consent required: a passkey approve_commitment over the considering response (${v.why})`);
      if (consent!.payload.decision === "decline") { c.resolved = true; return [this.outcome(c, { decision: "deny", disposition: "not_now" }, courtesyText, now, "owner declined", consent)]; }
    }
    c.resolved = true;
    if (decided.decision === "grant") {
      const acts = decided.approve_actions ?? c.actions;
      const valid_until = addDays(now, this.cfg.policy.outcome_valid_days ?? 30);   // no rule fixes a default (SPEC open item 15); per place
      this.approvals.set(ref, { consideration_ref: ref, actions: acts, limits: decided.limits, until: valid_until, principal: c.principal });
      const approved = { actions: acts, ...(decided.limits ? { limits: decided.limits } : {}), valid_until };
      const outside = acts.filter((a) => !c.mandate.allowed_actions.includes(a));
      // C10/C20: never seats beyond the mandate; no seat rides on an outcome (used via a new encounter citing consideration_ref).
      if (outside.length > 0) return [this.outcome(c, { decision: "conditional", approved, conditions: [{ code: "require_mandate", params: { actions: outside } }] }, courtesyText, now, "approved; mandate needed", consent)];
      return [this.outcome(c, { decision: "grant", approved }, courtesyText, now, "approved", consent)];
    }
    return [this.outcome(c, { decision: "deny", disposition: decided.disposition }, courtesyText, now, "declined inside", consent)];
  }
  /** §6.8 extension: a consideration_outcome with decision "considering", the same ref and a later response_by. */
  extendConsideration(ref: string, newDate: string): Out[] {
    const c = this.considerations.get(ref); if (!c || c.resolved) throw new Error("unknown consideration");
    if (Date.parse(newDate) <= Date.parse(c.response_by)) throw new Error("an extension must move response_by later");
    c.response_by = newDate; const now = this.clock();
    const e = this.encounters.get(c.encounter_id); const loc = e ? this.loc(e).locale : this.cfg.policy.supported_locales[0];
    return [this.outcome(c, { decision: "considering", response_by: newDate }, t(loc, "considering", { date: renderDate(newDate, loc, e?.timeZone) }), now, "extended")];
  }

  // ---------- acts (§7.2) ----------
  /** C289: the first must-understand problem in the request's signed artefacts (its own payload, the card, the mandate, an allowance). */
  private critOf(r: S.InvitationRequest, card: unknown): string | null {
    for (const p of [r, card, r.mandate?.payload, r.allowance?.allowance?.payload]) { const why = critProblem(p); if (why) return why; }
    return null;
  }

  private onAct(a: Msg): Msg[] {
    const st = this.seats.get(a.seat_id); const now = this.clock();
    const e0 = st ? this.encounters.get(st.encounter_id) : undefined;
    if (!st || !e0 || st.rep !== a.from) {
      const e = this.encounters.get(a.encounter_id) ?? this.newEnc(a.encounter_id, a.from, [], "");
      return [this.actDecision(e, a, "not_a_fit", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    }
    const e = e0;
    const refuse = (disposition: S.Disposition, code: S.ReasonCode | undefined, retry: S.Retry) => [this.actDecision(e, a, disposition, code, retry, now, st)];
    // v0.3.0-rc4 (§2.6, C198): revoking a card ends every open seat it holds. Refused like a revoked card: not_now, no reason told.
    if (this.seatCardRevoked(st)) { st.unseated = true; return refuse("not_now", undefined, { kind: "with_credential", credentials: ["signed_card"] }); }
    // v0.5.0 (Conventions, C289): an act whose `crit` this place can't honour is refused whole, nothing performed.
    if (this.v05 && critProblem(a)) { this.note(`act ${a.msg_id}: ${critProblem(a)} → not_now / UNSUPPORTED_CRITICAL`); return refuse("not_now", "UNSUPPORTED_CRITICAL", { kind: "after", not_before: now }); }
    // Red team phase 1 (§2.6, C265, provisional): a seat whose card names a revocation_url acts only on a list read in the last
    // REVOCATION_RECHECK_S seconds. Older or unreadable → not_now, retry after (fail closed; a setup failure, never misconduct). A listed
    // revocation of this card ends the seat (C198).
    if (st.revUrl && !st.unseated) {
      const f = this.fetched.get(st.revUrl);
      if (!f || !f.ok || !(Date.parse(now) - Date.parse(f.at) <= REVOCATION_RECHECK_S * 1e3)) {
        this.note(`seat ${a.seat_id}: the card's revocation list is unreadable or older than ${REVOCATION_RECHECK_S} s → not_now, retry after (fail closed, C265)`);
        return refuse("not_now", undefined, { kind: "after", not_before: addSec(now, 60) });
      }
      for (const x of (Array.isArray(f.body) ? f.body : []) as S.Signed<S.CardRevocation>[]) { const p = x?.payload; if (p && p.card_id === st.cardId && sameDid(p.principal_id, st.principal)) this.acceptCardRevocation(x); }
      if (this.seatCardRevoked(st)) { st.unseated = true; return refuse("not_now", undefined, { kind: "with_credential", credentials: ["signed_card"] }); }
    }
    if (st.unseated || (st.seat.expires_at && Date.parse(st.seat.expires_at) < Date.parse(now))) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
    // v0.5.0 (§6.12, provisional): "admit then request": the owner's answer rides on an act. A usable one is kept for this seat; anything
    // else is treated as no response. It never widens the seat; the act itself is checked below as any other.
    if (this.v05 && (a as S.Act).context_response !== undefined && this.cfg.policy.context_requirements?.mode === "admit_then_request") {
      const usable = this.usableContextResponse((a as S.Act).context_response, st.principal, now);
      if (usable) { usable.entry.spent = true; this.rememberDeclined(st.principal, usable.resp.declined, now, usable.resp.answers.map((x) => x.name)); const R = this.cfg.policy.context_requirements;
        this.ctxAnswers.set(a.seat_id, { answers: usable.resp.answers.map((x) => ({ ...x })), declined: [...usable.resp.declined], ...((R.retention_days ?? 0) > 0 ? { until: addDays(now, R.retention_days!) } : {}) });
        this.note(`context answers kept for seat ${a.seat_id} (${usable.resp.answers.length} answered, ${usable.resp.declined.length} declined)`); }
    }
    const L = st.seat.limits ?? {};
    const rawAmt = a.arguments?.amount;
    const amt: Amt | null = rawAmt === undefined ? null : parseMoney(rawAmt);
    if (rawAmt !== undefined && !amt) return refuse("not_now", "REQUEST_INCOMPLETE", { kind: "with_credential", credentials: ["signed_mandate"] });
    // v0.4.0 (§5.4, §7.2 step 5a, C210): an act never carries an owner's login credential or an account identifier. It is refused
    // before anything reaches the place's service: not_a_fit / CREDENTIAL_NOT_ACCEPTED, retry at once without it. Nothing recorded.
    const carried = forbiddenMembers(a.arguments ?? {});
    if (carried.length) { this.note(`act ${a.msg_id} carries ${carried.join(", ")}: refused before the service (the representative never holds the owner's credentials)`);
      return refuse("not_a_fit", "CREDENTIAL_NOT_ACCEPTED", { kind: "after", not_before: now }); }
    // v0.4.0 (§5.2, §7.3 step 5b, C212, C213): a live owner prompt is for a purchase only: an act that spends (a spending action with
    // an amount above zero). Any other act asking to be held for its owner is refused. The visitor card must have told the owner.
    // v0.5.0 (§7.2, C233): a malformed idempotency key is not_now / REQUEST_INCOMPLETE (under shokai/0.5; a 0.3 message has none).
    if (this.v05 && a.idempotency_key !== undefined && !V5.idempotencyKeyOk(a.idempotency_key)) return refuse("not_now", "REQUEST_INCOMPLETE", { kind: "after", not_before: now });
    if (a.hold_for_owner === true) {
      const purchase = this.cfg.policy.spending_actions.includes(a.tool) && !!amt && amt.units > 0n;
      if (!purchase) { this.note(`act ${a.msg_id} asks for a live owner prompt for something other than a purchase → refused (§5.2)`); return refuse("not_a_fit", "LIVE_PROMPT_PURCHASE_ONLY", { kind: "after", not_before: now }); }
      if (st.ownerPrompts !== "purchase_only") return refuse("not_now", "CREDENTIAL_REQUIRED", { kind: "with_credential", credentials: ["signed_card"] });
      if (!this.holdsPurchases()) return refuse("not_now", "POLICY_DENY", { kind: "with_credential", credentials: ["signed_mandate"] });
      // v0.5.0 (§7.3, C232): hold policies first, before the amount and scope checks, so a second purchase during an open hold gets
      // the meaningful refusal (retry once the open hold has ended).
      const HP = this.cfg.policy.hold_policies;
      if (HP) {
        const open = [...this.holds.values()].filter((h) => h.seat_id === a.seat_id && !h.done && !V5.holdLapsed(now, h.expires_at, h.grace_s ?? 0));
        const hit = V5.holdPolicyHit(HP, { open, made: st.holdsMade ?? 0, released: st.released ?? 0 });
        if (hit?.policy === "max_open_holds") return refuse("not_now", "POLICY_DENY", { kind: "after", not_before: hit.retry_after });
        if (hit) return refuse("not_now", "POLICY_DENY", { kind: "with_credential", credentials: ["signed_mandate"] });
      }
    }
    const moves = (!!amt && amt.units > 0n) || this.cfg.policy.spending_actions.includes(a.tool);
    const cap = parseMoney(L.max_amount);
    // D11: a seat without max_amount refuses any act that moves money. v0.2.3 (§5.2, G7): retry with_credential [signed_mandate], never a live human confirmation.
    if (moves && !cap) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
    if (!st.seat.tool_allowlist.includes(a.tool)) return refuse("not_a_fit", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
    // v0.5.0 (§7.4): a reservation is checked by code against the seat's and the mandate's booking limits (the window, the party size).
    if (BOOKING_ACTIONS.has(a.tool) || (a.arguments && typeof a.arguments === "object" && "booking" in a.arguments)) {
      const bk = a.arguments?.booking ?? {};
      const why = bookingProblem(bk, L.booking, ...(st.mlimits || st.mandate ? [(st.mlimits ?? st.mandate?.limits)?.booking] : []));
      if (why) { this.note(`act ${a.msg_id} (${a.tool}): ${why} (§7.4)`); return refuse(why === "booking_malformed" ? "not_now" : "not_a_fit", why === "booking_malformed" ? "REQUEST_INCOMPLETE" : "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }); }
    }
    // v0.5.0 (§6.9, C244): a seat relying on a receipt the place revoked ends at once.
    if (st.trust?.receipts.some((id) => this.revokedReceipts.has(id))) { st.unseated = true; return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }); }
    // v0.5.0 (§6.9, C243): grant caps are counted at each act; past one, not_now / RATE_LIMITED with a retry when a slot frees.
    const caps = this.grantCapsFor(st, a.tool, now);
    if (caps.reached) return refuse("not_now", this.legacy ? "POLICY_DENY" : "RATE_LIMITED", { kind: "after", not_before: caps.until });
    const costly = this.opts.costlyActCap?.({ seat_id: a.seat_id, principal: st.principal, tool: a.tool, amount: (a as any).amount });
    if (costly?.reached) { this.note(`costly-action cap reached for ${a.tool} (§7.7) → RATE_LIMITED`); return refuse("not_now", this.legacy ? "POLICY_DENY" : "RATE_LIMITED", { kind: "after", not_before: addSec(now, 3600) }); }
    const countGrant = () => { for (const k of caps.keys) { const l = this.grantUses.get(k) ?? []; l.push(now); this.grantUses.set(k, l); } if (costly && !costly.reached) costly.count(); };
    // v0.4.0 (§5.4, C209): a seat under a customer link ends with the link; no money moves before the link's cooling-off ends.
    if (st.linkId) {
      const link = this.customerLinks.get(st.linkId);
      if (!link || this.endedLinks.has(st.linkId) || isExpired(link.payload.expires_at, now)) { st.unseated = true; return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }); }
      if (moves && link.payload.money_from && Date.parse(now) < Date.parse(link.payload.money_from)) return refuse("not_now", "POLICY_DENY", { kind: "after", not_before: link.payload.money_from });
    }
    // v0.3.0-rc2 (§7.2, C174): an act of a spending action states what it spends in arguments.amount (Money). Without it the door
    // couldn't count it against the seat's caps, so it is refused as incomplete (the visitor resends it with the amount).
    if (this.cfg.policy.spending_actions.includes(a.tool) && !amt) return refuse("not_now", "REQUEST_INCOMPLETE", { kind: "with_credential", credentials: ["signed_mandate"] });
    if (L.max_operations !== undefined && st.ops + 1 > L.max_operations) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
    // v0.3.0-rc2 (§5.1, C175): a mandate's limits bind across every seat granted under it while it is valid, not per seat. A second
    // visit under the same mandate continues its count; once the mandate's operations or amount are used up, its acts are refused.
    const mu: MandateUse | undefined = st.mkey ? this.mandateUse.get(st.mkey) : undefined; const ML = st.mlimits ?? {};
    if (mu && ML.max_operations !== undefined && mu.ops + 1 > ML.max_operations) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
    if (this.door && DOOR_ACTIONS.includes(a.tool)) return this.onOffer(e, a, st, now);
    let allowUnits: bigint | undefined;
    if (amt && cap) {
      if (amt.currency !== cap.currency) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
      const perOp = L.max_amount_scope === "per_operation";
      // v0.2.8 (§7.2, P10): per_operation caps each act AND the whole seat stays under its session cap (session_max_amount, default
      // max_amount), across every payment_ref, so splitting one purchase over fresh refs can't exceed what the owner allowed for the visit.
      const sess = perOp ? (parseMoney(sessionCapOf(L)) ?? cap) : cap;
      if (sess.currency !== cap.currency) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
      const ref = typeof a.arguments?.payment_ref === "string" ? a.arguments.payment_ref : null;
      const refSum = ref ? (st.byRef[ref] ?? 0n) + amt.units : amt.units;
      // Structuring (§7.2, §9.3 seat_overreach severe): parts of one payment_ref that together exceed the limit.
      if (ref && st.byRef[ref] !== undefined && refSum > cap.units) {
        st.unseated = true; this.bindNever(st.rep, now); e.neverClosed = true;
        this.issueNotice(e, [{ code: "seat_overreach", severity: "severe", observed_at: now, evidence_digest: digestOf({ seat: a.seat_id, ref, sum: refSum.toString() }) }], false, st);
        return [...refuse("never", undefined, { kind: "never" }), { ...this.hdr(e, "unseat"), seat_id: a.seat_id, reason: "seat_overreach" }];
      }
      const mcap = mu ? parseMoney(ML.max_amount_scope === "per_operation" ? (sessionCapOf(ML) ?? ML.max_amount) : ML.max_amount) : null;
      const seatFails = (perOp && amt.units > cap.units) || st.spent + amt.units > sess.units;
      const mandFails = !!mu && amt.units > 0n && !!mcap && (amt.currency !== mcap.currency || mu.spent + amt.units > mcap.units);
      if (seatFails || mandFails) {
        // v0.5.0 (§7.3, C230): with policy.limit_calls, a purchase asked to be held that fails ONLY on max_amount is held over the limit.
        const over = this.overLimitOf(a, st, amt, cap, mcap, mu, perOp);
        if (!over) return refuse("not_now", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] });
        // R8-01: reserve the amount as well as the operation, so intervening spend can't push a later release past the owner-signed ceiling.
        st.ops++; if (mu) mu.ops++;
        st.spent += amt.units; if (ref) st.byRef[ref] = refSum;
        if (mu) { mu.spent += amt.units; mu.currency = amt.currency; }
        this.admitted.set(`${a.from}|${a.msg_id}`, { seat_id: a.seat_id, units: amt.units, ref: ref ?? undefined, mkey: st.mkey, at: now });
        return [this.holdAct(e, a, st, now, over)];
      }
      // v0.5.0 (§5.2, C286): the place's own ledger for the allowance grant, across every mandate minted under it; check and record are one step.
      if (st.allow && amt.units > 0n) {
        const v = this.allowanceLedger.spend(st.allow, a.seat_id, amt.units, amt.currency, now);
        if (!v.ok) { this.note(`act ${a.msg_id}: allowance grant ${v.which} cap at this place reached (C286) → not_now / SEAT_SCOPE_EXCEEDED`);
          return refuse("not_now", "SEAT_SCOPE_EXCEEDED", v.retryAfter ? { kind: "after", not_before: v.retryAfter } : { kind: "with_credential", credentials: ["signed_mandate"] }); }
        allowUnits = amt.units;
      }
      st.spent += amt.units; if (ref) st.byRef[ref] = refSum;
      if (mu) { mu.spent += amt.units; mu.currency = amt.currency; }
    }
    st.ops++; if (mu) mu.ops++; countGrant();
    // v0.3.0-rc4 (§7.2, C194): remember what this act counted, so a refusal by the place's own service can release all of it at once.
    this.admitted.set(`${a.from}|${a.msg_id}`, { seat_id: a.seat_id, units: amt && cap ? amt.units : 0n,
      ref: typeof a.arguments?.payment_ref === "string" ? a.arguments.payment_ref : undefined, mkey: st.mkey, at: now, ...(allowUnits ? { allowUnits } : {}) });
    // v0.4.0 (§7.3): the purchase passed every check; it is held (reserved, not charged) while the visitor asks its owner.
    if (a.hold_for_owner === true) return [this.holdAct(e, a, st, now)];
    // v0.5.0 (§7.2, §7.4, §7.5): the place's own service answers the act; a refusal releases what it counted (C194).
    if (this.opts.service) {
      const sv = this.opts.service(a, { now, seat_id: a.seat_id, seat: st.seat, encounter_id: e.id, representative_id: st.rep, principal_id: st.principal, card_id: st.cardId,
        mandate: st.mandate, mandate_limits: st.mlimits, visitor: st.visitor, host: this });
      if (sv && !sv.ok) { this.releaseAct(a.from, a.msg_id); return refuse(sv.disposition, sv.reason_code, sv.retry ?? { kind: "after", not_before: now }); }
      if (sv && sv.ok) { const h = this.hdr(e, "act_result", a.from); return [{ ...h, in_reply_to: a.msg_id, seat_id: a.seat_id, tool: a.tool, ok: true, result: sv.result }]; }
    }
    // The simulated reference: with uniqueActRefs (the SDK's doors) or after a restart it names this act_result's own msg_id, unique per
    // sender (§2.2), so it never repeats across seats or restarts. The short legacy form stays for the golden traces' fixed runs.
    const h = this.hdr(e, "act_result", a.from);
    return [{ ...h, in_reply_to: a.msg_id, seat_id: a.seat_id, tool: a.tool, ok: true,
      result: { simulated: true, reference: this.bootTag || this.opts.uniqueActRefs ? `${a.tool}-${h.msg_id}` : `${a.tool}-${st.ops}`, ...Object.fromEntries(Object.entries(a.arguments && typeof a.arguments === "object" && !Array.isArray(a.arguments) ? a.arguments : {}).filter(([k]) => k !== "simulated" && k !== "reference")) }, rationale: "within seat and limits" }];
  }
  // ---------- v0.4.0: the purchase-only live owner prompt (§5.2, §7.3) ----------
  /** Whether this place holds purchases for a visitor's owner: its policy sets a hold time and, with a Shōkai host card, the card's
   *  host scope includes "hold_purchases" (so the place's owner was told when they signed it). */
  holdsPurchases(): boolean {
    const hs = this.cfg.policy.purchase_hold_s; if (!hs || hs <= 0) return false;
    const c = this.cfg.card?.payload; return !c || c.kind !== "host" || !!c.host_scope?.duties?.includes("hold_purchases");
  }
  private holdAct(e: Enc, a: Msg, st: SeatState, now: string, over?: Hold["over_limit"]): Msg {
    const hold_id = "hold-" + short(a.from + "|" + a.msg_id); const act_digest = digestOf(a);
    const expires_at = addSec(now, Math.min(this.cfg.policy.purchase_hold_s!, MAX_HOLD_S));
    // v0.5.0 (§7.3, C231): one clock, one grace (at most 5 s), stated by the place; a hold made under shokai/0.3 keeps the v0.4.0 rule.
    const grace_s = this.v05 ? V5.graceOf(this.cfg.policy.hold_grace_s) : 0;
    this.holds.set(hold_id, { hold_id, act: a, act_digest, seat_id: a.seat_id, expires_at, admittedKey: `${a.from}|${a.msg_id}`, grace_s, ...(over ? { over_limit: over } : {}) });
    st.holdsMade = (st.holdsMade ?? 0) + 1;
    this.note(`purchase ${a.msg_id} held until ${expires_at} for the visitor's owner (nothing charged; the visit goes on)${over ? `; over the limit (${over.current.value} of ${over.limit.value}, ${over.proposed.value} proposed)` : ""}`);
    return { ...this.hdr(e, "act_held", a.from), in_reply_to: a.msg_id, seat_id: a.seat_id, tool: a.tool, amount: a.arguments.amount, hold_id, act_digest, expires_at, ...(over ? { over_limit: over } : {}) };
  }
  /** v0.5.0 (§7.3, C230, R8-01): the over-limit hold's figures when the act may be held over the limit, else null (refused as in v0.4.0).
   *  Only under shokai/0.5, with policy.limit_calls, a live owner prompt for a purchase, a seat under a mandate, a session-scoped cap,
   *  one currency, and only max_amount failing (operations were checked before). The caller reserves the amount against the seat. */
  private overLimitOf(a: Msg, st: SeatState, amt: Amt, cap: Amt, mcap: Amt | null, mu: MandateUse | undefined, perOp: boolean): Hold["over_limit"] | null {
    const P = this.cfg.policy; const L = st.seat.limits ?? {}; const ML = st.mlimits ?? {};
    if (!this.v05 || P.limit_calls !== true || a.hold_for_owner !== true || st.ownerPrompts !== "purchase_only" || !this.holdsPurchases()) return null;
    // Review 4 R4-09: never for a seat spending under an allowance grant: the place's own grant ledger (C286) caps it, and a release can't pass it.
    if (st.allow) return null;
    // Review 5 R5-02: at most one over-limit hold open per seat, so `current` and `proposed` are the true totals the owner approves:
    // a newer over-limit act ends the older hold (it lapses; its raise can no longer release it), e.g. after the owner declined it.
    for (const h of [...this.holds.values()]) if (!h.done && h.over_limit && h.seat_id === st.seat.seat_id) this.lapse(h, "ended by a newer over-limit hold in this seat (one at a time)");
    if (!st.mandate || !st.mandateDigest || !mu || perOp || L.session_max_amount || ML.max_amount_scope === "per_operation" || ML.session_max_amount) return null;
    if (amt.currency !== cap.currency || (mcap && mcap.currency !== amt.currency)) return null;
    if (a.arguments?.payment_ref !== undefined && st.byRef[String(a.arguments.payment_ref)] !== undefined) return null;   // never for parts of one payment (structuring)
    // §7.3 (v0.5.0): held only when proposed is within the place's own stated limit for the action: only the owner's limit is raised.
    const pl = parseMoney(P.actions.find((x) => x.action === a.tool)?.limits?.max_amount);
    const useM = !!mcap && mcap.units < cap.units; const limitSigned = (useM ? ML.max_amount : L.max_amount)!;
    // Binding current is against the binding ceiling (the lower of seat and mandate), not max(spent): a prior visit under the
    // same mandate can make mandate.spent diverge from this seat's spent (C175 / R9-02).
    const seatSpent = st.spent; const mandSpent = mu.spent;
    const current = useM ? mandSpent : seatSpent;
    // Same scale as the signed amounts (the limit is the signed Money as is).
    const seatLimSigned = (L.max_amount ?? limitSigned)!;
    const mandLimSigned = (ML.max_amount ?? limitSigned)!;
    const scaleSrc = [limitSigned, seatLimSigned, mandLimSigned, a.arguments.amount];
    const dp = Math.max(...scaleSrc.map((x: S.Money) => (String(x.value).split(".")[1] ?? "").length));
    const fmt = (u: bigint): S.Money => { const m = moneyOf({ units: u, currency: amt.currency }); const [i, f = ""] = m.value.split("."); return { value: dp ? `${i}.${f.padEnd(dp, "0")}` : i, currency: m.currency }; };
    if (pl && (pl.currency !== amt.currency || current + amt.units > pl.units)) { this.note(`act ${a.msg_id}: above the place's own limit for ${a.tool} (${pl.units} units): refused, not held`); return null; }
    return {
      limit: { value: limitSigned.value, currency: limitSigned.currency }, current: fmt(current), proposed: fmt(current + amt.units),
      seat: { limit: { value: seatLimSigned.value, currency: seatLimSigned.currency }, current: fmt(seatSpent) },
      mandate: { limit: { value: mandLimSigned.value, currency: mandLimSigned.currency }, current: fmt(mandSpent) },
    };
  }
  /** A hold ends without a yes (declined, or silence past expires_at): the act lapses and what it reserved is released (C194). */
  private lapse(h: Hold, why: string) {
    if (h.done) return; h.done = true; const [from, msgId] = [h.admittedKey.slice(0, h.admittedKey.lastIndexOf("|")), h.admittedKey.slice(h.admittedKey.lastIndexOf("|") + 1)];
    this.releaseAct(from, msgId); this.note(`hold ${h.hold_id} lapsed (${why}): nothing charged, its reservation released`);
  }
  private onActConfirmation(m: S.ActConfirmation): Msg[] {
    const now = this.clock(); const h = this.holds.get(m.hold_id); const st = h ? this.seats.get(h.seat_id) : undefined;
    const e = st ? this.encounters.get(st.encounter_id) : undefined;
    const stub = { msg_id: m.msg_id, seat_id: m.seat_id, tool: h?.act.tool ?? "?", from: m.from };
    if (!h || !st || !e || st.rep !== m.from || h.seat_id !== m.seat_id) {
      const e2 = this.encounters.get(m.encounter_id) ?? this.newEnc(m.encounter_id, m.from, [], "");
      return [this.actDecision(e2, stub, "not_a_fit", "SEAT_SCOPE_EXCEEDED", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    }
    const lapsed = () => [this.actDecision(e, stub, "not_now", "HOLD_LAPSED", { kind: "after", not_before: now }, now, st)];
    // v0.5.0 (§7.3, C230): a superseding mandate is used up by its release; offered again (another hold, or after its hold ended): MANDATE_INVALID.
    const offered = this.v05 ? m.mandate?.payload : undefined;
    if (offered && typeof offered.mandate_id === "string" && this.usedRaises.has(`${canonDid(st.principal)}|${offered.mandate_id}`)) {
      this.note(`act_confirmation for ${h.hold_id}: superseding mandate ${offered.mandate_id} was used up by an earlier release → MANDATE_INVALID`);
      return [this.actDecision(e, stub, "not_now", "MANDATE_INVALID", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    }
    // Editor decision H1(e) (C300): a superseding mandate whose min_protocol isn't a well-formed protocol identifier is malformed:
    // MANDATE_INVALID, like any invalid mandate; the hold is left as it is.
    if (offered && V5.minProtocolMalformed(offered)) {
      this.note(`act_confirmation for ${h.hold_id}: superseding mandate ${String(offered.mandate_id)} carries a malformed min_protocol → MANDATE_INVALID (H1(e), C300)`);
      return [this.actDecision(e, stub, "not_now", "MANDATE_INVALID", { kind: "with_credential", credentials: ["signed_mandate"] }, now, st)];
    }
    if (h.done) return lapsed();
    // v0.5.0 (§7.3, C231): one clock, one grace: held while now ≤ expires_at + grace (0 under the v0.4.0 rule).
    const grace = h.grace_s ?? 0;
    if (V5.holdLapsed(now, h.expires_at, grace)) { this.lapse(h, "the hold ended before the owner answered"); return lapsed(); }
    // v0.5.0 (§7.2): a malformed idempotency key.
    if (this.v05 && m.idempotency_key !== undefined && !V5.idempotencyKeyOk(m.idempotency_key)) return [this.actDecision(e, stub, "not_now", "REQUEST_INCOMPLETE", { kind: "after", not_before: now }, now, st)];
    // v0.5.0 (§7.3): ActConfirmation is consent OR mandate. An ordinary hold takes the owner's approve_purchase consent; an over-limit
    // hold takes a superseding passkey mandate (an owner's decline may come as a consent with decision "decline" for either).
    const cred: S.CredentialKind = h.over_limit ? "signed_mandate" : "owner_consent";
    const needs = () => [this.actDecision(e, stub, "not_now", "CREDENTIAL_REQUIRED", { kind: "with_credential", credentials: [cred] }, now, st)];
    const mandate = this.v05 ? m.mandate : undefined;
    if ((m.consent && mandate) || (!m.consent && !mandate)) { this.note(`act_confirmation for ${h.hold_id}: needs exactly one of consent or mandate`); return needs(); }
    const ownerId = st.ownerId ?? st.principal;
    if (m.consent) {
      // v0.5.0 (§7.3, C231): an owner consent, or a superseding mandate offered to release an over-limit hold, whose own expires_at equals the hold's gets the same grace.
      const at = V5.consentClock(now, m.consent?.payload?.expires_at, h.expires_at, grace);
      const v = verifyOwnerConsent(this.verifier, m.consent, { action: "approve_purchase", owner_id: ownerId, subject: { kind: "act", id: h.hold_id, digest: h.act_digest },
        now: at, rpId: this.rpOf(ownerId), revoked: this.revokedConsents, representative_id: st.rep });
      if (!v.ok) { this.note(`act_confirmation for ${h.hold_id}: consent does not verify (${v.why}); the hold stays until ${h.expires_at}`); return needs(); }
      if (m.consent.payload.decision === "decline") { this.lapse(h, "the owner declined"); return lapsed(); }
      if (h.over_limit) { this.note(`act_confirmation for ${h.hold_id}: over the limit, a consent can't raise it (a superseding mandate is needed)`); return needs(); }
    } else {
      // v0.5.0 (§5.1, §7.3, C230, C237): the passkey mandate superseding the seat's current one, for the seat's Shōkai visitor card,
      // verified against the visitor card's owner binding (signed by the owner, ES256 on the pinned rp id) and the held act.
      const card = e.card; const ol = h.over_limit!;
      const signedOk = !!card && !badTimestamps(mandate!).length && !!this.verifier.signed(mandate!, ownerId, undefined, "ES256", this.rpOf(ownerId));
      // v0.5.0 (§7.3, C231, conformance 2026-11-08 finding 2): one clock, one grace. A raise whose own expires_at equals the hold's gets the
      // hold's grace, as an owner consent does (consentClock); under shokai/0.3 the grace is 0, so nothing changes there.
      const mAt = V5.consentClock(now, mandate?.payload?.expires_at, h.expires_at, grace);
      const chk = signedOk && st.mandate && st.mandateDigest ? V5.checkSupersedingMandate(mandate!.payload, { current: st.mandate, currentDigest: st.mandateDigest, card: card!,
        tool: h.act.tool, proposed: parseMoney(ol.proposed)!, now: mAt, place: this.cfg.principal_id, hold: { hold_id: h.hold_id, act_digest: h.act_digest, expires_at: h.expires_at } }) : { ok: false as const, why: signedOk ? "no_current_mandate" : "signature" };
      if (!chk.ok) { this.note(`act_confirmation for ${h.hold_id}: superseding mandate refused (${chk.why}); the hold stays until ${h.expires_at}`); return needs(); }
      // R8-01 / R9b-02 / R9b-05: re-check each ledger against the total that ledger showed at the hold plus this
      // act, before burning the raise. Comparing both ledgers to the binding `proposed` would refuse a valid
      // cross-visit release when the mandate ledger already holds earlier visits (fail closed). Intervening
      // spend that pushed either ledger past its shown ceiling still fails. A refused release keeps the hold and the raise.
      const proposed = parseMoney(ol.proposed)!;
      const actAmt = parseMoney(h.act.arguments?.amount as S.Money | undefined);
      const seatShown = parseMoney(ol.seat?.current);
      const mandShown = parseMoney(ol.mandate?.current);
      const same = (a?: ReturnType<typeof parseMoney>) => !!a && !!actAmt && a.currency === proposed.currency && actAmt.currency === proposed.currency;
      const seatCeiling = same(seatShown) ? seatShown!.units + actAmt!.units : proposed.units;
      const mandCeiling = same(mandShown) ? mandShown!.units + actAmt!.units : proposed.units;
      const mu = st.mkey ? this.mandateUse.get(st.mkey) : undefined;
      if (st.spent > seatCeiling || (mu && mu.spent > mandCeiling)) {
        this.note(`act_confirmation for ${h.hold_id}: reserved total now exceeds the shown ceiling (seat ${st.spent} > ${seatCeiling} or mandate ${mu?.spent ?? 0n} > ${mandCeiling}); the hold stays`);
        return needs();
      }
      // §7.3 "After the release: no standing raise": it releases this act only. The seat keeps its limits and its mandate (one errand,
      // one ledger); the superseding mandate is used up and never becomes the seat's mandate.
      const nm = mandate!.payload; this.usedRaises.add(`${canonDid(st.principal)}|${nm.mandate_id}`);
      this.note(`hold ${h.hold_id}: the owner approved this one purchase (${ol.proposed.value} ${ol.proposed.currency} in all) with a passkey mandate superseding ${nm.supersedes!.mandate_id}; the seat keeps its limit`);
    }
    // Amount was reserved at the hold (ordinary and over-limit); do not count it again.
    h.done = true; h.released = true; st.released = (st.released ?? 0) + 1; const a = h.act; const hd = this.hdr(e, "act_result", a.from);
    this.note(`hold ${h.hold_id}: the owner approved with their passkey → the purchase goes to the place's service`);
    return [{ ...hd, in_reply_to: a.msg_id, seat_id: a.seat_id, tool: a.tool, ok: true,
      result: { simulated: true, reference: `${a.tool}-${hd.msg_id}`, ...Object.fromEntries(Object.entries(a.arguments ?? {}).filter(([k]) => k !== "simulated" && k !== "reference")) }, rationale: "approved by the owner, within seat and limits" }];
  }
  // ---------- v0.4.0: customer links at an institution (§5.4) ----------
  /** The place records a customer link made in its own authenticated channel (its app or website). Returns whether it verified. */
  recordCustomerLink(l: S.Signed<S.CustomerLink>): boolean {
    const v = verifyCustomerLink(this.verifier, l, { place: this.cfg.principal_id, now: this.clock() });
    if (!v.ok) { this.note(`customer link not recorded (${v.why})`); return false; }
    this.customerLinks.set(l.payload.link_id, l); this.endedLinks.delete(l.payload.link_id); return true;
  }
  /** Either side ends a link; open seats under it end at once (§5.4). */
  /**
   * v0.5.0 (`door.endSeat`, P31 guard 14, approved for v0.5.0): the host alone ends a live seat. The seat is unseated at once and the
   * host's own farewell is held for the visiting representative in its encounter (and its wire tag). No finding and no notice:
   * a misconduct finding, if any, goes through the misconduct path. Returns false for an unknown or already ended seat.
   */
  endSeat(seatId: string): boolean {
    const st = this.seats.get(seatId); if (!st || st.unseated) return false;
    st.unseated = true; this.allowanceLedger.forgetSeat(seatId); const e = this.encounters.get(st.encounter_id);
    // §7.1: its open holds lapse with nothing charged (a later confirmation gets HOLD_LAPSED).
    for (const h of this.holds.values()) if (h.seat_id === seatId && !h.done) this.lapse(h, "the host ended the seat");
    if (e && !e.seatEnded) { e.closed = true; e.seatEnded = true; this.outbox.push({ to: st.rep, held: true, message: this.wrap(this.farewell(e, "completed")) }); }
    this.note(`endSeat ${seatId}`); return true;
  }
  endCustomerLink(linkId: string) { this.endedLinks.add(linkId); for (const st of this.seats.values()) if (st.linkId === linkId) st.unseated = true; }
  private customerLinkCheck(actions: string[], m: S.Mandate, card: S.RepresentativeCard, now: string): { result: GateResult } | { linkId: string } | null {
    const P = this.cfg.policy;
    if (!actions.some((a) => P.actions.find((x) => x.action === a)?.requires_customer_link)) return null;
    // One answer for every failure that would tell a stranger whether this owner is a customer (no customer oracle).
    const uniform = (why: string): { result: GateResult } => { this.note(`customer link check failed (${why}) → the one uniform answer (not_now, readiness customer_link)`);
      return { result: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", retry: { kind: "with_credential", credentials: ["customer_link"] }, readiness_requirements: [{ code: "customer_link", required: true }] } }; };
    const ref = m.customer_link; if (!ref || typeof ref.link_id !== "string") return uniform("no customer_link in the mandate");
    const l = this.customerLinks.get(ref.link_id);
    if (!l || this.endedLinks.has(ref.link_id) || l.payload_digest !== ref.link_digest) return uniform("unknown, ended or changed link");
    if (!verifyCustomerLink(this.verifier, l, { place: this.cfg.principal_id, now }).ok) return uniform("link not valid now");
    if (!sameDid(l.payload.owner_id, card.principal.principal_id) || l.payload.rp_id !== card.owner_binding?.rp_id) return uniform("link of another owner identity");
    if (actions.some((a) => !l.payload.scope.actions.includes(a))) return { result: { decision: "deny", disposition: "not_a_fit", reason_code: "MANDATE_SCOPE_EXCEEDED", retry: { kind: "with_credential", credentials: ["signed_mandate"] } } };
    return { linkId: ref.link_id };
  }
  // ---------- v0.4.0: this door's own Shōkai host card (§2.3) ----------
  /** null when the door may speak: no card, a v0.3.0 card (no kind), or a host card that names this place, covers its actions and
   *  fingerprints the house config it serves now. Otherwise why not. */
  /**
   * v0.5.0 (§7.6): serve an owner-signed amended setup without a restart. The caller (the SDK's door) has verified the owner's
   * signature, the chain (prev_house_digest, setup_version) and the Shōkai host card; this checks the house config like a start
   * does and swaps it. Open seats keep what they were granted; new requests are decided under the new setup.
   */
  replaceHouse(cfg: PlaceConfig): string[] {
    const problems = V5.houseConfigProblems(cfg, { holdsPurchases: !!cfg.policy.purchase_hold_s, summaryRequired: cfg.card?.payload.kind === "host" });
    if (problems.length) return problems;
    this.cfg = cfg; this.policyDigest = digestOf(cfg.policy);
    const ob = cfg.card?.payload.owner_binding; if (ob?.rp_id) this.knownRp.set(ob.owner_id, ob.rp_id);
    return [];
  }
  hostCardProblem(): string | null {
    const sc = this.cfg.card; const c = sc?.payload;
    if (!c) return null;   // a bare Host with no card of its own (test harnesses, pre-v0.4 golden replays); the SDK Door always holds one (§3.1)
    if (Date.parse(this.clock()) >= Date.parse(c.expires_at)) return "expired";
    if (this.undecidedPrincipals.has(canonDid(c.principal.principal_id))) return "withdrawn";
    { const r = this.revokedCards.get(canonDid(c.principal.principal_id) + "|" + c.card_id); if (r && (!r.digest || r.digest === sc!.payload_digest)) return "withdrawn"; }
    if (c.kind === undefined) return null;   // a v0.3.0 card (no kind), read as the place's card (§2.3)
    if (c.kind === "visitor") return "a Shōkai visitor card can't keep a door";
    const r = checkHostCardFields(c, { principal_id: this.cfg.principal_id, ...(this.opts.entryUrl ? { entry: this.opts.entryUrl } : {}), house_digest: houseDigest(this.cfg),
      actions: this.cfg.policy.actions.map((a) => a.action) });
    return r.ok ? null : r.why;
  }
  private actDecision(e: Enc, a: Msg, disposition: S.Disposition, code: S.ReasonCode | undefined, retry: S.Retry, now: string, st?: SeatState): Msg {
    const P = this.cfg.policy;
    const m: Msg = { ...this.hdr(e, "act_decision", a.from), in_reply_to: a.msg_id, seat_id: a.seat_id, tool: a.tool, decision: "deny", disposition, retry,
      courtesy: this.courtesy(e, disposition === "never" ? "deny_never" : !st ? "act_seat_gone" : "act_deny", disposition === "never" ? "adversarial" : "established"),
      basis: { policy_version: P.policy_version, decided_at: now, input_digest: digestOf({ now, policy: { policy_version: P.policy_version, policy_digest: this.policyDigest },
        seat: st?.seat ?? null, tool: a.tool, amount: a.arguments?.amount ?? null, ops: st?.ops ?? 0, spent: st ? st.spent.toString() : "0",
        ...(st?.mkey ? { mandate_used: { ops: this.mandateUse.get(st.mkey)?.ops ?? 0, spent: (this.mandateUse.get(st.mkey)?.spent ?? 0n).toString() } } : {}) }) } };
    if (code) m.reason_code = code;
    return m;
  }

  // ---------- misconduct (§9.3, D1) ----------
  issueNotice(e: Enc, findings: S.MisconductFinding[], probing: boolean, seat?: SeatState): Out[] {
    const now = this.clock(); const card = e.card!; const pid = card.principal.principal_id;
    const worst = findings.some((f) => f.severity === "severe") ? "severe" : findings.some((f) => f.severity === "serious") ? "serious" : "minor";
    const relied = seat?.vouch ?? (e.vouchWeight === "full" || e.vouchWeight === "reduced" ? e.vouch : undefined);
    const chain = relied ? [{ vouch_id: relied.vouch_id, introducer_id: relied.introducer.principal_id }] : [];
    const scope = relied ? relied.scope.purposes : card.mandate_scope.purposes;
    const effects: S.MisconductEffect[] = [{ party_id: card.representative_id, party_role: "representative", scope,
      standing_change: worst === "minor" ? "noted" : worst === "serious" ? (probing ? "suspended" : "reduced") : "suspended",
      ...(probing || worst === "severe" ? { disposition: "never" as const, retry: { kind: "never" as const } } : {}) }];
    if (worst === "severe") { this.bindNever(pid, now); this.bindNever(card.representative_id, now); }
    const notice_id = "mn-" + short(e.id + now + findings.map((f) => f.code).join());
    if (relied && worst !== "minor") {
      const grade = worst === "serious" ? "reduced" : "suspended"; const days = worst === "serious" ? 90 : 180;
      const until = addDays(now, days);
      const p: Penalty = { grade, purposes: relied.scope.purposes, notice_ref: notice_id, until, from: now, days, vouch_id: relied.vouch_id };
      this.introducers.set(relied.introducer.principal_id, [...(this.introducers.get(relied.introducer.principal_id) ?? []), p]);
      effects.push({ party_id: relied.introducer.principal_id, party_role: "introducer", scope: relied.scope.purposes, standing_change: grade, until });
    }
    // v0.2.9 (§9.3): a representative's conduct is its owner's conduct. The owner's standing at this place changes too,
    // so a fresh representative of the same owner does not start clean here. Local to this place only.
    effects.push({ party_id: pid, party_role: "visitor_principal", scope: card.mandate_scope.purposes,
        standing_change: worst === "minor" ? "noted" : worst === "serious" ? (probing ? "suspended" : "reduced") : "suspended",
        ...(worst !== "minor" ? { until: addDays(now, worst === "serious" && !probing ? 90 : NEVER_DAYS) } : {}),
        ...(probing || worst === "severe" ? { disposition: "never" as const, retry: { kind: "never" as const } } : {}) });
    const base: S.MisconductNotice = { notice_id, issuer: { principal_id: this.cfg.principal_id, display_name: this.cfg.display_name },
      subject: { representative_id: card.representative_id, card_digest: e.cardDigest!, principal_id: pid }, encounter_id: e.id,
      relationship_ref: this.records.get(canonDid(pid))?.relationship_ref, vouch_chain: chain, effects, issued_at: now };
    const full = { ...base, findings };
    const toPrincipal = probing ? { ...base, findings_withheld: true } : full;
    const rec = this.ensureRecord(pid, card.representative_id);
    rec.misconduct = [...(rec.misconduct ?? []), ...findings.map((f) => ({ notice_id, code: f.code, severity: f.severity, at: now }))];
    this.notices.set(notice_id, { notice: full, introducers: chain.map((c) => c.introducer_id) });
    const msg = (to: string, n: S.MisconductNotice): Out => ({ to, message: this.wrap({ ...this.hdr(e, "misconduct_notice", to), notice: this.signAsPrincipal(n) }), held: true });
    // §11.2 (v0.2.4): a notice to a principal is held for the representative named in the card it is about (it polls with its own key),
    // and also under the principal's own DID (MAY).
    const out: Out[] = [msg(card.representative_id, toPrincipal as S.MisconductNotice), msg(pid, toPrincipal as S.MisconductNotice), ...chain.map((c) => msg(c.introducer_id, full))];
    this.outbox.push(...out);
    this.note(`misconduct_notice ${notice_id} (${findings.map((f) => f.code + "/" + f.severity).join(",")}) → ${out.map((o) => o.to).join(", ")}`);
    return out;
  }

  private onRevocation(m: S.VouchRevocationMessage): Msg[] {
    const r = m.revocation; const v = r?.payload; if (!v) return [];
    if (this.real && m.from !== v.introducer_id) { this.note("revocation not sent by its introducer: ignored"); return []; }
    if (!this.verifier.signed(r, v.introducer_id)) { this.note("revocation with bad signature ignored"); return []; }
    if (this.revokedVouches.has(v.vouch_id)) return [];
    this.revokedVouches.set(v.vouch_id, r);
    // D1: a revocation within 7 days of the notice halves the duration.
    for (const p of this.introducers.get(v.introducer_id) ?? []) {
      if (((v.notice_ref && p.notice_ref === v.notice_ref) || p.vouch_id === v.vouch_id) && !p.halved_by_revocation && Date.parse(v.revoked_at) - Date.parse(p.from) <= 7 * 86400e3) {
        p.halved_by_revocation = r.payload_digest; p.until = addDays(p.from, p.days / 2);
      }
    }
    this.note(`vouch ${v.vouch_id} revoked by message; the vouch's own log is still consulted on use`);
    return [];
  }
  /**
   * §9.3 (v0.2.9, P5): only a review signed by the place's own principal, or by a reviewer the place names, restores standing.
   * A review signed by the penalised introducer (any key or spelling of its DID) is an appeal: it is kept for the place, never a pardon.
   */
  appeals: S.Signed<S.IntroducerReview>[] = [];
  private onReview(m: S.IntroducerReviewMessage): Msg[] {
    const r = m.review; const v = r?.payload; if (!v) return [];
    const reviewer = v.reviewer_id ?? v.introducer_id;
    if (!this.verifier.signed(r, reviewer)) { this.note("review with bad signature ignored"); return []; }
    const allowed = [this.cfg.principal_id, ...(this.cfg.policy.introducer_reviewers ?? [])];
    if (sameDid(reviewer, v.introducer_id) || !allowed.some((x) => sameDid(x, reviewer))) {
      this.appeals.push(r); this.note(`introducer review ${v.review_id}: signed by ${sameDid(reviewer, v.introducer_id) ? "the penalised introducer itself" : "a reviewer this place does not name"} → kept as an appeal; standing unchanged (P5)`);
      return [];
    }
    for (const p of this.introducers.get(v.introducer_id) ?? []) if (p.notice_ref === v.notice_ref) p.restored_by_review = v.review_id;
    this.note(`introducer review ${v.review_id} (reviewer ${reviewer}) restored standing for ${v.introducer_id}`);
    return [];
  }

  /** Host-side VisitReport to the host's own owner (§8.2). outcome_rendered comes from machine fields only (D10). */
  report(encounter_id: string, ownerLocale = "en-US", timeZone?: string): S.VisitReport {
    const e = this.encounters.get(encounter_id)!; const rec = e.card ? this.records.get(canonDid(e.card.principal.principal_id)) : undefined;
    const last = rec?.encounters.filter((x) => x.encounter_id === encounter_id).at(-1);
    const cons = last?.consideration_ref ? this.considerations.get(last.consideration_ref) : undefined;
    const seat = [...this.seats.values()].find((s) => s.encounter_id === encounter_id);
    const decision = (last?.decision ?? "deny") as "grant" | "deny" | "conditional" | "considering";
    const rendered = cons ? `Taken inside: a decision is needed by ${renderDate(cons.response_by, ownerLocale, timeZone)}; with no reply it is declined.`
      : decision === "grant" ? `Seated for ${seat?.seat.tool_allowlist.join(", ")}${seat?.seat.limits?.max_amount ? ` up to ${seat.seat.limits.max_amount.value} ${seat.seat.limits.max_amount.currency}` : ", no spending"}.`
      : `Declined (${last?.disposition ?? "not_now"}).`;
    const offers = this.offersDeclined.filter((o) => o.encounter_id === encounter_id);
    return { report_id: "vrep-" + short(encounter_id), representative_id: this.cfg.rep_id, host: { display_name: this.cfg.display_name, principal_id: this.cfg.principal_id },
      visited_at: this.clock(), outcome: { decision, disposition: last?.disposition, consideration_ref: last?.consideration_ref, ...(cons ? { response_by: cons.response_by } : {}) },
      outcome_rendered: { text: rendered, locale: ownerLocale },
      ...(seat ? { seat: { actions: seat.seat.tool_allowlist, limits: seat.seat.limits } } : {}),
      host_said: [], next_step: { text: cons ? "Review the request I took inside and decide (a passkey is needed to approve)." : "Nothing pending; tell me if you'd like a follow-up.", requires_owner_approval: true, if_no_reply: "nothing_happens" },
      ...(cons ? { taken_home: [{ item_id: cons.ref, what: { text: `Request for ${cons.actions.join(", ")}`, locale: "en-US" }, needs: "approve_commitment" as const, response_by: cons.response_by, if_no_reply: "declined" as const }] } : {}),
      ...(offers.length ? { offers_declined: offers.map((o) => ({ text: o.text, locale: o.locale, untrusted: true as const, why: o.why })) } : {}),
      voice: { text: `I met ${e.card ? claimLabel(e.card.principal.principal_id, e.card.principal.display_name) : "an unprepared visitor"} at the door. ${rendered}`
        + this.ownerAlerts.filter((x) => x.encounter_id === encounter_id).slice(0, 1).map((x) => ` Someone used your name here: ${claimLabel(x.visitor_principal, x.claimed_name)}${x.handled === "refused" ? "; I didn't let them in, and asked them for an introduction from someone you trust" : "; I treated them as a stranger, so nothing was granted for being you"}.`).join(""), locale: ownerLocale },
      relationship_ref: rec?.relationship_ref } as unknown as S.VisitReport;
  }
  /** §2.5: url -> digest for evidence the host fetched itself (content_digest = sha-256 over the raw bytes, host-3-008). */
  evidenceDigests(): Map<string, string> {
    const m = new Map<string, string>(); for (const [u, f] of this.fetched) if (f.ok && f.digest) m.set(u, f.digest); return m;
  }

  // ---------- Appendix B.2: the test owner (pair place) ----------
  /** B.2: approve a commitment considering at once iff the request carries no max_amount; otherwise stay silent (a decline at response_by). */
  private testOwnerOnConsidering(ref: string, req: S.InvitationRequest["proposal"]["request"]) {
    const o = this.opts.testOwner; const c = this.considerations.get(ref);
    if (!o || !this.testProfile || !c || c.routed_to.kind !== "principal" || !sameDid(c.routed_to.principal_id, o.id)) return;
    if (req.limits?.max_amount !== undefined) { this.note(`test owner: request ${c.request_msg} carries max_amount → silent (declined at ${c.response_by})`); return; }
    const now = this.clock();
    const consent = makeOwnerSigned<S.OwnerConsent>({ consent_id: "oc-" + ref, owner_id: o.id, representative_id: this.cfg.rep_id, action: "approve_commitment", decision: "approve",
      subject_ref: { kind: "consideration", id: ref, digest: c.considering_digest }, assurance: "passkey",
      shown_to_owner: { text: `Approve: ${c.actions.join(", ")} with ${c.principal}, no spending.`, locale: "en-US" }, issued_at: now, expires_at: addDays(now, 1) }, o, now);
    this.note(`test owner: approve_commitment for ${ref} (no max_amount)`);
    for (const x of this.resolveConsideration(ref, { decision: "grant" }, "Approved by the owner.", consent)) this.outbox.push({ ...x, held: true });
  }
  /**
   * Appendix B.4 (v0.2.6): the test decider for considerings routed to a role. No max_amount → conditional approval at once (approved = the requested
   * actions, valid 7 days, decided_by {kind role, role, human false}, no seat), held for the visitor's inbox after the `held`; else silence.
   */
  private testDeciderOnConsidering(ref: string, req: S.InvitationRequest["proposal"]["request"]) {
    const c = this.considerations.get(ref);
    if (!this.testDecider || !c || c.routed_to.kind !== "role") return;
    if (req.limits?.max_amount !== undefined) { this.note(`test decider: ${ref} carries max_amount → silent (declined at ${c.response_by})`); return; }
    const now = this.clock(); c.resolved = true;
    const valid_until = addDays(now, 7);
    this.approvals.set(ref, { consideration_ref: ref, actions: req.actions, until: valid_until, principal: c.principal });
    const decidedBy = { kind: "role" as const, role: c.routed_to.role, human: false };
    this.note(`test decider: grant ${ref} (${req.actions.join(", ")}) until ${valid_until}`);
    // v0.2.6: a considering only arises for actions outside the mandate → conditional require_mandate {approved actions}, retry [signed_mandate] (as G5b).
    this.outbox.push({ ...this.outcome(c, { decision: "conditional", approved: { actions: req.actions, valid_until }, conditions: [{ code: "require_mandate", params: { actions: req.actions } }] },
      "Approved, under a mandate that covers it.", now, "test decider (B.4)", undefined, decidedBy), held: true });
  }
  /** B.2 rule for a peer_invitation: approve iff every purpose is collaboration/invitation/introduction, valid now, ≤ 30 days, before answer_by. */
  testOwnerRule(inv: S.PeerInvitation, now: string): { approve: boolean; why: string } {
    const okPurposes = inv.purposes.every((p) => p === "collaboration" || p === "invitation" || p === "introduction");
    if (!okPurposes) return { approve: false, why: "purpose" };
    if (!inWindowSkew(now, inv.valid_from, inv.expires_at)) return { approve: false, why: "not_valid_now" };
    if (Date.parse(inv.expires_at) - Date.parse(inv.valid_from) > 30 * 86400e3) return { approve: false, why: "longer_than_30_days" };
    if (!isTimestamp(inv.answer_by) || Date.parse(now) > Date.parse(inv.answer_by)) return { approve: false, why: "answer_by_passed" };
    return { approve: true, why: "rule" };
  }

  // ---------- Appendix B.3: the test gathering ----------
  private addInvitee(card: S.RepresentativeCard): Out[] {
    const g = this.cfg.gathering; if (!g || !this.place) return [];
    if (g.payload.invitees.some((x) => sameDid(x.representative_id, card.representative_id))) return this.place.invitations().filter((o) => sameDid(o.to, card.representative_id));
    const sg = this.signAsPrincipal<S.Gathering>({ ...g.payload, invitees: [...g.payload.invitees, { representative_id: card.representative_id, principal_id: card.principal.principal_id, invited_by: this.cfg.principal_id }] });
    this.note(`B.3: ${card.representative_id} added to ${g.payload.gathering_id}; re-signed Gathering re-delivered`);
    return this.place.updateGathering(sg);
  }

  // ---------- consent revocation (§8.1) ----------
  private onConsentRevocation(m: S.ConsentRevocationMessage): Msg[] {
    const r = m.revocation; const p = r?.payload; if (!p?.consent_id || !p.owner_id) return [];
    if (this.real && badTimestamps(r).length) { this.note("consent revocation with malformed timestamps ignored"); return []; }
    if (!this.verifier.signed(r, p.owner_id, undefined, undefined, this.rpOf(p.owner_id))) { this.note(`consent revocation for ${p.consent_id}: owner signature does not verify (rp ${this.rpOf(p.owner_id) ?? "unknown"}); ignored`); return []; }
    this.revokedConsents.add(p.consent_id + "|" + p.owner_id);
    this.note(`consent ${p.consent_id} revoked by its owner`);
    return [];
  }

  // ---------- pair-invitation transport (the Peer meetings extension, §11 with the Gatherings or Peer meetings extension) ----------
  /** The owner (off-wire, through its own console) issues a PeerInvitation; our representative carries it. Delivered by the transport or held. */
  issuePeerInvitation(inv: S.Signed<S.PeerInvitation>, toRep: string): Out {
    const p = inv.payload; this.invitationsIssued.set(p.invitation_id, inv);
    const enc = { id: p.place.place_id + "-invite", visitor: toRep, seq: 0 };
    const m: Msg = { ...this.hdr(enc, "peer_invitation", toRep), invitation: inv, reply_to: this.opts.entryUrl ?? "" };
    this.note(`peer_invitation ${p.invitation_id} → ${toRep}`);
    return { to: toRep, message: this.wrap(m), held: true };
  }
  /** An invitation delivered to us (we are the invited side). Kept for our owner to answer off-wire. */
  private onPeerInvitationDelivery(m: S.PeerInvitationDelivery): Msg[] {
    const inv = m.invitation?.payload; if (!inv || !this.cfg.peer) return [];
    if (!inv.representatives?.some((x) => sameDid(x, this.cfg.rep_id)) || !inv.representatives.some((x) => sameDid(x, m.from))) { this.note("peer_invitation not naming us and its carrier: ignored"); return []; }
    if (!sameDid(inv.to_owner?.principal_id, this.cfg.peer.owner_id)) { this.note("peer_invitation for another owner: ignored"); return []; }
    if (this.real && (badTimestamps(m.invitation).length || !isTimestamp(inv.answer_by))) { this.note(`peer_invitation ${inv.invitation_id}: malformed timestamps or no answer_by: dropped`); return []; }
    if (this.real && !this.verifier.signed(m.invitation, inv.from_owner.principal_id, undefined, "ES256", this.rpOf(inv.from_owner.principal_id))) {
      this.note(`peer_invitation ${inv.invitation_id}: inviting owner's passkey signature does not verify: dropped`); return []; }
    const enc = { id: (inv.place?.place_id ?? m.encounter_id) + "-answer", visitor: m.from, seq: 0 };
    const now = this.clock();
    // the Peer meetings extension / C126 (v0.2.5): past answer_by nothing is taken home: no held, no answer, even with a B.2 test owner (the Peer meetings extension wins).
    if (Date.parse(now) > Date.parse(inv.answer_by) + SKEW_S * 1e3) { this.note(`peer_invitation ${inv.invitation_id} past answer_by: not taken home`); return []; }
    const o = this.opts.testOwner;
    if (o && this.testProfile) {
      // Appendix B.2: the test owner answers at once by its fixed rule; the answer is held for the inviting representative's inbox.
      const rule = this.testOwnerRule(inv, now);
      const answer = makeOwnerSigned<S.OwnerConsent>({ consent_id: "oc-" + inv.invitation_id, owner_id: o.id, representative_id: this.cfg.rep_id, action: "accept_invitation",
        decision: rule.approve ? "approve" : "decline", subject_ref: { kind: "invitation", id: inv.invitation_id, digest: m.invitation.payload_digest }, assurance: "passkey",
        shown_to_owner: { text: `Meet the representative of ${claimLabel(inv.from_owner.principal_id, inv.from_owner.display_name)} for ${inv.purposes.join(", ")}, ${inv.valid_from} to ${inv.expires_at}?`, locale: "en-US" },
        issued_at: now, expires_at: minIso(inv.expires_at, addDays(now, 30)) }, o, now);
      this.invitationsReceived.set(inv.invitation_id, { invitation: m.invitation, reply_to: m.reply_to, from: m.from });
      this.note(`test owner: ${rule.approve ? "accept" : "decline"} peer_invitation ${inv.invitation_id} (${rule.why})`);
      this.outbox.push({ to: m.from, held: true, message: this.wrap({ ...this.hdr(enc, "peer_invitation_answer", m.from), invitation_id: inv.invitation_id, answer }) });
      return [this.heldNotice(enc, m.msg_id, m.from)];
    }
    this.invitationsReceived.set(inv.invitation_id, { invitation: m.invitation, reply_to: m.reply_to, from: m.from });
    this.note(`peer_invitation ${inv.invitation_id} received from ${m.from}; taken home to our owner`);
    return [this.heldNotice(enc, m.msg_id, m.from, inv.answer_by)];
  }
  /** Our owner's passkey answer to a received invitation → a peer_invitation_answer for the inviting representative. */
  answerPeerInvitation(invitation_id: string, answer: S.Signed<S.OwnerConsent>): Out {
    const got = this.invitationsReceived.get(invitation_id); if (!got) throw new Error("unknown invitation");
    const v = verifyOwnerConsent(this.verifier, answer, { action: "accept_invitation", owner_id: this.cfg.peer!.owner_id, subject: { kind: "invitation", id: invitation_id, digest: got.invitation.payload_digest },
      now: this.clock(), rpId: this.rpOf(this.cfg.peer!.owner_id) });
    if (!v.ok) throw new Error("owner answer does not verify: " + v.why);
    // S5 fix (host-s5-001, C145): the `held` sent on delivery already used <place>-answer-h1 from this sender; the answer must not reuse it.
    const enc = { id: got.invitation.payload.place.place_id + "-answer", visitor: got.from, seq: 1 };
    return { to: got.from, message: this.wrap({ ...this.hdr(enc, "peer_invitation_answer", got.from), invitation_id, answer }), held: true };
  }
  /** The invited representative returns its owner's answer; verified once the invited owner's rp is known (from its card, §2.1). */
  private onPeerInvitationAnswer(m: S.PeerInvitationAnswer): Msg[] {
    const inv = this.invitationsIssued.get(m.invitation_id);
    if (!inv) { this.note(`peer_invitation_answer for unknown invitation ${m.invitation_id}: ignored`); return []; }
    const to = inv.payload.to_owner.principal_id;
    if (!inv.payload.representatives.some((x) => sameDid(x, m.from))) { this.note("peer_invitation_answer from a representative the invitation does not name: ignored"); return []; }
    // the Peer meetings extension (v0.2.4): an answer issued after answer_by (+300 s) is ignored: silence means decline.
    const issued = m.answer?.payload?.issued_at;
    if (!isTimestamp(issued) || Date.parse(issued) > Date.parse(inv.payload.answer_by) + SKEW_S * 1e3) { this.note(`peer_invitation_answer ${m.invitation_id} issued after answer_by: ignored (declined by silence)`); return []; }
    // §2.1 (v0.2.4): the answer states its rp_id, so it verifies even before we have seen the invited owner's card.
    const v = verifyOwnerConsent(this.verifier, m.answer, { action: "accept_invitation", owner_id: to, subject: { kind: "invitation", id: m.invitation_id, digest: inv.payload_digest }, now: this.clock(), rpId: this.rpOf(to), revoked: this.revokedConsents });
    if (!v.ok) { this.note(`peer_invitation_answer ${m.invitation_id} does not verify (${v.why}): ignored`); return []; }
    this.peerAnswers.set(m.invitation_id, m.answer);
    return [];
  }

  /**
   * v0.3.0-rc4 (§7.2, C194): the place's own service refused an act the door had let through (C187). Releases everything the act
   * counted, together: its operation and its amount, from the seat, its payment_ref and the mandate. Once only; false if unknown.
   */
  releaseAct(from: string, msgId: string): boolean {
    const k = `${from}|${msgId}`; const x = this.admitted.get(k); if (!x) return false;
    this.admitted.delete(k);
    const st = this.seats.get(x.seat_id);
    if (st) { st.ops = Math.max(0, st.ops - 1); st.spent -= x.units; if (st.spent < 0n) st.spent = 0n;
      if (x.ref && st.byRef[x.ref] !== undefined) { st.byRef[x.ref] -= x.units; if (st.byRef[x.ref] <= 0n) delete st.byRef[x.ref]; } }
    const mu = x.mkey ? this.mandateUse.get(x.mkey) : undefined;
    if (mu) { mu.ops = Math.max(0, mu.ops - 1); mu.spent -= x.units; if (mu.spent < 0n) mu.spent = 0n; }
    if (st?.allow && x.allowUnits) this.allowanceLedger.release(st.allow, x.seat_id, x.allowUnits, x.at);
    this.note(`act ${msgId} refused by the place's service: its operation and amount released (C194)`);
    return true;
  }

  // ---------- card revocation (v0.3.0-rc4, §2.6, C191) ----------
  /** A delivered card_revocation, from anyone, in any encounter: kept when the card's principal signed it. Nothing is answered. */
  private onCardRevocation(m: S.CardRevocationMessage): Msg[] {
    const ok = this.acceptCardRevocation(m.revocation);
    this.note(ok ? `card ${m.revocation?.payload?.card_id} revoked by its principal (delivered)` : `card_revocation does not verify: ignored`);
    return [];
  }
  // ---------- v0.5.0 (§12.4, C255): raw visitor text, retention and deletion ----------
  /** Keep the request's raw visitor text (purpose statement, value_to_counterparty) for the purposes §12.4 allows, by principal. */
  private keepRawText(e: Enc, r: S.InvitationRequest) {
    const principal = e.card?.principal.principal_id; if (!principal) return;
    const at = this.clock(); const add = (kind: string, t: unknown) => { if (typeof t === "string" && t) this.rawText.push({ principal: canonDid(principal), encounter_id: e.id, at, kind, text: t.slice(0, 4096) }); };
    add("value_to_counterparty", (r.proposal as any)?.value_to_counterparty?.text); add("purpose_statement", r.mandate?.payload?.purpose?.statement);
  }
  /** §12.4: raw visitor text (and considerations' prose) older than the stated retention (policy.retention_days, default 30, max 90) is deleted. */
  pruneRawText(): number {
    const keepMs = Math.min(V5.retentionDaysOf(this.cfg.policy), V5.RETENTION_MAX_DAYS) * 86400e3; const now = Date.parse(this.clock());
    const before = this.rawText.length; this.rawText = this.rawText.filter((x) => now - Date.parse(x.at) <= keepMs);
    let n = before - this.rawText.length;
    for (const c of this.considerations.values()) if (c.prose && now - Date.parse(c.response_by) > keepMs) { delete c.prose; n++; }
    return n;
  }
  /**
   * §12.4, §3.6 (v0.5.0 retention of records): a misconduct notice, an introducer penalty, a relationship record and a signal are
   * kept only while the suspension, reduced standing or `never` decision they support is in force, plus at most 90 days after it
   * ends; one that supports nothing follows the place's retention (policy.retention_days, default 30, at most 90). A `never` binding
   * keeps only the identity key and its end (no message content), and is dropped when it ends. Returns how many were dropped.
   */
  pruneRecords(): number {
    const now = Date.parse(this.clock()); const R = Math.min(V5.retentionDaysOf(this.cfg.policy), V5.RETENTION_MAX_DAYS) * 86400e3; const AFTER = RECORD_AFTER_DAYS * 86400e3;
    const t = (iso: unknown) => (typeof iso === "string" ? Date.parse(iso) : NaN);
    // When a notice may be dropped: the last of its effects' ends (a never disposition lasts NEVER_DAYS) plus 90 days, else the retention.
    const noticeUntil = (nt: S.MisconductNotice) => { const ends = (nt.effects ?? []).map((ef) => Number.isFinite(t(ef.until)) ? t(ef.until) : ef.disposition === "never" ? t(addDays(nt.issued_at, NEVER_DAYS)) : NaN).filter(Number.isFinite);
      return ends.length ? Math.max(...ends) + AFTER : t(nt.issued_at) + R; };
    let n = 0; const liveNotices = new Set<string>();
    for (const [id, x] of this.notices) { if (now > noticeUntil(x.notice)) { this.notices.delete(id); n++; } else liveNotices.add(id); }
    for (const [k, l] of this.introducers) { const kept = l.filter((p) => !(now > t(p.until) + AFTER)); n += l.length - kept.length; if (kept.length) this.introducers.set(k, kept); else this.introducers.delete(k); }
    for (const [k, until] of this.never) if (now >= t(until)) { this.never.delete(k); n++; }
    const liveRecordKeys = new Set([...this.receipts.values()].filter((x) => !(now > t(x.r.expires_at))).map((x) => x.recordKey));
    const openFor = new Set([...this.considerations.values()].filter((c) => !c.resolved).map((c) => canonDid(c.principal)));
    for (const [k, rec] of this.records) {
      // A misconduct entry lives as long as its notice; with no notice kept here, by the retention from its own time (a dropped
      // notice always ends later than that: its effects last at least 90 days, plus 90).
      const mis = (rec.misconduct ?? []).filter((m) => liveNotices.has(m.notice_id) || (!this.notices.has(m.notice_id) && !(now > t(m.at) + R)));
      n += (rec.misconduct ?? []).length - mis.length; if (mis.length) rec.misconduct = mis; else delete rec.misconduct;
      const supports = mis.length > 0 || this.isNever(rec.counterpart_principal_id) || (this.introducers.get(rec.counterpart_principal_id) ?? []).some((p) => !(now > t(p.until)));
      if (!supports) { const enc = rec.encounters.filter((e) => !(now > t(e.at) + R)); n += rec.encounters.length - enc.length; rec.encounters = enc; }
      if (!supports && !rec.encounters.length && !liveRecordKeys.has(k) && !openFor.has(canonDid(rec.counterpart_principal_id))) { this.records.delete(k); n++; }
    }
    const kept = this.signals.filter((x) => !(now > t(x.at) + R) || this.isNever(x.principal)); n += this.signals.length - kept.length; this.signals = kept;
    for (const [k, l] of this.probing) { const kp = l.filter((x) => !(now > t(x.at) + R) || this.isNever(k)); n += l.length - kp.length; if (kp.length) this.probing.set(k, kp); else this.probing.delete(k); }
    return n;
  }
  /**
   * §12.4 (C255): a DeletionRequest signed by its principal's own key, for this place, delivered in any encounter by any representative.
   * Answered `held` (answer_by ≤ 30 days); the place deletes the principal's raw visitor text and model output, asks each named outside
   * classifier to delete, and holds a deletion_receipt for the principal and the delivering representative. Findings, never
   * bindings, revocations and ledgers are kept (§3.6). One that doesn't verify, or names another place, is ignored.
   */
  private onDeletionRequest(m: S.DeletionRequestMessage): Msg[] {
    const r = m.request; const p = r?.payload; const now = this.clock();
    const why = V5.deletionRequestProblem(p, this.cfg.principal_id)
      ?? (this.real && badTimestamps(r).length ? "timestamps" : null)
      ?? (!this.verifier.signed(r, p.principal_id, undefined, undefined, this.rpOf(p.principal_id)) ? "signature" : null);
    if (why) { this.note(`deletion_request ignored (${why})`); return []; }
    const e = this.encounters.get(m.encounter_id) ?? this.newEnc(m.encounter_id, m.from, [], "");
    const held = this.heldNotice(e, m.msg_id, m.from, addDays(now, V5.DELETION_ANSWER_DAYS));
    if (this.deletions.has(p.request_id)) { this.note(`deletion_request ${p.request_id} again: already answered`); return [held]; }
    const who = canonDid(p.principal_id);
    const mine = this.rawText.filter((x) => x.principal === who).length; this.rawText = this.rawText.filter((x) => x.principal !== who);
    const encs = new Set([...this.seats.values()].filter((st) => canonDid(st.principal) === who).map((st) => st.encounter_id));
    let prose = 0; for (const c of this.considerations.values()) if (encs.has(c.encounter_id) && c.prose) { delete c.prose; prose++; }
    const ask = (c: any, role: "classifier" | "model_provider") => ({ name: c.name, role, status: (this.opts.classifierDeletion?.(c, p.principal_id) ? "confirmed" : "pending") as "confirmed" | "pending" });
    const outside = [...(this.cfg.policy.third_party_classifiers ?? []).map((c) => ask(c, "classifier")), ...(this.cfg.policy.model_providers ?? []).map((c) => ask(c, "model_provider"))];
    const kept: S.DeletionReceiptMessage["kept"] = [];
    // §12.4 lawful retention: only records under a legal obligation or for a legal claim, each with its recorded purpose.
    for (const hold of this.opts.legalHolds?.(p.principal_id) ?? []) if (hold.detail) kept.push({ kind: hold.kind, reason: hold.reason, detail: hold.detail });
    if (this.isNever(p.principal_id, now) || this.signals.some((x) => sameDid(x.principal, p.principal_id))) kept.push({ kind: "findings", reason: "required_record", detail: "§3.6, §12.4: findings and never bindings are kept while the decision they support is in force, plus at most 90 days" });
    if ([...this.mandateUse.keys()].some((k) => k.startsWith(who + "|"))) kept.push({ kind: "ledgers", reason: "required_record", detail: "§3.6: what was spent under each mandate" });
    if ([...this.revokedCards.keys()].some((k) => k.startsWith(who + "|"))) kept.push({ kind: "revocations", reason: "required_record", detail: "§3.6: verified revocations of cards, vouches and consents" });
    const receipt: Msg = { ...this.hdr(e, "deletion_receipt", m.from), request_id: p.request_id, request_digest: r.payload_digest, principal_id: p.principal_id, deleted_at: now,
      requested: ["raw_visitor_text", "raw_model_output", ...(outside.length ? ["outside_service_copies"] : [])],
      deleted: ["raw_visitor_text", "raw_model_output"], kept, outside_services: outside };
    // §11.2: held under the principal's DID and the delivering representative's.
    this.outbox.push({ to: m.from, held: true, message: this.wrap(receipt) });
    if (!sameDid(p.principal_id, m.from)) this.outbox.push({ to: p.principal_id, held: true, message: this.wrap({ ...receipt, to: p.principal_id }) });
    this.deletions.set(p.request_id, now);
    this.note(`deletion_request ${p.request_id}: ${mine} raw text record(s) and ${prose} consideration text(s) deleted; ${outside.length} outside service(s) asked (${outside.filter((o) => o.status === "pending").length} pending); receipt held`);
    return [held];
  }
  /** Verify one signed CardRevocation (principal's own key; an owner's passkey against its stated or known rp_id) and remember it. */
  acceptCardRevocation(r: S.Signed<S.CardRevocation> | undefined): boolean {
    const p = r?.payload; if (!p || typeof p.card_id !== "string" || typeof p.principal_id !== "string") return false;
    if (this.real && badTimestamps(r!).length) return false;
    if (!this.verifier.signed(r!, p.principal_id, undefined, undefined, this.rpOf(p.principal_id))) return false;
    const key = canonDid(p.principal_id) + "|" + p.card_id;
    // C238 (fix check 2, N1): a revocation for a card this door never seated goes to a store bounded per principal (16) and in total
    // (10000), oldest first; one for a card it seated is kept until the card expires and never dropped.
    const seen = [...this.seats.values()].some((st: any) => st.cardId === p.card_id);
    if (!seen && !this.revokedCards.has(key)) {
      const pfx = canonDid(p.principal_id) + "|"; const mine = [...this.unseenRevocations].filter((k) => k.startsWith(pfx));
      const drop = mine.length >= 16 ? mine[0] : this.unseenRevocations.size >= 10000 ? this.unseenRevocations.values().next().value : undefined;
      if (drop) { this.unseenRevocations.delete(drop); this.revokedCards.delete(drop); }
      this.unseenRevocations.add(key);
    } else { this.unseenRevocations.delete(key);
      // R5-01 (§2.6, C238): seen-card revocations are bounded per principal (16, its own oldest dropped) and in total (10000); a store full in
      // total drops its oldest and fails closed only for that principal (presentations refused until a fresh revocation list is read).
      if (!this.revokedCards.has(key)) { const pfx = canonDid(p.principal_id) + "|"; const seenKeys = [...this.revokedCards.keys()].filter((k) => !this.unseenRevocations.has(k));
        const mine = seenKeys.filter((k) => k.startsWith(pfx));
        if (mine.length >= 16) this.revokedCards.delete(mine[0]);
        else if (seenKeys.length >= 10000) { const o = seenKeys[0]; this.revokedCards.delete(o); this.undecidedPrincipals.add(o.split("|")[0]); } } }
    this.revokedCards.set(key, { digest: p.card_digest, at: this.clock(), reason: p.reason });
    // C198: every open seat held under that card ends now (acts already done are unaffected).
    let ended = 0; for (const st of this.seats.values()) if (!st.unseated && this.seatCardRevoked(st)) { st.unseated = true; ended++; }
    if (ended) this.note(`card ${p.card_id} revoked: ${ended} open seat(s) it held ended (C198)`);
    return true;
  }
  /** C198: whether the card a seat was granted under is known revoked (by card_id from its principal; with card_digest, only that version). */
  private seatCardRevoked(st: SeatState): boolean {
    if (!st.cardId) return false;
    const r = this.revokedCards.get(canonDid(st.principal) + "|" + st.cardId);
    return !!r && (!r.digest || r.digest === st.cardDigest);
  }
  /** Red team phase 1 (C265): what a transport must (re)fetch before handing this act to the host: the seat's card revocation list,
   *  when the copy it holds is missing or would pass REVOCATION_RECHECK_S within a minute. */
  actRevocationUrls(raw: any): string[] {
    const p = raw?.payload ?? raw; if (!p || (p.type !== "act" && p.type !== "act_confirmation")) return [];
    const st = typeof p.seat_id === "string" ? this.seats.get(p.seat_id) : undefined; if (!st?.revUrl) return [];
    const f = this.fetched.get(st.revUrl);
    return f && f.ok && Date.parse(this.clock()) - Date.parse(f.at) <= (REVOCATION_RECHECK_S - 60) * 1e3 ? [] : [st.revUrl];
  }
  /** "ok" | "revoked" | "unreachable" for a verified card: delivered revocations, then the card's own revocation_url (fetched by the transport). */
  cardRevocationState(card: S.RepresentativeCard, cardDigest: string, _now: string): "ok" | "revoked" | "unreachable" {
    const hit = (d?: string) => d === undefined || d === cardDigest;
    const k = canonDid(card.principal.principal_id) + "|" + card.card_id;
    const known = this.revokedCards.get(k); if (known && hit(known.digest)) return "revoked";
    const url = card.revocation_url; if (typeof url !== "string" || !url) return "ok";
    if (!/^https:\/\//.test(url) && !(this.opts.testProfile && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url))) return "unreachable";   // Appendix B.1
    const f = this.fetched.get(url); if (!f || !f.ok || !Array.isArray(f.body)) return "unreachable";
    for (const x of f.body as S.Signed<S.CardRevocation>[]) {
      const p = x?.payload; if (!p || p.card_id !== card.card_id || !sameDid(p.principal_id, card.principal.principal_id) || !hit(p.card_digest)) continue;
      if (this.acceptCardRevocation(x)) return "revoked";
    }
    return "ok";
  }

  // ---------- durable state (v0.3.0-rc4, §3.6, C192) ----------
  /** Everything §3.6 says a place must keep across restarts, as JSON, including used_raises (C270 / §7.3). Restore with restoreDurable(). The door wrapper persists this before sending the release response. */
  durableState(): DurableState {
    this.pruneAllowance();
    return { v: 1, saved_at: this.clock(), never: [...this.never], used_nonces: [...this.usedNonces], seen_msgs: [...this.seenMsgs], poll_ids: [...this.pollIds],
      mandate_use: [...this.mandateUse].map(([k, u]) => [k, { ops: u.ops, spent: u.spent.toString(), currency: u.currency, seats: u.seats, ...(u.expires_at ? { expires_at: u.expires_at } : {}) }]),
      records: [...this.records], introducers: [...this.introducers], notices: [...this.notices], probing: [...this.probing], signals: this.signals, signups: this.signups,
      spent_invitations: [...this.spentInvitations], revoked_consents: [...this.revokedConsents], revoked_vouches: [...this.revokedVouches], revoked_cards: [...this.revokedCards],
      known_rp: [...this.knownRp], receipts: [...this.receipts], owner_links: [...this.ownerLinks], ...(this.seenMeta.size ? { seen_meta: [...this.seenMeta] } : {}),
      allowance_ledger: this.allowanceLedger.snapshot(this.clock()),
      ...(this.usedRaises.size ? { used_raises: [...this.usedRaises] } : {}) };
  }
  /** Restore what durableState() saved (before handling any message). */
  restoreDurable(d: DurableState) {
    if (!d || d.v !== 1) throw new Error("unknown durable state version");
    this.never = new Map(d.never); this.usedNonces = new Map(d.used_nonces); this.seenMsgs = new Map(d.seen_msgs); this.pollIds = new Map(d.poll_ids);
    this.mandateUse = new Map(d.mandate_use.map(([k, u]) => [k, { ops: u.ops, spent: BigInt(u.spent), currency: u.currency, seats: u.seats, ...(u.expires_at ? { expires_at: u.expires_at } : {}) }]));
    this.records = new Map(d.records); this.introducers = new Map(d.introducers); this.notices = new Map(d.notices); this.probing = new Map(d.probing);
    this.signals = d.signals; this.signups = d.signups; this.spentInvitations = new Set(d.spent_invitations); this.revokedConsents = new Set(d.revoked_consents);
    this.revokedVouches = new Map(d.revoked_vouches); this.revokedCards = new Map(d.revoked_cards); for (const [k, v] of d.known_rp) this.knownRp.set(k, v);
    this.receipts = new Map(d.receipts); this.ownerLinks = new Map(d.owner_links ?? []); this.seenMeta = new Map(d.seen_meta ?? []);
    this.usedRaises = new Set(d.used_raises ?? []);
    this.allowanceLedger.restore(d.allowance_ledger, this.clock());
    this.bootTag ??= b64u(randomBytesTag());   // restored: this key has spoken before (§2.2 msg_id uniqueness)
  }

  /**
   * v0.4.0 (host-local, not on the wire): what a place holds while visits are in progress (encounters, seats, considerations and
   * approvals, held purchases, counted acts, held inbox messages, links and invitations), as JSON, so a place that runs as several
   * instances sharing one store answers as one place with no sticky sessions. §3.6 doesn't require keeping it (live seats need not
   * survive a restart); a place that keeps it loses nothing on a restart either. Holds no private keys.
   */
  liveState(): LiveState {
    this.pruneAllowance();
    this.pruneClaimFailMaps();
    const pl = this.place; const dr = this.door;
    return toLiveJson({ v: 1, encounters: this.encounters, seats: this.seats, considerations: this.considerations, approvals: this.approvals, admitted: this.admitted,
      allowance_ledger: this.allowanceLedger.snapshot(this.clock()),
      holds: this.holds, inbox: this.inbox, echo_failures: this.echoFailures, foreign_seq: this.foreignSeq, customer_links: this.customerLinks, ended_links: this.endedLinks,
      peer_answers: this.peerAnswers, invitations_issued: this.invitationsIssued, invitations_received: this.invitationsReceived, owner_alerts: this.ownerAlerts,
      taken_home: this.takenHome, offers_declined: this.offersDeclined, appeals: this.appeals, capacity_refusals: this.capacityRefusals,
      // v0.5.0: idempotent answers and repeat counts (§7.2), claim bindings (durable, §4.1), grant-cap uses and revoked receipts (§6.9),
      // C296/C287 failed-claim counts (per card, per principal, per source) so serverless instances sharing a store keep the backoff.
      v050: { idem: this.idem, repeats: this.repeats, intro_claims: this.introClaims, intro_probes: this.introProbes, grant_uses: this.grantUses,
        revoked_receipts: this.revokedReceipts, receipt_probes: this.receiptProbes, claim_fails: this.claimFails, claim_fails_by: this.claimFailsBy },
      ...(this.encTouched.size ? { enc_touched: this.encTouched } : {}),
      ...(pl ? { place: { attendees: pl.attendees, items: pl.items, declines: pl.declines, presses: pl.presses, noticed: pl.noticed, rate: pl.rate, flags: pl.flags } } : {}),
      ...(dr ? { door: { judged: dr.judged, meta: dr.meta, retry_after: dr.retryAfter, digest: dr.digest, tickets: dr.tickets } } : {}) }) as LiveState;
  }
  /** Restore what liveState() saved: replaces this place's visits in progress with the stored ones. */
  restoreLive(l: LiveState) {
    if (!l || l.v !== 1) throw new Error("unknown live state version");
    const x = fromLiveJson(l) as any;
    if (x.allowance_ledger) this.allowanceLedger.restore(x.allowance_ledger, this.clock());
    this.encounters = x.encounters; this.seats = x.seats; this.considerations = x.considerations; this.approvals = x.approvals; this.admitted = x.admitted;
    this.holds = x.holds; this.inbox = x.inbox; this.echoFailures = x.echo_failures; this.foreignSeq = x.foreign_seq; this.customerLinks = x.customer_links;
    this.endedLinks = x.ended_links; this.peerAnswers = x.peer_answers; this.invitationsIssued = x.invitations_issued; this.invitationsReceived = x.invitations_received;
    this.ownerAlerts = x.owner_alerts; this.takenHome = x.taken_home; this.offersDeclined = x.offers_declined; this.appeals = x.appeals; this.capacityRefusals = x.capacity_refusals ?? 0;
    this.encTouched = x.enc_touched instanceof Map ? x.enc_touched : new Map();
    if (x.v050) { const v = x.v050; this.idem = v.idem; this.repeats = v.repeats; this.introClaims = v.intro_claims; this.introProbes = v.intro_probes;
      this.grantUses = v.grant_uses; this.revokedReceipts = v.revoked_receipts; this.receiptProbes = v.receipt_probes;
      this.claimFails = v.claim_fails instanceof Map ? v.claim_fails : new Map();
      this.claimFailsBy = v.claim_fails_by instanceof Map ? v.claim_fails_by : new Map();
      this.pruneClaimFailMaps(); }
    if (this.place && x.place) Object.assign(this.place, x.place);
    if (this.door && x.door) { const d = x.door; Object.assign(this.door, { judged: d.judged, meta: d.meta, retryAfter: d.retry_after, digest: d.digest, tickets: d.tickets }); }
    // Restored from a store other instances write too: this instance tags its msg_ids, so two instances never send the same one (§2.2).
    this.bootTag ??= b64u(randomBytesTag());
  }

  private pruneAllowance(): void {
    const now = this.clock();
    this.allowanceLedger.prune(now, new Set([...this.seats].filter(([, st]) => !st.unseated && !(st.seat.expires_at && isExpired(st.seat.expires_at, now))).map(([id]) => id)));
  }
  // ---------- pruning (v0.4.0, host-local) ----------
  /** The last message of an encounter (with retainS): finished visits are dropped retainS after it. */
  private touch(raw: any) {
    if (this.opts.retainS === undefined) return;
    const m = raw && typeof raw === "object" ? (raw.payload ?? raw) : null; const id = m && typeof m.encounter_id === "string" ? m.encounter_id : null;
    if (id && this.encounters.has(id)) this.encTouched.set(id, this.clock());
  }
  /** With retainS: prune, at most once per pruneEveryS (default 30 s) of the place's clock. */
  maybePrune() {
    if (this.opts.retainS === undefined) return;
    const now = Date.parse(this.clock()); const every = (this.opts.pruneEveryS ?? 30) * 1e3;
    if (now >= this.lastPrune && now - this.lastPrune < every) return;
    this.lastPrune = now; this.prune();
  }
  /** How long finished visits are kept (s): retainS, raised to 2 × maxMessageAgeS + 300 s and to at least 600 s. */
  retention(): number { return Math.max(this.opts.retainS ?? 3600, 2 * SKEW_S, 2 * (this.opts.maxMessageAgeS ?? 0) + SKEW_S); }
  /**
   * v0.4.0 (host-local, §3.4, §3.6): drop what finished visits left behind; see HostOpts.retainS. Deterministic in the state and the
   * place's clock, so instances sharing one store may each run it (a store's compare-and-set keeps one result). Returns the counts.
   */
  prune(): PruneReport {
    const nowIso = this.clock(); const now = Date.parse(nowIso); const skew = SKEW_S * 1e3; const keep = this.retention() * 1e3;
    const older = (iso: unknown, ms: number) => { const t = typeof iso === "string" ? Date.parse(iso) : NaN; return Number.isFinite(t) && now - t > ms; };
    const n: PruneReport = { encounters: 0, seats: 0, admitted: 0, holds: 0, considerations: 0, approvals: 0, nonces: 0, seen: 0, polls: 0, mandates: 0, receipts: 0, inbox: 0 };
    const seatLive = (st: SeatState) => !st.unseated && !(st.seat.expires_at && older(st.seat.expires_at, skew));
    // An encounter is in use while it has a live seat, an open consideration or a purchase held for an owner.
    const busy = this.busyEncounters();
    for (const [id] of this.encounters) {
      if (busy.has(id)) continue;
      const t = this.encTouched.get(id); if (t === undefined) { this.encTouched.set(id, nowIso); continue; }   // from an older state: start its clock now
      if (!older(t, keep)) continue;
      this.encounters.delete(id); this.foreignSeq.delete(id); this.encTouched.delete(id); n.encounters++;
    }
    for (const id of [...this.encTouched.keys()]) if (!this.encounters.has(id)) this.encTouched.delete(id);
    // Ended seats of dropped encounters, then what hung off them. A replayed act for a dropped seat finds no seat and is refused (§7.2).
    for (const [sid, st] of this.seats) if (!seatLive(st) && !this.encounters.has(st.encounter_id)) { this.seats.delete(sid); n.seats++; }
    for (const [k, h] of this.holds) if (!this.seats.has(h.seat_id) || (h.done && older(h.expires_at, keep))) { this.holds.delete(k); n.holds++; }
    for (const [k, a] of this.admitted) if (!this.seats.has(a.seat_id)) { this.admitted.delete(k); n.admitted++; }
    for (const [k, c] of this.considerations) if (c.resolved && !this.encounters.has(c.encounter_id)) { this.considerations.delete(k); n.considerations++; }
    for (const [k, a] of this.approvals) if (older(a.until, skew + keep)) { this.approvals.delete(k); n.approvals++; }
    // De-duplication keys (§2.2): kept while their encounter is, and at least the retention after first seen.
    for (const k of [...this.seenMeta.keys()]) if (!this.seenMsgs.has(k)) this.seenMeta.delete(k);
    for (const k of this.seenMsgs.keys()) {
      const m = this.seenMeta.get(k); if (!m) { this.seenMeta.set(k, [nowIso, ""]); continue; }
      if ((m[1] && this.encounters.has(m[1])) || !older(m[0], keep)) continue;
      this.seenMsgs.delete(k); this.seenMeta.delete(k); n.seen++;
    }
    // Greeting nonces (§2.4): for at least the lifetime of the visit receipts this place issues (at most 7 days), plus skew.
    const receiptS = Math.min(this.cfg.policy.lobby?.receipt_ttl_days ?? 7, 7) * 86400;
    const nonceKeep = Math.max(receiptS * 1e3, keep) + skew;
    for (const [k, at] of this.usedNonces) if (older(at, nonceKeep)) { this.usedNonces.delete(k); n.nonces++; }
    // Inbox polls (§11.2): single use within ±300 s of their sent_at; past that a replay is refused as stale.
    for (const [k, at] of this.pollIds) if (older(at, 2 * skew + 60e3)) { this.pollIds.delete(k); n.polls++; }
    // A mandate's use (§5.1, C175): until it expires, plus skew and the retention.
    for (const [k, u] of this.mandateUse) if (u.expires_at && older(u.expires_at, skew + keep)) { this.mandateUse.delete(k); n.mandates++; }
    // Visit receipts (§3.3): after they expire (their records stay, §9).
    for (const [k, x] of this.receipts) if (older(x?.r?.expires_at, skew + keep)) { this.receipts.delete(k); n.receipts++; }
    // Held messages nobody collected (§11.2): after 7 days or the retention, whichever is longer.
    const inboxKeep = Math.max(7 * 86400e3, keep);
    for (const [to, l] of this.inbox) {
      const kept = l.filter((m) => !older((m?.payload ?? m)?.sent_at, inboxKeep)); n.inbox += l.length - kept.length;
      if (kept.length) this.inbox.set(to, kept); else this.inbox.delete(to);
    }
    for (const [k, l] of this.echoFailures) if (!l.some((t) => now - t < 3600e3)) this.echoFailures.delete(k);
    this.pruneAllowance();
    this.pruneRawText();   // v0.5.0 (§12.4, C255)
    this.pruneRecords();   // v0.5.0 (§12.4, §3.6): records only while what they support is in force, plus at most 90 days
    return n;
  }

  /** Redacted state snapshot (no receipt nonces). */
  snapshot() {
    return { records: Object.fromEntries(this.records), receipts: [...this.receipts.values()].map((x) => ({ receipt_id: x.r.receipt_id, used: x.used, expires_at: x.r.expires_at, bound: !!x.r.bound_key })),
      seats: [...this.seats.values()].map((s) => ({ seat: s.seat, rep: s.rep, ops: s.ops, spent: s.spent.toString(), unseated: !!s.unseated })),
      considerations: [...this.considerations.values()].map(({ prose, ...c }) => c),
      introducers: Object.fromEntries(this.introducers), revoked_vouches: [...this.revokedVouches.keys()],
      never: Object.fromEntries(this.never), spent_invitations: [...this.spentInvitations],
      mandate_use: Object.fromEntries([...this.mandateUse].map(([k, u]) => [k, { ops: u.ops, spent: u.spent.toString(), seats: u.seats }])), revoked_consents: [...this.revokedConsents], signals: this.signals, taken_home: this.takenHome, place: this.place?.snapshot(), log: this.log };
  }
}

export { RealVerifier, PlaceholderVerifier };

/**
 * v0.3.0-rc4 (§2.1, C199): names are claims, never identity. How text for an owner or staff names a counterpart: by its verified
 * identifier (a did:web's domain, or the end of its key), with a self-asserted display name only as "claims to be …".
 */
export function claimLabel(principalId: string, displayName?: string): string {
  const id = principalId.startsWith("did:web:") ? decodeURIComponent(principalId.slice(8).split(":")[0]) : `the owner with key …${principalId.split("#")[0].slice(-8)}`;
  return displayName ? `${id} (claims to be "${displayName}"; not verified)` : id;
}
