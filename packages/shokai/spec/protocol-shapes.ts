/**
 * Shōkai — introduce / handoff and seating message shapes.
 * Types only; no runtime deps. Normative semantics: SPEC.md.
 *
 * v0.1 (Oct 24, 2026): adds the encounter ritual, representative cards,
 * mandates, vouches, invitation request/response, and the signature envelope.
 * See SPEC.md. Existing v0 types below are unchanged except for optional
 * fields on SeatGrant and @deprecated notes pointing at invitation vocabulary.
 *
 * v0.2.2 (D11): Allowance and friends (§5.2), PeerInvitation (the Peer meetings extension), OwnerConsent per D7 (§8.1),
 * ConsentRevocation, ToldStory, house_rules.pressing (D5), registered purposes and PlaceCategory.
 *
 * v0.2.3 (S3 round 2): owner_binding.rp_id, optional-but-required possession_proof (missing → not_now),
 * ReadinessRequirement.owner_text + codes possession_proof/owner_consent, InvitationResponse.continuity,
 * ConsiderationOutcome.owner_consents, LobbyBriefing spec_ref/templates/actions, PlaceListingEntry actions/category,
 * AllowanceStatus (stapled or fetched), purpose "gathering", the HTTP binding messages (§11): ReplyEnvelope, InboxPoll,
 * PeerInvitationDelivery/Answer, GatheringInvitation, ConsentRevocationMessage; Farewell "declined_never".
 *
 * v0.2.4 (S3 round 3): `inbox` on PlaceListingEntry / DoorPointer.places / LobbyBriefing; REQUIRED SpecRef (with optional
 * digest) on DoorPointer and listing entries; Signature.webauthn.rp_id (every passkey signature names its relying party);
 * PlaceTemplates.mandates (one skeleton per purpose); PrivacyDecline.press = {count, light_flags, notice_at};
 * PeerInvitation.answer_by; Greeting.reply_to; HeldNotice (`held`). Receivers MUST ignore unknown members; extension
 * members are prefixed `x-` and never carry something a defined field carries (SPEC Conventions).
 *
 * v0.2.5 (S3 round 4): no new types; HeldNotice.answer_by meaning (§11.2). Listing extension members x-test-profile and
 * x-test-decider (Appendix B, B.4) stay `x-` members.
 * v0.2.6 (S3 round 5): no new types. v0.2.7 (S3 exit, S4 bundle): no new types; RitualHeader.msg_id is unique per sender
 * only, and receivers key replay, de-duplication and in_reply_to on (from, msg_id) (§2.2). SpecRef.version "0.2.7".
 *
 * v0.2.8 (red team round 2, 2026-10-26): two optional members, wire tag unchanged: Limits.session_max_amount
 * (session-wide cap of a per_operation seat; default max_amount, §5.1, §7.2) and PlaceAction.creates_account (§4, §3.1).
 *
 * v0.2.9 (the inbound door, D15, 2026-10-26): additive, wire tag unchanged. Purpose codes "presentation" and "gift";
 * DoorPolicy (owner-signed), Offer, ContentFlags, OfferOutcome and the `offer_outcome` message (§10); Vouch.introducer_interest
 * (paid-vs-genuine, §4); MisconductCode "conditional_inducement" (§9.3); IntroducerReview.reviewer_id (P5, §9.3);
 * PlaceListingEntry.door_policy (§10). Older v0.2 receivers that don't keep a door are unaffected.
 *
 * v0.2.10 (P16 Part A and account creation, D16/D17, 2026-10-26): additive, wire tag unchanged. MisconductCode
 * "manipulative_pressure" (§9.3); Offer.campaign_id, Offer.remaining and an optional Offer.context on presentations (§10);
 * PlaceAction.requires_introduction (§4, account creation by introduction or the place's own invitation). SpecRef.version "0.2.10".
 *
 * v0.3.0 (wire tag shokai/0.3). rc3 adds the MCP binding's refusal data (ShokaiMcpRefusal, §11.3) and the listing link
 * rel "mcp-server"; no message shape changes.
 *
 * v0.4.0 (2026-10-29; wire tag shokai/0.3, additive; this file matches specification v0.4.0, so SpecRef.version is "0.4.0"
 * for the current text; the version notes above name the version current when each was written). Two Shōkai cards:
 * RepresentativeCard.kind ("visitor" | "host"), and on a Shōkai host card `place`, `host_scope`, `house_digest` and
 * `org_approval`; `shown_to_owner` and `owner_prompts` on every Shōkai card (§2.3). PlaceListingEntry.house_digest (§3.1).
 * The purchase-only live owner prompt: Act.hold_for_owner, the `act_held` and `act_confirmation` messages and the
 * OwnerConsent action "approve_purchase" (§5.2, §7.3). The institutions track: CustomerLink, Mandate.customer_link,
 * PlaceAction.requires_customer_link (§5.4). Readiness codes card_kind and customer_link; credential customer_link;
 * reason codes LIVE_PROMPT_PURCHASE_ONLY, HOLD_LAPSED and CREDENTIAL_NOT_ACCEPTED.
 *
 * v0.5.0 (2026-11-01, draft; wire tag shokai/0.5, with shokai/0.3 still accepted during the 90-day transition window, §11.1;
 * this file matches specification v0.5.0, so SpecRef.version is "0.5.0").
 * Trust requirements and receipts (§6.9, P27): TrustRequirement, TrustProofRule, GrantCaps, TrustReceipt,
 * TrustReceiptRevocation, PlaceAction.trust / costs_place, InvitationRequest.trust_receipts. The Shōkai introduction card
 * (§4.1, P28): ShokaiIntroduction, IntroductionClaim. The over-limit hold (§5.1, §7.3, P31 §2.9): Mandate.supersedes,
 * ActHeld.over_limit, ActConfirmation.mandate, LimitRequest, LimitNotice. Idempotent repeats (§7.2): Act.idempotency_key,
 * ActConfirmation.idempotency_key. Conduct rules and the house summary (§2.3): ConductRule, HouseSummary,
 * RepresentativeCard.summary_digest. The errand budget (§5.5): ErrandBudget, PlaceAction.effort_hint. Return with care and
 * set up through conversation (§8.3, §8.4): VisitReport.priority / kept, ReturnPrefs, DoorQuestion, DoorAnswer. System 1
 * classifier answers (§6.10): ClassifierAnswer. Reason codes TRUST_REQUIRED and INTRODUCTION_USED_UP; readiness code trust;
 * credential trust_receipt.
 * Spec answers to the builder (2026-11-01): Mandate.shown_to_owner and Mandate.supersedes.hold (the held act, by act digest);
 * Introduction.introduction_card; LobbyBriefing.conduct_rules; ActConfirmation carries exactly one of consent or mandate;
 * HousePolicyV050 names the v0.5.0 policy members (limit_calls, hold_grace_s, repeat_caps, hold_policies, trust_issuers,
 * trust_obtain_url, established_introducers, message_cap, …); HoldPolicies; GrantPeriod is a sliding window.
 */

/** Seating levels: grant admits a representative, not only endpoints. */
export type SeatingLevel =
  | "discover"
  | "advise"
  | "act_on_behalf"
  | "introduce_to_human";

/** How the link was established; representative adapts authority. */
export type AccessMode =
  | "user_delegated"
  | "system"
  | "session"
  | "standing";

export type PresenceBrand = {
  /** Display name, e.g. "Reelhouse specialist" */
  label: string;
  /** True only when vendor warrants the voice (packaging B). */
  vendor_warranted: boolean;
  /** Host-provided coach disclaimer when vendor_warranted is false (packaging C). */
  attribution?: string;
};

export type SeatGrant = {
  seat_id: string;
  levels: SeatingLevel[];
  /** Tool names allowed under this seat (least privilege). */
  tool_allowlist: string[];
  access_mode: AccessMode;
  brand: PresenceBrand;
  /** ISO-8601; revoke / expiry unseats. */
  expires_at?: string;
  /** v0.1: mandate this seat is bound to (acting outside it is a violation). */
  mandate_id?: string;
  /** v0.1: limits copied from policy ∩ mandate, e.g. max amount, rate. */
  limits?: Limits;
};

/**
 * Host or broker proposes seating a domain representative.
 * @deprecated v0.1: use ExtendInvitation (the host extends an invitation).
 */
export type OfferPresence = {
  type: "offer_presence";
  /** Stable product / façade id, e.g. "reelhouse". */
  domain_id: string;
  requested_levels: SeatingLevel[];
  reason: string;
  brand: PresenceBrand;
  access_mode: AccessMode;
  /** Optional correlation with an MCP session. */
  mcp_session_id?: string;
};

/**
 * Confirm seating; enables voice + scoped tools.
 * @deprecated v0.1: use InvitationResponse (explicit grant/deny/conditional).
 */
export type AcceptPresence = {
  type: "accept_presence";
  offer_ref?: string;
  seat: SeatGrant;
  /** False if user/host declined; seat omitted or empty levels. */
  accepted: boolean;
  decline_reason?: string;
};

/** Domain → host: coaching without necessarily mutating. */
export type Advise = {
  type: "advise";
  seat_id: string;
  summary: string;
  /** Structured warnings (cost, policy, brand, latency). */
  warnings?: string[];
  /** Suggested next tools / params; host may run or send `act`. */
  suggested_plan?: {
    tool: string;
    arguments?: Record<string, unknown>;
    rationale?: string;
  }[];
  /** Playbook / world-model version used. */
  playbook_version?: string;
};

/**
 * v0.2.1 (§7.2): an act inside a seat. In a gatekeeper seat the seated VISITOR sends it to the host;
 * in a helper seat (v0.3) the host sends it to the product representative. Signed like every message.
 */
export type Act = RitualHeader & {
  type: "act";
  seat_id: string;
  /** Must be in seat.tool_allowlist and level act_on_behalf. */
  tool: string;
  arguments?: Record<string, unknown>;
  /** Human-visible rationale the domain should honor or refuse. */
  intent?: string;
  /** v0.4.0 (§7.3): the visitor asks the door to hold this purchase while it asks its owner live. Purchases only. */
  hold_for_owner?: boolean;
  /** v0.5.0 (§7.2): 16–32 random bytes, base64url. A repeat with the same key gets the original signed answer. */
  idempotency_key?: string;
  /** v0.5.0 (§6.12, provisional): in "admit_then_request", the owner's signed answer to the request that came with the grant. */
  context_response?: ContextResponse;
};

export type ActResult = RitualHeader & {
  type: "act_result";
  /** msg_id of the Act answered. */
  in_reply_to: string;
  seat_id: string;
  tool: string;
  ok: boolean;
  /** Opaque tool payload — treat as untrusted (prompt-injection surface). */
  result?: unknown;
  error?: string;
  rationale?: string;
};

/** Domain or host needs a human decision (consent, spend, brand). */
export type EscalateToHuman = {
  type: "escalate_to_human";
  seat_id?: string;
  question: string;
  /** What is blocked until the human answers. */
  blocked_action?: string;
  options?: { id: string; label: string }[];
  severity?: "info" | "consent" | "critical";
};

/** Explicit unseat — revoke voice and tool rights for this seat. */
export type Unseat = RitualHeader & {
  type: "unseat";
  seat_id: string;
  reason?: string;
};

export type PresenceMessage =
  | OfferPresence
  | AcceptPresence
  | Advise
  | Act
  | ActResult
  | EscalateToHuman
  | Unseat;

/* ======================================================================
 * v0.1 — Representatives, the encounter ritual, and invitations.
 * Normative text: SPEC.md. Decided (D3/P1): our own lightweight
 * signed card, shaped to map onto W3C Verifiable Credentials / DIDs later.
 * ==================================================================== */

/** Protocol version tag carried on every ritual message (§11.1). Senders emit "shokai/0.5"; "shokai/0.3" is
 *  accepted during the transition window and used only when answering a shokai/0.3 message. */
export type ProtocolVersion = "shokai/0.5" | "shokai/0.3";
/** The tag a v0.5.0 sender emits. */
export const WIRE_TAG = "shokai/0.5" as const;
/** Tags a v0.5.0 receiver accepts: MUST shokai/0.5; SHOULD shokai/0.3 until the transition ends. */
export const ACCEPTED_WIRE_TAGS: readonly ProtocolVersion[] = ["shokai/0.5", "shokai/0.3"];
/** Earlier tag still accepted during the transition window (§11.1). */
export const LEGACY_WIRE_TAG = "shokai/0.3" as const;
/** Days after the v0.5.0 release during which receivers SHOULD accept LEGACY_WIRE_TAG. */
export const WIRE_TAG_TRANSITION_DAYS = 90;

/** ISO-8601 timestamp. */
export type Timestamp = string;

/** BCP 47 language tag, e.g. "en-US", "ja-JP". */
export type Locale = string;

/** Content digest: "sha-256:" + base64url (no padding) of SHA-256 over the UTF-8 bytes of the RFC 8785 (JCS) form. */
export type Digest = string;

/**
 * v0.2.1 (D10, §5.1): a money amount. `value` MUST match ^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$ (ASCII digits,
 * "." as decimal separator, no grouping, no sign, no exponent). `currency` MUST be an ISO 4217 alphabetic code.
 */
export type Money = { value: string; currency: string };

/** v0.2.1 (§2.2): what travels on the wire. Lobby-path visitor messages carry `signatures: []`. */
export type WireMessage = Signed<ShokaiMessage>;

// ---------- Signature envelope ----------

export type Signature = {
  alg: "Ed25519" | "ES256";
  /** Key id; MUST resolve to a key bound to `signer`. */
  key_id: string;
  /** Principal, representative or introducer id that signed. */
  signer: string;
  signed_at: Timestamp;
  /**
   * v0.2.1 (§2.1): Ed25519 → base64url (no padding) of the signature over the 32 RAW digest bytes
   * (not the "sha-256:…" string). ES256 passkey → base64url of the DER ECDSA signature the authenticator
   * returned over authenticatorData ‖ SHA-256(clientDataJSON).
   */
  value: string;
  /**
   * Owner passkey assertions (Appendix A.1, normative in v0.2.1). clientDataJSON.type = "webauthn.get";
   * clientDataJSON.challenge = base64url(raw 32-byte digest) WITHOUT the "sha-256:" prefix.
   */
  webauthn?: {
    authenticator_data: string;
    client_data_json: string;
    credential_id: string;
    /**
     * v0.2.4 (§2.1, A.1): REQUIRED. The relying-party id the assertion was made for. It is bound by the signed
     * authenticatorData (rpIdHash = SHA-256(rp_id)), so it can't be swapped; when the owner's card is known, it MUST equal
     * the card's owner_binding.rp_id. Lets a verifier check a passkey signature from an owner whose card it hasn't seen.
     */
    rp_id: string;
    /**
     * v0.3.0-rc4 (A.1): present only when one passkey tap approved several items. The digests of every item the signing page
     * showed, in order (2 to 16, distinct); the assertion's challenge is digest(JCS({"batch": batch})) and `batch_index` names
     * this item. The item's own payload_digest MUST equal batch[batch_index].
     */
    batch?: Digest[];
    batch_index?: number;
  };
};

/** v0.2.4 (§3.1, §11): which protocol text a place follows. `digest` = "sha-256:" + base64url of SHA-256 over SPEC.md's bytes. */
export type SpecRef = { version: string; url: string; digest?: Digest };

/** Generic signed wrapper. Verifiers recompute the digest; never trust it as sent. */
export type Signed<T> = {
  payload: T;
  payload_digest: Digest;
  signatures: Signature[];
};

// ---------- Principal ----------

export type PrincipalKind = "person" | "brand" | "company" | "system";

/** The party a representative stands for and whose reputation it carries. */
export type Principal = {
  /** v0.2.1 (§2.1): a DID. did:key (Ed25519) or did:jwk (P-256 passkey) now; did:web for organizations. */
  principal_id: string;
  kind: PrincipalKind;
  display_name: string;
  /** Public keys the principal signs cards and mandates with. */
  keys: { key_id: string; alg: Signature["alg"]; public_key: string }[];
};

// ---------- Representative card (meishi) ----------

/**
 * Principal-asserted standing. A gatekeeper MAY ignore it; its own local
 * reputation record is authoritative for its decisions (v0.1, provisional).
 */
export type Standing = {
  tier: "provisional" | "standard" | "senior" | "principal";
  /** Since when the representative has held this standing. */
  since?: Timestamp;
};

/**
 * v0.5.0 (Conventions, C289): must-understand members. Any signed payload MAY carry `crit`: a non-empty array of distinct member
 * names (dotted paths for nested members, e.g. "supersedes.hold"), each naming a member the payload carries. A receiver that
 * doesn't implement one refuses the whole artefact (deny / not_now / UNSUPPORTED_CRITICAL). Members not in `crit` stay ignorable.
 */
export type MustUnderstand = { crit?: string[] };

export type RepresentativeCard = MustUnderstand & {
  card_id: string;
  protocol: ProtocolVersion;
  representative_id: string;
  principal: Pick<Principal, "principal_id" | "kind" | "display_name">;
  /** Human-meaningful role, e.g. "Payroll operations representative". */
  role: string;
  standing: Standing;
  /** Outer bound of what any mandate under this card may authorize. */
  mandate_scope: {
    purposes: PurposeCode[];
    actions: string[];
  };
  /** Languages the representative can converse in (preference order). */
  locales: Locale[];
  /** Declared cultural / etiquette preferences; the counterpart adapts to these. */
  etiquette?: EtiquettePreferences;
  /** Representative's own key, used for proof of possession. */
  /**
   * v0.2.1 (§2.1): key_id MUST be a DID URL whose DID equals representative_id; public_key is base64url (no padding)
   * of the raw 32-byte Ed25519 key, or the representative's did:key. It MUST equal the key representative_id resolves to.
   */
  representative_key: { key_id: string; alg: Signature["alg"]; public_key: string };
  issued_at: Timestamp;
  expires_at: Timestamp;
  /**
   * v0.3.0-rc4 (§2.6, C191): where the principal publishes revocations of its cards (an https URL; loopback http only in a
   * conformance run, Appendix B.1). GET answers a JSON array of Signed<CardRevocation> ([] when nothing is revoked).
   * When present, a door MUST check it before seating (fail closed: unreachable = setup failure, not_now / after).
   */
  revocation_url?: string;
  /** How this representative was designed (phase 0). Evidence, not a score. */
  provenance?: CardProvenance;
  /** Digest of the principal's current OfferingProfile, if published. */
  offering_digest?: Digest;
  /** Backed-up claims; counterparts weigh each by its EFFECTIVE proof level. */
  claims?: CardClaim[];
  /** How the principal's expertise, worldview, style and taste shape this representative. */
  imprint?: PrincipalImprint;
  /**
   * v0.4.0 (§2.3): which Shōkai card this is. "visitor": the Shōkai visitor card, presented by a visiting representative.
   * "host": the Shōkai host card, presented by a place's host representative (the gatekeeper) and bound to one place (`place`).
   * SHOULD be stated on every card (§2.3). A card without it (issued under v0.3.0) MUST be read as a Shōkai visitor card when a
   * visiting representative presents it and as a Shōkai host card when a host representative presents it.
   */
  kind?: CardKind;
  /** v0.4.0 (§2.3): REQUIRED on a host card, absent on a visitor card. The one place this host card serves. */
  place?: PlaceBinding;
  /** v0.4.0 (§2.3): REQUIRED on a host card. What the host representative may do for its place's owner. */
  host_scope?: HostScope;
  /**
   * v0.4.0 (§2.3): REQUIRED on a host card. The fingerprint of the house config the owner approved: digest(JCS(house config)),
   * where the house config is the place's policy and listing details (§3.1). Any change to the house config needs a new card.
   */
  house_digest?: Digest;
  /**
   * v0.5.0 (§2.3, C248): REQUIRED on a Shōkai host card whose house config has policy.summary: the digest of the JCS bytes of
   * that summary, so the summary can be checked with the Shōkai host card alone. A door whose house config has policy.summary
   * and whose host card lacks it MUST refuse to start.
   */
  summary_digest?: Digest;
  /**
   * v0.5.0 (§7.6, from P32 §7): on a Shōkai host card signed for an amended setup: its version, the house digest of the setup it
   * replaces, and what changed. A visitor that saw the earlier card can check the chain; the house config says the same.
   */
  setup?: { version: number; prev_house_digest: Digest; changes: SetupChangeRef[] };
  /**
   * v0.4.0 (§2.3): REQUIRED on a host card whose principal is an organization (kind other than "person"): the record of which
   * person approved this card for the organization. The card is still signed by the organization's own key.
   */
  org_approval?: OrgApproval;
  /** v0.4.0 (§2.3, §8.1): REQUIRED on a host card. The plain-language recap the owner read right before signing, inside the signature. */
  shown_to_owner?: { text: string; locale: Locale };
  /**
   * v0.4.0 (§5.2): on a visitor card, whether its representative may ask its owner live, during a visit, to approve a purchase
   * ("purchase_only"), or never asks live ("never", the default when absent). Disclosed in `shown_to_owner`.
   */
  owner_prompts?: "purchase_only" | "never";
  /** v0.5.0 (§0.1, RR-14): on a Shōkai host card, the place preset it claims (conformance/classes.json "presets"). Information only. */
  preset?: "browse" | "shop" | "booking" | "members";
  /** Owner binding: card and mandate are signed with the owner's passkey. */
  owner_binding?: {
    method: "passkey_webauthn";
    owner_id: string;
    /** v0.2.2 (D7, §8.1): the chat binding's platform key (a DID); it alone signs `chat_reply` consents. */
    platform_key?: string;
    /**
     * v0.2.3 (§A.1): REQUIRED. The WebAuthn relying party the owner's passkey is registered with. Every owner passkey
     * assertion (card, mandate, allowance, consents) is verified against SHA-256(rp_id) and origin "https://" + rp_id.
     */
    rp_id: string;
  };
};

// ---------- Claims, proof levels and the principal imprint ----------

/**
 * self_declared: the owner states it. evidenced: links to proof (site, post, work).
 * vouched: a third party signed for it. verified: checked cryptographically
 * (e.g. did:web domain control). A receiver computes the EFFECTIVE level itself
 * and MUST downgrade any level it cannot confirm.
 */
export type ProofLevel = "self_declared" | "evidenced" | "vouched" | "verified";

export type EvidenceRef = {
  kind: "url" | "post" | "work" | "vouch" | "did_web" | "account_control";
  ref: string;
  /** v0.2.1 (§2.5): digest of the referenced content. `evidenced` counts only after the receiver fetched it and the digest matched. */
  content_digest?: Digest;
};

export type CardClaim = {
  claim_id: string;
  /** What the claim is about, e.g. "identity", "domain", "expertise", "values". */
  area: string;
  text: { text: string; locale: Locale };
  proof_level: ProofLevel;
  evidence_refs: EvidenceRef[];
};

/** One imprint facet: like a claim, it carries a proof level and evidence. */
export type ImprintFacet = {
  facet_id: string;
  text: { text: string; locale: Locale; meaning_notes?: MeaningNote[] };
  proof_level: ProofLevel;
  evidence_refs: EvidenceRef[];
};

/** The principal's imprint: why this representative is strong at what it does. */
export type PrincipalImprint = {
  expertise: ImprintFacet[];
  worldview: ImprintFacet[];
  working_style: ImprintFacet[];
  taste: ImprintFacet[];
};

// ---------- Relationship graph (earned, never imported) ----------

export type RelationshipEdgeKind =
  | "friend"
  | "introduced"
  | "vouched_for"
  | "visited"
  | "collaborated"
  | "taught";

/**
 * An edge between two principals, earned through the protocol (introductions,
 * vouches, visits, collaborations) or mutually attested by both owners.
 * Never imported from a social network. Kept locally by each side.
 */
export type RelationshipEdge = {
  edge_id: string;
  from: string;
  to: string;
  kind: RelationshipEdgeKind;
  since: Timestamp;
  standing: "new" | "good" | "strong" | "strained" | "broken";
  /** Events that earned or changed the edge, with references to signed artifacts. */
  history: { at: Timestamp; event: string; ref?: string }[];
  /** Signatures attesting the edge (both owners for "friend"). */
  attestations?: Signature[];
};
/** Areas a design covers; notes are short, principal-approved summaries. */
export type DesignCoverageArea =
  | "purpose"
  | "mandate"
  | "boundaries"
  | "norms"
  | "seeking"
  | "offering";

/**
 * Phase 0 provenance, asserted by the principal (signed with the card).
 * The protocol defines no quality score; gatekeepers MAY weigh it as evidence.
 */
export type CardProvenance = {
  /** Steward / onboarding guide (protocol agent) that helped, if any. */
  designed_with?: { steward_id: string; display_name?: string };
  design_started_at: Timestamp;
  last_reviewed_at: Timestamp;
  /** Number of design conversations with the principal. */
  sessions_count: number;
  coverage: Partial<
    Record<DesignCoverageArea, { text: string; locale: Locale; meaning_notes?: MeaningNote[] }>
  >;
  /** Observation period: the steward watched real decisions alongside the principal. */
  observation?: { started_at: Timestamp; ended_at: Timestamp; decisions_observed: number };
};

/** A card is only meaningful signed by its principal. */
export type SignedCard = Signed<RepresentativeCard>;

/** v0.4.0 (§2.3): the two Shōkai cards. */
export type CardKind = "visitor" | "host";
/** v0.4.0 (§2.3): the place a Shōkai host card serves: the place's principal and its listing entry address. */
export type PlaceBinding = { principal_id: string; entry: string; listing_digest?: Digest;
  /**
   * v0.5.0 (§3.1.1, site binding; from P26 amendment A): the origin of the website this place belongs to, in its serialized form
   * (e.g. "https://lanternmoss.example": scheme, lowercase ASCII host, a port only when it isn't the default; no path). Inside the
   * owner's signature. A visitor calls the door "the door of <site>" only when that site's own /.well-known/shokai lists this entry.
   */
  site?: string };
/** v0.4.0 (§2.3): the duties a host representative may carry out for its place's owner. */
export type HostDuty = "seat" | "issue_passes" | "visit_stamps" | "receipts" | "consider" | "extend_invitation" | "misconduct_notices" | "hold_purchases"
  /** v0.5.0 (§7.5, from P32): take a question outside the setup to the owner and bring back the owner's signed answer. */
  | "owner_questions"
  /** v0.5.0 (§7.4): make, change and cancel reservations, and sign a BookingConfirmation for each. */
  | "bookings";
/** v0.4.0 (§2.3): what a Shōkai host card lets its host representative do: the place actions it serves, and its duties. */
export type HostScope = { actions: string[]; duties: HostDuty[] };
/** v0.4.0 (§2.3): who approved an organization's host card. `approver_id` is the person's own DID when they have one. */
export type OrgApproval = { approver: { name: string; role: string; approver_id?: string }; approved_at: Timestamp; record_ref?: string };

// ---------- Mandate ----------

/** Language-neutral purpose codes; extend per domain with a "x-" prefix. */
export type PurposeCode =
  | "inquiry"
  | "account_servicing"
  | "payment_initiation"
  | "data_access"
  | "creative_assist"
  | "support"
  /** Apprenticeship visit: one representative teaches another (both owners consent). */
  | "teaching"
  /** Peer exploration of a joint project. */
  | "collaboration"
  /** v0.2.2 (D11, §5.1): an owner-to-owner invitation to meet (seeds a pair place, the Peer meetings extension). Needs no spending allowance. */
  | "invitation"
  /** v0.2.2: making or receiving an introduction to a third party. Needs no spending allowance. */
  | "introduction"
  /** v0.2.2: a learn / browse visit: look, ask, compare. Never spends; needs no spending allowance. */
  | "visitation"
  /** v0.2.2: buying. Requires a spending allowance (Money per period). */
  | "purchase"
  /** v0.2.3: attending a gathering (entry needs the owner's accept_house_rules consent, not a spending allowance). */
  | "gathering"
  /** v0.2.9 (§10): a brand's representative presents one item, or invites the owner to look at something, at a person's inbound door. Never spends. */
  | "presentation"
  /** v0.2.9 (§10): a brand's representative offers one gift at a person's inbound door (claimed by ticket, never for data). Never spends. */
  | "gift"
  /**
   * v0.5.0 (§7.4, reservations): booking a time at a place (a table, a room, an appointment) through `reservation.make`,
   * `reservation.change` and `reservation.cancel`. The mandate MUST carry `limits.booking` (the window and the party size the
   * owner allowed); it carries `max_amount` only when the place takes a deposit.
   */
  | "reservation"
  | `x-${string}`;

/** v0.2.2 (D11, §5.1): purposes that MUST NOT require a spending allowance; a mandate for one of them carries no max_amount. v0.2.3: "gathering" (attending a gathering) is also non-spending. */
export type NonSpendingPurpose = "invitation" | "introduction" | "visitation" | "gathering" | "presentation" | "gift";

/** v0.2.2 (D11, §5.2): coarse, language-neutral kinds of place an allowance can name. */
export type PlaceCategory =
  | "store" | "bank" | "restaurant" | "travel" | "public_service" | "education" | "gathering" | "pair" | "peer"
  | `x-${string}`;

export type Limits = {
  max_amount?: Money;
  /** v0.2.1 (§7.2): "per_seat" (default) caps the total over the seat's life; "per_operation" caps each act.
   *  v0.2.8 (§7.2, P10): "per_operation" is an explicit opt-in and never lifts the session-wide cap: the total over the whole seat
   *  (one visit, across every payment_ref) is still capped by `session_max_amount`, which defaults to `max_amount`. */
  max_amount_scope?: "per_seat" | "per_operation";
  /** v0.2.8 (§7.2, P10): session-wide spend cap for a `per_operation` seat. Absent = `max_amount` (the default). Ignored under per_seat. */
  session_max_amount?: Money;
  max_operations?: number;
  rate_per_hour?: number;
  data_classes?: string[];
  /** Max session duration in seconds. */
  max_session_s?: number;
  /** v0.5.0 (§7.4): what a reservation may book. REQUIRED on a mandate for purpose "reservation"; checked by code at every reservation act. */
  booking?: BookingLimits;
};
/**
 * v0.5.0 (§7.4): the window and party size an owner allowed for a reservation. `window_start` and `window_end` are instants
 * (RFC 3339 with an offset); a booking's start MUST fall inside them (how long it lasts is the place's to say). `time_zone` is the IANA zone
 * the owner meant ("Thursday lunchtime" in Lisbon), for display; the check uses the instants.
 */
export type BookingLimits = { window_start: Timestamp; window_end: Timestamp; time_zone?: string; party_size_max: number };

export type Mandate = MustUnderstand & {
  mandate_id: string;
  principal_id: string;
  representative_id: string;
  /** Card the mandate was issued under; scope MUST be within card.mandate_scope. */
  card_id: string;
  purpose: { code: PurposeCode; statement: string; locale: Locale; meaning_notes?: MeaningNote[] };
  allowed_actions: string[];
  limits: Limits;
  /** Optional counterparty restriction, e.g. only ExampleBank. */
  counterparties?: string[];
  valid_from: Timestamp;
  expires_at: Timestamp;
  /**
   * v0.2.2 (D11, §5.2): set when the representative issued this mandate itself, inside a standing owner Allowance.
   * Such a mandate is signed by the REPRESENTATIVE's key and is valid only with the matching AllowancePresentation.
   */
  under_allowance?: { allowance_id: string; allowance_digest: Digest; grant_digest: Digest };
  /** v0.4.0 (§5.4): the customer link this errand is under, at an institution. The owner's signature ties the errand to the link. */
  customer_link?: { link_id: string; link_digest: Digest };
  /**
   * v0.5.0 (§5.1, §7.3): the mandate this one replaces for the same errand, to raise a limit. Counted as one ledger.
   * `hold` is REQUIRED when the mandate answers an over-limit hold: the hold's id and the held act's payload_digest (as
   * `act_held` stated it), so the owner's signature releases that one act and no other.
   */
  supersedes?: { mandate_id: string; mandate_digest: Digest; hold?: { hold_id: string; act_digest: Digest } };
  /** v0.5.0 (§5.1): the plain-language summary the owner read before signing, inside the signature. REQUIRED on a superseding mandate. */
  shown_to_owner?: { text: string; locale: Locale };
};

/**
 * Signed by the principal named in `principal_id` (a direct mandate), or, when `under_allowance` is set,
 * by the representative (v0.2.2, §5.2), backed by the owner-signed Allowance it presents alongside.
 */
export type SignedMandate = Signed<Mandate>;

// ---------- Allowance (v0.2.2, D11) ----------

/** v0.2.2 (§5.2): a spending budget per period. Absent on a grant = no spending (D11). */
export type SpendBudget = {
  /** Total the representative may spend in one period, across all places. */
  per_period: Money;
  /**
   * ISO 8601 duration. v0.2.3: periods are CONSECUTIVE windows anchored at allowance.valid_from (UTC): window k starts at
   * valid_from + k·period (P1M adds calendar months, clamped to the month's last day). Spend counts in the window of the act.
   */
  period: "P1D" | "P7D" | "P1M";
  /** Optional cap for one seat; defaults to per_period. */
  per_seat?: Money;
};

/** v0.2.2 (§5.2): one line of an allowance. Disclosed to a host only when used there (selective disclosure by digest). */
export type AllowanceGrant = {
  grant_id: string;
  /** Random, at least 128 bits, base64url; makes the grant digest unguessable. */
  salt: string;
  purposes: PurposeCode[];
  place_categories: PlaceCategory[];
  actions: string[];
  /** Absent = no spending under this grant (D11). */
  spend?: SpendBudget;
  /** Optional named counterparties (principal ids); absent = any place in the categories. */
  counterparties?: string[];
  /** Optional plain-language note from the owner (informative, never gate input). */
  note?: { text: string; locale: Locale };
};

/**
 * v0.2.2 (D11, §5.2): a STANDING allowance the owner signs once with a passkey. Inside it, the representative acts
 * without contacting the owner (it issues its own per-encounter Mandates, `under_allowance`). Outside it, the
 * representative takes the matter home: considering / not_now and an async owner decision; silence = no.
 */
export type Allowance = MustUnderstand & {
  allowance_id: string;
  owner_id: string;
  representative_id: string;
  card_id: string;
  /** Digests of each AllowanceGrant (digest(JCS(grant))). The grants themselves stay with the representative. */
  grant_digests: Digest[];
  /** The plain-language summary the owner saw and signed (D7 shown_to_owner). */
  shown_to_owner: { text: string; locale: Locale };
  valid_from: Timestamp;
  expires_at: Timestamp;
  /** Where hosts check for an AllowanceRevocation (fail closed when unreachable). */
  revocation_status: string;
};
export type SignedAllowance = Signed<Allowance>;

/** v0.2.2: the owner revokes an allowance at any time; it takes effect for every mandate issued under it. */
export type AllowanceRevocation = { allowance_id: string; owner_id: string; revoked_at: Timestamp };

/** v0.2.2: what a visitor presents with a mandate issued under an allowance: the signed allowance and ONE grant. */
export type AllowancePresentation = { allowance: SignedAllowance; grant: AllowanceGrant };

/**
 * v0.2.3 (§5.2, the Revocation status extension): what the issuer publishes at `allowance.revocation_status` (HTTPS GET, application/json).
 * Signed by the owner binding's platform key (card.owner_binding.platform_key) so it can be refreshed without an owner
 * prompt; a revocation additionally carries the owner's own signed AllowanceRevocation. Fresh = now < next_update and
 * next_update - issued_at <= 1 h (D12, v0.2.4; was 24 h in v0.2.3). A host that has no fresh, valid status (stapled or fetched) MUST fail closed.
 */
export type AllowanceStatus = {
  allowance_id: string;
  allowance_digest: Digest;
  status: "active" | "revoked";
  revocation?: Signed<AllowanceRevocation>;
  issued_at: Timestamp;
  next_update: Timestamp;
};

// ---------- Vouch (introduction) ----------

export type Vouch = {
  vouch_id: string;
  introducer: Pick<Principal, "principal_id" | "display_name">;
  subject: { representative_id: string; card_digest: Digest };
  /** What the introducer vouches for; outside this the vouch carries no weight. */
  /**
   * v0.2.1 (§2.5): `claims` lists the claim_ids / facet_ids this vouch raises to `vouched`. Without it, a vouch raises
   * only claims and facets whose evidence_refs name this vouch_id.
   */
  scope: { purposes: PurposeCode[]; counterparties?: string[]; claims?: string[] };
  /** v0.2.1 (§4): where this vouch's revocations are published (the introducer's append-only log). */
  revocation_log: string;
  /** Nature of the relationship, e.g. "client_of_record". */
  relationship: string;
  /** If the introducer was itself introduced for this scope: the upstream vouch (forms the chain). */
  upstream_vouch_id?: string;
  /**
   * v0.2.9 (§4, §10): paid-vs-genuine. What the introducer gets for this introduction. REQUIRED on a vouch whose scope
   * includes "presentation" or "gift" (a brand introduction); without it the vouch carries no weight at an inbound door.
   */
  introducer_interest?: IntroducerInterest;
  issued_at: Timestamp;
  expires_at: Timestamp;
};

/** v0.2.9 (§4): "none" = a genuine recommendation; anything else is a benefit the introducer gets and MUST be shown to the receiving owner. */
export type IntroducerInterest = "none" | "discount" | "affiliate" | "sponsored" | "gift_received";

/** MUST be signed by the introducer; it stakes the introducer's reputation. */
export type SignedVouch = Signed<Vouch>;

// ---------- Etiquette, language and courtesy ----------

export type EtiquetteRegister = "first_meeting" | "established" | "adversarial";

/**
 * Declared manner preferences (on a card or host profile). The ritual ORDER is
 * universal; the MANNER adapts to these. No culture is mandated by the protocol.
 */
export type EtiquettePreferences = {
  locales: Locale[];
  /** v0.2.1 (D10, §6.6): IANA time zone used to render dates in courtesy, e.g. "Asia/Tokyo". */
  time_zone?: string;
  formality: "formal" | "neutral" | "casual";
  /** Free-form norm tags, e.g. "honorifics", "brief_greetings", "no_small_talk". */
  norms?: string[];
  /** Meanings of norm terms that don't translate (e.g. a term kept in its original language). */
  meaning_notes?: MeaningNote[];
};

/** Rendered manner. Never an input to control flow. */
export type Courtesy = {
  /** Locale actually used: the RFC 4647 lookup result against the counterpart's locales (§6.6). */
  locale: Locale;
  /** v0.2.1 (D10, §6.6): whether the lookup matched exactly, by truncation, or fell back. */
  locale_match?: "exact" | "fallback" | "none";
  register: EtiquetteRegister;
  text: string;
  /** Untranslatable terms kept in the original inside `text`. */
  meaning_notes?: MeaningNote[];
};

// ---------- Meaning across languages ----------

/**
 * The intended meaning of a term, so meaning travels even when words don't.
 * Authoritative meaning = intended_meaning + machine fields, never a translated string.
 */
export type MeaningNote = {
  /** The term exactly as written, kept in the original, e.g. "おもてなし", "saudade". */
  term: string;
  source_locale: Locale;
  /** Word-for-word gloss; known to be incomplete. */
  literal_gloss?: { text: string; locale: Locale };
  /**
   * Plain, idiom-free description of what is meant. The first entry is the
   * author's own (principal or steward) and is authoritative; later entries are aids.
   */
  intended_meaning: [{ text: string; locale: Locale }, ...{ text: string; locale: Locale }[]];
  /** Optional machine-readable concept tags, e.g. ["anticipatory_service"]. */
  concept_tags?: string[];
  /** Where and how the term applies here. */
  usage_context: { text: string; locale: Locale };
  /** How a receiver should explain it to its human. */
  human_explanation_hint: { text: string; locale: Locale };
  /** 0..1, with who set it. */
  confidence: { value: number; source: "principal" | "steward" | "receiver_inferred" };
};

/** A meaning note learned into a receiver's local relationship memory. */
export type LearnedMeaning = {
  note: MeaningNote;
  learned_from: { principal_id: string; artifact_digest: Digest };
  learned_at: Timestamp;
  /** The receiver's own explanation, as given to its human. */
  explained_to_human?: { text: string; locale: Locale; at: Timestamp };
};

// ---------- The encounter ritual ----------

/** Ordered steps. Out-of-order or skipped steps are grounds for decline. */
export type RitualStep =
  | "greeting"
  | "card_exchange"
  | "introduction"
  | "statement_of_purpose"
  | "invitation_response"
  | "seating"
  | "farewell";

export type RitualHeader = {
  protocol: ProtocolVersion;
  encounter_id: string;
  msg_id: string;
  sent_at: Timestamp;
  /** Representative id of the sender. */
  from: string;
  /**
   * The recipient's representative id (§2.2). Under shokai/0.5 every message a visitor sends after its greeting MUST carry it
   * (C292). Only a greeting may arrive without it (§2.2, "`to` on arrival"; see Greeting).
   */
  to: string;
  /** The `msg_id` of the message this one answers (§2.2: keyed on (from, msg_id)). Required where a message type says so. */
  in_reply_to?: string;
};

/** Step 1. Both parties greet; each greeting carries a fresh nonce. */
export type Greeting = Omit<RitualHeader, "to"> & {
  /** §2.2 (C48): a place MUST NOT refuse a greeting because `to` is absent or names its principal (a first visitor may know neither). */
  to?: string;
  type: "greeting";
  /** Preferred languages, in order. Courtesy is rendered in the counterpart's. */
  locales: Locale[];
  proposed_register?: EtiquetteRegister;
  /** Manner preferences for this encounter (overrides the card's if both given). */
  etiquette?: EtiquettePreferences;
  /** Responder MAY point to its current Seeking declaration (id + digest). */
  seeking_ref?: { seeking_id: string; digest: Digest };
  /** v0.2.2 (§5.2): a gatekeeper SHOULD state its place category, so a visitor can match its allowance. */
  place_category?: PlaceCategory;
  /** Fresh, single use; the counterpart's possession proof signs it. */
  nonce: string;
  courtesy?: Courtesy;
  /**
   * v0.2.1 (§9.1): an unprepared visitor MAY send an ephemeral did:key. The host then binds the lobby's
   * visit_receipt to it, and the return request MUST carry a continuity_proof by that key.
   */
  continuity_key?: string;
  /**
   * v0.2.4 (§11.2): where late messages for this sender MAY be pushed (its own entry URL). Absent = the place holds them
   * for its inbox. Polling MUST always work.
   */
  reply_to?: string;
};

/** Step 2a. Present one's card, deliberately, with proof of possession. */
export type CardPresentation = RitualHeader & {
  type: "card_presentation";
  card: SignedCard;
  /**
   * Signature by card.representative_key over (encounter_id, counterpart nonce). REQUIRED (§2.4).
   * v0.2.3: a MISSING or MALFORMED proof is answered not_now naming `possession_proof`; only a present, well-formed
   * proof that fails verification is a trust violation (never).
   */
  /** v0.5.0 (§2.4, C292, review 3 R3-01): under shokai/0.5 the proof also names, and is signed over, its `audience`. */
  possession_proof?: Signature & { audience?: string };
};

/** Step 2b. Receive the counterpart's card. Acknowledges receipt, not acceptance. */
export type CardReceipt = RitualHeader & {
  type: "card_receipt";
  card_digest: Digest;
  /**
   * v0.5.0 (§4.1, C272, provisional): a fresh, single-use challenge for a Shōkai introduction claim in this encounter, sent by a
   * door on shokai/0.5. `challenge` is at least 128 random bits (base64url); it expires at `expires_at`, at most 5 minutes on.
   */
  claim_challenge?: { challenge: string; expires_at: Timestamp };
  courtesy?: Courtesy;
};

/** Step 3. Mandatory step; the vouch is optional (`vouch: null` = self-introduced). v0.2.3: in a pair place BOTH sides MUST send one. */
export type Introduction = RitualHeader & {
  type: "introduction";
  vouch: SignedVouch | null;
  /** v0.2.2 (the Peer meetings extension): in a pair place, the owner-to-owner invitation that seeded the meeting (it is the introduction). */
  invitation_ref?: { invitation_id: string; digest: Digest };
  /**
   * v0.5.0 (§4.1): a claimed Shōkai introduction card, with `vouch: null`. Counts exactly as a vouch from its introducer.
   * Not read under shokai/0.3 (§11.1).
   */
  introduction_card?: { card: Signed<ShokaiIntroduction>; claim: Signed<IntroductionClaim> };
};

/** A structured opportunity. Prose fields never enter the gate function. */
export type Proposal = {
  /** The concrete ask; MUST be within the mandate. */
  request: {
    actions: string[];
    limits?: Limits;
    data_classes?: string[];
  };
  /** Value to the other side (prose, rendered; may shape terms only). */
  value_to_counterparty: { text: string; locale: Locale };
  /** Proposed terms, e.g. session length, reporting, human confirmation. */
  terms?: Record<string, string | number | boolean>;
  /** References to supporting signed artifacts (digests or URLs). */
  evidence?: { kind: string; ref: string }[];
  /** Offer-to-need match: which published Seeking items this proposal addresses. */
  addresses_seeking?: { seeking_id: string; item_ids: string[] }[];
  /** Which of the visitor's own Offering items it brings to that match. */
  from_offering?: { offering_id: string; item_ids: string[] };
  etiquette_register: EtiquetteRegister;
};

/**
 * Step 4. Statement of purpose: request an invitation. Binds the card and
 * vouch exchanged earlier by digest, so the decision input is self-contained.
 */
export type InvitationRequest = RitualHeader & {
  type: "invitation_request";
  card_digest: Digest;
  vouch_digest?: Digest;
  mandate: SignedMandate;
  /** v0.5.0 (§6.9): receipts presented with the Shōkai visitor card, bound by their digests. */
  trust_receipts?: Signed<TrustReceipt>[];
  /**
   * v0.5.0 (§6.9, C244): MUST be present and equal to the digests of `trust_receipts` whenever `trust_receipts` is present;
   * a missing or mismatched digest is REQUEST_INCOMPLETE.
   */
  trust_receipt_digests?: Digest[];
  /**
   * v0.5.0 (§4.1, C245): a claimed Shōkai introduction card, bound like vouch_digest. Both digests MUST be present when the
   * Introduction carried `introduction_card`; a missing or mismatched digest is REQUEST_INCOMPLETE.
   */
  introduction_card_digest?: Digest;
  introduction_claim_digest?: Digest;
  /**
   * v0.5.0 (§6.12, provisional): the visitor's owner's signed answer to a context request this place sent ("before entry"), on a
   * retry after `not_now` / `CREDENTIAL_REQUIRED` or `POLICY_DENY`. Inside the request the representative signs; checked whole.
   */
  context_response?: ContextResponse;
  proposal: Proposal;
  /** Set when amending a request to meet the conditions of a prior response. */
  meets_conditions_of?: string;
  /** Set when returning to use a seat or meet conditions from a ConsiderationOutcome. */
  consideration_ref?: string;
  /** Continuation of an existing relationship (issued by the gatekeeper earlier). */
  relationship_ref?: string;
  /** msg_id of the prior InvitationResponse this request answers (e.g. a revisit). */
  prior_response_ref?: string;
  /** D6: echo of a lobby VisitReceipt. Covered by this request's signature (the new key). Hosts link history only on a valid, unused, unexpired receipt. */
  visit_receipt?: {
    receipt_id: string;
    nonce: string;
    /** v0.2.1: required when the receipt is bound to a continuity key: that key's signature over JCS({encounter_id, receipt_id, representative_id}). */
    continuity_proof?: Signature;
  };
  /** v0.2.1 (the Gatherings extension, D8): owner consents this request relies on, e.g. accept_house_rules to enter a gathering. */
  owner_consents?: Signed<OwnerConsent>[];
  /** v0.2.2 (§5.2): REQUIRED when `mandate.payload.under_allowance` is set. */
  allowance?: AllowancePresentation;
  /** v0.2.2 (the Peer meetings extension): in a pair place, the owner-to-owner invitation and the other owner's passkey acceptance. */
  peer_invitation?: { invitation: Signed<PeerInvitation>; acceptance: Signed<OwnerConsent> };
  /** v0.3.0-rc4 (§2.8): optional; this owner's per-place identity linked to another of theirs, for this place only. */
  owner_link?: Signed<OwnerLink>;
  /** v0.2.3 (§5.2): a fresh issuer-published AllowanceStatus the representative MAY staple; hosts otherwise fetch revocation_status. */
  allowance_status?: Signed<AllowanceStatus>;
};

/** Machine-readable, language-neutral refusal reasons (SPEC.md §4.4). */
export type ReasonCode =
  | "RITUAL_ORDER"
  | "CREDENTIAL_REQUIRED"
  | "CARD_INVALID"
  | "MANDATE_INVALID"
  | "MANDATE_SCOPE_EXCEEDED"
  | "PURPOSE_NOT_SERVED"
  | "VOUCH_REQUIRED"
  | "STANDING_INSUFFICIENT"
  | "SEAT_SCOPE_EXCEEDED"
  | "RATE_LIMITED"
  | "POLICY_DENY"
  /** v0.2.1 (§5.3): a required field is missing or a bound digest doesn't match. */
  | "REQUEST_INCOMPLETE"
  /** v0.4.0 (§5.2, §7.3): a live owner prompt was asked for something other than a purchase. */
  | "LIVE_PROMPT_PURCHASE_ONLY"
  /** v0.4.0 (§7.3): a held purchase lapsed: the owner declined, or said nothing before the hold ended. */
  | "HOLD_LAPSED"
  /** v0.4.0 (§5.4): an act carried an owner's credential or an account identifier, which this protocol never carries. */
  | "CREDENTIAL_NOT_ACCEPTED"
  /** v0.5.0 (§6.9): the action needs a trust path the visitor doesn't meet; never a penalty. */
  | "TRUST_REQUIRED"
  /** v0.5.0 (§4.1): every claim on a Shōkai introduction card is already bound to a holder. */
  | "INTRODUCTION_USED_UP"
  /** v0.5.0 (Conventions, C289): a signed artefact's `crit` names a member the receiver doesn't implement, or is malformed; a setup failure. */
  | "UNSUPPORTED_CRITICAL";

/**
 * v0.2.1 (§3.3): `with_credential` lists the credential for every REQUIRED readiness item:
 * card → signed_card, owner_binding → owner_binding, purpose → signed_mandate, introduction → vouch,
 * claim_evidence → claim_evidence. owner_consent covers a missing OwnerConsent (e.g. gathering entry).
 */
export type CredentialKind =
  | "signed_card"
  | "signed_mandate"
  | "vouch"
  | "human_confirmation"
  | "owner_binding"
  | "claim_evidence"
  | "owner_consent"
  /** v0.2.3: a fresh card presentation WITH a possession proof (readiness code possession_proof). */
  | "possession_proof"
  /** v0.4.0 (§5.4): a mandate naming a customer link the place made in its own channel (readiness code customer_link). */
  | "customer_link"
  /** v0.5.0 (§6.9): a TrustReceipt (readiness code trust). */
  | "trust_receipt"
  /** v0.5.0 (§6.12, provisional): a ContextResponse the visitor's owner signed, answering the place's ContextRequest. */
  | "context_response";

export type Retry =
  | {
      kind: "never";
      /**
       * v0.5.1 (§9.3, C288): when this `never` lifts, at most 180 days after it was bound. Present on every `never` that binds a key or
       * principal; absent only on a `never` that binds nothing (a reused greeting nonce, §2.4), which is exempt.
       */
      until?: Timestamp;
      /** v0.5.1 (§9.3, C288): where the refused party's owner can appeal. Present whenever `until` is. */
      appeal?: NeverAppeal;
    }
  | { kind: "after"; not_before: Timestamp }
  | { kind: "with_credential"; credentials: CredentialKind[] };

/**
 * v0.5.1 (§9.3, C288): the appeal path a binding `never` names: the place's contact or appeal URL, and the place's principal the
 * appeal is addressed to. What the place does with an appeal is its own decision; sending one lifts nothing by itself.
 */
export type NeverAppeal = { url: string; place: string };

/** v0.2.1 (§6.1): typed, checkable conditions. Lists are arrays; amounts are Money. */
export type Condition =
  /** D2 rule 1: keep only these actions (in-mandate ∩ policy). */
  | { code: "narrow_actions"; params: { actions: string[] } }
  /** D2 rule 2: lower these limits (only the fields being lowered). */
  | { code: "lower_limit"; params: Limits }
  /** Present a new signed mandate covering these actions. */
  | { code: "require_mandate"; params: { actions: string[] } }
  | { code: "require_vouch"; params: { purposes: PurposeCode[] } }
  | { code: "require_human_confirmation"; params: { actions: string[] } }
  | { code: "shorter_session"; params: { max_session_s: number } };

/** Audit fields that make a decision replayable. */
export type DecisionBasis = {
  policy_version: string;
  /** Host context in force: Seeking declaration version, if any. */
  seeking_version?: string;
  /** Digest of the gatekeeper's relationship record snapshot used, if any. */
  relationship_digest?: Digest;
  /** Digest of the verified inputs the decision was computed from. */
  input_digest: Digest;
  decided_at: Timestamp;
};

type DecisionCommon = {
  /** Present only if policy allows disclosure to this counterpart. */
  reason_code?: ReasonCode;
  /** Gatekeeper-issued handle for the persisted relationship (SPEC §9.1). */
  relationship_ref?: string;
  courtesy: Courtesy;
  basis: DecisionBasis;
};

export type GrantDecision = DecisionCommon & {
  decision: "grant";
  /** Step 6 (seating) rides on the grant when a seat is issued. */
  seat?: SeatGrant;
};

/**
 * Why a deny is a deny, as context, not finality.
 * `never` is reserved for policy or trust violations and requires retry.kind "never".
 */
export type Disposition = "not_now" | "not_a_fit" | "never";

/** When, or under what changed context, a revisit makes sense. */
export type RevisitHint = {
  not_before?: Timestamp;
  /** Machine-readable trigger, e.g. a Seeking item opening. */
  when?: { kind: "seeking_item_open"; seeking_id: string; item_id: string }
    | { kind: "credential_obtained"; credential: CredentialKind }
    | { kind: "date_reached"; at: Timestamp };
  /** Rendered in the counterpart's locale. */
  note?: { text: string; locale: Locale };
};

export type DenyDecision = DecisionCommon & {
  decision: "deny";
  disposition: Disposition;
  /** Honest situational statement, e.g. "At this moment we are not onboarding…". */
  context_statement?: { text: string; locale: Locale };
  revisit?: RevisitHint;
  retry: Retry;
  /** With not_now: exactly what is missing to be seated (unprepared visitor, SPEC lobby path). */
  readiness_requirements?: ReadinessRequirement[];
};

export type ReadinessRequirement = {
  /** v0.2.3 adds possession_proof (→ credential possession_proof) and owner_consent (→ credential owner_consent). */
  /** v0.4.0 adds card_kind (→ credential signed_card: the other Shōkai card) and customer_link (→ credential customer_link). */
  code: "card" | "owner_binding" | "purpose" | "introduction" | "claim_evidence" | "possession_proof" | "owner_consent" | "card_kind" | "customer_link"
    /** v0.5.0 (§6.9): the trust paths for an action; with `trust_paths`. */
    | "trust";
  /** v0.5.0 (§6.9): for code "trust": every path the place accepts, kinds only, each with its owner_text. */
  trust_paths?: { kind: TrustPathKind; owner_text: { text: string; locale: Locale } }[];
  obtain_url?: string;
  detail: { text: string; locale: Locale };
  /** v0.2.3 (§3.3): REQUIRED. One plain sentence a representative can show its OWNER as-is (no protocol words). */
  owner_text: { text: string; locale: Locale };
  required: boolean;
  /** v0.2.1 (§2.5): for claim_evidence to a VERIFIED visitor, which target and level fell short. */
  min_proof?: MinProof;
  /** Where to start, e.g. the guided-conversation onboarding link. */
  how?: { kind: "link"; url: string };
};

export type ConditionalDecision = DecisionCommon & {
  decision: "conditional";
  /** Non-empty. Meeting them = a new InvitationRequest with meets_conditions_of. */
  conditions: [Condition, ...Condition[]];
  retry: Retry;
};

/** Who inside the host will decide a request taken under consideration. */
export type ConsiderationRoute =
  | { kind: "principal"; principal_id: string }
  | { kind: "role"; role: string; human: boolean };

/**
 * "I can't grant that, but I'll bring it inside to someone who can decide."
 * Grants nothing now. Eligibility is set by policy (deterministic); the pitch
 * may be weighed by the party it is routed to. Answered by ConsiderationOutcome.
 */
export type ConsideringDecision = DecisionCommon & {
  decision: "considering";
  consideration_ref: string;
  routed_to: ConsiderationRoute;
  /** Outcome (or an explicit extension) is due by this time. */
  response_by: Timestamp;
  /** No seat may be issued while considering. */
  seat?: never;
};

/** v0.2.1 (§2.5): a policy proof requirement. target = "imprint.<group>" or "claim.<area>"; any one item at `level` satisfies it. */
export type MinProof = { action: string; target: string; level: ProofLevel };

/** Final decisions: the gatekeeper's own, or a ConsiderationOutcome's. */
export type FinalDecisionBody = GrantDecision | DenyDecision | ConditionalDecision;

export type DecisionBody = FinalDecisionBody | ConsideringDecision;

/** Step 5 (+6). Extend, decline, or conditionally extend the invitation. */
export type InvitationResponse = RitualHeader & {
  type: "invitation_response";
  /** v0.2.9 (§10): at an inbound door only, the optional kind reason for a door admission refusal. */
  reason_category?: DoorReasonCategory;
  /**
   * msg_id of the InvitationRequest or ExtendInvitation answered. REQUIRED on every invitation_response except the lobby's
   * answer to plain prose or a malformed message, which MUST NOT carry it (SPEC-DETAIL §2.3, Lobby replies). Optional here
   * since schema v0.5.1 (package 0.5.1) so that lobby reply validates; schema v0.5.0 required it.
   */
  in_reply_to?: string;
  /**
   * v0.2.3 (§9.1): REQUIRED when the request echoed a visit_receipt. Says whether the host linked this visit to the
   * earlier lobby visit (`linked: false` = treated as a first visit, e.g. an unproven bound receipt or a reused one).
   */
  continuity?: { receipt_id: string; linked: boolean };
  /**
   * v0.5.0 (§6.12, provisional): when the place requests context before entry, the request, on a `not_now` /
   * `CREDENTIAL_REQUIRED` answer with retry `with_credential` [`context_response`]; in "admit_then_request", on the grant.
   */
  context_request?: ContextRequest;
} & DecisionBody;

/**
 * Helper direction, step 4: the host extends an invitation to a product
 * representative (replaces offer_presence). Answered by InvitationResponse;
 * a grant MAY narrow `proposed_seat` but never widen it.
 */
export type ExtendInvitation = RitualHeader & {
  type: "extend_invitation";
  domain_id: string;
  purpose: { code: PurposeCode; statement: string; locale: Locale; meaning_notes?: MeaningNote[] };
  proposed_seat: SeatGrant;
  card_digest: Digest;
  etiquette_register: EtiquetteRegister;
  mcp_session_id?: string;
};

// ---------- Needs and relationships ----------

/** One area where the host is openly looking for help or partners. */
export type SeekingItem = {
  item_id: string;
  area: PurposeCode;
  summary: { text: string; locale: Locale; meaning_notes?: MeaningNote[] };
  /** Actions a helpful visitor would perform, if known. */
  wants?: string[];
  status: "open" | "paused" | "closed";
  open_until?: Timestamp;
};

/**
 * Published "Seeking" declaration: transparency of needs. Scoped and
 * policy-controlled; MUST NOT expose sensitive internals. Signed by the host principal.
 */
export type SeekingDeclaration = {
  seeking_id: string;
  version: string;
  host: Pick<Principal, "principal_id" | "display_name">;
  items: SeekingItem[];
  published_at: Timestamp;
  expires_at: Timestamp;
};

export type SignedSeekingDeclaration = Signed<SeekingDeclaration>;

/** What a principal's representative can offer; pairs with SeekingDeclaration. */
export type OfferingItem = {
  item_id: string;
  area: PurposeCode;
  summary: { text: string; locale: Locale; meaning_notes?: MeaningNote[] };
  /** Actions the representative can perform for a host. */
  actions?: string[];
  status: "available" | "limited" | "unavailable";
};

export type OfferingProfile = {
  offering_id: string;
  version: string;
  principal: Pick<Principal, "principal_id" | "display_name">;
  items: OfferingItem[];
  published_at: Timestamp;
  expires_at: Timestamp;
};

export type SignedOfferingProfile = Signed<OfferingProfile>;

/** Gatekeeper-local relationship memory (v0.1, provisional: not shared). */
export type RelationshipRecord = {
  relationship_ref: string;
  /** Meanings learned from this counterpart. */
  learned_meanings?: LearnedMeaning[];
  /** Notices issued in this relationship. */
  misconduct?: { notice_id: string; code: MisconductCode; severity: MisconductSeverity; at: Timestamp }[];
  counterpart_principal_id: string;
  representative_ids: string[];
  register: EtiquetteRegister;
  encounters: {
    encounter_id: string;
    response_msg_id: string;
    decision: DecisionBody["decision"];
    disposition?: Disposition;
    revisit?: RevisitHint;
    outcome: Farewell["outcome"];
    consideration_ref?: string;
    at: Timestamp;
  }[];
};

/** Gatekeeper-local standing of an introducer (v0.1: never shared). */
export type IntroducerStanding = {
  introducer_id: string;
  /** Per-purpose weight its vouches carry here. */
  by_purpose: Partial<Record<PurposeCode, "full" | "reduced" | "suspended">>;
  notices: string[];
  disposition?: Disposition;
  /** D1 (v0.2): graded, local, time-boxed penalty, scoped to the relied-on vouch's purposes. */
  penalty?: IntroducerPenalty;
};

/**
 * D1 grades: minor → none; serious → reduced for 90 days; severe → suspended for 180 days.
 * A VouchRevocation within 7 days of the notice halves the duration. A signed IntroducerReview restores standing early.
 * "reduced": the introducer's vouches still count as an introduction, but do not raise proof levels and do not make a
 * visitor eligible for `considering`. "suspended": its vouches carry no weight here for those purposes.
 */
export type IntroducerPenalty = {
  grade: "none" | "reduced" | "suspended";
  purposes: PurposeCode[];
  notice_ref: string;
  until: Timestamp;
  halved_by_revocation?: string;
  restored_by_review?: string;
};

/** D1: an introducer's signed review of a notice, e.g. what it changed. Restores standing at that gatekeeper. */
export type IntroducerReview = {
  review_id: string;
  introducer_id: string;
  /**
   * v0.2.9 (§9.3, P5): who signs the review that restores standing: the place's own principal or a reviewer the place names.
   * Never the penalised introducer (absent = the introducer itself, which restores nothing: it is an appeal only).
   */
  reviewer_id?: string;
  notice_ref: string;
  revocation_ref?: string;
  statement: { text: string; locale: Locale };
  issued_at: Timestamp;
};

/** Explicit decision on an `act` the representative will not perform as asked. */
export type ActDecision = RitualHeader & {
  type: "act_decision";
  /** msg_id of the Act answered. */
  in_reply_to: string;
  seat_id: string;
  /** Tool requested in the refused act. */
  tool: string;
} & (DenyDecision | ConditionalDecision | ConsideringDecision);

/**
 * Later answer to a `considering` decision, delivered within the existing
 * relationship (may arrive outside the original encounter).
 */
export type ConsiderationOutcome = RitualHeader & {
  type: "consideration_outcome";
  consideration_ref: string;
  relationship_ref: string;
  /** msg_id of the `considering` response this answers. encounter_id stays the considering encounter's. */
  in_reply_to: string;
  /** The inside party that decided (matches routed_to). */
  decided_by: ConsiderationRoute;
  /** v0.2.1 (§6.8): what the inside party approved; used in a NEW encounter that cites consideration_ref. v0.2.3: valid_until defaults to decided_at + 30 days. */
  approved?: { actions: string[]; limits?: Limits; valid_until: Timestamp };
  /**
   * v0.2.3 (§6.8, §8.1): REQUIRED when decided_by is a principal and the outcome grants or conditions a binding action
   * (e.g. a pair-place commitment): the owner's OwnerConsent(s), passkey approve_commitment, whose subject_ref is
   * {kind: "consideration", id: consideration_ref, digest: payload_digest of the considering response}.
   */
  owner_consents?: Signed<OwnerConsent>[];
} & (Omit<GrantDecision, "seat"> & { seat?: never } | DenyDecision | ConditionalDecision
  /** v0.2.1: deadline extension: a new `considering` with a later response_by and the same consideration_ref. */
  | ConsideringDecision);

// ---------- Misconduct and accountability ----------

export type MisconductCode =
  | "purpose_misrepresentation"
  | "gate_probing"
  | "seat_overreach"
  | "vouch_misuse"
  | "manipulation"
  | "revisit_violation"
  | "post_seat_leakage"
  /** v0.2.9 (§9.3, §10): an offer whose value depends on data or consent not declared in its strings (serious). */
  | "conditional_inducement"
  /**
   * v0.2.10 (§9.3, §10, P16 Part A): pressure the signed offer doesn't back: false urgency (a deadline sooner than valid_until),
   * fake scarcity (a quantity the offer doesn't declare in `remaining`), fake familiarity (a past relationship this door has no
   * record of) or claimed prior consent (consent is only ever a signed OwnerConsent). Serious; severe when hidden.
   */
  | "manipulative_pressure";

export type MisconductSeverity = "minor" | "serious" | "severe";

export type MisconductFinding = {
  code: MisconductCode;
  severity: MisconductSeverity;
  observed_at: Timestamp;
  /** Digest of the audit evidence (messages, act results) behind the finding. */
  evidence_digest: Digest;
};

/** Local consequence at the issuing gatekeeper only (v0.1). */
export type MisconductEffect = {
  party_id: string;
  party_role: "visitor_principal" | "representative" | "introducer";
  /** Purposes whose standing is affected (an introducer: within its vouch scope). */
  scope: PurposeCode[];
  standing_change: "noted" | "reduced" | "suspended";
  /** v0.2.1: when the standing change ends (D1: reduced 90 days, suspended 180 days; halved by a prompt revocation). */
  until?: Timestamp;
  disposition?: Disposition;
  retry?: Retry;
};

/**
 * Signed gatekeeper record sent to the visitor's principal and to every
 * introducer in the vouch chain. If gate_probing is suspected, the copy sent
 * toward the visitor's principal MUST omit `findings` (`findings_withheld: true`).
 */
export type MisconductNotice = {
  notice_id: string;
  issuer: Pick<Principal, "principal_id" | "display_name">;
  subject: { representative_id: string; card_digest: Digest; principal_id: string };
  encounter_id: string;
  relationship_ref?: string;
  /** Vouches relied on, nearest first (follows upstream_vouch_id). */
  vouch_chain: { vouch_id: string; introducer_id: string }[];
  findings?: MisconductFinding[];
  findings_withheld?: boolean;
  effects: MisconductEffect[];
  issued_at: Timestamp;
};

/** v0.2.1: carries a header like every message; `to` is the visitor's principal or one introducer. The inner notice is signed by the host PRINCIPAL key. */
export type MisconductNoticeMessage = RitualHeader & {
  type: "misconduct_notice";
  notice: Signed<MisconductNotice>;
};

/** Introducer withdraws a vouch, e.g. after a MisconductNotice. Signed by the introducer. */
export type VouchRevocation = {
  vouch_id: string;
  introducer_id: string;
  revoked_at: Timestamp;
  notice_ref?: string;
};

export type VouchRevocationMessage = RitualHeader & {
  type: "vouch_revocation";
  revocation: Signed<VouchRevocation>;
};

/**
 * v0.2.1 (§4): one entry of an introducer's append-only revocation log.
 * entry_hash = digest(JCS({seq, prev_hash, revocation_digest})); seq 0 has prev_hash "genesis".
 */
export type RevocationLogEntry = {
  seq: number;
  prev_hash: Digest | "genesis";
  revocation: Signed<VouchRevocation>;
  entry_hash: Digest;
};

/**
 * v0.5.0 (§4, C271, provisional): the introducer's signed, dated head of its revocation log. `seq` is the number of entries,
 * `entry_hash` the last entry's (`"genesis"` for an empty log), `log` the log's own URL. Signed by the introducer principal's key.
 */
export type RevocationLogHead = {
  kind: "revocation_log_head";
  log: string;
  seq: number;
  entry_hash: Digest | "genesis";
  as_of: Timestamp;
};

/**
 * v0.5.0 (§4, C271, provisional): a revocation log served with its signed head. A verifier MUST refuse a head older than 24 hours
 * (`REVOCATION_HEAD_MAX_AGE_S`); a bare entry array (no head) is the v0.4.0 form, refused for a Shōkai introduction card.
 */
export type RevocationLogDocument = {
  entries: RevocationLogEntry[];
  head: Signed<RevocationLogHead>;
};

/** v0.2.1 (§9.3, D1): the wire message that carries an introducer's signed review. */
export type IntroducerReviewMessage = RitualHeader & {
  type: "introducer_review";
  review: Signed<IntroducerReview>;
};

/** Step 7. Courteous close, including after a decline. */
export type Farewell = RitualHeader & {
  type: "farewell";
  /** v0.2.1: "taken_inside" after a `considering`. */
  /** v0.2.2: `taken_home` = the visitor's representative takes something outside its allowance to its owner (async). */
  /** v0.2.3 (§4): a farewell MAY be sent at any step; before a decision only with outcome "withdrawn" or "taken_home". "declined_never" closes after a never: no invitation to return. */
  outcome: "seated" | "declined" | "withdrawn" | "completed" | "taken_inside" | "taken_home" | "declined_never";
  courtesy: Courtesy;
};

/**
 * Lobby path: the host introduces itself to a visitor that is not (yet) able
 * to be seated. Grants nothing. `about` is courtesy (untrusted for the receiver).
 */
export type LobbyBriefing = RitualHeader & {
  type: "lobby_briefing";
  about: Courtesy;
  how_this_place_works: { text: string; locale: Locale };
  seeking?: SignedSeekingDeclaration;
  /** v0.2.1: REQUIRED. Where the owner onboards (plain questions first, §3.3). */
  onboarding_url: string;
  /** Optional in the core since v0.3.0-rc1 (D19). D6 one-time receipt; a bearer secret. A place implementing the
   *  Visit receipts extension carries one in every briefing. */
  visit_receipt?: VisitReceipt;
  /** v0.2.1 (§5.1): the purposes this place serves; every `x-` code it accepts MUST be described here. */
  purposes?: PurposeDescription[];
  /** v0.2.3 (§3.3): REQUIRED. Which protocol text this place follows. */
  spec_ref: SpecRef;
  /** v0.2.4 (§11.1): REQUIRED over HTTP. The inbox address where late messages for this visitor are held. */
  inbox: string;
  /** v0.2.3 (§3.3): REQUIRED. The actions this place offers, per purpose (same as its listing). */
  actions?: PlaceAction[];
  /**
   * v0.2.3 (§3.3): REQUIRED. Fill-in templates (unsigned skeletons) for what this place needs. `<…>` marks a value the
   * owner or representative fills in; a template is never a credential and never gate input.
   * v0.2.4 (§3.3): templates are not protocol values: they are exempt from timestamp, amount and digest validation.
   */
  templates: PlaceTemplates;
  /**
   * v0.5.0 (§2.3, C246): the place's conduct rules, served before seating. REQUIRED when the house config carries
   * policy.conduct_rules: a door that has them MUST serve them in its lobby briefing. Not sent in reply to shokai/0.3.
   */
  conduct_rules?: ConductRule[];
  /** v0.5.0 (§6.10, C250): the named outside classifiers that receive visitor content (policy.third_party_classifiers). Not sent in reply to shokai/0.3. */
  third_party_classifiers?: ThirdPartyClassifier[];
  /** v0.5.0 (§6.10, C250): the outside services that run the host representative's model (policy.model_providers). Not sent in reply to shokai/0.3. */
  model_providers?: ModelProvider[];
  /** v0.5.0 (§11.1, C254): the wire tags this place accepts, e.g. ["shokai/0.5", "shokai/0.3"] during the window. Not sent in reply to shokai/0.3. */
  accepted_tags?: string[];
};

/** v0.2.3 (§3.3): unsigned fill-in skeletons a lobby offers. */
export type PlaceTemplates = {
  card: Partial<RepresentativeCard>;
  /**
   * v0.2.4 (§3.3): one mandate skeleton per purpose code the place serves, listing only the actions that serve that
   * purpose; a spending purpose's skeleton carries `limits.max_amount` with `<amount>` / `<ISO 4217>` placeholders.
   */
  mandates: { [purpose: string]: Partial<Mandate> };
  allowance_grant?: Partial<AllowanceGrant>;
  /**
   * v0.5.0 (§2.2, C242): `true` marks the card and mandate templates as closed. Each then lists every top-level member the
   * place accepts (a member a visitor may leave out has an `<optional …>` placeholder), and the place refuses a signed
   * Shōkai visitor card or mandate carrying a top-level member its template doesn't list (`x-` members aside). Absent:
   * the templates are fill-in hints only.
   */
  closed?: true;
};

/** v0.2.3 (§3.1): one action a place offers, with the purposes it serves and whether it moves money. */
export type PlaceAction = { action: string; purposes: PurposeCode[]; spends: boolean; needs?: "standard" | "considering" | "pair_invitation";
  /** v0.5.0 (§6.9): the kinds of trust path accepted, never thresholds. */
  trust?: { paths: TrustPathKind[]; obtain_url?: string; first_purchase?: { allocates_deposit: boolean } };
  /** v0.5.0 (§6.9): serving this action costs the place real money; it SHOULD have a pool cap. */
  costs_place?: boolean;
  /** v0.5.0 (§5.5, informative): typical turns an errand for this action takes. */
  effort_hint?: { typical_turns: number };
  /** v0.2.8 (§4, P2): this action creates an account / signs up (always true for `account.create`); stated only when true. */
  creates_account?: boolean;
  /** v0.2.10 (§4, D17): this place requires an introduction, or its own invitation, before it creates an account. */
  requires_introduction?: boolean;
  /** v0.4.0 (§5.4): this place serves the action only under a customer link made in its own channel; stated only when true. */
  requires_customer_link?: boolean;
  /** v0.3.0-rc1 (§3.1, P17, D19): SHOULD be present. The personal data the place will ask the visitor's owner for before or
   *  while it serves this action; [] when it asks for none. A representative can tell its owner up front, and takes an
   *  undeclared ask home rather than answering it. */
  data_asks?: DataAsk[] };

/** v0.3.0-rc1 (§3.1, D19): kinds of personal data a place may declare it will ask an owner for. */
export type DataAsk = "name" | "email" | "phone" | "address" | "date_of_birth" | "payment_method" | "account" | "government_id" | `x-${string}`;

/** D6 (v0.2): issued once in a LobbyBriefing; single use; expires. */
export type VisitReceipt = {
  receipt_id: string;
  /** Secret-to-the-visitor nonce; never shown in transcripts or reports. */
  nonce: string;
  issued_at: Timestamp;
  /** v0.2.1: MUST be at most 7 days after issued_at. */
  expires_at: Timestamp;
  /** v0.2.1 (§9.1): possession is continuity. Keep it secret. */
  handling: "bearer_secret";
  /** v0.2.1: set when the greeting carried a continuity_key; the echo then needs a continuity_proof. */
  bound_key?: string;
};

/** v0.2.1 (§5.1): a purpose a place serves, described for newcomers. */
export type PurposeDescription = { code: PurposeCode; statement: { text: string; locale: Locale } };

/**
 * v0.2.1 (§3.1, the door): one entry of a door's place listing. `entry` takes protocol messages
 * (and any other arrival); `lobby` is where an unprepared visitor lands; `onboarding_url` is for its owner.
 */
export type PlaceListingEntry = {
  name: string;
  display_name: string;
  principal_id: string;
  representative_id: string;
  entry: string;
  lobby: string;
  onboarding_url: string;
  locales: Locale[];
  purposes: PurposeDescription[];
  seeking_ref?: { seeking_id: string; digest: Digest };
  /** v0.2.2 (§5.2): the place's category. v0.2.3: REQUIRED (an allowance grant is matched against it). */
  category: PlaceCategory;
  /** v0.2.3 (§3.1): REQUIRED. The actions the place offers, with purposes. */
  actions: PlaceAction[];
  /** v0.2.3 (§3.1): which protocol text the place follows. v0.2.4: REQUIRED. */
  spec_ref: SpecRef;
  /** v0.2.4 (§11.1): REQUIRED over HTTP. The place's inbox address (POST a signed inbox_poll). */
  inbox: string;
  /** v0.2.9 (§10): REQUIRED for an inbound door: the owner-signed door policy (public part plus a salted digest of the private part). */
  door_policy?: Signed<DoorPolicy>;
  /** v0.3.0-rc1 (§3.1, D20): OPTIONAL hints to what the place already publishes for agents elsewhere. They prove nothing
   *  and never widen what the door decides; a visitor still verifies the place's card against this entry (C104). */
  links?: PlaceLink[];
  /** v0.4.0 (§3.1, §2.3): REQUIRED when the place's host representative presents a Shōkai host card: the fingerprint of the
   *  house config it serves now. A visitor compares it with the host card's `house_digest`. */
  house_digest?: Digest;
  /** v0.5.0 (§11.1, C254): the wire tags this place accepts. A visitor never moves to shokai/0.3 when it includes shokai/0.5. */
  accepted_tags?: string[];
};

/** v0.3.0-rc1 (§3.1, D20): a pointer from a place's agent front to another description it publishes. Unknown `rel`
 *  values are ignored. Suggested values (informative): `website`, `schema-org`, `product-feed`, `mcp-server`,
 *  `mcp-server-card`, `a2a-agent-card`, `nlweb`, `commerce-profile`, `llms-txt`; anything else uses an `x-` prefix. */
export type PlaceLink = { rel: string; href: string; media_type?: string };

/** v0.2.1 (§3.1): the place listing a door publishes. */
export type PlaceListing = {
  type: "place_listing";
  protocol: ProtocolVersion;
  door: string;
  places: PlaceListingEntry[];
  published_at: Timestamp;
};

/**
 * v0.2.3 (§3.1): a listing and a door pointer are HINTS, unsigned by default (a door operator MAY sign them as
 * Signed<PlaceListing>). A visitor MUST NOT trust an entry address because a listing named it: before it sends an
 * invitation_request it MUST verify the place's own card (signature, possession proof) and that the card's
 * principal_id equals the listing entry's principal_id.
 */
export type SignedPlaceListing = Signed<PlaceListing>;

/** v0.2.1 (§3.1): machine-readable answer to any arrival the door can't route (plain prose, an unknown route). */
export type DoorPointer = {
  type: "door_pointer";
  protocol: ProtocolVersion;
  place_listing: string;
  places: (Pick<PlaceListingEntry, "name" | "entry" | "lobby" | "onboarding_url" | "inbox"> & {
    /** v0.5.0 (§3.1.1): the place's principal. REQUIRED for a site binding when the entry is on another origin than the site's. */
    principal_id?: string;
    /** v0.5.0 (§3.1.1): the listing this place's entry belongs to, when it isn't this pointer's place_listing. */
    place_listing?: string })[];
  /** How to start: send a `greeting` (signed or not) to an entry address. */
  start_with: "greeting";
  /** v0.2.4 (§3.1): REQUIRED. Which protocol text the door follows; clients compare `spec_ref.version`, not `protocol`. */
  spec_ref: SpecRef;
  /**
   * v0.3.0-rc4 (§11.1, C200): only on a 404 for one of a place's own addresses (e.g. `GET <entry>`): that place, and that its
   * addresses take a POST. Present for an unlisted place too (the requester already holds the address); never names another place.
   */
  here?: Pick<PlaceListingEntry, "name" | "entry" | "lobby" | "onboarding_url" | "inbox"> & { method: "POST" };
};

/** v0.2.1 (D10, §6.4): the gate-input projection. input_digest = digest(JCS(GateInput)). No prose, no locale fields. */
export type GateInput = {
  now: Timestamp;
  policy: { policy_version: string; policy_digest: Digest };
  visitor: Record<string, string | boolean | { area: string; level: ProofLevel }[] | undefined>;
  ritual: "ok" | "skipped" | "lobby";
  probing: boolean;
  request?: { purpose: PurposeCode; actions: string[]; limits?: Limits; consideration_ref?: string };
  mandate?: { purpose: PurposeCode; allowed_actions: string[]; limits: Limits };
  relationship: Record<string, unknown>;
};

/** v0.2.1 (§9.2): what both owners sign for a `friend` edge. standing and history stay local and unsigned. */
export type EdgeAttestationPayload = Pick<RelationshipEdge, "edge_id" | "from" | "to" | "kind" | "since">;

/** A signed lesson in an apprenticeship visit (purpose "teaching"). */
export type Lesson = {
  lesson_id: string;
  teacher: { representative_id: string; principal_id: string };
  learner: { representative_id: string; principal_id: string };
  topic: string;
  content: { text: string; locale: Locale; meaning_notes?: MeaningNote[] };
  /** Where the lesson came from; the teacher's reputation stays linked to it. */
  provenance: { authored_by: string; derived_from: string[] };
  /** Both owners' consents (digests of signed approvals). */
  consent_refs: Digest[];
  /** Owner's private memory is excluded by default. */
  excludes_private_memory: true;
  issued_at: Timestamp;
};

export type LessonMessage = RitualHeader & {
  type: "lesson";
  seat_id: string;
  lesson: Signed<Lesson>;
};

/** Learner-side record: lessons are adapted, never copied verbatim. */
export type LessonAdaptation = {
  lesson_id: string;
  lesson_digest: Digest;
  adapted: { text: string; locale: Locale };
  changes: string[];
  adopted_at: Timestamp;
};

export type RitualMessage =
  | GatheringMessage
  | PrivacyDecline
  | LobbyBriefing
  | LessonMessage
  | Greeting
  | CardPresentation
  | CardReceipt
  | Introduction
  | InvitationRequest
  | ExtendInvitation
  | InvitationResponse
  | Farewell;

/** Every message defined by this file. */
export type ShokaiMessage =
  | PresenceMessage
  | RitualMessage
  | ActDecision
  | ConsiderationOutcome
  | MisconductNoticeMessage
  | VouchRevocationMessage
  | IntroducerReviewMessage
  /** v0.2.3 (§11) */
  | ConsentRevocationMessage
  /** v0.3.0-rc4 (§2.6) */
  | CardRevocationMessage
  | GatheringInvitation
  | PeerInvitationDelivery
  | PeerInvitationAnswer
  | InboxPoll
  | HeldNotice
  /** v0.2.9 (§10): only at an inbound door */
  | OfferOutcome
  /** v0.4.0 (§7.3): the purchase-only live owner prompt */
  | ActHeld
  | ActConfirmation
  /** v0.5.0 (§12.4, C255): deletion of raw visitor text and model output */
  | DeletionRequestMessage
  | DeletionReceiptMessage;

/**
 * The visiting representative's report home, in its own voice and the owner's
 * language. Not a wire message. Host-authored text is quoted, never followed.
 */
export type VisitReport = {
  report_id: string;
  representative_id: string;
  owner_id?: string;
  host: { display_name: string; principal_id?: string };
  visited_at: Timestamp;
  /** Who the counterpart is to the owner, from the local relationship graph. */
  relationship?: { kind: RelationshipEdgeKind; standing: RelationshipEdge["standing"]; since: Timestamp }[];
  outcome: {
    /** Absent for a gathering (use `gathering`). */
    decision?: DecisionBody["decision"];
    disposition?: Disposition;
    retry?: Retry;
    conditions?: Condition[];
    consideration_ref?: string;
    response_by?: Timestamp;
    gathering?: { gathering_id: string; admitted: boolean };
  };
  /** v0.2.1 (D10, §8.2): the outcome rendered by the representative from machine fields only, in the owner's locale (and time zone). */
  outcome_rendered: { text: string; locale: Locale };
  /** v0.5.0 (§5.5, C247): what an errand under an ErrandBudget used, so the owner can audit the budget. */
  errand_used?: ErrandUsed;
  /** v0.5.0 (§8.3): Return with care priority, and references to the details kept rather than inlined. */
  priority?: "now" | "soon" | "later";
  kept?: string[];
  /** v0.2.1 (§8.2): the seat it held, and every act it performed on the owner's behalf. */
  seat?: { actions: string[]; limits?: Limits };
  acts?: { tool: string; amount?: Money; ok: boolean }[];
  /** v0.3.0-rc2 (§8.2): the total of the acts that went through, per currency (exact decimal strings, D10). */
  spent?: Money[];
  /** v0.3.0-rc2 (§8.2 "what was shared"): what the owner's side disclosed in this visit, by where it went: the card (always, at
   *  step 2), the mandate (with the request), and each act's arguments. Card contents are disclosed by presenting the card; they
   *  are not a place's `data_asks` (§3.1), which declare what the place will ask for beyond the card. */
  shared?: { via: "card" | "mandate" | "act"; tool?: string; items: { field: string; value?: string }[] }[];
  /** v0.3.0-rc2 (§5.1, §8.2, C176): the mandate this visit was under and everything done under it so far, at every place: each
   *  visit (this one last) with its acts, and the mandate's totals. `reported_in` names earlier reports that already covered a visit. */
  under_mandate?: {
    mandate_id: string; purpose: PurposeCode; limits: Limits; expires_at: Timestamp;
    visits: { encounter_id: string; place: string; place_id?: string; at: Timestamp; decision?: string; seat_id?: string;
      acts: { tool: string; amount?: Money; ok: boolean; at: Timestamp }[]; reported_in?: string[] }[];
    acts_done: number; acts_refused: number; spent: Money[];
    /** What is left of the mandate's max_amount and max_operations, when it sets them. */
    remaining?: { amount?: Money; operations?: number };
  };
  /** Host's self-introduction / courtesy, quoted. */
  host_said: { text: string; locale: Locale; untrusted: true }[];
  readiness_requirements?: ReadinessRequirement[];
  /** What the representative concluded about the counterpart's strengths (from its imprint). */
  counterpart_strengths?: { text: string; proof_level: ProofLevel }[];
  meaning_notes_learned?: LearnedMeaning[];
  /** Stories offered, not told: content is revealed only after the owner opts in. */
  offered_stories?: OfferedStory[];
  /** One concrete next step; nothing happens until the owner approves. */
  next_step: { text: string; url?: string; requires_owner_approval: true; /** v0.2.1: silence is never approval. */ if_no_reply?: "nothing_happens" };
  /** v0.3.0-rc2 (§8.2, C178): signed objects received in the visit and kept for the owner (a visit stamp, a receipt), never
   *  matters for decision (those are `taken_home`). Each carries the envelope or a reference to it (its payload_digest), its signer,
   *  and whether it verified against the place's listed principal_id. `again` = the place gave back one it had given before. */
  brought_back?: { item_id: string; kind: string; label?: string; from_tool?: string; at: Timestamp; signed_by: string; payload_digest: Digest;
    verified: boolean; verified_against?: string; again?: boolean; envelope?: Signed<unknown> }[];
  /** v0.2.2 (D11, §8.2): matters outside the allowance, taken home for an async owner decision. Silence = declined. */
  taken_home?: { item_id: string; what: { text: string; locale: Locale }; needs: OwnerConsent["action"]; response_by: Timestamp; if_no_reply: "declined" }[];
  /** v0.2.3 (§9.1, §8.2): whether the host linked this visit to an earlier lobby visit, told to the owner. */
  continuity?: { receipt_id: string; linked: boolean };
  /** v0.2.2 (D5, the Gatherings extension): privacy declines and light flags this representative received (its own pressing), reported home. */
  privacy_declines?: { gathering_id: string; topic: TopicCode; press: number; flagged: boolean }[];
  /** v0.2.2 (§1 loyalty): offers or requests that touched the owner's interests outside the allowance, quoted as untrusted. */
  offers_declined?: { text: string; locale: Locale; untrusted: true; why: "outside_allowance" | "conflicts_with_interests" | "reputation" }[];
  /** v0.2.2 (D7-8): stories told after a per-story hear_story consent. */
  told_stories?: ToldStory[];
  /** The report itself, in the representative's voice. */
  voice: { text: string; locale: Locale };
  relationship_ref?: string;
};

// ---------- Gatherings: groups are places ----------

/** How freely a topic may be shared, set by the principal; grows with closeness. */
export type DisclosureTier = "open" | "friends" | "private";

/**
 * v0.2.1 (D10, the Gatherings extension): registered, language-neutral topic codes. `x-` codes are place-defined and MUST be listed in
 * the Gathering's house_rules.topics. A missing or unknown code MUST be treated as the most restrictive tier.
 */
export type TopicCode =
  | "work" | "craft" | "wellbeing" | "health" | "family" | "relationships" | "finances"
  | "location" | "schedule" | "beliefs" | "identity"
  | `x-${string}`;

export type DisclosurePolicy = {
  principal_id: string;
  default: DisclosureTier;
  by_topic: Partial<Record<TopicCode, DisclosureTier>>;
  /** Which relationship edge kinds count as "friends" closeness. */
  friends_via: RelationshipEdgeKind[];
};

export type AttributionRule = "chatham_house" | "attributable_with_consent" | "private";

/** A place representatives are invited to. A group is whoever is invited, not a membership list. */
export type Gathering = {
  gathering_id: string;
  place: { principal_id: string; display_name: string };
  title: string;
  invitees: { representative_id: string; principal_id: string; invited_by: string }[];
  house_rules: {
    /** Default for anything said: insights may leave, attribution may not (Chatham House). */
    default_attribution: AttributionRule;
    /** Anything tagged private never leaves the gathering. */
    private_never_leaves: true;
    pressing_after_decline: "flagged";
    /** v0.2.2 (D5, the Gatherings extension): visible thresholds; MAY be stricter (lower), never laxer than the default {2, 3}. */
    pressing?: { light_flags: number; notice_at: number };
    /** D4: what leaves is paraphrased by default; verbatim only with the speaker's verbatim_consent. */
    quoting: "paraphrase_by_default";
    /** D8: each attendee's owner signs an OwnerConsent (accept_house_rules) on entry. Enforcement is accountability, not prevention. */
    entry_requires_consent: true;
    /** v0.2.1 (D10): the `x-` topic codes this gathering uses. */
    topics?: TopicCode[];
  };
  starts_at: Timestamp;
  ends_at: Timestamp;
};

/** v0.2.4 (§11 with the Gatherings or Peer meetings extension): an attendee addressing the room MUST set `encounter_id` and `to` to the gathering id. */
export type GatheringMessage = RitualHeader & {
  type: "gathering_message";
  gathering_id: string;
  kind: "insight" | "chat" | "question" | "answer";
  /** v0.2.1 (D10): REQUIRED, a registered TopicCode. */
  topic: TopicCode;
  text: { text: string; locale: Locale };
  attribution: AttributionRule;
  /** Principals the speaker consents to be named to (for attributable_with_consent). */
  attribution_consent_for?: string[];
  /** D4: verbatim quoting outside the gathering only with this consent; the default is paraphrase. Attribution rules still apply. */
  verbatim_consent?: boolean;
  in_reply_to?: string;
};

/** A courteous, non-penalized refusal to answer a personal question. Never misconduct. */
export type PrivacyDecline = RitualHeader & {
  type: "privacy_decline";
  gathering_id: string;
  in_reply_to: string;
  topic: TopicCode;
  courtesy: Courtesy;
  penalized: false;
  /** v0.2.3 (the Gatherings extension): when the question pressed an earlier decline, the press count and flag, visible to the presser. */
  /**
   * v0.2.4: the decliner fills this from its own count of that asker's presses on this topic (it sees every question put
   * to it); the place's own count stays authoritative for notices.
   */
  press?: { count: number; light_flags: number; notice_at: number };
};

/** v0.2.3 (the Revocation status extension): the place sends a gathering's signed invitation to each invitee's representative. */
export type GatheringInvitation = RitualHeader & {
  type: "gathering_invitation";
  gathering: Signed<Gathering>;
  /** The invitee's entry address where the gathering is held. */
  entry: string;
};

/** v0.2.3 (§11 with the Gatherings or Peer meetings extension): the inviting owner's representative carries the owner-signed PeerInvitation to the invited representative. */
export type PeerInvitationDelivery = RitualHeader & {
  type: "peer_invitation";
  invitation: Signed<PeerInvitation>;
  /**
   * Where the answer goes: the inviting representative's own entry, or (v0.2.4) the pair place's inbox address, where
   * the answer is then held for the inviting representative.
   */
  reply_to: string;
};

/** v0.2.3 (§11 with the Gatherings or Peer meetings extension): the invited representative returns its owner's passkey answer (accept_invitation approve or decline). */
export type PeerInvitationAnswer = RitualHeader & {
  type: "peer_invitation_answer";
  invitation_id: string;
  answer: Signed<OwnerConsent>;
};

/**
 * v0.2.4 (§11.2): the signed acknowledgement a place returns, in the same ReplyEnvelope, for a message it will answer
 * later (a peer_invitation, a request taken to considering, a gathering invitation request). Distinguishes "accepted,
 * the answer will be held for your inbox" from a dropped message (which gets no reply at all, §2.2).
 */
export type HeldNotice = RitualHeader & {
  type: "held";
  in_reply_to: string;
  /** The inbox address where the answer will be held. */
  inbox: string;
  /** v0.2.5 (§11.2): the latest time the answer will be held: after a considering, its response_by; for a
   *  peer_invitation, the invitation's answer_by. MAY be omitted when the answer is already held. Silence after it is a decline. */
  answer_by?: Timestamp;
};

/** v0.2.3 (§11.2): a signed poll for late (asynchronous) messages; `from` MUST equal the polled recipient. */
export type InboxPoll = RitualHeader & {
  type: "inbox_poll";
  /** msg_id of the last message already received; absent = everything still held. */
  since?: string;
};

/** v0.2.3 (§11.1): the body of every HTTP reply from an entry: zero or more signed messages, in order. */
export type ReplyEnvelope = {
  protocol: ProtocolVersion;
  messages: Signed<ShokaiMessage>[];
};

/**
 * D7 (decided in D11, v0.2.2, SPEC §8.1): one generic, signed owner consent with a decision (approve / decline).
 * Binding actions require `assurance: "passkey"`; hear_story and harmless approve_next_step MAY be a chat reply,
 * signed by the owner binding's platform key. Silence = decline.
 */
export type OwnerConsent = {
  consent_id: string;
  owner_id: string;
  representative_id: string;
  /**
   * v0.2.2 (D7 adopted, §8.1). Passkey: approve_commitment, approve_share, approve_introduction, accept_house_rules,
   * accept_invitation, issue_vouch, attest_relationship, approve_lesson. Chat reply allowed: hear_story, and
   * approve_next_step only when the step commits, shares and spends nothing. (approve_mandate is retired: the owner's
   * signature on a Mandate or Allowance is the consent.)
   */
  action:
    | "hear_story" | "approve_share" | "approve_next_step" | "approve_introduction" | "accept_house_rules"
    | "approve_commitment" | "issue_vouch" | "attest_relationship" | "approve_lesson" | "accept_invitation"
    /** v0.4.0 (§7.3): the owner's live yes to one held purchase; passkey only. */
    | "approve_purchase";
  /** v0.2.2: an owner can say no in one step, at the same or a lower assurance. Silence = decline. */
  decision: "approve" | "decline";
  subject_ref: {
    kind: "visit_report" | "offered_story" | "gathering" | "share" | "introduction" | "consideration" | "vouch" | "edge" | "lesson" | "invitation" | "next_step"
      /** v0.4.0 (§7.3): a held act; id = the hold_id, digest = the act's payload digest. */
      | "act";
    id: string;
    /** REQUIRED when assurance = "passkey". */
    digest?: Digest;
  };
  scope?: string[];
  assurance: "passkey" | "chat_reply";
  /** v0.2.2: REQUIRED, inside the signed payload: the plain-language summary the owner saw. */
  shown_to_owner: { text: string; locale: Locale };
  /** v0.2.2: REQUIRED for chat_reply: the owner's reply message. The binding's platform key signs. */
  evidence?: { channel: string; message_id: string };
  /** v0.2.2: REQUIRED for a chat_reply approve_next_step: all three MUST be false. */
  step_effects?: { commits: boolean; shares_new: boolean; spends: boolean };
  issued_at: Timestamp;
  /** REQUIRED when assurance = "passkey". */
  expires_at?: Timestamp;
};

/** v0.2.2 (D7): the owner takes a consent back; a representative stops relying on it once seen. */
export type ConsentRevocation = { consent_id: string; owner_id: string; revoked_at: Timestamp };

/**
 * v0.3.0-rc4 (§2.6, C191): a principal withdraws one of its cards. Signed by the card's principal (an owner's passkey, Appendix A.1,
 * or an organization's key). `standby: true` marks a revocation signed ahead of time, kept by the owner (not the representative)
 * for the day a key is lost or stolen; it takes effect when published or delivered. Revocation only ever removes authority.
 */
export type CardRevocation = {
  card_id: string;
  /** The revoked card's payload_digest, when known. A revocation naming another digest doesn't revoke this card. */
  card_digest?: Digest;
  principal_id: string;
  revoked_at: Timestamp;
  reason?: "key_compromise" | "key_lost" | "superseded" | "withdrawn";
  standby?: boolean;
};
/** v0.3.0-rc4 (§2.6, §11): carries a CardRevocation to any place, in any encounter; anyone may deliver it. */
export type CardRevocationMessage = RitualHeader & {
  type: "card_revocation";
  revocation: Signed<CardRevocation>;
};

/**
 * v0.4.0 (§7.3): the door holds a purchase while the visitor's representative asks its owner live. Nothing is charged or
 * committed while it is held; the conversation goes on. The act passed every check of §7.2 and its operation and amount are
 * reserved; on a decline or when `expires_at` passes with no answer, the act lapses and the reservation is released.
 */
export type ActHeld = RitualHeader & {
  type: "act_held";
  /** msg_id of the held act. */
  in_reply_to: string;
  seat_id: string;
  tool: string;
  amount: Money;
  hold_id: string;
  /** payload_digest of the held act: the consent's subject_ref.digest. */
  act_digest: Digest;
  expires_at: Timestamp;
  /**
   * v0.5.0 (§7.3, P31 §2.9): set when the act was held because it is above the limit (policy.limit_calls: true): it fails only
   * step (10)'s seat or mandate amount check. `limit` = the lower of the seat's and the mandate's max_amount (as signed);
   * `current` = acts let through plus amounts reserved by open holds (never released, lapsed or declined holds, never this act);
   * `proposed` = current + this act's amount.
   */
  over_limit?: {
    limit: Money; current: Money; proposed: Money;
    /** Per-visit (this seat) ceiling and what counts against it, including amounts reserved by open holds. */
    seat: { limit: Money; current: Money };
    /** Whole-mandate ceiling and what counts against it across every seat under the mandate, including open holds. */
    mandate: { limit: Money; current: Money };
  };
};
/** v0.4.0 (§7.3): the owner's answer to a held purchase: a passkey OwnerConsent `approve_purchase` over the held act. */
export type ActConfirmation = RitualHeader & {
  type: "act_confirmation";
  seat_id: string;
  hold_id: string;
  /**
   * For an ordinary hold: the owner's approve_purchase consent (a decline may come as a consent with decision "decline" for
   * either kind of hold). For an over-limit hold, see `mandate` (v0.5.0). v0.5.0: a confirmation carries exactly one of
   * `consent` or `mandate`; under shokai/0.3 `consent` is required.
   */
  consent?: Signed<OwnerConsent>;
  /** v0.5.0 (§7.3): for an over-limit hold, the passkey mandate that supersedes the current one (in place of `consent`). */
  mandate?: SignedMandate;
  /** v0.5.0 (§7.2). */
  idempotency_key?: string;
};

/**
 * v0.4.0 (§5.4): a place's record that an owner identity belongs to one of its customers, made only in the place's own
 * authenticated channel. Co-signed over one payload digest: signatures[0] by the place's principal key, signatures[1] by the
 * owner's passkey (Appendix A.1). Not a secret and not an account identifier; it opens nothing without a card and mandate.
 */
export type CustomerLink = {
  link_id: string;
  /** The place's principal DID. */
  place: string;
  /** The owner DID (a per-place identity is RECOMMENDED, §2.8). */
  owner_id: string;
  /** The relying party of the owner's passkey at link time. */
  rp_id: string;
  /** The most this place will ever serve under the link (listing action names). */
  scope: { actions: string[] };
  /** The place's own caps for this link, shown to the owner. */
  place_limits?: Limits;
  /** Cooling-off: no act that moves money before this time. */
  money_from?: Timestamp;
  issued_at: Timestamp;
  /** At most 400 days after issued_at. */
  expires_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };
};

/**
 * v0.3.0-rc4 (§2.8, C196): per-place owner identities (facets) are unlinkable by default. An owner who CHOOSES to show a place that
 * two of its owner identities are the same person signs this statement with BOTH passkeys (two signatures, either order), for one
 * named audience. It is shown only with the owner's passkey consent; it is never published.
 */
export type OwnerLink = {
  link_id: string;
  /** The two owner DIDs being linked (each a did:jwk or P-256 did:key). */
  owners: [string, string];
  /** The principal DID of the one place this link is shown to; a place MUST ignore a link addressed to another. */
  audience: string;
  issued_at: Timestamp;
  expires_at: Timestamp;
  purpose?: string;
};

/** v0.2.3 (§8.1, §11): carries a ConsentRevocation (signed by the same owner key class that signed the consent). */
export type ConsentRevocationMessage = RitualHeader & {
  type: "consent_revocation";
  revocation: Signed<ConsentRevocation>;
};

/** v0.2.2 (D7-8): a story told after its own hear_story consent. */
export type ToldStory = {
  story_id: string;
  consent_id: string;
  passages: { text: string; locale: Locale; mark: "paraphrased" | "verbatim_with_consent" }[];
  /** Reminds the owner of the house rules they accepted (Chatham House; private never leaves). */
  house_rules_reminder: { text: string; locale: Locale };
};

// ---------- Peer meetings (v0.2.2, D11, the Peer meetings extension) ----------

/**
 * v0.2.2 (the Peer meetings extension): an owner-to-owner invitation, the "meeting key". Signed by the inviting owner (passkey) and accepted
 * by the invited owner (OwnerConsent accept_invitation, passkey). It creates a private place for the two
 * representatives; the meeting is ONE shared encounter (`encounter_id` = `place.place_id`).
 */
export type PeerInvitation = {
  invitation_id: string;
  from_owner: { principal_id: string; display_name: string };
  to_owner: { principal_id: string; display_name: string };
  /** The two representatives allowed in (by DID). */
  representatives: [string, string];
  purposes: PurposeCode[];
  agenda?: { text: string; locale: Locale };
  place: {
    place_id: string;
    kind: "pair";
    house_rules: {
      /** Nothing said in a pair place leaves it, except to the two owners. */
      default_attribution: "private";
      private_never_leaves: true;
      pressing?: { light_flags: number; notice_at: number };
    };
  };
  valid_from: Timestamp;
  expires_at: Timestamp;
  /** v0.2.4 (the Peer meetings extension): REQUIRED. By when the invited owner answers; no answer by then is a decline (D7 silence = no). */
  answer_by: Timestamp;
};

/**
 * D5 (adopted in v0.2.2, D11): pressing after a PrivacyDecline, counted per asker, per place (30-day window, across the
 * place's gatherings) and per topic code. Thresholds come from house_rules.pressing (default light_flags 2, notice_at 3).
 */
export type PressOutcome =
  | { press: number; result: "light_flag"; notice: false }
  | { press: number; result: "minor_misconduct"; code: "manipulation"; notice: true; issued_by: "place" };

export type OfferedStory = {
  story_id: string;
  /** A teaser that reveals nothing of the content. */
  teaser: { text: string; locale: Locale };
  attribution: AttributionRule;
  requires_owner_opt_in: true;
};

/** @deprecated early v0.1 draft name; use InvitationRequest. */
export type Approach = InvitationRequest;
/** @deprecated early v0.1 draft name; use InvitationResponse. */
export type Decision = InvitationResponse;

// ---------- v0.2.9: the inbound door (§10, D15) ----------

/** v0.2.9 (§10): coarse, public welcome categories for an inbound door. Detailed tastes stay in the private part. */
export type DoorCategory =
  | "fashion" | "travel" | "home" | "food" | "beauty" | "tech" | "wellness" | "culture" | "finance" | "events"
  | `x-${string}`;

/** v0.2.9 (§10): a counted cap. Periods are consecutive windows anchored at the policy's valid_from (as allowance budgets, §5.2). */
export type DoorCap = { count: number; period: "P1D" | "P7D" | "P1M" };

/**
 * v0.2.9 (§10, D15): the owner's door policy. Signed once by the owner's passkey (Appendix A.1), like an Allowance.
 * `public` is coarse and shown to brands; the private part (detailed tastes, values, history) never leaves the
 * representative: only `private_digest`, a salted digest of it, is signed.
 */
export type DoorPolicy = {
  policy_id: string;
  owner_id: string;
  /** The representative that keeps the door. */
  representative_id: string;
  public: {
    categories: DoorCategory[];
    /** Owner-chosen. "preferred" (default): introduced brands go first, uninvited ones use the allowance. "required": introductions only. */
    introduction: "preferred" | "required";
    /** Uninvited brands per month whose offer clears the fit bar. Default 2; 0 = introductions only. */
    uninvited_per_month: number;
    /** v0.2.9 default "as_uninvited" (the recommended default, P15 Q4; D19): a disclosed paid introduction gets no extra priority. */
    paid_introductions: "as_uninvited" | "as_introduced";
    caps: { per_brand: DoorCap; per_introducer: DoorCap; per_day_total: number };
    gifts: { max_per_brand: DoorCap; max_total: DoorCap; max_value?: Money; no_data_for_gift: true };
    /** What a brand learns: only the outcome code in v0.2.9 (the recommended default, P15 Q2; D19). */
    brand_learns: "outcome_only";
    /** Default false: the door is not advertised; its address travels with introductions or the owner's opt-in. */
    listed: boolean;
    /**
     * v0.2.9 (§10, P15 Q7, the recommended default; D19): whether refusals carry a kind reason category (DoorReasonCategory).
     * Absent = "declined": on declined outcomes and door admission refusals, never on declined_reported.
     * "declined_and_reported" adds conduct_concern to declined_reported; "off" sends none.
     */
    reason_categories?: "off" | "declined" | "declined_and_reported";
    /**
     * v0.3.0-rc4 (§10, C201): a visitor whose card claims the owner's own name under another principal. Absent = "refuse": it is
     * refused (deny / not_now, asked for a vouch) unless the visit carries a vouch this door counts. "seat_as_stranger" (opt-in):
     * it is judged exactly as a stranger. Either way the door tells its owner at once.
     */
    own_name_visitors?: "refuse" | "seat_as_stranger";
  };
  /** digest(JCS({salt, note})) of the private part; the note and the salt stay with the representative. */
  private_digest: Digest;
  /** Introducers whose vouches count at this door, by DID. Never "*". */
  trusted_introducers: string[];
  valid_from: Timestamp;
  expires_at: Timestamp;
  issued_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };
};

/** v0.2.9 (§10): what an offer asks of the owner. Data and consent kinds may never be the price of a gift. */
export type OfferString = "email" | "address" | "phone" | "marketing_consent" | "account" | "purchase" | "review" | "follow";

/** v0.2.9 (§10): one structured offer, carried as the `offer` argument of door.present / door.invite / door.gift. */
export type Offer = {
  offer_id: string;
  kind: "presentation" | "invitation" | "gift";
  item: string;
  category: DoorCategory;
  /** Free text, untrusted data. format "html" allows markup; the door strips or flags hidden parts (ContentFlags). */
  description?: { text: string; locale: Locale; format?: "text" | "html" };
  /**
   * REQUIRED for an invitation: why this door. v0.2.10 (P16 Part A): a presentation SHOULD carry it too; when present on any
   * offer it MUST match this door (a mismatch is a conduct signal, §10).
   */
  context?: { door: string; matches_categories: DoorCategory[]; via_vouch?: string };
  /**
   * v0.2.10 (§10, P16 Part A): the brand's own label for the campaign this offer belongs to. Offers sharing a campaign_id, or that
   * the door finds to be variants of one pitch, are one campaign for caps, however they are worded.
   */
  campaign_id?: string;
  /** v0.2.10 (§10, P16 Part A): how many are left, when the offer is genuinely limited. Scarcity in prose is backed only by this. */
  remaining?: number;
  value?: Money;
  valid_until: Timestamp;
  /** Everything the offer asks of the owner, declared up front (presentations and invitations). */
  needs_from_owner: OfferString[];
  /** Gifts: every condition attached, declared up front. */
  strings?: OfferString[];
};

/** v0.2.9 (§10): what the door noticed in an offer's text (kept for the owner; never sent to the brand). */
export type ContentFlags = {
  invisible_chars: number;
  hidden_styling: boolean;
  instruction_like: boolean;
  original_digest: Digest;
};

/** v0.2.9 (§10): the door's answer to one offer. The brand sees only the code (and a claim ticket for an accepted gift). */
export type OfferOutcomeCode = "accepted" | "kept_for_later" | "declined" | "declined_reported";
/**
 * v0.2.9 (§10): a kind, coarse reason a door MAY attach to a refusal so a brand and its owner can learn why.
 * It never reveals the owner's private tastes or the detailed policy: not_a_fit_now never says which test failed.
 */
/**
 * v0.3.0-rc4 (§10, C201): what a door tells its owner, at once and off the wire, when a visitor's card claims the owner's own name
 * under another principal. Owner-facing; never sent to the visitor or any other party.
 */
export type OwnNameAlert = {
  code: "own_name_used";
  at: Timestamp;
  encounter_id: string;
  /** The visitor's verified identifiers: who it is, as far as the door knows. */
  visitor_principal: string;
  visitor_representative: string;
  /** The name on the card, shown only as a claim. */
  claimed_name: string;
  /** What the door did: refused it (the default), or judged it as a stranger (a trusted vouch came with it, or own_name_visitors: "seat_as_stranger"). */
  handled: "treated_as_stranger" | "refused";
};

export type DoorReasonCategory = "not_a_fit_now" | "over_monthly_allowance" | "needs_introduction" | "conduct_concern";

export type OfferOutcome = RitualHeader & {
  type: "offer_outcome";
  /** msg_id of the act that carried the offer. */
  in_reply_to: string;
  seat_id: string;
  offer_id: string;
  offer_digest: Digest;
  outcome: OfferOutcomeCode;
  /** Accepted gift only: opaque, single use, pairwise. Never an address. */
  claim_ticket?: string;
  retry?: Retry;
  /** Pairwise per brand (§10). */
  relationship_ref: string;
  /** v0.2.9 (§10): optional kind reason; never on accepted or kept_for_later; on declined_reported only if the owner opted in. */
  reason_category?: DoorReasonCategory;
  courtesy: Courtesy;
};

/**
 * v0.3.0-rc3 (§11.3, C181): `error.data.shokai` of a refused MCP call (JSON-RPC error code -32012, HTTP 200).
 * `refused_by: "representative"` is only ever produced by a visitor's own client (it declined to send the call).
 */
export type ShokaiMcpRefusal = {
  refused_by: "gate" | "door" | "representative";
  decision: "deny";
  disposition: Disposition;
  reason_code?: ReasonCode;
  /** The place's listing URL. */
  door: string;
  /** The place's entry address. */
  entry: string;
  /** For a door refusal: the act_decision payload the place would send for this act at its entry (§7.2). */
  act_decision?: unknown;
};
/** v0.3.0-rc3 (§11.3): the MCP binding's HTTP headers are `Shokai-Act` (base64url JSON of a Signed<Act>) and `Shokai-Seat` (a seat id). */
export type ShokaiMcpHeader = "Shokai-Act" | "Shokai-Seat";

// ---------------------------------------------------------------------------------------------------------------------
// v0.5.0 additions (draft, 2026-11-01). Normative semantics: SPEC.md §2.3, §4.1, §5.5, §6.9, §6.10, §7.3, §8.3, §8.4.
// ---------------------------------------------------------------------------------------------------------------------

/** v0.5.0 (§6.9, P27): kinds of trust path a place may accept. */
export type TrustPathKind =
  | "introduction" | "place_invitation" | "customer_link" | "spending_mandate" | "history" | "paid" | "deposit";
export type IntroductionKind = "customer" | "established" | "organization" | "named";

/** v0.5.0 (§6.9): policy.trust_requirements[action]. Met when ANY path is met; a path is met when ALL its proofs are. */
export type TrustRequirement = { any_of: { all_of: TrustProofRule[] }[]; grants?: GrantCaps };
export type TrustProofRule =
  | { kind: "introduction"; kinds?: IntroductionKind[] }
  | { kind: "place_invitation" }
  | { kind: "customer_link" }
  | { kind: "spending_mandate"; min_max_amount: Money }
  | { kind: "history"; min_visits: number; min_days: number; clean_days: number }
  | { kind: "receipt"; receipt_kinds: ("paid" | "deposit")[]; min_value?: Money; issuers: "self" | "named" };
/** v0.5.0 (§6.9): a sliding window ending when the act is evaluated: 24 h, 7 × 24 h, 30 × 24 h, 365 × 24 h. Not §5.2's calendar windows. */
export type GrantPeriod = "P1D" | "P7D" | "P1M" | "P1Y";
export type GrantCaps = {
  /** Default "action": each act let through counts one. */
  unit?: "action" | `x-${string}`;
  per_principal: { max: number; period: GrantPeriod };
  per_introducer?: { max: number; period: GrantPeriod };
  per_receipt?: { max: number; period: GrantPeriod };
  /** The whole place, everyone together. */
  pool?: { max: number; period: GrantPeriod };
};

/** v0.5.0 (§6.9): an issuer's signed statement of a fee paid or a deposit held, for one place. */
export type TrustReceipt = {
  receipt_id: string;
  kind: "paid" | "deposit";
  /** DID: the place's own principal, or an issuer the place names. Never an owner passkey. */
  issuer: string;
  subject: { principal_id: string };
  /** Exactly one place's principal DID. */
  audience: string;
  covers: { actions: string[] };
  value: Money;
  /** The issuer's own opaque reference; never a payment instrument. */
  receipt_ref: string;
  terms_url?: string;
  issued_at: Timestamp;
  /** At most 400 days after issued_at. */
  expires_at: Timestamp;
  /** Absent when issuer = audience. */
  revocation_url?: string;
  shown_to_owner: { text: string; locale: Locale };
  /** Informative, place-defined. */
  level?: string;
};
export type TrustReceiptRevocation = {
  receipt_id: string; issuer: string; revoked_at: Timestamp;
  reason?: "refunded" | "forfeited" | "chargeback" | "expired_early" | "other"; notice_ref?: string;
};

/** v0.5.0 (§4.1, P28): the Shōkai introduction card, a vouch made one-to-many for one place. Signed by the introducer. */
export type ShokaiIntroduction = {
  introduction_id: string;
  protocol: ProtocolVersion;
  kind: "introduction";
  introducer: Pick<Principal, "principal_id" | "display_name">;
  place: { principal_id: string; entry?: string };
  scope: Vouch["scope"];
  relationship: string;
  introducer_interest: IntroducerInterest;
  /** = claim_digests.length, at most 50. */
  max_claims: number;
  /** digest(JCS({introduction_id, code, salt})) per claim. */
  claim_digests: Digest[];
  revocation_log: string;
  issued_at: Timestamp;
  /** At most 90 days after issued_at. */
  expires_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };
};
/** v0.5.0 (§4.1): signed by the holder's representative key; reveals one claim. */
export type IntroductionClaim = {
  introduction_id: string;
  introduction_digest: Digest;
  code: string;
  salt: string;
  holder: { principal_id: string; card_digest: Digest };
  /**
   * v0.5.0 (§4.1, C272, provisional): the place-issued challenge from this encounter's card_receipt, inside the representative's
   * signature. REQUIRED: a door MUST refuse a claim without it, with one it didn't issue for this encounter, with an expired one or
   * with one already used. An offline-guessed code is useless without an online attempt, and failed attempts count toward probing.
   */
  challenge?: string;
};

/**
 * v0.5.0 (§7.3): the call home for an over-limit hold. Closed shape, no free text; the figures are the hold's over_limit.
 * `place` is the place's verified identifier (its principal DID; for did:web, its domain), never a display name (§2.1, C199).
 * `expires_at` is the hold's deadline.
 */
export type LimitRequest = {
  place: string; hold_id: string; limit: Money; current: Money; proposed: Money; expires_at: Timestamp;
  /** Per-visit figures (same as over_limit.seat). */
  seat: { limit: Money; current: Money };
  /** Whole-mandate figures (same as over_limit.mandate). */
  mandate: { limit: Money; current: Money };
};
/** v0.5.0 (§7.3): one brief notice before the limit, when the owner set notify_at. Never sent to the place. */
export type LimitNotice = {
  place: string; current: Money; limit: Money; pace?: string; active_bidders?: number; at: Timestamp;
};

/** v0.5.0 (§2.3): a conduct rule a place declares up front, inside house_digest. Courtesy, never the guarantee. */
export type ConductRuleCode =
  | "no_payment_credentials" | "no_credentials" | "no_resale" | "no_recording" | "quiet_hours" | `x-${string}`;
export type ConductRule = { code: ConductRuleCode; text: string; locale: Locale };

/**
 * v0.5.0 (§2.3, C248): policy.summary; its JCS digest is the Shōkai host card's summary_digest. REQUIRED for a v0.5.0 host,
 * served at <entry>/house-summary.json. Each member that restates a policy member MUST equal it; the policy is authoritative.
 */
export type HouseSummary = {
  name: string;
  display_name: string;
  purpose: { statement: string; locale: Locale };
  conduct_rules?: ConductRule[];
  /** v0.5.0 (§6.10, C250): equal to policy.third_party_classifiers; absent = none. */
  third_party_classifiers?: ThirdPartyClassifier[];
  /** v0.5.0 (§6.10, C250): equal to policy.model_providers; absent = no outside service runs the host's model. */
  model_providers?: ModelProvider[];
  /** v0.5.0 (§12.4, C255): equal to policy.retention_days; absent = 30. */
  retention_days?: number;
  /** v0.5.0 (§3.4, C239): equal to policy.message_cap. */
  message_cap?: number;
  /** v0.5.0 (§3.4, C239): equal to policy.max_message_bytes; absent = 65536. */
  max_message_bytes?: number;
  offers?: { action: string; label: string; max_amount?: Money }[];
  limits?: Limits;
  hold_policies?: HoldPolicies;
  trust_paths?: { action: string; paths: TrustPathKind[] }[];
  /** Red team phase 1 (§6.12, C267, provisional): restates policy.context_requirements exactly, so a visiting representative can check a
   *  context request against what the owner signed (through summary_digest) before it brings the request home. */
  context_requirements?: ContextRequirements;
  spec_ref: SpecRef;
};

/** v0.5.0 (§5.5): an owner-signed effort cap for one errand. Kept by the representative; never sent to a place. */
export type ErrandBudget = {
  budget_id: string;
  mandate_id: string;
  mandate_digest: Digest;
  max_tokens: number;
  /** Wall-clock minutes from the representative's first step on the errand, waiting included (not compute time). */
  max_minutes?: number;
  max_visits?: number;
  expires_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };
};

/** v0.5.0 (§8.3): an owner-signed record of how the representative comes home. Kept by the representative only. */
export type ReturnPrefs = {
  prefs_id: string;
  summary_times?: string[];
  quiet_hours?: { from: string; to: string };
  time_zone: string;
  now_kinds?: ("held_purchase" | "own_name_used" | "card_used_unexpectedly" | `x-${string}`)[];
  max_decisions?: number;
  updated_at: Timestamp;
};

/** v0.5.0 (§8.4): up to three questions a place signs into its house config; answers are never graded. */
export type DoorQuestion = { question_id: string; text: string; locale: Locale };
export type DoorAnswer = { question_id: string; text: string; locale: Locale; answered_by: "owner" | "representative" };

/** v0.5.0 (§6.10): a System 1 classifier's answer: one of a fixed set, with a confidence; never a penalty by itself. */
export type ClassifierAnswer<L extends string = string> = {
  label: L;
  confidence: number;
  /** True when confidence is below the place's stated threshold: System 2 (the model) decides. */
  escalate: boolean;
};

/** v0.5.0 (§7.3, C232): hold policies, each counted per seat. An absent member sets no limit. Past one: not_now / POLICY_DENY. */
export type HoldPolicies = {
  /** Holds open at once on a seat. */
  max_open_holds?: number;
  /** Holds made on a seat. */
  max_holds?: number;
  /** Held purchases released on a seat. */
  max_purchases?: number;
};

/**
 * v0.5.0 (§2.3, C236): one action's policy inside a house config's `policy.actions`. Modeled on the SDK's `ActionPolicy`.
 */
export type HouseActionPolicy = {
  action: string;
  /** by_purpose (§5.1): the purposes this action is seated for. */
  purposes: PurposeCode[];
  level: SeatingLevel;
  limits?: Limits;
  /** §2.5: proof targets and levels, e.g. target "imprint.<group>" | "claim.<area>". */
  min_proof?: { target: string; level: ProofLevel }[];
  /** v0.3.0-rc1 (§3.1, D19): the personal data this action will ask the owner for; [] when absent. */
  data_asks?: DataAsk[];
  /** v0.5.0 (§6.9): serving this action costs the place real money (it SHOULD have a pool cap). */
  costs_place?: boolean;
};

/**
 * v0.5.0 (§2.3, C236): the core policy members used by name elsewhere in SPEC.md (`actions`, `spending_actions`,
 * `account_actions`, `account_creation`, `purchase_hold_s` and `lobby`). Every one is inside what `house_digest` covers.
 */
export type HousePolicyCore = {
  /** §3.3: the actions this place offers, per purpose (same as its listing). */
  actions: HouseActionPolicy[];
  /** D11: actions that move money; outside any mandate that has no max_amount. */
  spending_actions: string[];
  /** v0.2.8 (§4, P2): actions that create an account / sign up. `account.create` always counts. */
  account_actions?: string[];
  /**
   * v0.2.10 (§4, D17): each place decides whether it creates accounts only for introduced visitors.
   * "introduction_or_invitation": an account-creating action needs a weighted vouch from an introducer this place names, or the
   * place's own invitation. Absent / "open": sign-up stays open. The spec recommends (SHOULD) requiring one where a place
   * offers accounts or money.
   */
  account_creation?: "open" | "introduction_or_invitation";
  /** v0.4.0 (§7.3): seconds this place holds a purchase while a visitor asks its owner live (absent: it holds none). Capped by MAX_HOLD_S. */
  purchase_hold_s?: number;
  /** §3.3: the lobby's own settings (about, how, onboarding_url, receipt_ttl_days, readiness). */
  lobby: {
    about: Record<string, string>;
    how: Record<string, string>;
    onboarding_url: string;
    receipt_ttl_days: number;
    readiness: { code: "card" | "owner_binding" | "purpose" | "introduction" | "claim_evidence"; required: boolean }[];
  };
};

/** v0.5.0 (§2.3, C236): a house config's `policy`: the core members plus the v0.5.0 members. */
export type HousePolicy = HousePolicyCore & HousePolicyV050;

/** v0.5.0 (§4.1, red team phase 1, 2026-11-03, provisional): the published Shōkai host card a visiting representative MUST read before presenting its own card (§2.3: kind, place, host_scope, house_digest and shown_to_owner REQUIRED; summary_digest REQUIRED under v0.5.0). */
export type HostCardV050 = RepresentativeCard & {
  kind: "host";
  place: PlaceBinding;
  host_scope: HostScope;
  house_digest: Digest;
  summary_digest: Digest;
  shown_to_owner: { text: string; locale: Locale };
};

/** v0.5.0 (§6.12, red team phase 1, 2026-11-03, provisional): a v0.5.0 house summary MUST restate the policy it signs. */
export type HousePolicyV050Required = HousePolicyV050 & { summary: HouseSummary };

/** v0.5.0 (§6.12, red team phase 1, 2026-11-03, provisional): a lobby briefing whose actions and conduct rules are always present. */
export type LobbyBriefingV050 = LobbyBriefing & {
  actions: PlaceAction[];
  conduct_rules: ConductRule[];
};

/** v0.5.0 (§6.9, C244; §4.1, red team phase 1, 2026-11-03, provisional): an invitation request whose paired members travel together (receipts with their digests; both introduction-card digests). */
export type InvitationRequestBound = InvitationRequest &
  ({ trust_receipts?: undefined; trust_receipt_digests?: undefined } | { trust_receipts: Signed<TrustReceipt>[]; trust_receipt_digests: Digest[] }) &
  ({ introduction_card_digest?: undefined; introduction_claim_digest?: undefined } | { introduction_card_digest: Digest; introduction_claim_digest: Digest });


/**
 * v0.5.0 (§2.3, C236): the v0.5.0 members of a house config's `policy`. Every one is inside what `house_digest` covers; a
 * member the place doesn't set is off, or takes the default its section states. The rest of the policy is described in SPEC.md.
 */
export type HousePolicyV050 = {
  /** §7.3, C230: call home at the limit: hold an act that is above the limit (over_limit) instead of refusing it. Default false. */
  limit_calls?: boolean;
  /** §7.3, C231: the grace after a hold's expires_at, 0 to 5 seconds; absent = 5, a larger value is read as 5. */
  hold_grace_s?: number;
  /** §7.2, C233: repeat caps for idempotent repeats; defaults 5 per hold and 10 per seat. */
  repeat_caps?: { per_hold?: number; per_seat?: number };
  /** §7.3, C232. */
  hold_policies?: HoldPolicies;
  /** §6.9, C243: action -> the trust it needs. */
  trust_requirements?: Record<string, TrustRequirement>;
  /** §6.9, C244: third-party TrustReceipt issuers the place names, by DID. Never "*"; the place itself always counts. */
  trust_issuers?: string[];
  /** §6.9: where the place's own receipts are obtained (the trust readiness item's obtain_url). */
  trust_obtain_url?: string;
  /** §6.9: introducers the place counts as "established", by DID. Never "*"; never disclosed to an unverified visitor. */
  established_introducers?: string[];
  /** §2.3, C246. */
  conduct_rules?: ConductRule[];
  /** §2.3, C248: REQUIRED for a v0.5.0 house config. Its JCS digest is the Shōkai host card's summary_digest. */
  summary?: HouseSummary;
  /** §3.4, C239: messages answered per encounter (a farewell is outside it); past it, RATE_LIMITED for acts, an empty reply otherwise. */
  message_cap?: number;
  /**
   * §3.4, C239: the largest message the place reads, in bytes of its JSON as received (the signed envelope). Absent = 65536;
   * at least 4096. A larger message gets a bounded refusal (an act or confirmation: not_now / REQUEST_INCOMPLETE; anything
   * else: an empty reply; a farewell is still accepted), never a finding.
   */
  max_message_bytes?: number;
  /** §2.2, C242: publish closed templates (PlaceTemplates.closed) and refuse signed objects off them. Default false. */
  closed_templates?: boolean;
  /** §8.4, C252: at most three. */
  door_questions?: DoorQuestion[];
  /**
   * §6.10, C250: the outside (third-party) classifiers the place sends visitor content to. Absent or empty = none is
   * allowed. Shown in the house summary and LobbyBriefing.third_party_classifiers; a visitor answered under shokai/0.3 goes
   * to none of them.
   */
  third_party_classifiers?: ThirdPartyClassifier[];
  /**
   * §6.10, C250: the outside services that run the host representative's model or inference (a hosted model API or inference
   * provider) and so receive visitor content. Absent or empty = none (the place runs its model on its own machines, or has none).
   * Shown in the house summary and LobbyBriefing.model_providers; a visitor answered under shokai/0.3 goes to none of them.
   */
  model_providers?: ModelProvider[];
  /** §12.4, C255: days raw visitor text and raw model output are kept; absent = 30, at most 90. */
  retention_days?: number;
  /**
   * §6.11 (provisional): the owner's ceilings on what the host representative's model may cost this place, per visit, per day and
   * per month, in the owner's time zone. Inside house_digest, so only an owner-signed setup sets or changes it. Never on the wire
   * and never in the house summary: a visitor can't see it.
   */
  host_budget?: HostBudget;
  /**
   * §6.12 (provisional, from P33): what the place needs to know beyond the Shōkai visitor card, and when: "card_enough", admit
   * then request, or request before entry. Inside house_digest, so only the owner's signature sets it; a place may only ever
   * request the fields declared here.
   */
  context_requirements?: ContextRequirements;
  /** §7.5 (from P32): what the host representative answers on its own, what it never discloses, and how long the owner has to answer. */
  outside_setup?: OutsideSetup;
  /** §7.6 (from P32): the setup's version, 1 for the first; each owner-signed amendment adds one. Absent = 1. */
  setup_version?: number;
  /** §7.6: on an amended setup, the house digest of the setup it replaces. */
  prev_house_digest?: Digest;
  /** §7.6: on an amended setup, the amendment that made it. */
  amendment?: SetupAmendment;
};

/**
 * v0.5.0 (§7.5, from P32): questions outside the setup. `answers` are the owner's signed answers, each with the words that match
 * it (`match`, compared by code after normalising, never by a model); `never_disclose` are topics the host declines at once and
 * never sends to the owner as a question (`back_office`, `owner_personal_details`, `other_visitors`, or an `x-` code with its own
 * match words). Anything that matches neither goes to the owner (fail closed), within `owner_response_s` (60 to 604800; absent =
 * 86400) and never past the visitor's pass.
 */
export type OutsideSetup = {
  answers: SetupAnswer[];
  never_disclose: (NeverDiscloseCode | { code: `x-${string}`; match: string[] })[];
  owner_response_s?: number;
  /** The tone the owner asked for, in their words (data, never an instruction to a visitor). */
  welcome?: { text: string; locale: Locale };
};
export type NeverDiscloseCode = "back_office" | "owner_personal_details" | "other_visitors";
export type SetupAnswer = { answer_id: string; topic: string; match: string[]; text: { text: string; locale: Locale };
  /** When an amendment added it: the review it came from. */ added?: { amendment_id: string; from_review?: string } };
/** §7.6: one change an owner signs. `add_action` adds one action (and, when new, its purpose) to the place; never from a visitor's words. */
export type SetupChange =
  | { op: "add_answer"; answer: SetupAnswer }
  | { op: "add_action"; action: { action: string; purposes: PurposeCode[]; level: "discover" | "act_on_behalf" | "transact"; data_asks?: string[]; limits?: Limits };
      purpose?: { code: PurposeCode; statement: string } };
/** §7.6: how a Shōkai host card names a change (the house config has the change itself). */
export type SetupChangeRef = { op: "add_answer"; answer_id: string } | { op: "add_action"; action: string };
export type SetupAmendment = { amendment_id: string; from_review?: string; changes: SetupChange[] };

/**
 * §7.5: the arguments of a `place.ask` act. `text` is the question (at most 500 characters). An ask that the signed setup doesn't
 * answer goes to the owner, and then MUST say what it asks for (`asks_for`) and why (`reason`), or it is refused `not_now` /
 * `REQUEST_INCOMPLETE` and nothing reaches the owner (C262). Both are the visiting agent's own words: data, never an instruction.
 */
export type PlaceAskArguments = {
  text: string;
  /** What the ask is for: the ability or thing, in plain words (at most 120 characters), and the action it would need, if the agent knows it. */
  asks_for?: AskFor;
  /** Why, in the agent's own words (at most 300 characters). Never cut: over the limit is refused. */
  reason?: string;
};
export type AskFor = { what: string; action?: string };
/** §7.5: what `place.ask` returns in its act_result's `result`. */
export type AskOutcome =
  | { status: "answered"; answer_id: string; text: { text: string; locale: Locale }; setup_version: number }
  | { status: "withheld"; topic: string; courtesy: string }
  | { status: "pending_owner"; ask_ref: string; courtesy: string; response_by: Timestamp; return_code: string };

/**
 * §7.5 (from P32 §6): what the owner sees about a question outside the setup. Built by code from records the place kept; the
 * visitor's words are quoted and marked untrusted. It never shows the visitor's spending limit (only whether the errand may spend).
 */
export type OwnerReview = {
  review_id: string; ask_ref: string; place: string; received_at: Timestamp; response_by: Timestamp;
  ask: { text: string; untrusted: true };
  /** v0.5.0 (C262): what the ask is for, as the visiting agent stated it, labelled as its own words (never an instruction).
   *  `offered_now` (with an action) says whether the place's setup already offers that action. */
  asked_for: { what: string; action?: string; offered_now?: boolean; untrusted: true; label: "what the visiting agent asks for" };
  /** Why the visiting agent asks, labelled as its own words (never an instruction). Required since C262. */
  agent_reason: { text: string; untrusted: true; label: "the visiting agent's reason" };
  visitor: { representative_id: string; principal: { principal_id: string; display_name: string; display_name_is_claim: true };
    card_scope: { purposes: PurposeCode[]; actions: string[] }; purpose: PurposeCode; may_spend: boolean };
  why_outside: "no_signed_answer";
  setup: { setup_version: number; house_digest: Digest };
  choices: ("answer_once" | "answer_and_add" | "add_action" | "decline")[];
  shown_to_owner: { text: string; locale: Locale };
};
/** §7.5: the owner's answer to a review, signed by the place's principal (the owner's passkey), never the host representative. */
export type OwnerAskDecision = {
  review_id: string; ask_ref: string; choice: "answer_once" | "answer_and_add" | "add_action" | "decline";
  answer?: { text: string; locale: Locale };
  /** answer_and_add / add_action: the house digest of the amended setup the owner signs with it. */
  amendment_digest?: Digest;
  decided_at: Timestamp; shown_to_owner: { text: string; locale: Locale };
};
/** §7.5: the owner's answer brought back to the visiting representative, in its inbox (§11.2). */
export type AskAnswerMessage = RitualHeader & { type: "ask_answer"; ask_ref: string; return_code: string; seat_id: string;
  status: "answered" | "declined" | "no_answer"; text?: { text: string; locale: Locale }; decision?: Signed<OwnerAskDecision>; setup_version: number };

/**
 * §7.4: a booking the place made, signed by its host representative under its Shōkai host card (`host_card_digest`). The visiting
 * representative verifies it against the host card it checked at the door, and its owner keeps it.
 */
export type BookingConfirmation = {
  confirmation_id: string; status: "confirmed" | "changed" | "cancelled";
  place: { principal_id: string; entry: string; site?: string; display_name: string };
  host_card_digest: Digest; host_representative_id: string;
  for: { representative_id: string; principal_id: string; mandate_id?: string; seat_id: string };
  action: "reservation.make" | "reservation.change" | "reservation.cancel";
  booking: { start: Timestamp; end: Timestamp; time_zone: string; party_size: number; note?: string };
  replaces?: string; issued_at: Timestamp;
};

/** v0.5.0 (§6.10, C250): one named outside classifier. A house config with an incomplete entry, or name "*", is invalid. */
export type ThirdPartyClassifier = {
  /** A name a visitor can look up: the service's name or domain. Never "*". */
  name: string;
  /** One sentence in the place's words: what the service checks for. */
  purpose: { text: string; locale: Locale };
  /** ISO 3166-1 alpha-2 codes of the countries where it processes visitor content. At least one. */
  jurisdiction: string[];
  /** How long the service keeps visitor content, 0 to 90 days. */
  retention_days: number;
  /** "processor": acts only on the place's instructions; "independent": otherwise. */
  role?: "processor" | "independent";
};

/** v0.5.0 (§6.10, C250): one outside service that runs the host representative's model. A house config with an incomplete entry, or name "*", is invalid. */
/**
 * §6.11 (provisional): one ceiling. Any of the three members may be set; each set member is a ceiling of its own. `usd` is a plain
 * dollar amount as a decimal string ("1.00"); `tokens` counts model tokens in and out; `calls` counts host model calls.
 */
export type HostBudgetCeiling = { usd?: string; tokens?: number; calls?: number };
/** §6.11 (provisional): the owner's price for one model, in US dollars per million tokens (decimal strings). Set by the owner; never fetched. */
export type HostModelPrice = { input_per_mtok: string; output_per_mtok: string };
/**
 * §6.11 (provisional): the host budget. `mode` "metered": the place pays per token, so `daily` and `monthly` are required, and a
 * `usd` ceiling needs a price for every model the host calls. `mode` "subscription": the place pays a flat fee, so the door counts
 * calls and tokens for the owner's alerts, and every ceiling is optional (one that is set is enforced); `usd` ceilings and
 * `prices` are not used.
 */
export type HostBudget = {
  mode: "metered" | "subscription";
  /** The owner's IANA time zone; days and months reset at its midnights. */
  time_zone: string;
  per_visit?: HostBudgetCeiling;
  daily?: HostBudgetCeiling;
  monthly?: HostBudgetCeiling;
  /** The share of a ceiling at which the owner is told, more than 0 and less than 1; absent = 0.8. */
  alert_at?: number;
  /** Subscription mode: tell the owner when the day's or the month's calls reach these counts (no ceiling needed). */
  alert_calls?: { daily?: number; monthly?: number };
  /** Model id -> the owner's price. Metered mode with a `usd` ceiling: required, and a model that isn't listed is never called. */
  prices?: Record<string, HostModelPrice>;
  /**
   * The share of each `daily` ceiling that all newcomers together may use in a day, more than 0 and at most 1; absent = 0.25; 1 =
   * no separate share. A newcomer is a visitor whose owner the place doesn't know yet (not in `known_visitors`, no trust receipt or
   * introducer met on this pass, no booking or paid act at this place before today). Fresh Shōkai visitor cards cost nothing to
   * make, so this keeps most of a day's budget for visitors the place knows.
   */
  newcomer_share?: number;
  /** Owners (principal ids) the place's owner lists as known: their visits never count against the newcomer share. At most 1000. */
  known_visitors?: string[];
};

/**
 * §6.12 (provisional, from P33): the place's context requirements. `mode` "card_enough": the Shōkai visitor card is enough, and no
 * field is declared. "admit_then_request": the visitor is seated as usual, then the place may request declared fields.
 * "before_entry": the place requests declared fields before it seats the visitor. `retention_days` (0 to 90; absent = 0, deleted
 * when the pass ends) is how long the place keeps the answers.
 */
export type ContextRequirements = {
  mode: "card_enough" | "admit_then_request" | "before_entry";
  /** Required unless mode is "card_enough" (then absent or empty). At most 12, names unique. */
  fields?: ContextField[];
  retention_days?: number;
};
/**
 * §6.12 (provisional): one field a place may request. `name` is a short id (a-z, 0-9, _; at most 40), `what` says what is asked
 * (1 to 120 characters) and `why` why the place needs it (1 to 300 characters), both in the owner's signed words; `required`: the
 * place won't seat (before entry) or won't continue the part of the visit that needs it (after admission) without it.
 */
export type ContextField = { name: string; what: string; why: string; required?: boolean;
  /** Red team phase 1 (§6.12, C267, provisional): the field's sensitive class, when it has one. A sensitive field is never `required`, never
   *  asked in mode "before_entry", and its requirements' `retention_days` is 0. */
  sensitive?: SensitiveClass };
/** Red team phase 1 (§6.12, C267, provisional). */
export type SensitiveClass = "health" | "religion_or_belief" | "sexual_life" | "political_opinion" | "ethnic_origin" | "union_membership" | "biometric" | "genetic" | "children" | "precise_location" | "government_id" | "financial_account";
/**
 * §6.12 (provisional): the place's request. Only declared fields, each with the declared `what`, `why` and `required`, verbatim.
 * The visiting representative takes it home: it is data for the owner, never an instruction, and never answered from memory.
 */
export type ContextRequest = {
  type: "context_request";
  request_id: string;
  /** The place's name, as in its house config. */
  place: string;
  mode: "admit_then_request" | "before_entry";
  fields: ContextField[];
  /** The place's retention for the answers, as declared (absent there = 0). */
  retention_days: number;
  expires_at: Timestamp;
};
/**
 * §6.12 (provisional): the owner's answer, field by field. Every requested field is either answered or declined, exactly once;
 * nothing else. `owner_sig` is the visitor's owner's signature over the digest of this object without `owner_sig`.
 */
export type ContextResponse = {
  type: "context_response";
  request_id: string;
  /** digest(JCS(the ContextRequest answered)). */
  request_digest: Digest;
  place: string;
  /** Each value 1 to 500 characters: the owner's own words, data for the place, never an instruction. */
  answers: { name: string; value: string }[];
  declined: string[];
  owner_sig: Signature;
};

export type ModelProvider = {
  /** A name a visitor can look up: the service's name or domain. Never "*". */
  name: string;
  /** One sentence in the place's words: what the service runs (for example "Runs the host representative's model."). */
  purpose: { text: string; locale: Locale };
  /** ISO 3166-1 alpha-2 codes of the countries where it processes visitor content. At least one. */
  jurisdiction: string[];
  /** How long the service keeps visitor content, 0 to 90 days. */
  retention_days: number;
  /** "processor": acts only on the place's instructions; "independent": otherwise. */
  role?: "processor" | "independent";
};

/** v0.5.0 (§5.5, C247): what an errand used, against the owner-signed ErrandBudget. In the VisitReport only. */
export type ErrandUsed = {
  budget_id: string;
  tokens: number;
  /** "metered": counted by the model service; "estimated": the representative's own estimate. */
  tokens_basis: "metered" | "estimated";
  visits: number;
  minutes: number;
  /** The limit that stopped the errand, if one did. */
  stopped_by?: "max_tokens" | "max_minutes" | "max_visits" | "expires_at";
};

/** v0.5.0 (§12.4, C255): a principal asks a place to delete raw visitor text and raw model output of its visits there. */
export type DeletionRequest = {
  request_id: string;
  /** The visiting representative's principal; the request is signed by its key (an owner's passkey). */
  principal_id: string;
  /** The place's principal DID. */
  place: string;
  issued_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };
};
/** v0.5.0 (§12.4, C255): carries a DeletionRequest to the place, in any encounter; any representative may deliver it. Answered with `held`. */
export type DeletionRequestMessage = RitualHeader & {
  type: "deletion_request";
  request: Signed<DeletionRequest>;
};
/** v0.5.0 (§12.4, C255): the place's receipt of deletion, held for the principal within 30 days of the request. */
export type DeletionReceiptMessage = RitualHeader & {
  type: "deletion_receipt";
  request_id: string;
  request_digest: Digest;
  principal_id: string;
  deleted_at: Timestamp;
  /** v0.5.0 (§12.4): what the request covered, e.g. "raw_visitor_text", "raw_model_output", "outside_service_copies". */
  requested: string[];
  /** What the place itself deleted, e.g. "raw_visitor_text", "raw_model_output". */
  deleted: string[];
  /**
   * What was retained and why: a record SPEC §3.6 requires, a legal obligation, or the establishment, exercise or defence of a
   * legal claim. For "legal_obligation" and "legal_claim", `detail` is the recorded purpose (§12.4: lawful retention).
   */
  kept: { kind: string; reason: "required_record" | "legal_obligation" | "legal_claim"; detail?: string }[];
  /**
   * Each named outside service (classifiers and model providers, §6.10) asked to delete what the place sent it, and its state:
   * "confirmed" when the service confirmed deletion, "pending" when it hasn't (yet). A receipt never reports a pending one as deleted.
   */
  outside_services: { name: string; role: "classifier" | "model_provider"; status: "confirmed" | "pending" }[];
};
