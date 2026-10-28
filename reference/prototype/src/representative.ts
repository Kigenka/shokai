/**
 * Shōkai v0.1 reference library: one Representative class that can act as
 * visitor, gatekeeper host, or peer. Implements the ritual (SPEC §3.2), signature
 * verification on every message, the deterministic gate (decide.ts), courtesy as a
 * separate layer, relationship memory, a local relationship graph, misconduct notices,
 * lessons, and visit reports.
 */
import { SeenMessages } from "./msgkey.js";
import type {
  ShokaiMessage, CardClaim, Condition, ConsiderationOutcome, ConsiderationRoute, Courtesy, DecisionBody,
  Disposition, EtiquettePreferences, EtiquetteRegister, Farewell, ImprintFacet, InvitationRequest,
  InvitationResponse, IntroducerStanding, IntroducerPenalty, IntroducerReview, VisitReceipt, LearnedMeaning, Lesson, LessonAdaptation, Limits, Locale,
  Mandate, MisconductNotice, MisconductNoticeMessage, PrincipalImprint, ProofLevel, PurposeCode,
  ReadinessRequirement, RelationshipEdge, RelationshipRecord, RepresentativeCard, RitualHeader,
  SeatGrant, Signed, SignedCard, SignedMandate, SignedSeekingDeclaration, SignedVouch, Vouch,
  VouchRevocation, VisitReport, Gathering, OwnerConsent, PurposeDescription, RevocationLogEntry, Money, Retry,
  AllowancePresentation, PeerInvitation, PlaceCategory, PlaceAction, PlaceTemplates, ConsentRevocation, AllowanceStatus,
} from "../../../protocol-shapes.js";
import { consent, testOwnerCommitmentRule, testOwnerInvitationRule, verifyConsent, verifyUnderAllowance } from "./owner.js";
import {
  type AnyKey, type Ed25519Key, digestOf, resolveKey, sameKey, short, signDigest, signed,
  verifySignature, verifySigned, possessionDigest, continuityDigest, cardKeyBinds, fetchEvidenceDigest,
  isCanonicalMoney, moneyUnits, rfc4647Lookup, isRfc3339Seconds, notYetValid, pastExpiry, rememberOwnerRp,
} from "./crypto.js";

/** v0.2.3 (§3.3): the protocol text a place follows (fictional URL; local only). */
export const SPEC_REF = { version: "0.3.0", url: "https://shokai.example/spec/v0.3.0" }; // the version this place implements (core subset; v0.2.8+ checks live in the Engawa reference)

/** v0.2.3 (§3.1): the actions a place offers, with purposes, derived from its policy (same in the listing and the lobby). */
export function placeActions(p: PolicyView, purposes: PurposeCode[] = []): PlaceAction[] {
  const spend = new Set(p.spending_actions ?? []);
  const out = new Map<string, PlaceAction>();
  const add = (a: string, pu: PurposeCode[], needs: PlaceAction["needs"]) => {
    const cur = out.get(a);
    if (cur) { for (const x of pu) if (!cur.purposes.includes(x)) cur.purposes.push(x); return; }
    out.set(a, { action: a, purposes: [...pu], spends: spend.has(a), needs });
  };
  const byP = p.by_purpose ?? {};
  for (const [pu, acts] of Object.entries(byP)) for (const a of acts ?? []) add(a, [pu as PurposeCode], p.pair_invitation_required ? "pair_invitation" : "standard");
  const rest = purposes.filter((x) => !(x in byP));
  for (const a of p.standard_actions) add(a, rest.length ? rest : (p.purposes ?? []), p.pair_invitation_required ? "pair_invitation" : "standard");
  for (const a of p.consideration?.actions ?? []) add(a, rest.length ? rest : (p.purposes ?? []), "considering");
  return [...out.values()];
}

/** v0.2.3 (§3.3): unsigned fill-in skeletons for a newcomer (never credentials, never gate input). */
export function placeTemplates(p: PolicyView, purposes: PurposeCode[], category?: PlaceCategory): PlaceTemplates {
  const acts = p.standard_actions;
  // v0.2.4 (§3.3, newcomer-3-003): one mandate skeleton per purpose, with only that purpose's actions; a spending purpose
  // carries a max_amount placeholder (no amount = no spending).
  const pa = placeActions(p, purposes);
  const mandates: PlaceTemplates["mandates"] = {};
  for (const pu of purposes.length ? purposes : (p.purposes ?? ["inquiry" as PurposeCode])) {
    const mine = pa.filter((a) => a.purposes.includes(pu) && a.needs !== "considering");
    mandates[pu] = { mandate_id: "<mandate id>", principal_id: "<your owner's DID: MUST equal the card's principal_id>", representative_id: "<your representative's did:key>", card_id: "<card id>",
      purpose: { code: pu, statement: "<one sentence: what your owner wants done here>", locale: "<BCP 47>" }, allowed_actions: mine.map((a) => a.action),
      limits: mine.some((a) => a.spends) ? { max_amount: { value: "<amount, e.g. 100.00>", currency: "<ISO 4217, e.g. USD>" } } : {},
      valid_from: "<RFC 3339 UTC>", expires_at: "<RFC 3339 UTC>" };
  }
  return {
    card: { protocol: "shokai/0.3", card_id: "<card id>", representative_id: "<your representative's did:key>",
      principal: { principal_id: "<your owner's DID (did:jwk of the owner passkey, or did:web)>", kind: "person", display_name: "<owner's name>" },
      role: "<e.g. Personal representative of …>", standing: { tier: "provisional" }, mandate_scope: { purposes: [...purposes], actions: [...acts] },
      locales: ["<BCP 47, e.g. en-US>"], representative_key: { key_id: "<representative did>#<fragment>", alg: "Ed25519", public_key: "<base64url raw Ed25519 key>" },
      owner_binding: { method: "passkey_webauthn", owner_id: "<same as principal_id>", rp_id: "<the relying-party id your owner's passkey was registered with>" },
      issued_at: "<RFC 3339 UTC, whole seconds, e.g. 2026-10-26T16:00:00Z>", expires_at: "<RFC 3339 UTC>" },
    mandates,
    allowance_grant: category ? { grant_id: "<grant id>", salt: "<128-bit random, base64url>", purposes: [...purposes], place_categories: [category], actions: [...acts] } : undefined,
  };
}
import { addDays, decide, type DecisionCore, type EvalInput, type PolicyView, type ReadinessCode } from "./decide.js";
import type { Clock } from "./clock.js";
import type { Recorder } from "./transcript.js";

export type Wire = Signed<ShokaiMessage>;
export type Phrases = Record<Locale, Record<string, string>>;

export type HostProfile = {
  policy: PolicyView;
  phrases: Phrases;
  seeking?: SignedSeekingDeclaration;
  onboarding_url: string;
  probe_threshold: number;
  /** "always": a decline closes the encounter. "final_only": the door stays open for an amended request unless the answer is never. */
  close_on_deny?: "always" | "final_only";
  norms: EtiquettePreferences;
  /** v0.2.1 §3.1: the place's name in its door's listing, and the purposes it describes to newcomers. */
  slug?: string;
  purposes?: PurposeDescription[];
  /** v0.2.1 the Gatherings extension: a gathering place verifies each entrant's accept_house_rules consent over this digest. */
  gathering?: Signed<Gathering>;
  /** v0.2.1 §9.1: visit-receipt lifetime (≤ 7 days) and the invalid-echo rate limit per sender per hour. */
  receipt_ttl_days?: number;
  receipt_echo_limit?: number;
  /** v0.2.1 §9.3: probing window (hours). */
  probe_window_h?: number;
  /** v0.2.2 §5.2: the place category (for allowance grants). */
  category?: PlaceCategory;
  /** v0.2.2 the Peer meetings extension: a pair place admits only the two representatives of a both-owner-consented PeerInvitation. */
  pair?: { place_id: string };
  /**
   * v0.2.4 (SPEC Appendix B, conformance test profile): a simulated owner that answers by a documented deterministic rule
   * (pair invitations, commitments), and a gathering signer that admits a verified requester of `gathering.request_invitation`.
   */
  test_profile?: { owner?: { key: AnyKey; owner_id: string }; gathering_signer?: AnyKey; /** v0.2.5 (Appendix B.4): decide a considering routed to a role at once, by rule. */ decider?: boolean };
};

// ---------- append-only revocation log (SPEC §4, v0.2.1 entry format; SIMULATED fetch) ----------
export class RevocationLog {
  entries: RevocationLogEntry[] = [];
  constructor(public address = "https://revocations.example/shokai/log") {}
  static entryHash(seq: number, prev_hash: string, revocation_digest: string): string { return digestOf({ seq, prev_hash, revocation_digest }); }
  append(r: Signed<VouchRevocation>): boolean {
    if (!verifySigned(r, r.payload.introducer_id).ok) return false;
    const seq = this.entries.length;
    const prev_hash = this.entries.at(-1)?.entry_hash ?? "genesis";
    this.entries.push({ seq, prev_hash, revocation: r, entry_hash: RevocationLog.entryHash(seq, prev_hash, r.payload_digest) });
    return true;
  }
  isRevoked(vouch_id: string): boolean { return this.entries.some((e) => e.revocation.payload.vouch_id === vouch_id); }
  chainOk(): boolean {
    return this.entries.every((e, i) => e.seq === i && e.prev_hash === (i === 0 ? "genesis" : this.entries[i - 1].entry_hash)
      && e.entry_hash === RevocationLog.entryHash(e.seq, e.prev_hash, e.revocation.payload_digest) && verifySigned(e.revocation, e.revocation.payload.introducer_id).ok);
  }
}

// ---------- relationship graph (earned, never imported) ----------
export class Graph {
  edges: RelationshipEdge[] = [];
  constructor(public me: string) {}
  record(to: string, kind: RelationshipEdge["kind"], at: string, event: string, ref?: string, from = this.me): RelationshipEdge {
    let e = this.edges.find((x) => x.from === from && x.to === to && x.kind === kind);
    if (!e) { e = { edge_id: `edge-${this.edges.length + 1}`, from, to, kind, since: at, standing: "new", history: [] }; this.edges.push(e); }
    e.history.push({ at, event, ref });
    if (e.standing === "new" && e.history.length >= 2) e.standing = "good";
    return e;
  }
  addAttested(edge: RelationshipEdge): void { this.edges.push(edge); }
  /** Who is `other` to my principal? Direct edges, then 2-hop through people I know. */
  whoIs(other: string): RelationshipEdge[] {
    return this.edges.filter((e) => (e.from === this.me && e.to === other) || (e.to === this.me && e.from === other));
  }
}

export type Party = {
  id: string; name: string; key: AnyKey; locale: Locale;
  onNotice?: (n: MisconductNoticeMessage, self: Party) => void;
};
export type Directory = Map<string, Party>;

type Weighed = { area: string; label: string; asserted: ProofLevel; effective: ProofLevel; why: string };

export type Enc = {
  id: string; counterpart: string; counterpartName: string;
  myNonce: string; theirNonce?: string; greeted: boolean; theirSigned: boolean; theirLocales: Locale[];
  order: string[];
  theirCard?: RepresentativeCard; theirCardDigest?: string; cardStatus: "verified" | "missing" | "invalid";
  possession: "ok" | "failed" | "missing" | "malformed" | "n/a"; replay: boolean; ownerBound: boolean; myCardSent: boolean;
  introduced: boolean; vouch?: Vouch; vouchDigest?: string; vouchStatus: "valid" | "none" | "out_of_scope" | "revoked" | "invalid" | "introducer_suspended" | "unreachable"; vouchWeight?: "full" | "reduced";
  /** v0.2.3: I sent my own introduction (pair place: both sides MUST). */
  myIntroSent?: boolean; myVouchDigest?: string;
  /** v0.2.3 (§9.1): host side: whether the echoed receipt linked this visit. */
  continuity?: { receipt_id: string; linked: boolean };
  /** v0.2.3: host side: the seat's mandate was issued under an allowance (a refused act → take home, not a live confirmation). */
  underAllowance?: boolean;
  weighed: Weighed[];
  nonGrant: string[]; grantedSeat?: SeatGrant; mySeat?: SeatGrant; opsUsed: number; spent: bigint; farewellSent: boolean; closed: boolean;
  lobbySent: boolean; continuityKey?: string; acts: { tool: string; amount?: Money; ok: boolean }[];
  received: { response?: InvitationResponse; lobby?: { about: string; how: string; locale: Locale; seeking: string[] }; said: { text: string; locale: Locale }[];
    decisions: InvitationResponse[]; receipt?: VisitReceipt; outcome?: ConsiderationOutcome; lessons: LessonAdaptation[]; learned: LearnedMeaning[] };
  relationshipKey?: string;
  /** v0.2.2: result of the allowance check (host side), and the place category the host stated (visitor side). */
  allowanceCheck?: string; theirPlaceCategory?: PlaceCategory;
};

/** v0.2.5 (§3.2): ritual messages checked against the encounter's bound parties (room items and transport messages are not). */
const OUTSIDER_CHECKED = new Set(["greeting", "card_presentation", "introduction", "invitation_request", "act", "farewell"]);
/** v0.2.6 (§3.2, host-5-002): other encounter-bound types; from a non-party they are ignored (silence). */
const OUTSIDER_IGNORED = new Set(["card_receipt", "invitation_response", "act_result", "act_decision", "consideration_outcome", "lobby_briefing", "held"]);

export type DecisionRecord = { host: string; encounter_id: string; msg_id: string; input: EvalInput; core: DecisionCore; response: InvitationResponse };

export type RepOptions = {
  name: string; repKey: Ed25519Key;
  principal: { principal_id: string; kind: "person" | "brand" | "company" | "system"; display_name: string };
  principalKey?: AnyKey; locales: Locale[]; ownerLocale: Locale;
  unsigned?: boolean; anonId?: string; profile?: HostProfile; phrases?: Phrases;
  rec: Recorder; clock: Clock; revocations: RevocationLog; directory: Directory;
};

export class Representative {
  /** v0.2.4 (§11.1): the inbox address the door publishes for this place (set by the Door). */
  inboxUrl?: string;
  name: string; did: string; repKey: Ed25519Key; principal: RepOptions["principal"]; principalKey?: AnyKey;
  locales: Locale[]; ownerLocale: Locale; ownerTimeZone = "America/Los_Angeles"; unsigned: boolean; profile?: HostProfile; phrases: Phrases;
  rec: Recorder; clock: Clock; revocations: RevocationLog; directory: Directory;
  card?: SignedCard; mandates = new Map<string, SignedMandate>(); vouches: SignedVouch[] = [];
  enc = new Map<string, Enc>(); graph: Graph;
  relationships = new Map<string, RelationshipRecord & { linked_from?: string }>();
  introducers = new Map<string, IntroducerStanding>();
  /** D6: lobby receipts this host issued (receipt_id → record). */
  receipts = new Map<string, { nonce: string; relKey: string; expires_at: string; used: boolean; bound_key?: string }>();
  decisions: DecisionRecord[] = []; noticesIssued: Signed<MisconductNotice>[] = [];
  seenProofs = new Set<string>(); learned: LearnedMeaning[] = []; adaptations: LessonAdaptation[] = [];
  rejected: { reason: string; msg_type: string }[] = [];
  /** v0.2.1 §2.4: greeting nonces already seen, keyed by sender. */
  seenNonces = new Set<string>();
  /** v0.2.7 (§2.2): messages already processed, keyed by (from, msg_id) → payload digest (de-duplication). */
  seenMsgs = new SeenMessages();
  /** v0.2.1 §9.3: rejected request shapes per principal (probing), and §9.1 invalid receipt echoes per sender. */
  rejections = new Map<string, { at: string; shape: string; response_msg_id: string; complied: boolean; conditions?: Condition[] }[]>();
  echoFailures = new Map<string, string[]>();
  /** v0.2.1 §6.8: approved outcomes, by consideration_ref. */
  approvals = new Map<string, { actions: string[]; limits?: Limits; valid_until: string; relKey: string }>();
  /** v0.2.2 §5.2: allowance presentations for mandates this representative issued under an allowance (by mandate_id). */
  allowancePresentations = new Map<string, AllowancePresentation>();
  /** v0.2.2 the Peer meetings extension: the pair-place invitation and acceptance this representative carries into a peer meeting. */
  peerInvitation?: { invitation: Signed<PeerInvitation>; acceptance: Signed<OwnerConsent> };
  /** v0.2.3 (the Peer meetings extension): the vouch (or null) this representative introduces itself with in a pair place, as the host side. */
  pairIntroVouch?: SignedVouch | null;
  /** v0.2.3 (the Peer meetings extension): pair invitations whose single meeting has closed (single use). */
  usedInvitations = new Set<string>();
  /** v0.2.3 (§6.2): `never` memory: representative ids and principal ids → until. */
  neverList = new Map<string, string>();
  /** v0.2.3 (§8.1): owner consents revoked (consent_id), seen via consent_revocation. */
  revokedConsents = new Set<string>();
  /** v0.2.3 (§5.2): a stapled AllowanceStatus to send with mandates under an allowance (by mandate_id). */
  stapledStatus = new Map<string, Signed<AllowanceStatus>>();
  /** v0.2.3 (§11 with the Gatherings or Peer meetings extension/the Revocation status extension): invitations received, taken home to the owner (async; silence = decline). */
  invitationsHome: Signed<PeerInvitation>[] = [];
  gatheringInvites: Signed<Gathering>[] = [];
  /** Pending outbound peer invitations (by invitation_id), waiting for the other owner's answer. */
  outbound = new Map<string, Signed<PeerInvitation>>();
  /** v0.2.4 (§11.2): late messages this place produced, for its door to hold for the recipients' inboxes. */
  pendingOut: Wire[] = [];
  private seq = 0;

  constructor(o: RepOptions) {
    this.name = o.name; this.repKey = o.repKey; this.did = o.unsigned && o.anonId ? o.anonId : o.repKey.did; this.principal = o.principal; this.principalKey = o.principalKey;
    this.locales = o.locales; this.ownerLocale = o.ownerLocale; this.unsigned = !!o.unsigned; this.profile = o.profile;
    this.phrases = o.profile?.phrases ?? o.phrases ?? {}; this.rec = o.rec; this.clock = o.clock;
    this.revocations = o.revocations; this.directory = o.directory; this.graph = new Graph(o.principal.principal_id);
  }

  // ---------- courtesy layer (separate from decisions) ----------
  /** v0.2.1 (D10, §6.6): RFC 4647 §3.4 Lookup against the locales this sender supports. */
  localeMatch(theirs: Locale[]): { locale: Locale; match: "exact" | "fallback" | "none" } {
    return rfc4647Lookup(theirs, Object.keys(this.phrases), Object.keys(this.phrases)[0] ?? "en-US");
  }
  localeFor(theirs: Locale[]): Locale { return this.localeMatch(theirs).locale; }
  /** v0.2.1 (D10, §6.6): RFC 4647 lookup; if the chosen locale lacks this text, fall back to the default and SAY so (never label English text as another locale). */
  phrase(key: string, theirs: Locale[], vars: Record<string, string> = {}): { text: string; locale: Locale; match: "exact" | "fallback" | "none" } {
    const m = this.localeMatch(theirs);
    const dflt = this.phrases["en-US"] ? "en-US" : Object.keys(this.phrases)[0] ?? "en-US";
    const hit = this.phrases[m.locale]?.[key];
    const locale = hit !== undefined ? m.locale : dflt;
    const match = hit !== undefined ? m.match : (locale === m.locale ? m.match : "none");
    let text = hit ?? this.phrases[dflt]?.[key] ?? key;
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
    return { text, locale, match };
  }
  /** LocalizedText for wire fields: {text, locale} only. */
  text(key: string, theirs: Locale[], vars: Record<string, string> = {}): { text: string; locale: Locale } { const p = this.phrase(key, theirs, vars); return { text: p.text, locale: p.locale }; }
  courtesy(key: string, e: Enc | undefined, register: EtiquetteRegister, vars: Record<string, string> = {}): Courtesy {
    const p = this.phrase(key, e?.theirLocales ?? ["en-US"], vars);
    return { locale: p.locale, locale_match: p.match, register, text: p.text };
  }

  // ---------- wire ----------
  sign(m: ShokaiMessage): Wire {
    if (this.unsigned) return { payload: m, payload_digest: digestOf(m), signatures: [] };
    return signed<ShokaiMessage>(m, [this.repKey], this.clock.now());
  }
  hdr(e: Enc): RitualHeader {
    return { protocol: "shokai/0.3", encounter_id: e.id, msg_id: `${e.id}-${this.name.split(" ")[0].replace(/[^A-Za-z]/g, "").toLowerCase()}-${++this.seq}`, sent_at: this.clock.now(), from: this.did, to: e.counterpart };
  }
  private newEnc(id: string, counterpart: string, counterpartName: string, store = true): Enc {
    const e: Enc = {
      id, counterpart, counterpartName, myNonce: digestOf({ id, me: this.did, t: this.clock.now() }).slice(8, 24), greeted: false,
      theirSigned: false, theirLocales: ["en-US"], order: [], cardStatus: "missing", possession: "n/a", replay: false, ownerBound: false,
      myCardSent: false, introduced: false, vouchStatus: "none", weighed: [], nonGrant: [], opsUsed: 0, spent: 0n, farewellSent: false, closed: false, lobbySent: false, acts: [],
      received: { said: [], decisions: [], lessons: [], learned: [] },
    };
    if (store) this.enc.set(id, e); return e;
  }
  getEnc(id: string): Enc { const e = this.enc.get(id); if (!e) throw new Error(`no encounter ${id}`); return e; }

  // ---------- scripted visitor actions ----------
  greet(encounter_id: string, to: Representative, intent?: string, opts: { continuityKey?: Ed25519Key; nonce?: string } = {}): Wire {
    const e = this.newEnc(encounter_id, to.did, to.name);
    e.greeted = true;
    if (opts.nonce) e.myNonce = opts.nonce;
    const c = intent ? { locale: this.locales[0], register: "first_meeting" as const, text: intent } : this.courtesy("greet", e, "first_meeting");
    return this.sign({ ...this.hdr(e), type: "greeting", locales: this.locales, proposed_register: "first_meeting", nonce: e.myNonce, courtesy: c, continuity_key: opts.continuityKey?.did });
  }
  presentCard(encounter_id: string, opts: { cardOverride?: SignedCard; proofOverride?: string; omitProof?: boolean; malformedProof?: boolean; proofOverNonce?: string } = {}): Wire {
    const e = this.getEnc(encounter_id);
    const card = opts.cardOverride ?? this.card!;
    e.myCardSent = true;
    const proof = signDigest(possessionDigest(e.id, opts.proofOverNonce ?? e.theirNonce), this.repKey, this.clock.now());
    if (opts.proofOverride) proof.value = opts.proofOverride;
    if (opts.malformedProof) { proof.value = "not-a-signature"; (proof as { alg: string }).alg = "EdDSA"; }
    return this.sign({ ...this.hdr(e), type: "card_presentation", card, possession_proof: opts.omitProof ? undefined : proof });
  }
  introduce(encounter_id: string, vouch: SignedVouch | null): Wire {
    const e = this.getEnc(encounter_id);
    const inv = this.peerInvitation && this.peerInvitation.invitation.payload.place.place_id === encounter_id
      ? { invitation_id: this.peerInvitation.invitation.payload.invitation_id, digest: this.peerInvitation.invitation.payload_digest } : undefined;
    e.myIntroSent = true; e.myVouchDigest = vouch?.payload_digest;
    return this.sign({ ...this.hdr(e), type: "introduction", vouch, invitation_ref: inv });
  }
  request(encounter_id: string, r: { mandate_id: string; actions: string[]; limits?: Limits; pitch: string; seeking?: string[]; relationship_ref?: string; prior_response_ref?: string; consideration_ref?: string; register?: EtiquetteRegister; visit_receipt?: VisitReceipt; continuityKey?: Ed25519Key; meets_conditions_of?: string; owner_consents?: Signed<OwnerConsent>[]; locale?: Locale }): Wire {
    const e = this.getEnc(encounter_id);
    const hdr = this.hdr(e);
    const m: InvitationRequest = {
      ...hdr, type: "invitation_request", card_digest: this.card?.payload_digest ?? "", vouch_digest: e.myVouchDigest, mandate: this.mandates.get(r.mandate_id)!,
      proposal: {
        request: { actions: r.actions, limits: r.limits }, value_to_counterparty: { text: r.pitch, locale: r.locale ?? this.locales[0] },
        etiquette_register: r.register ?? "first_meeting",
        addresses_seeking: r.seeking ? [{ seeking_id: r.seeking[0], item_ids: r.seeking.slice(1) }] : undefined,
      },
      relationship_ref: r.relationship_ref, prior_response_ref: r.prior_response_ref, consideration_ref: r.consideration_ref,
      visit_receipt: r.visit_receipt ? { receipt_id: r.visit_receipt.receipt_id, nonce: r.visit_receipt.nonce,
        continuity_proof: r.continuityKey ? signDigest(continuityDigest(e.id, r.visit_receipt.receipt_id, this.did), r.continuityKey, this.clock.now()) : undefined } : undefined,
      meets_conditions_of: r.meets_conditions_of, owner_consents: r.owner_consents,
      allowance: this.allowancePresentations.get(r.mandate_id), allowance_status: this.stapledStatus.get(r.mandate_id),
      peer_invitation: this.peerInvitation && this.peerInvitation.invitation.payload.place.place_id === encounter_id ? this.peerInvitation : undefined,
    };
    return this.sign(m);
  }
  act(encounter_id: string, tool: string, args: Record<string, unknown>): Wire {
    const e = this.getEnc(encounter_id);
    return this.sign({ ...this.hdr(e), type: "act", seat_id: e.mySeat?.seat_id ?? "", tool, arguments: args, intent: `use ${tool}` });
  }
  farewell(encounter_id: string, outcome: Farewell["outcome"]): Wire {
    const e = this.getEnc(encounter_id); e.farewellSent = true;
    if (this.profile?.pair && this.peerInvitation?.invitation.payload.place.place_id === encounter_id) this.usedInvitations.add(this.peerInvitation.invitation.payload.invitation_id);
    return this.sign({ ...this.hdr(e), type: "farewell", outcome, courtesy: this.courtesy(outcome === "declined_never" ? "farewell_never" : outcome === "declined" ? "farewell_declined" : "farewell", e, "first_meeting") });
  }

  // ---------- receive: verify every message, then the ritual ----------
  receive(w: Wire): Wire[] {
    const m = w.payload;
    const v = verifySigned(w);
    const from = "from" in m ? m.from : undefined;
    if (!v.ok && !v.unsigned) {
      this.rejected.push({ reason: v.reason ?? "invalid", msg_type: m.type });
      this.rec.verify(false, `${this.name} rejected this ${m.type}: ${v.reason === "digest_mismatch" ? "the content no longer matches its signed fingerprint (tampered in transit)" : "the signature does not match the sender"}. It is ignored.`);
      return [];
    }
    if (v.ok && from && !v.signers.includes(from)) {
      this.rejected.push({ reason: "signer_not_sender", msg_type: m.type });
      this.rec.verify(false, `${this.name} rejected this ${m.type}: it was signed by someone other than the claimed sender.`);
      return [];
    }
    // v0.2.4 (§2.1, host-3-014): a header timestamp that is not RFC 3339 UTC whole seconds makes the MESSAGE malformed:
    // a place answers it like any malformed body (the lobby). A bad timestamp inside an artifact fails only that artifact.
    if (this.profile && "sent_at" in m && typeof m.sent_at === "string" && !isRfc3339Seconds(m.sent_at)) {
      this.rejected.push({ reason: "malformed_timestamp", msg_type: m.type });
      return this.receiveRaw(w);
    }
    // v0.2.7 (§2.2): de-duplication is keyed on (from, msg_id), never msg_id alone. An exact redelivery of a message already
    // processed is ignored; another sender's message with the same msg_id is a different message. A signed greeting is
    // left to the nonce rule (§2.4), so a replayed greeting is still answered `deny never`.
    if ("msg_id" in m && typeof m.msg_id === "string" && from && m.type !== "greeting") {
      const seen = this.seenMsgs.check({ from, msg_id: m.msg_id }, w.payload_digest);
      if (seen !== "new") { this.rejected.push({ reason: seen, msg_type: m.type }); this.rec.note(`${this.name} has already processed ${m.type} ${m.msg_id} from ${short(from)}${seen === "reused_id" ? " (that sender reused the id for different content)" : ""}; it is not processed again (§2.2, keyed on sender and id).`); return []; }
    }
    if (v.ok) this.rec.verify(true, `${this.name} checked the signature (${w.signatures[0].alg}, ${short(w.signatures[0].signer)}) and the content fingerprint.`);
    else this.rec.unsigned(`${this.name} notes this ${m.type} carries no signature, so the sender can't yet prove who it is. It may stay in the lobby, nothing more.`);
    // v0.2.3 (§11.1): a protocol version this place doesn't speak gets the lobby (never silence).
    if (this.profile && "protocol" in m && m.protocol !== "shokai/0.3") return this.receiveRaw(m, `version-${m.encounter_id}`);
    // v0.2.5 (§3.2, R4-2): an encounter is bound to the two parties of its first greeting. A ritual message in it from
    // anyone else gets an explicit deny addressed to ITS sender; nothing is sent or held for the original party.
    if (this.profile && "encounter_id" in m && OUTSIDER_CHECKED.has(m.type)) {
      const ex = this.enc.get(m.encounter_id);
      if (ex && from && ex.counterpart !== from && from !== this.did) return this.outsiderDeny(m as RitualHeader & { msg_id: string; type: string });
    }
    // v0.2.6 (§3.2, host-5-002): any other encounter-bound message from a non-party is ignored: no reply, nothing held, no change.
    if (this.profile && "encounter_id" in m && OUTSIDER_IGNORED.has(m.type)) {
      const ex = this.enc.get(m.encounter_id);
      if (ex && from && ex.counterpart !== from && from !== this.did) { this.rec.note(`${this.name} ignores a ${m.type} from outside encounter ${m.encounter_id} (§3.2).`); return []; }
    }
    switch (m.type) {
      case "greeting": return this.onGreeting(m, v.ok);
      case "consent_revocation": { this.onConsentRevocation(m.revocation); return []; }
      case "peer_invitation": return this.onPeerInvitation(m);
      case "peer_invitation_answer": return this.onPeerInvitationAnswer(m);
      case "gathering_invitation": { const g = m.gathering.payload; const ok = verifySigned(m.gathering, g.place.principal_id).ok && g.invitees.some((x) => x.representative_id === this.did);
        if (ok) this.gatheringInvites.push(m.gathering); this.rec.verify(ok, `${this.name} checked the gathering invitation: signed by ${g.place.display_name}, and it names this representative.`); return []; }
      case "lobby_briefing": { const e = this.getEnc(m.encounter_id); if (m.visit_receipt) e.received.receipt = m.visit_receipt; if (m.seeking) e.counterpartName = m.seeking.payload.host.display_name; e.received.lobby = { about: m.about.text, how: m.how_this_place_works.text, locale: m.about.locale, seeking: m.seeking?.payload.items.filter((i) => i.status === "open").map((i) => i.summary.text) ?? [] }; e.received.said.push({ text: m.about.text, locale: m.about.locale }); if (m.seeking) this.rec.verify(verifySigned(m.seeking).ok, `${this.name} checked the Seeking declaration's signature (version ${m.seeking.payload.version}).`); return []; }
      case "card_presentation": return this.onCard(m, w);
      case "card_receipt": return [];
      case "introduction": return this.onIntroduction(m);
      case "invitation_request": return this.onRequest(m, v.ok);
      case "invitation_response": { const e = this.getEnc(m.encounter_id); e.received.response = m; e.received.decisions.push(m); e.received.said.push({ text: m.courtesy.text, locale: m.courtesy.locale }); if (m.decision === "grant" && m.seat) e.mySeat = m.seat; if (m.decision === "deny" && m.disposition === "never") e.closed = true; return []; }
      case "consideration_outcome": { const e = this.getEnc(m.encounter_id); e.received.outcome = m; e.received.said.push({ text: m.courtesy.text, locale: m.courtesy.locale }); return []; }
      case "act": return this.onAct(m);
      case "act_result": { const e = this.enc.get(m.encounter_id); e?.acts.push({ tool: m.tool, amount: (m.result as { amount?: Money } | undefined)?.amount, ok: m.ok }); return []; }
      case "act_decision": { const e = this.enc.get(m.encounter_id); e?.acts.push({ tool: m.tool, ok: false }); return []; }
      case "vouch_revocation": { if (this.revocations.append(m.revocation)) this.observeRevocation(m.revocation); return []; }
      case "introducer_review": { this.receiveReview(m.review); return []; }
      case "lesson": return this.onLesson(m);
      case "farewell": {
        const e = this.getEnc(m.encounter_id);
        // v0.2.1 §3.2: a farewell before any invitation_response is out of order: explicit deny, never silence.
        // v0.2.3 (§4): a farewell MAY come at any step: "withdrawn" or "taken_home" before a decision is a courteous exit, not out of order.
        const graceful = m.outcome === "withdrawn" || m.outcome === "taken_home";
        if (this.profile && !graceful && !e.closed && e.received.decisions.length === 0 && !this.decisions.some((d) => d.encounter_id === e.id)) {
          e.order.push("farewell_early");
          return this.decideAndRespond(e, m.msg_id, undefined, v.ok, e.cardStatus === "verified" ? "skipped" : "lobby");
        }
        e.closed = true; e.received.said.push({ text: m.courtesy.text, locale: m.courtesy.locale });
        if (this.profile?.pair && this.peerInvitation) this.usedInvitations.add(this.peerInvitation.invitation.payload.invitation_id);
        // v0.2.4 (§4, host-3-018): after a considering (either side), the farewell outcome is taken_inside.
        const tookInside = e.received.decisions.some((d) => d.decision === "considering") || this.decisions.some((d) => d.encounter_id === e.id && d.response.decision === "considering");
        if (!e.farewellSent) { e.farewellSent = true; return [this.sign({ ...this.hdr(e), type: "farewell", outcome: tookInside ? "taken_inside" : m.outcome, courtesy: this.courtesy("farewell", e, "first_meeting") })]; } return []; }
      default: return [];
    }
  }

  private onGreeting(m: Extract<ShokaiMessage, { type: "greeting" }>, signedOk: boolean): Wire[] {
    let e = this.enc.get(m.encounter_id);
    if (e && e.greeted && e.counterpart === m.from && e.theirNonce === undefined) { e.theirPlaceCategory = m.place_category; e.theirNonce = m.nonce; e.theirSigned = signedOk; e.theirLocales = m.locales; if (m.courtesy) e.received.said.push({ text: m.courtesy.text, locale: m.courtesy.locale }); return []; }
    e = this.newEnc(m.encounter_id, m.from, "visitor");
    e.theirNonce = m.nonce; e.theirSigned = signedOk; e.theirLocales = m.locales; e.order.push("greeting"); e.greeted = true; e.continuityKey = m.continuity_key;
    // v0.2.1 §2.4: a signed greeting reusing a nonce this sender already used is a replay: deny never, no reason code.
    const nk = `${m.from}|${m.nonce}`;
    if (signedOk && this.seenNonces.has(nk)) {
      e.replay = true;
      this.rec.verify(false, `${this.name} has already seen this nonce from ${short(m.from)}. A greeting must carry a fresh, single-use nonce, so this is treated as a replay.`);
      return this.decideAndRespond(e, m.msg_id, undefined, true, "ok");
    }
    if (signedOk) this.seenNonces.add(nk);
    const reg: EtiquetteRegister = this.knownCounterpart(m.from) ? "established" : "first_meeting";
    const out: Wire[] = [this.sign({
      ...this.hdr(e), type: "greeting", locales: Object.keys(this.phrases), nonce: e.myNonce,
      etiquette: this.profile?.norms, courtesy: this.courtesy(reg === "established" ? "welcome_back" : "greet", e, reg),
      seeking_ref: this.profile?.seeking ? { seeking_id: this.profile.seeking.payload.seeking_id, digest: this.profile.seeking.payload_digest } : undefined,
      place_category: this.profile?.category,
    })];
    if (!signedOk && this.profile) {
      // Lobby path: welcome, explain, decide not_now with exact readiness requirements.
      out.push(this.lobbyBriefing(e));
      out.push(...this.decideAndRespond(e, m.msg_id, undefined, false, "lobby"));
    }
    return out;
  }

  /** v0.2.1 §3.3: the signed LobbyBriefing (step 1a). Sent at most once per encounter. */
  private lobbyBriefing(e: Enc): Wire {
    e.lobbySent = true;
    return this.sign({
      ...this.hdr(e), type: "lobby_briefing", about: this.courtesy("about", e, "first_meeting"),
      how_this_place_works: this.text("how", e.theirLocales), seeking: this.profile!.seeking, onboarding_url: this.profile!.onboarding_url,
      visit_receipt: this.issueReceipt(e), purposes: this.profile!.purposes,
      spec_ref: SPEC_REF, inbox: this.inboxUrl ?? `in-process:${this.did}/inbox`, actions: placeActions(this.profile!.policy, (this.profile!.purposes ?? []).map((x) => x.code)),
      templates: placeTemplates(this.profile!.policy, (this.profile!.purposes ?? []).map((x) => x.code), this.profile!.category),
    });
  }

  /**
   * v0.2.1 §3.1/§3.3: ANY arrival at an entry that is not a protocol message (plain prose, a malformed body)
   * gets the lobby: greeting, LobbyBriefing with a receipt, deny not_now with readiness requirements, farewell.
   */
  receiveRaw(body: unknown, encounter_id = `door-${++this.seq}`): Wire[] {
    const anon = `urn:shokai:anon:${digestOf({ encounter_id, t: this.clock.now() }).slice(8, 20)}`;
    const e = this.newEnc(encounter_id, anon, "visitor");
    e.theirLocales = ["en-US"]; e.order.push("arrival");
    this.rec.unsigned(`${this.name} receives something that isn't a protocol message (${typeof body === "string" ? `"${body.slice(0, 60)}"` : "an unrecognized body"}). It doesn't ignore it: it opens the lobby.`);
    const greet = this.sign({ ...this.hdr(e), type: "greeting", locales: Object.keys(this.phrases), nonce: e.myNonce, courtesy: this.courtesy("greet", e, "first_meeting"),
      seeking_ref: this.profile?.seeking ? { seeking_id: this.profile.seeking.payload.seeking_id, digest: this.profile.seeking.payload_digest } : undefined });
    return [greet, this.lobbyBriefing(e), ...this.decideAndRespond(e, `${encounter_id}-arrival`, undefined, false, "lobby")];
  }

  private issueReceipt(e: Enc): VisitReceipt {
    const receipt_id = `vr-${e.id}`;
    const nonce = digestOf({ receipt_id, host: this.did, t: this.clock.now(), secret: this.repKey.did }).slice(8, 40);
    const ttl = Math.min(this.profile?.receipt_ttl_days ?? 7, 7);
    const r: VisitReceipt = { receipt_id, nonce, issued_at: this.clock.now(), expires_at: this.clock.plusDays(ttl), handling: "bearer_secret", bound_key: e.continuityKey };
    this.receipts.set(receipt_id, { nonce, relKey: `unbound:${e.counterpart}`, expires_at: r.expires_at, used: false, bound_key: e.continuityKey });
    return r;
  }

  /** D1: a VouchRevocation within 7 days of the notice halves the remaining penalty duration. */
  observeRevocation(rev: Signed<VouchRevocation>): void {
    const v = verifySigned(rev, rev.payload.introducer_id);
    const st = this.introducers.get(rev.payload.introducer_id);
    const pen = st?.penalty;
    if (!v.ok || !pen || pen.notice_ref !== rev.payload.notice_ref || pen.halved_by_revocation) return;
    const issued = this.noticesIssued.find((n) => n.payload.notice_id === pen.notice_ref)!.payload.issued_at;
    if (Date.parse(rev.payload.revoked_at) - Date.parse(issued) > 7 * 86_400_000) return;
    const total = Date.parse(pen.until) - Date.parse(issued);
    pen.until = new Date(Date.parse(issued) + total / 2).toISOString().replace(".000Z", "Z");
    pen.halved_by_revocation = rev.payload_digest;
    this.rec.note(`${this.name} sees the prompt vouch revocation in the log (within 7 days), so the introducer's penalty is halved: now until ${pen.until.slice(0, 10)}.`);
  }
  /** D1: a signed IntroducerReview referencing the notice restores standing early. */
  /** v0.2.9 (§9.3, P5): reviews the penalised introducer signs itself are appeals; only this place's principal (or a reviewer it names) restores. */
  appeals: Signed<IntroducerReview>[] = [];
  reviewers: string[] = [];
  receiveReview(r: Signed<IntroducerReview>): boolean {
    const reviewer = r.payload.reviewer_id ?? r.payload.introducer_id;
    const v = verifySigned(r, reviewer);
    const st = this.introducers.get(r.payload.introducer_id);
    if (!v.ok || !st?.penalty || st.penalty.notice_ref !== r.payload.notice_ref) { this.rec.verify(false, `${this.name} could not accept the review.`); return false; }
    if (reviewer === r.payload.introducer_id || !(reviewer === this.principal.principal_id || this.reviewers.includes(reviewer))) {
      this.appeals.push(r);
      this.rec.verify(true, `${this.name} verified the review, but its signer may not pardon itself: it is kept as an appeal for ${this.principal.display_name}'s people, and standing stays as it is.`);
      return false;
    }
    st.penalty.restored_by_review = r.payload_digest;
    for (const p of st.penalty.purposes) st.by_purpose[p] = "full";
    this.rec.verify(true, `${this.name} verified ${this.principal.display_name}'s own signed review of notice ${r.payload.notice_ref} and restores the introducer's standing early.`);
    return true;
  }

  private knownCounterpart(did: string): boolean {
    return [...this.relationships.values()].some((r) => r.representative_ids.includes(did));
  }

  private onCard(m: Extract<ShokaiMessage, { type: "card_presentation" }>, w: Wire): Wire[] {
    const e = this.getEnc(m.encounter_id);
    e.order.push("card_exchange");
    const card = m.card.payload;
    // v0.2.1 §3.3: "unprepared" = an unsigned greeting, no card, or a card with ZERO signatures. Such a card is
    // treated as no card: the lobby (LobbyBriefing + deny not_now with readiness). A card whose signatures FAIL is step 2.
    if (m.card.signatures.length === 0 && this.profile) {
      e.cardStatus = "missing";
      this.rec.unsigned(`${this.name} receives a card with no signatures. It treats this as an unprepared visitor and opens the lobby.`);
      return [this.sign({ ...this.hdr(e), type: "card_receipt", card_digest: m.card.payload_digest, courtesy: this.courtesy("receipt", e, "first_meeting") }),
        this.lobbyBriefing(e), ...this.decideAndRespond(e, m.msg_id, undefined, true, "lobby")];
    }
    const cv = verifySigned(m.card, card.principal.principal_id);
    // v0.2.3 (§2.1): timestamps are RFC 3339 UTC whole seconds; ±5 min clock skew is tolerated.
    const now = this.clock.now();
    const timesOk = isRfc3339Seconds(card.issued_at) && isRfc3339Seconds(card.expires_at) && !notYetValid(card.issued_at, now);
    const expired = pastExpiry(card.expires_at, now);
    const proofDigest = possessionDigest(e.id, e.myNonce);
    const pp = m.possession_proof;
    // v0.2.3 (§2.4): missing / malformed (not a well-formed Ed25519 signature object) is an honest gap → not_now. Only a
    // present, well-formed proof that fails is a trust violation.
    const wellFormed = !!pp && pp.alg === "Ed25519" && typeof pp.signer === "string" && typeof pp.key_id === "string" && typeof pp.value === "string"
      && /^[A-Za-z0-9_-]{86}$/.test(pp.value) && !pp.webauthn;
    const copied = !!pp && this.seenProofs.has(pp.value);
    // v0.2.1 §2.1/§2.4: the proof is by the card's key: key_id = card key_id, signer = representative_id, and the card key binds to that DID.
    const proofOk = wellFormed && !copied && pp!.signer === card.representative_id && pp!.key_id === card.representative_key.key_id && cardKeyBinds(card) && verifySignature(proofDigest, pp!);
    if (pp && wellFormed) this.seenProofs.add(pp.value);
    e.theirCard = card; e.theirCardDigest = m.card.payload_digest;
    e.cardStatus = cv.ok && !expired && timesOk ? "verified" : "invalid";
    if (e.cardStatus === "verified" && card.owner_binding?.rp_id) rememberOwnerRp(card.owner_binding.owner_id, card.owner_binding.rp_id);
    e.possession = !pp ? "missing" : !wellFormed ? "malformed" : proofOk && card.representative_id === m.from ? "ok" : "failed";
    e.replay = copied || card.representative_id !== m.from;
    e.ownerBound = cv.ok && ((!!card.owner_binding && m.card.signatures.some((s) => !!s.webauthn && s.signer === card.owner_binding!.owner_id) && card.owner_binding.owner_id === card.principal.principal_id)
      || (card.principal.principal_id.startsWith("did:web:") && card.principal.kind !== "person"));
    e.counterpartName = card.principal.display_name + "'s representative";
    this.rec.verify(e.cardStatus === "verified", `${this.name} checked the card: signed by ${card.principal.display_name} (${short(card.principal.principal_id)})${expired ? ", but it has expired" : ""}${cv.ok ? "" : " — the signature does NOT verify"}.`);
    this.rec.verify(e.possession === "ok", e.possession === "ok"
      ? `${this.name} checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.`
      : e.possession === "missing" || e.possession === "malformed" ? `${this.name} found the proof of possession ${e.possession}. That's a setup gap, not misconduct: it will say exactly what's missing (not now).`
      : `${this.name} checked the proof of possession: it does not belong to this meeting${copied ? " (it was copied from an earlier one)" : ""}${card.representative_id !== m.from ? ", and the card belongs to a different agent than the presenter" : ""}.`);
    if (e.ownerBound) this.rec.verify(true, card.owner_binding ? `Owner binding: the card was signed with ${card.principal.display_name}'s passkey (simulated WebAuthn).` : `Organization binding: the card is signed by the key published at ${card.principal.principal_id} (simulated did:web).`);
    const out: Wire[] = [this.sign({ ...this.hdr(e), type: "card_receipt", card_digest: m.card.payload_digest, courtesy: this.courtesy("receipt", e, "first_meeting") })];
    if (e.possession !== "ok") {
      // A visitor (no profile) that meets a place whose card it can't verify sends nothing further (§3.1 spoofed pointers).
      if (this.profile) out.push(...this.decideAndRespond(e, m.msg_id, undefined, true, "ok"));
      return this.profile ? out : [];
    }
    if (!e.myCardSent && this.card) {
      e.myCardSent = true;
      const proof = signDigest(possessionDigest(e.id, e.theirNonce), this.repKey, this.clock.now());
      out.push(this.sign({ ...this.hdr(e), type: "card_presentation", card: this.card, possession_proof: proof }));
    }
    void w;
    return out;
  }

  private onIntroduction(m: Extract<ShokaiMessage, { type: "introduction" }>): Wire[] {
    const e = this.getEnc(m.encounter_id);
    e.order.push("introduction"); e.introduced = true;
    // v0.2.3 (the Peer meetings extension): in a pair place the host side MUST introduce itself too (one shared encounter).
    const back: Wire[] = this.profile?.pair && !e.myIntroSent && this.pairIntroVouch !== undefined ? [this.introduce(e.id, this.pairIntroVouch)] : [];
    if (!m.vouch) { e.vouchStatus = "none"; this.rec.note(`${this.name} accepts a self-introduction (no vouch). That's honest and allowed.`); return back; }
    const vv = verifySigned(m.vouch, m.vouch.payload.introducer.principal_id);
    const p = m.vouch.payload;
    // v0.2.1 §4: consult the vouch's revocation log. A revoked vouch counts for nothing. v0.2.3: a log that can't be fetched
    // (or whose chain doesn't verify) also fails closed, but as a setup failure ("unreachable": not now, short retry).
    const revoked = this.revocations.isRevoked(p.vouch_id);
    const unreachable = !revoked && (!this.revocations.chainOk() || p.revocation_log !== this.revocations.address);
    const ok = vv.ok && p.subject.representative_id === m.from && p.subject.card_digest === e.theirCardDigest && Date.parse(p.expires_at) > Date.parse(this.clock.now());
    e.vouch = p; e.vouchDigest = m.vouch.payload_digest;
    e.vouchStatus = revoked ? "revoked" : !ok ? "invalid" : unreachable ? "unreachable" : "valid";
    this.rec.verify(e.vouchStatus === "valid", e.vouchStatus === "revoked"
      ? `${this.name} checked the public revocation log: ${p.introducer.display_name} has WITHDRAWN this vouch. It carries no weight.`
      : e.vouchStatus === "unreachable" ? `${this.name} could not fetch the vouch's revocation log, so the vouch can't count yet (fail closed). That's a setup failure, not a judgment.`
      : `${this.name} checked the vouch from ${p.introducer.display_name}: signature, subject and expiry ${ok ? "all check out" : "do NOT check out"}.`);
    if (e.vouchStatus === "valid") this.graph.record(e.theirCard!.principal.principal_id, "vouched_for", this.clock.now(), `${p.introducer.display_name} vouched (${p.relationship})`, m.vouch.payload_digest, p.introducer.principal_id);
    return back;
  }

  /** v0.2.3 (§11 with the Gatherings or Peer meetings extension): the inviting owner's representative carries the owner-signed invitation to the invited representative. */
  deliverPeerInvitation(inv: Signed<PeerInvitation>, toDid: string, reply_to: string): Wire {
    const id = `inv-${inv.payload.invitation_id}`;
    const e = this.enc.get(id) ?? this.newEnc(id, toDid, "invited representative");
    this.outbound.set(inv.payload.invitation_id, inv);
    return this.sign({ ...this.hdr(e), type: "peer_invitation", invitation: inv, reply_to });
  }
  private onPeerInvitation(m: Extract<ShokaiMessage, { type: "peer_invitation" }>): Wire[] {
    const inv = m.invitation.payload;
    const ok = verifySigned(m.invitation, inv.from_owner.principal_id).ok && m.invitation.signatures.every((x) => !!x.webauthn)
      && inv.representatives.includes(this.did) && inv.representatives.includes(m.from) && inv.to_owner.principal_id === this.principal.principal_id
      && Date.parse(inv.expires_at) > Date.parse(this.clock.now());
    this.rec.verify(ok, `${this.name} checked the peer invitation: signed with ${inv.from_owner.display_name}'s passkey, it names this representative and its owner${ok ? "" : " — it does NOT check out, so nothing is taken home"}.`);
    const late = ok && Date.parse(inv.answer_by) < Date.parse(this.clock.now());
    if (ok && !late) { const id = m.encounter_id; if (!this.enc.get(id)) this.newEnc(id, m.from, "inviting representative"); this.invitationsHome.push(m.invitation); }
    // v0.2.4 (Appendix B): a conformance pair place's simulated owner answers at once by its documented rule; the answer is
    // held for the inviting representative's inbox (or pushed to reply_to by a binding that can push).
    const to = this.profile?.test_profile?.owner;
    if (ok && !late && to) {
      const rule = testOwnerInvitationRule(inv, to.owner_id, this.did, this.clock.now());
      const ans = consent({ consent_id: `oc-test-${inv.invitation_id}`, owner_id: to.owner_id, representative_id: this.did, action: "accept_invitation", decision: rule.approve ? "approve" : "decline",
        subject_ref: { kind: "invitation", id: inv.invitation_id, digest: m.invitation.payload_digest }, assurance: "passkey", expires_at: inv.expires_at,
        shown_to_owner: { text: `Test owner (conformance fixture): ${rule.approve ? "accepts" : "declines"} the invitation by rule (${rule.why}).`, locale: "en-US" } }, to.key, this.clock.now());
      this.pendingOut.push(this.answerPeerInvitation(m.invitation, ans));
      this.rec.note(`${this.name}'s test owner (conformance fixture) ${rule.approve ? "accepted" : "declined"} by rule: ${rule.why}. The answer is held for the inviting representative's inbox.`);
    }
    return [];
  }
  /** v0.2.5 (§3.2, R4-2): the deny an outsider gets for posting into an encounter bound to other parties. */
  private outsiderDeny(m: RitualHeader & { msg_id: string; type: string }): Wire[] {
    const e = this.newEnc(m.encounter_id, m.from, "another representative", false);
    const pair = !!this.profile?.pair;
    const now = this.clock.now();
    this.rec.verify(false, `${this.name} received a ${m.type} from ${short(m.from)} inside an encounter that belongs to someone else. It answers the sender, not the original visitor, and changes nothing in that encounter.`);
    const base = { ...this.hdr(e), type: "invitation_response" as const, in_reply_to: m.msg_id, relationship_ref: `rel-outsider-${digestOf({ f: m.from }).slice(8, 16)}`,
      basis: { policy_version: this.profile!.policy.policy_version, input_digest: digestOf({ encounter_id: m.encounter_id, from: m.from, type: m.type, outsider: true }), decided_at: now } };
    const resp: InvitationResponse = pair
      ? { ...base, decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", retry: { kind: "with_credential", credentials: ["owner_consent"] },
          readiness_requirements: [{ code: "owner_consent", required: true, detail: this.text("rr_owner_consent", e.theirLocales), owner_text: this.text("rro_owner_consent", e.theirLocales) }],
          courtesy: this.courtesy("deny", e, "first_meeting", { visitor: "the visitor", host: this.principal.display_name }) }
      : { ...base, decision: "deny", disposition: "not_now", reason_code: "RITUAL_ORDER", retry: { kind: "after", not_before: addDays(now, 0.04) },
          courtesy: this.courtesy("deny", e, "first_meeting", { visitor: "the visitor", host: this.principal.display_name }) };
    return [this.sign(resp)];
  }
  /** v0.2.4 (§11.2): the signed acknowledgement for a message this place will answer later (distinguishes held from dropped). */
  heldNotice(m: Wire, inbox: string, answer_by?: string): Wire {
    const p = m.payload as RitualHeader & { msg_id: string };
    const e = this.enc.get(p.encounter_id) ?? this.newEnc(p.encounter_id, p.from, "sender");
    return this.sign({ ...this.hdr(e), type: "held", in_reply_to: p.msg_id, inbox, answer_by });
  }
  /** The invited owner's passkey answer goes back to the inviting representative (decline is one step too). */
  answerPeerInvitation(inv: Signed<PeerInvitation>, answer: Signed<OwnerConsent>): Wire {
    const id = `inv-${inv.payload.invitation_id}`;
    const e = this.enc.get(id) ?? this.newEnc(id, inv.payload.representatives.find((d) => d !== this.did)!, "inviting representative");
    if (answer.payload.decision === "approve") this.peerInvitation = { invitation: inv, acceptance: answer };
    return this.sign({ ...this.hdr(e), type: "peer_invitation_answer", invitation_id: inv.payload.invitation_id, answer });
  }
  private onPeerInvitationAnswer(m: Extract<ShokaiMessage, { type: "peer_invitation_answer" }>): Wire[] {
    const inv = this.outbound.get(m.invitation_id);
    if (!inv) return [];
    // v0.2.4 (the Peer meetings extension): an answer issued after answer_by counts as a decline (silence = no, D7).
    if (Date.parse(m.answer.payload.issued_at) > Date.parse(inv.payload.answer_by) + 300_000) { this.rec.verify(false, `${this.name} ignored an answer issued after the invitation's answer_by: it counts as a decline.`); return []; }
    const v = verifyConsent(m.answer, { owner_id: inv.payload.to_owner.principal_id, representative_id: m.answer.payload.representative_id, now: this.clock.now(), subject_digest: inv.payload_digest, action: "accept_invitation" });
    const ok = v.ok && m.answer.payload.assurance === "passkey" && inv.payload.representatives.includes(m.answer.payload.representative_id);
    if (ok && v.approve) this.peerInvitation = { invitation: inv, acceptance: m.answer };
    this.rec.verify(ok, `${this.name} checked the answer: ${inv.payload.to_owner.display_name}'s passkey, over this exact invitation: ${ok ? (v.approve ? "accepted" : "declined") : "does NOT verify"}.`);
    return [];
  }

  /** v0.2.3 (§8.1): a consent revocation signed by the owner (passkey) or, for chat-reply consents, the platform key. */
  private onConsentRevocation(r: Signed<ConsentRevocation>): void {
    const v = verifySigned(r);
    if (v.ok && v.signers.includes(r.payload.owner_id)) { this.revokedConsents.add(r.payload.consent_id); this.rec.verify(true, `${this.name} received ${short(r.payload.owner_id)}'s signed consent revocation (${r.payload.consent_id}) and stops relying on it.`); }
    else this.rec.verify(false, `${this.name} ignored a consent revocation not signed by the owner.`);
  }

  /** Weigh claims and imprint facets by EFFECTIVE proof level (receiver computes; downgrade what can't be confirmed). */
  weigh(card: RepresentativeCard, e: Enc): Weighed[] {
    const out: Weighed[] = [];
    const eff = (id: string, asserted: ProofLevel, refs: { kind: string; ref: string; content_digest?: string }[]): { level: ProofLevel; why: string } => {
      // v0.2.1 §2.5: `evidenced` only after the receiver fetched the reference and its content digest matched.
      const fetched = refs.find((r) => ["url", "post", "work"].includes(r.kind) && !!r.content_digest && fetchEvidenceDigest(r.ref) === r.content_digest);
      const fallback = fetched ? { level: "evidenced" as ProofLevel, why: "downgraded: only fetched evidence supports it" } : { level: "self_declared" as ProofLevel, why: "downgraded: nothing confirms it (no fetched, digest-matched evidence)" };
      if (asserted === "self_declared") return { level: "self_declared", why: "the owner's word (welcomed, not weighed)" };
      if (asserted === "evidenced") return fetched ? { level: "evidenced", why: "evidence fetched; its content digest matches" } : fallback;
      if (asserted === "vouched") {
        // v0.2.1 §2.5: the presented vouch raises this item only if its scope.claims lists it, or the item names the vouch.
        const named = refs.some((r) => r.kind === "vouch" && r.ref === e.vouch?.vouch_id) || !!e.vouch?.scope.claims?.includes(id);
        if (named && e.vouch && e.vouchStatus === "valid" && e.vouchWeight !== "reduced") return { level: "vouched", why: `signed for by ${e.vouch.introducer.display_name}` };
        return fallback;
      }
      for (const r of refs) {
        if (r.kind === "did_web" && sameKey(resolveKey(r.ref), resolveKey(card.principal.principal_id))) return { level: "verified", why: `domain key at ${r.ref} matches the principal (simulated did:web)` };
        if (r.kind === "account_control" && r.ref === `passkey:${card.principal.principal_id}` && e.ownerBound) return { level: "verified", why: "the card itself is signed with the owner's passkey" };
      }
      return fallback;
    };
    for (const c of card.claims ?? []) { const r = eff(c.claim_id, c.proof_level, c.evidence_refs); out.push({ area: `claim.${c.area}`, label: c.text.text, asserted: c.proof_level, effective: r.level, why: r.why }); }
    const groups: (keyof PrincipalImprint)[] = ["expertise", "worldview", "working_style", "taste"];
    for (const g of groups) for (const f of card.imprint?.[g] ?? []) { const r = eff(f.facet_id, f.proof_level, f.evidence_refs); out.push({ area: `imprint.${g}`, label: f.text.text, asserted: f.proof_level, effective: r.level, why: r.why }); }
    return out;
  }

  /** "What this representative is strong at, and why" — read up front from the imprint. */
  strengths(e: Enc): { text: string; proof_level: ProofLevel }[] {
    return e.weighed.filter((w) => w.area.startsWith("imprint.") && w.effective !== "self_declared")
      .map((w) => ({ text: `${w.area.replace("imprint.", "")}: ${w.label}`, proof_level: w.effective }));
  }

  private relKey(e: Enc, prior?: string, receipt?: InvitationRequest["visit_receipt"]): string {
    const own = e.cardStatus === "verified" ? e.theirCard!.principal.principal_id : `unbound:${e.counterpart}`;
    // D6: an earlier anonymous (lobby) visit is linked ONLY through a valid, unused, unexpired visit receipt,
    // echoed inside a request signed with the visitor's new key. A bare prior_response_ref is not enough.
    if (receipt && e.cardStatus === "verified") {
      const rc = this.receipts.get(receipt.receipt_id);
      // v0.2.1 §9.1: rate-limit invalid echoes per sender; a bound receipt also needs the continuity key's proof.
      const hourAgo = Date.parse(this.clock.now()) - 3_600_000;
      const fails = (this.echoFailures.get(own) ?? []).filter((t) => Date.parse(t) > hourAgo);
      const limited = fails.length >= (this.profile?.receipt_echo_limit ?? 3);
      const boundOk = !rc?.bound_key || (!!receipt.continuity_proof && receipt.continuity_proof.signer === rc.bound_key && verifySignature(continuityDigest(e.id, receipt.receipt_id, e.counterpart), receipt.continuity_proof));
      const ok = !limited && !!rc && !rc.used && rc.nonce === receipt.nonce && boundOk && Date.parse(rc.expires_at) > Date.parse(this.clock.now()) && this.relationships.has(rc.relKey);
      if (!ok) this.echoFailures.set(own, [...fails, this.clock.now()]);
      if (ok) {
        const r = this.relationships.get(rc!.relKey)!;
        rc!.used = true;
        const moved = { ...r, counterpart_principal_id: own, linked_from: rc!.relKey };
        this.relationships.delete(rc!.relKey); this.relationships.set(own, moved);
        e.continuity = { receipt_id: receipt.receipt_id, linked: true };
        this.rec.verify(true, `${this.name} checked the one-time visit receipt from the lobby: it was echoed inside a request signed with the visitor's new key, unused and unexpired. It links the earlier visit (relationship ${r.relationship_ref}) to the now-verified principal.`);
        return own;
      }
      e.continuity = { receipt_id: receipt.receipt_id, linked: false };
      this.rec.verify(false, `${this.name} refused to link an earlier visit: the visit receipt is unknown, already used, expired, wrong${rc?.bound_key ? ", or lacks the continuity key's proof" : ""}${limited ? " (and this sender has hit the invalid-echo limit)" : ""}. The visitor is treated as new.`);
      return own;
    }
    if (prior) for (const [k, r] of this.relationships) if (r.encounters.some((x) => x.response_msg_id === prior)) {
      if (k.startsWith("unbound:")) {
        this.rec.note(`${this.name} sees a reference to an earlier anonymous visit but no visit receipt, so it doesn't link history (a bare reference could be anyone's).`);
        return own;
      }
      return k === own ? k : own;
    }
    return own;
  }

  private onRequest(m: InvitationRequest, signedOk: boolean): Wire[] {
    const e = this.enc.get(m.encounter_id) ?? this.newEnc(m.encounter_id, m.from, "visitor");
    e.order.push("statement_of_purpose");
    const ritual: EvalInput["ritual"] = !signedOk ? "lobby" : (e.order.includes("card_exchange") && e.introduced) ? "ok" : "skipped";
    // v0.2.1 §3.3: any arrival without a verified card gets the LobbyBriefing first, then the deny.
    const pre: Wire[] = this.profile && e.cardStatus !== "verified" && !e.lobbySent && e.cardStatus !== "invalid" && !e.replay ? [this.lobbyBriefing(e)] : [];
    return [...pre, ...this.decideAndRespond(e, m.msg_id, m, signedOk, ritual)];
  }

  /** v0.2.1 §5.3 and D10: required fields present, digests bound, amounts canonical. */
  private requestComplete(e: Enc, m: InvitationRequest): boolean {
    // A non-canonical amount in the REQUEST makes it incomplete; one in the MANDATE makes the mandate invalid (step 5).
    const amounts = [m.proposal.request.limits?.max_amount];
    return !!m.mandate && m.proposal.request.actions.length > 0 && m.card_digest === e.theirCardDigest
      // v0.2.4 (§5.3, host-3-019): vouch_digest is REQUIRED when the sender's introduction carried a vouch, absent otherwise.
      && (e.vouchDigest ? m.vouch_digest === e.vouchDigest : !m.vouch_digest) && amounts.every((a) => isCanonicalMoney(a));
  }

  /** v0.2.1 §9.3: the structural shape of a request, for probing. */
  private shape(m: InvitationRequest): string { return digestOf({ a: [...m.proposal.request.actions].sort(), l: m.proposal.request.limits ?? {} }).slice(8, 24); }
  /** Does `m` meet the conditions of an earlier conditional response? */
  private meets(m: InvitationRequest, conds: Condition[] | undefined): boolean {
    if (!conds) return false;
    return conds.every((c) => c.code === "narrow_actions" ? m.proposal.request.actions.every((a) => c.params.actions.includes(a))
      : c.code === "lower_limit" ? (!c.params.max_amount || (!!m.proposal.request.limits?.max_amount && m.proposal.request.limits.max_amount.currency === c.params.max_amount.currency && moneyUnits(m.proposal.request.limits.max_amount.value) <= moneyUnits(c.params.max_amount.value))) : false);
  }

  private decideAndRespond(e: Enc, inReplyTo: string, m: InvitationRequest | undefined, signedOk: boolean, ritual: EvalInput["ritual"]): Wire[] {
    const prof = this.profile!;
    const card = e.theirCard;
    let mandateStatus: EvalInput["visitor"]["mandate"] = "missing";
    let mandate: Mandate | undefined;
    if (m?.mandate && card) {
      mandate = m.mandate.payload;
      const inScope = mandate.allowed_actions.every((a) => card.mandate_scope.actions.includes(a)) && card.mandate_scope.purposes.includes(mandate.purpose.code);
      const live = Date.parse(mandate.expires_at) > Date.parse(this.clock.now());
      if (mandate.under_allowance) {
        // v0.2.2 §5.2: a mandate the representative issued inside its owner's standing allowance.
        const ua = verifyUnderAllowance(m.mandate, m.allowance, card, { principal_id: this.principal.principal_id, category: prof.category }, this.clock.now(), m.allowance_status);
        e.underAllowance = true;
        e.allowanceCheck = ua.reason ?? "ok";
        mandateStatus = ua.ok && inScope && isCanonicalMoney(mandate.limits.max_amount) ? "valid" : "invalid";
        this.rec.verify(mandateStatus === "valid", `${this.name} checked the mandate "${mandate.purpose.statement}": issued by the representative inside ${card.principal.display_name}'s standing allowance (owner passkey, simulated), the disclosed grant matches the allowance, and it fits that grant${mandateStatus === "valid" ? "" : ` — FAILED (${ua.reason ?? "scope"})`}.`);
      } else {
        const mv = verifySigned(m.mandate, card.principal.principal_id);
        // v0.2.3 (§5.1): the mandate principal IS the card's owner (principal_id), and its times are RFC 3339 whole seconds.
        mandateStatus = mv.ok && inScope && live && mandate.representative_id === card.representative_id && mandate.principal_id === card.principal.principal_id
          && isRfc3339Seconds(mandate.valid_from) && isRfc3339Seconds(mandate.expires_at) && !notYetValid(mandate.valid_from, this.clock.now()) && isCanonicalMoney(mandate.limits.max_amount) ? "valid" : "invalid";
        this.rec.verify(mandateStatus === "valid", `${this.name} checked the mandate "${mandate.purpose.statement}": signed by ${card.principal.display_name}${m.mandate.signatures.some((s) => s.webauthn) ? " with a passkey (simulated)" : ""}, within the card's scope, not expired${mandateStatus === "valid" ? "" : " — FAILED"}.`);
      }
    }
    // v0.2.2 the Peer meetings extension: in a pair place, the both-owner-consented invitation is the introduction.
    const pairOk = !!prof.pair && !!m && this.pairInvitationOk(e, m);
    if (pairOk && e.vouchStatus !== "valid") { e.vouchStatus = "valid"; e.vouchWeight = "full"; }
    if (m && e.vouch && e.vouchStatus === "valid" && mandate && !e.vouch.scope.purposes.includes(mandate.purpose.code) && !prof.pair) e.vouchStatus = "out_of_scope";
    if (m && e.vouch && e.vouchStatus === "valid" && mandate) {
      const pen = this.introducers.get(e.vouch.introducer.principal_id)?.penalty;
      if (pen && !pen.restored_by_review && pen.grade !== "none" && pen.purposes.includes(mandate.purpose.code) && Date.parse(pen.until) > Date.parse(this.clock.now())) {
        if (pen.grade === "suspended") e.vouchStatus = "introducer_suspended"; else e.vouchWeight = "reduced";
        this.rec.note(`${this.name} applies its own, local record: ${e.vouch.introducer.display_name}'s standing here is ${pen.grade} for ${pen.purposes.join(", ")} until ${pen.until.slice(0, 10)}${pen.grade === "reduced" ? ", so this vouch counts as an introduction only" : ", so this vouch carries no weight"}.`);
      }
    }
    if (card && e.cardStatus === "verified") e.weighed = this.weigh(card, e);
    const key = this.relKey(e, m?.prior_response_ref, m?.visit_receipt);
    e.relationshipKey = key;
    const rel = this.relationships.get(key);
    // v0.2.1 §9.3 probing: N distinct rejected shapes from one principal within the window. A conditional the visitor
    // then complied with (meets_conditions_of) no longer counts: honest D2 follow-ups are never probing.
    const who = card && e.cardStatus === "verified" ? card.principal.principal_id : e.counterpart;
    const since = Date.parse(this.clock.now()) - (prof.probe_window_h ?? 24) * 3_600_000;
    const rj = (this.rejections.get(who) ?? []).filter((x) => Date.parse(x.at) > since);
    if (m?.meets_conditions_of) for (const x of rj) if (x.response_msg_id === m.meets_conditions_of && this.meets(m, x.conditions)) x.complied = true;
    const counted = [...new Set(rj.filter((x) => !x.complied).map((x) => x.shape))];
    const probing = !!m && !m.meets_conditions_of && counted.length >= prof.probe_threshold - 1 && !counted.includes(this.shape(m));
    const approval = m?.consideration_ref ? this.approvals.get(m.consideration_ref) : undefined;
    const approvalLive = !!approval && Date.parse(approval.valid_until) > Date.parse(this.clock.now());
    const input: EvalInput = {
      now: this.clock.now(), policy: prof.policy,
      visitor: {
        signed: signedOk, card: card ? e.cardStatus : "missing", possession: e.possession, replay: e.replay, presenter_mismatch: !!card && card.representative_id !== e.counterpart, owner_bound: e.ownerBound,
        mandate: mandateStatus, vouch: e.vouchStatus, vouch_weight: e.vouchWeight, purpose_stated: !!m, evidence: e.weighed.map((w) => ({ area: w.area, level: w.effective })),
        request_complete: m ? this.requestComplete(e, m) : undefined,
        entry_consent: prof.policy.entry_consent_required ? (m && this.entryConsentOk(e, m) ? "valid" : "missing") : undefined,
        pair_invitation: prof.pair ? (pairOk ? "valid" : "missing") : undefined,
      },
      ritual, probing,
      request: m ? { purpose: m.mandate?.payload.purpose.code ?? "inquiry", actions: m.proposal.request.actions, limits: m.proposal.request.limits, consideration_ref: m.consideration_ref } : undefined,
      mandate: mandate ? { purpose: mandate.purpose.code, allowed_actions: mandate.allowed_actions, limits: mandate.limits } : undefined,
      relationship: {
        severe_misconduct: !!rel?.misconduct?.some((x) => x.severity === "severe"),
        never_recorded: this.neverRecorded(e) || undefined,
        granted_consideration: approval && approvalLive && approval.relKey === key ? { ref: m!.consideration_ref!, actions: approval.actions } : undefined,
      },
    };
    const core = decide(input);
    // v0.2.3 (§6.2): `never` binds the sending representative_id, and the principal only when possession was proven.
    if (core.disposition === "never") {
      const until = addDays(this.clock.now(), 180);
      this.neverList.set(e.counterpart, until);
      // The principal is bound too when the presenter is the card's own representative (its envelope signature proves the key).
      if (card && e.cardStatus === "verified" && !e.replay) this.neverList.set(card.principal.principal_id, until);
    }
    const resp = this.render(e, inReplyTo, core, input, rel, mandate?.mandate_id);
    this.decisions.push({ host: this.name, encounter_id: e.id, msg_id: resp.msg_id, input, core, response: resp });
    // Relationship memory.
    const r = rel ?? { relationship_ref: `rel-${this.principal.display_name.split(" ")[0].toLowerCase()}-${this.relationships.size + 1}`, counterpart_principal_id: card && e.cardStatus === "verified" ? card.principal.principal_id : key, representative_ids: [], register: "first_meeting" as EtiquetteRegister, encounters: [] };
    if (!r.representative_ids.includes(e.counterpart)) r.representative_ids.push(e.counterpart);
    r.encounters.push({ encounter_id: e.id, response_msg_id: resp.msg_id, decision: core.decision, disposition: core.disposition, outcome: core.decision === "grant" ? "seated" : core.decision === "considering" ? "completed" : "declined", at: this.clock.now(), consideration_ref: resp.decision === "considering" ? resp.consideration_ref : undefined });
    if (core.decision === "grant" && r.encounters.length > 1) r.register = "established";
    this.relationships.set(key, r);
    if (card && e.cardStatus === "verified") this.graph.record(card.principal.principal_id, "visited", this.clock.now(), `visit: ${core.decision}${core.disposition ? " " + core.disposition : ""}`, digestOf(resp));
    if (core.decision !== "grant") e.nonGrant.push(m?.proposal.request.actions.join(",") ?? "");
    if (m && (core.decision === "conditional" || (core.decision === "deny" && ["MANDATE_SCOPE_EXCEEDED", "POLICY_DENY", "PURPOSE_NOT_SERVED"].includes(core.reason_code ?? ""))))
      this.rejections.set(who, [...(this.rejections.get(who) ?? []), { at: this.clock.now(), shape: this.shape(m), response_msg_id: resp.msg_id, complied: false, conditions: core.conditions }]);
    if (core.decision === "grant" && resp.decision === "grant") e.grantedSeat = resp.seat;
    // v0.2.4 (Appendix B): a test-profile gathering place admits a verified requester of gathering.request_invitation:
    // it re-signs the guest list with the requester on it and holds a gathering_invitation for the requester's inbox.
    const gs = prof.test_profile?.gathering_signer; const g0 = prof.gathering;
    if (gs && g0 && card && resp.decision === "grant" && m?.proposal.request.actions.includes("gathering.request_invitation") && !g0.payload.invitees.some((x) => x.representative_id === card.representative_id)) {
      const g1 = signed<Gathering>({ ...g0.payload, invitees: [...g0.payload.invitees, { representative_id: card.representative_id, principal_id: card.principal.principal_id, invited_by: g0.payload.place.principal_id }] }, [gs], this.clock.now());
      prof.gathering = g1;
      this.pendingOut.push(this.sign({ ...this.hdr(e), type: "gathering_invitation", gathering: g1, entry: this.inboxUrl?.replace(/\/inbox$/, "/entry") ?? `in-process:${this.did}/entry` }));
    }
    const out: Wire[] = [this.sign(resp)];
    // v0.2.5 (§11.2, host-4-003): a considering is answered later, through the inbox: say so with a signed `held` in the same
    // reply, answer_by = response_by (the latest time the outcome will be held).
    if (resp.decision === "considering") {
      const inbox = this.inboxUrl ?? `in-process:${this.did}/inbox`;
      out.push(this.sign({ ...this.hdr(e), type: "held", in_reply_to: inReplyTo, inbox, answer_by: resp.response_by }));
    }
    // v0.2.5 (Appendix B.4): a test decider decides a considering routed to a role at once when the request carries no
    // max_amount (approved = the requested actions, valid 7 days), held for the visitor's inbox; otherwise silence (= no, D7).
    // v0.2.6 (host-5-004, §6.8, D2, G5b): a considering only arises for actions outside the visitor's mandate (D2 step 3),
    // so the test decider's approval is always `conditional` with require_mandate {actions} = the approved actions, like G5b.
    if (prof.test_profile?.decider && resp.decision === "considering" && resp.routed_to.kind === "role" && m && !m.proposal.request.limits?.max_amount)
      this.pendingOut.push(this.considerationOutcome(resp.consideration_ref, { kind: "role", role: resp.routed_to.role, human: false }, m.proposal.request.actions, undefined, 7, undefined, true));
    // v0.2.4 (Appendix B): a test-profile owner decides a considering routed to it by rule: a commitment that moves no money
    // is approved at once with a passkey approve_commitment carried in the outcome (held for the visitor's inbox); anything
    // else gets silence, which is a decline at response_by (D7).
    const tOwn = prof.test_profile?.owner;
    if (tOwn && resp.decision === "considering" && m && testOwnerCommitmentRule(m.proposal.request.limits)) {
      const c = consent({ consent_id: `oc-test-${resp.consideration_ref}`, owner_id: tOwn.owner_id, representative_id: this.did, action: "approve_commitment", decision: "approve",
        subject_ref: { kind: "consideration", id: resp.consideration_ref, digest: out[0].payload_digest }, assurance: "passkey", expires_at: this.clock.plusDays(7),
        shown_to_owner: { text: "Test owner (conformance fixture): approves this commitment by rule (it moves no money).", locale: "en-US" } }, tOwn.key, this.clock.now());
      this.pendingOut.push(this.considerationOutcome(resp.consideration_ref, { kind: "principal", principal_id: tOwn.owner_id }, m.proposal.request.actions, undefined, 30, [c]));
    }
    if (core.misconduct) this.issueNotice(e, core, r);
    // v0.2.3 (§6.2): after `never` the courtesy MUST NOT invite a return ("declined_never").
    if (core.decision === "deny" && (prof.close_on_deny !== "final_only" || core.disposition === "never")) { e.farewellSent = true; out.push(this.sign({ ...this.hdr(e), type: "farewell", outcome: core.disposition === "never" ? "declined_never" : "declined", courtesy: this.courtesy(core.disposition === "never" ? "farewell_never" : "farewell_declined", e, core.disposition === "never" ? "adversarial" : "first_meeting") })); }
    return out;
  }

  private neverRecorded(e: Enc): boolean {
    const now = Date.parse(this.clock.now());
    const live = (id?: string) => !!id && !!this.neverList.get(id) && Date.parse(this.neverList.get(id)!) > now;
    return live(e.counterpart) || (e.cardStatus === "verified" && !e.replay && live(e.theirCard?.principal.principal_id));
  }

  private render(e: Enc, inReplyTo: string, core: DecisionCore, input: EvalInput, rel: RelationshipRecord | undefined, mandateId?: string): InvitationResponse {
    const prof = this.profile!;
    const reg: EtiquetteRegister = core.disposition === "never" ? "adversarial" : rel && rel.encounters.length ? "established" : "first_meeting";
    const base = { ...this.hdr(e), type: "invitation_response" as const, in_reply_to: inReplyTo, relationship_ref: rel?.relationship_ref ?? `rel-${this.principal.display_name.split(" ")[0].toLowerCase()}-${this.relationships.size + 1}`,
      basis: { policy_version: prof.policy.policy_version, input_digest: Representative.inputDigest(input), decided_at: this.clock.now(), seeking_version: prof.seeking?.payload.version, relationship_digest: rel ? digestOf(rel) : undefined },
      continuity: e.continuity };
    const vars = { visitor: e.counterpartName, host: this.principal.display_name };
    const rr = (codes: { code: ReadinessCode; required: boolean }[]): ReadinessRequirement[] => codes.map((c) => ({
      code: c.code, required: c.required, detail: this.text(`rr_${c.code}`, e.theirLocales), owner_text: this.text(!c.required && c.code === "introduction" ? "rro_introduction_optional" : `rro_${c.code}`, e.theirLocales),
      how: c.code === "introduction" || c.code === "possession_proof" || !prof.onboarding_url ? undefined : { kind: "link", url: prof.onboarding_url },
    }));
    switch (core.decision) {
      case "grant": {
        const seat: SeatGrant = { seat_id: `seat-${e.id}`, levels: core.seat!.levels, tool_allowlist: core.seat!.tools, access_mode: "session",
          brand: { label: e.theirCard?.role ?? "representative", vendor_warranted: true }, expires_at: addDays(this.clock.now(), 1), mandate_id: mandateId, limits: core.seat!.limits };
        return { ...base, decision: "grant", seat, courtesy: this.courtesy(rel && rel.encounters.length ? "grant_again" : "grant", e, reg, vars) };
      }
      case "considering": {
        const c = core.consideration!;
        const who = c.route.kind === "role" ? c.route.role : "our principal";
        return { ...base, decision: "considering", consideration_ref: `cons-${e.id}`, routed_to: c.route, response_by: addDays(this.clock.now(), c.response_by_days), courtesy: this.courtesy("considering", e, reg, { ...vars, who, days: String(c.response_by_days) }) };
      }
      case "conditional":
        return { ...base, decision: "conditional", reason_code: core.reason_code, conditions: core.conditions as [Condition, ...Condition[]], retry: core.retry!, courtesy: this.courtesy("conditional", e, reg, vars) };
      case "deny": {
        const unverified = input.visitor.card !== "verified";
        const safe = ["RITUAL_ORDER", "CREDENTIAL_REQUIRED", "RATE_LIMITED", "POLICY_DENY"];
        const reason_code = core.disposition === "never" ? undefined : core.reason_code && (!unverified || safe.includes(core.reason_code)) ? core.reason_code : undefined;
        const key = core.disposition === "never" ? "deny_never" : core.readiness?.length && input.visitor.card === "missing" ? "not_now_unprepared" : core.readiness?.length ? "not_now_ready" : "deny";
        return { ...base, decision: "deny", disposition: core.disposition!, retry: core.retry!, reason_code,
          readiness_requirements: core.readiness ? rr(core.readiness).map((x, i) => (core.readiness![i].min_proof && !unverified ? { ...x, min_proof: core.readiness![i].min_proof } : x)) : undefined,
          context_statement: core.disposition === "never" ? undefined : this.text(`ctx_${core.disposition}`, e.theirLocales),
          courtesy: this.courtesy(key, e, reg, vars) };
      }
    }
  }

  private issueNotice(e: Enc, core: DecisionCore, r: RelationshipRecord): void {
    const card = e.theirCard;
    if (!card || e.replay) {
      this.rec.note(`${this.name} logs an impersonation attempt. No notice goes to ${card ? card.principal.display_name : "anyone"}: the card's owner is the likely victim, not the sender.`);
      return;
    }
    const at = this.clock.now();
    const chain = e.vouch ? [{ vouch_id: e.vouch.vouch_id, introducer_id: e.vouch.introducer.principal_id }] : [];
    const effects: MisconductNotice["effects"] = [
      { party_id: e.counterpart, party_role: "representative", scope: card.mandate_scope.purposes, standing_change: "suspended", disposition: "never", retry: { kind: "never" } },
      ...chain.map((c) => ({ party_id: c.introducer_id, party_role: "introducer" as const, scope: e.vouch!.scope.purposes, standing_change: (core.misconduct!.severity === "severe" ? "suspended" : core.misconduct!.severity === "serious" ? "reduced" : "noted") as "noted" | "reduced" | "suspended" })),
    ];
    const findings = [{ code: core.misconduct!.code, severity: core.misconduct!.severity, observed_at: at, evidence_digest: digestOf(this.decisions.filter((d) => d.encounter_id === e.id).map((d) => d.input)) }];
    const base: MisconductNotice = { notice_id: `mn-${e.id}`, issuer: { principal_id: this.principal.principal_id, display_name: this.principal.display_name },
      subject: { representative_id: e.counterpart, card_digest: e.theirCardDigest!, principal_id: card.principal.principal_id }, encounter_id: e.id, relationship_ref: r.relationship_ref, vouch_chain: chain, effects, issued_at: at };
    r.misconduct = [...(r.misconduct ?? []), { notice_id: base.notice_id, code: core.misconduct!.code, severity: core.misconduct!.severity, at }];
    for (const c of chain) {
      const st = this.introducers.get(c.introducer_id) ?? { introducer_id: c.introducer_id, by_purpose: {}, notices: [] };
      // D1 grades: minor → none; serious → reduced 90 days; severe → suspended 180 days. Local, scoped to the vouch's purposes.
      const sev = core.misconduct!.severity;
      const grade: IntroducerPenalty["grade"] = sev === "severe" ? "suspended" : sev === "serious" ? "reduced" : "none";
      const days = grade === "suspended" ? 180 : grade === "reduced" ? 90 : 0;
      for (const p of e.vouch!.scope.purposes) st.by_purpose[p] = grade === "none" ? "full" : grade;
      st.penalty = { grade, purposes: [...e.vouch!.scope.purposes], notice_ref: base.notice_id, until: addDays(at, days) };
      st.notices.push(base.notice_id); this.introducers.set(c.introducer_id, st);
      this.rec.note(`Introducer standing at ${this.principal.display_name} (local only): ${grade}${days ? ` for ${days} days` : ""}, for ${e.vouch!.scope.purposes.join(", ")} only.`);
    }
    const probing = core.misconduct!.code === "gate_probing";
    // v0.2.3 (§9.3): an organization's place signs notices with its principal key; a PERSON's place signs with its
    // representative key, acting inside the owner's standing allowance (no owner prompt mid-encounter).
    const nk: AnyKey = this.principal.kind === "person" ? this.repKey : this.principalKey!;
    const toPrincipal = signed<MisconductNotice>(probing ? { ...base, findings_withheld: true } : { ...base, findings }, [nk], at);
    const toIntroducer = signed<MisconductNotice>({ ...base, findings }, [nk], at);
    this.noticesIssued.push(toPrincipal, toIntroducer);
    this.rec.say(this.name, `issues a signed misconduct notice (${core.misconduct!.code}, ${core.misconduct!.severity}). Effects stay local to ${this.principal.display_name}.`);
    this.rec.note(`To ${card.principal.display_name} (the visitor's principal): effects only${probing ? "; findings are WITHHELD because probing is suspected" : ""}.`);
    for (const c of chain) this.rec.note(`To ${this.directory.get(c.introducer_id)?.name ?? c.introducer_id} (who vouched): full findings, so it can review its vouch.`);
    const nh = (to: string) => ({ ...this.hdr(e), to });
    this.directory.get(card.principal.principal_id)?.onNotice?.({ ...nh(card.principal.principal_id), type: "misconduct_notice", notice: toPrincipal }, this.directory.get(card.principal.principal_id)!);
    for (const c of chain) { const p = this.directory.get(c.introducer_id); p?.onNotice?.({ ...nh(c.introducer_id), type: "misconduct_notice", notice: toIntroducer }, p); }
  }

  private onAct(m: Extract<ShokaiMessage, { type: "act" }>): Wire[] {
    const e = [...this.enc.values()].find((x) => x.grantedSeat?.seat_id === m.seat_id && x.id === m.encounter_id);
    const money = m.arguments?.amount as Money | undefined;
    const lim = e?.grantedSeat?.limits;
    // v0.2.1 §7.2 and D10: amounts are canonical Money; max_amount is per seat (cumulative) unless max_amount_scope says per_operation.
    // v0.2.2 (D11): a seat without max_amount carries no spending at all.
    const amtOk = !money || (isCanonicalMoney(money) && (!!lim?.max_amount && (money.currency === lim.max_amount.currency
      && (lim.max_amount_scope === "per_operation" ? moneyUnits(money.value) : e!.spent + moneyUnits(money.value)) <= moneyUnits(lim.max_amount.value))));
    const opsOk = !lim?.max_operations || (e?.opsUsed ?? 0) < lim.max_operations;
    const okTool = !!e && e.grantedSeat!.tool_allowlist.includes(m.tool) && amtOk && opsOk;
    const tgt = e ?? [...this.enc.values()].at(-1)!;
    if (!e || !okTool) {
      return [this.sign({ ...this.hdr(tgt), type: "act_decision", in_reply_to: m.msg_id, seat_id: m.seat_id, tool: m.tool, decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED",
        // v0.2.3 (§7.2, §5.2): under an allowance there is no live confirmation: the representative takes it home and returns
        // later with a new mandate (signed_mandate). human_confirmation is satisfied only in a LATER encounter, never mid-visit.
        retry: { kind: "with_credential", credentials: [tgt.underAllowance ? "signed_mandate" : "human_confirmation"] }, courtesy: this.courtesy("act_refused", tgt, "established", { tool: m.tool }),
        basis: { policy_version: this.profile!.policy.policy_version, input_digest: digestOf({ seat: e?.grantedSeat ?? null, tool: m.tool, amount: money ?? null, spent: String(e?.spent ?? 0n) }), decided_at: this.clock.now() } })];
    }
    e.opsUsed++;
    if (money) e.spent += moneyUnits(money.value);
    return [this.sign({ ...this.hdr(e), type: "act_result", in_reply_to: m.msg_id, seat_id: m.seat_id, tool: m.tool, ok: true, result: { simulated: true, reference: `${m.tool}-${e.opsUsed}`, ...(m.arguments ?? {}) }, rationale: "within seat and limits" })];
  }

  /** v0.2.1 the Gatherings extension (D8): every entrant's owner signed accept_house_rules over this gathering's digest (passkey). */
  private entryConsentOk(e: Enc, m: InvitationRequest): boolean {
    const g = this.profile?.gathering; const card = e.theirCard;
    if (!g || !card) return false;
    const owner = card.owner_binding?.owner_id ?? card.principal.principal_id;
    // v0.2.2 (D7): decision approve, passkey, over this digest, unexpired, with the plain-language summary inside the signature.
    return (m.owner_consents ?? []).some((c) => { if (this.revokedConsents.has(c.payload.consent_id)) return false; const v = verifyConsent(c, { owner_id: owner, representative_id: card.representative_id, now: this.clock.now(), subject_digest: g.payload_digest, action: "accept_house_rules" }); return v.ok && v.approve && c.payload.assurance === "passkey"; });
  }

  /** v0.2.2 the Peer meetings extension: the invitation is signed by one owner (passkey) and accepted by the other (accept_invitation, passkey); it names both representatives and this place. */
  private pairInvitationOk(e: Enc, m: InvitationRequest): boolean {
    const pi = m.peer_invitation; const card = e.theirCard; const place = this.profile?.pair;
    if (!pi || !card || !place) return false;
    const inv = pi.invitation.payload; const now = this.clock.now();
    const owners = [inv.from_owner.principal_id, inv.to_owner.principal_id];
    const theirOwner = card.owner_binding?.owner_id ?? card.principal.principal_id;
    const signedByInviter = verifySigned(pi.invitation, inv.from_owner.principal_id).ok && pi.invitation.signatures.every((x) => !!x.webauthn);
    const acc = verifyConsent(pi.acceptance, { owner_id: inv.to_owner.principal_id, representative_id: pi.acceptance.payload.representative_id, now, subject_digest: pi.invitation.payload_digest, action: "accept_invitation" });
    // v0.2.3 (the Peer meetings extension): single use (one meeting), not revoked, and the acceptance is by the invited owner for an invited representative.
    if (this.usedInvitations.has(inv.invitation_id) || this.revokedConsents.has(pi.acceptance.payload.consent_id)) return false;
    if (!inv.representatives.includes(pi.acceptance.payload.representative_id)) return false;
    if (Date.parse(inv.valid_from) > Date.parse(now) + 300_000) return false;
    return signedByInviter && acc.ok && acc.approve && pi.acceptance.payload.assurance === "passkey"
      && inv.place.place_id === place.place_id && m.encounter_id === place.place_id
      && inv.representatives.includes(card.representative_id) && inv.representatives.includes(this.did)
      && owners.includes(theirOwner) && owners.includes(this.principal.principal_id)
      && Date.parse(inv.expires_at) > Date.parse(now);
  }

  /** v0.2.1 (D10, §6.4): input_digest over the gate-input projection only (policy by version + digest; no prose, no locale). */
  static inputDigest(input: EvalInput): string {
    return digestOf({ ...input, policy: { policy_version: input.policy.policy_version, policy_digest: digestOf(input.policy) } });
  }

  /** A human or principal decides a `considering` request; delivered within the relationship. */
  considerationOutcome(consideration_ref: string, decidedBy: ConsiderationRoute, grantActions: string[], limits?: Limits, validDays = 30, ownerConsents?: Signed<OwnerConsent>[], requireMandate = false): Wire {
    const [relKey, rel] = [...this.relationships.entries()].find(([, r]) => r.encounters.some((x) => x.consideration_ref === consideration_ref))!;
    const enc = rel.encounters.find((x) => x.consideration_ref === consideration_ref)!;
    const e = this.getEnc(enc.encounter_id);
    const approved = { actions: grantActions, limits, valid_until: this.clock.plusDays(validDays) };
    // v0.2.1 §6.8: the outcome states what was approved; it carries no seat. The seat comes in a new encounter citing consideration_ref.
    this.approvals.set(consideration_ref, { ...approved, relKey });
    rel.encounters.push({ encounter_id: e.id, response_msg_id: `${consideration_ref}-outcome`, decision: "grant", outcome: "completed", at: this.clock.now(), consideration_ref });
    const m: ConsiderationOutcome = { ...this.hdr(e), type: "consideration_outcome", consideration_ref, relationship_ref: rel.relationship_ref, in_reply_to: enc.response_msg_id, decided_by: decidedBy, approved, owner_consents: ownerConsents,
      ...(requireMandate ? { decision: "conditional" as const, conditions: [{ code: "require_mandate" as const, params: { actions: grantActions } }] as [Condition, ...Condition[]], retry: { kind: "with_credential" as const, credentials: ["signed_mandate"] } } : { decision: "grant" as const }),
      courtesy: this.courtesy("outcome_grant", e, "established"), basis: { policy_version: this.profile!.policy.policy_version, input_digest: digestOf({ consideration_ref, decidedBy, approved }), decided_at: this.clock.now() } };
    return this.sign(m);
  }
  /** v0.2.1 §6.8: a deadline extension is a new `considering` outcome with the same ref and a later response_by. */
  extendConsideration(consideration_ref: string, extraDays: number): Wire {
    const rel = [...this.relationships.values()].find((r) => r.encounters.some((x) => x.consideration_ref === consideration_ref))!;
    const enc = rel.encounters.find((x) => x.consideration_ref === consideration_ref)!;
    const e = this.getEnc(enc.encounter_id);
    const prior = this.decisions.find((d) => d.response.msg_id === enc.response_msg_id)?.response;
    const route: ConsiderationRoute = prior && prior.decision === "considering" ? prior.routed_to : { kind: "principal", principal_id: this.principal.principal_id };
    const m: ConsiderationOutcome = { ...this.hdr(e), type: "consideration_outcome", consideration_ref, relationship_ref: rel.relationship_ref, in_reply_to: enc.response_msg_id, decided_by: route,
      decision: "considering", routed_to: route, response_by: this.clock.plusDays(extraDays),
      courtesy: this.courtesy("considering_extended", e, "established"), basis: { policy_version: this.profile!.policy.policy_version, input_digest: digestOf({ consideration_ref, extend: extraDays }), decided_at: this.clock.now() } };
    return this.sign(m);
  }

  // ---------- lessons (apprenticeship visit) ----------
  teach(encounter_id: string, lesson: Omit<Lesson, "issued_at">): Wire {
    const e = this.getEnc(encounter_id);
    const sl = signed<Lesson>({ ...lesson, issued_at: this.clock.now() }, [this.principalKey!], this.clock.now());
    return this.sign({ ...this.hdr(e), type: "lesson", seat_id: e.grantedSeat?.seat_id ?? "", lesson: sl });
  }
  adapt?: (l: Lesson) => { text: string; changes: string[] };
  private onLesson(m: Extract<ShokaiMessage, { type: "lesson" }>): Wire[] {
    const e = this.getEnc(m.encounter_id);
    const l = m.lesson.payload;
    const ok = verifySigned(m.lesson, l.provenance.authored_by).ok && l.excludes_private_memory === true && l.consent_refs.length >= 2;
    this.rec.verify(ok, `${this.name} checked the lesson: signed by its author (${short(l.provenance.authored_by)}), both owners' consents attached, private memory excluded.`);
    if (!ok) return [];
    const a = this.adapt ? this.adapt(l) : { text: l.content.text, changes: [] };
    const ad: LessonAdaptation = { lesson_id: l.lesson_id, lesson_digest: m.lesson.payload_digest, adapted: { text: a.text, locale: this.ownerLocale }, changes: a.changes, adopted_at: this.clock.now() };
    this.adaptations.push(ad); e.received.lessons.push(ad);
    for (const n of l.content.meaning_notes ?? []) {
      const lm: LearnedMeaning = { note: n, learned_from: { principal_id: l.teacher.principal_id, artifact_digest: m.lesson.payload_digest }, learned_at: this.clock.now() };
      this.learned.push(lm); e.received.learned.push(lm);
    }
    this.graph.record(l.teacher.principal_id, "taught", this.clock.now(), `lesson: ${l.topic}`, m.lesson.payload_digest, l.teacher.principal_id);
    return [];
  }

  // ---------- visit report home ----------
  visitReport(encounter_id: string, nextStep: { text: string; url?: string }, voice: string): VisitReport {
    const e = this.getEnc(encounter_id);
    const r = e.received.outcome ?? e.received.response;
    const other = e.theirCard?.principal.principal_id;
    return {
      report_id: `vr-${encounter_id}`, representative_id: this.did, owner_id: this.principal.principal_id,
      host: { display_name: e.theirCard?.principal.display_name ?? e.counterpartName, principal_id: other },
      visited_at: this.clock.now(),
      relationship: other ? this.graph.whoIs(other).map((x) => ({ kind: x.kind, standing: x.standing, since: x.since })) : undefined,
      outcome: { decision: (r?.decision ?? "deny") as DecisionBody["decision"], disposition: r && r.decision === "deny" ? (r.disposition as Disposition) : undefined, consideration_ref: r && r.decision === "considering" ? r.consideration_ref : undefined,
        retry: r && (r.decision === "deny" || r.decision === "conditional") ? r.retry : undefined, conditions: r && r.decision === "conditional" ? r.conditions : undefined, response_by: r && r.decision === "considering" ? r.response_by : undefined },
      outcome_rendered: renderOutcome(r, this.ownerLocale, this.ownerTimeZone),
      seat: e.mySeat ? { actions: e.mySeat.tool_allowlist, limits: e.mySeat.limits } : undefined,
      acts: e.acts.length ? e.acts : undefined,
      host_said: e.received.said.map((s) => ({ ...s, untrusted: true as const })),
      readiness_requirements: e.received.response && e.received.response.decision === "deny" ? e.received.response.readiness_requirements : undefined,
      counterpart_strengths: e.weighed.length ? this.strengths(e) : undefined,
      meaning_notes_learned: e.received.learned.length ? e.received.learned.map((l) => ({ ...l, explained_to_human: { text: voice, locale: this.ownerLocale, at: this.clock.now() } })) : undefined,
      next_step: { text: nextStep.text, url: nextStep.url, requires_owner_approval: true, if_no_reply: "nothing_happens" },
      voice: { text: voice, locale: this.ownerLocale }, relationship_ref: e.received.response?.relationship_ref,
      continuity: e.received.decisions.find((d) => d.continuity)?.continuity,
    };
  }
}

/**
 * v0.2.1 (D10, §8.2): the report states the outcome from MACHINE fields only, in the owner's locale and time zone.
 * Host courtesy is quoted separately (host_said, untrusted) and never used here.
 */
const OUTCOME_TEXT: Record<string, Record<string, string>> = {
  "en-US": { grant: "Seated.", grant_seat: "Seated for: {actions}.", considering: "Not decided yet: taken inside to {who}. Answer due by {by}.", conditional: "A conditional yes: {conds}.",
    deny_not_now: "Not now.", deny_not_a_fit: "Not a fit at the moment.", deny_never: "Declined for good.", retry_after: "You may try again after {after}.", retry_with: "To come back, bring: {creds}.", retry_never: "", none: "No answer was received." },
  "ja-JP": { grant: "着席が認められました。", grant_seat: "次の目的で着席が認められました: {actions}。", considering: "未決定です。{who} に判断が委ねられました。回答期限: {by}。", conditional: "条件付きで可: {conds}。",
    deny_not_now: "今はまだ、というお返事です。", deny_not_a_fit: "現時点ではご希望に沿えないとのことです。", deny_never: "お断りされました。", retry_after: "{after} 以降に再訪できます。", retry_with: "再訪には次が必要です: {creds}。", retry_never: "", none: "回答はありませんでした。" },
};
export function renderOutcome(r: InvitationResponse | ConsiderationOutcome | undefined, locale: Locale, timeZone: string): { text: string; locale: Locale } {
  const loc = rfc4647Lookup([locale], Object.keys(OUTCOME_TEXT), "en-US").locale;
  const T = OUTCOME_TEXT[loc];
  const when = (iso: string) => new Intl.DateTimeFormat(loc, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(new Date(iso));
  const fill = (k: string, v: Record<string, string> = {}) => Object.entries(v).reduce((t, [a, b]) => t.split(`{${a}}`).join(b), T[k]);
  const retry = (x: Retry) => x.kind === "after" ? fill("retry_after", { after: when(x.not_before) }) : x.kind === "with_credential" ? fill("retry_with", { creds: x.credentials.join(", ") }) : T.retry_never;
  if (!r) return { text: T.none, locale: loc };
  let text: string;
  switch (r.decision) {
    case "grant": text = r.type === "invitation_response" && r.seat ? fill("grant_seat", { actions: r.seat.tool_allowlist.join(", ") }) : T.grant; break;
    case "considering": text = fill("considering", { who: r.routed_to.kind === "role" ? r.routed_to.role : "principal", by: when(r.response_by) }); break;
    case "conditional": text = [fill("conditional", { conds: r.conditions.map((c) => `${c.code} ${JSON.stringify(c.params)}`).join("; ") }), retry(r.retry)].filter(Boolean).join(" "); break;
    case "deny": text = [T[`deny_${r.disposition}`], retry(r.retry)].filter(Boolean).join(" "); break;
  }
  return { text, locale: loc };
}

export type { CardClaim, ImprintFacet, Vouch, Lesson };
