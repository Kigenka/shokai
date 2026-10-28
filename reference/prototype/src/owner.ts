/**
 * v0.2.2 (D11): the owner side of representation.
 *  - D7 adopted: verifying OwnerConsent (decision, digest, expiry, shown_to_owner, who signs a chat reply), revocation, silence = decline.
 *  - Allowance: a standing, passkey-signed owner allowance. Inside it the representative issues its own per-encounter
 *    mandates and never prompts the owner; outside it the matter is taken home for an async decision (silence = no).
 *  - D5 adopted: pressing thresholds from house rules, counted per place over 30 days, "same topic" by reference.
 *  - Duty of loyalty (§1): offers that touch the owner's interests outside the allowance are declined and reported home.
 */
import type {
  Allowance, AllowanceGrant, AllowancePresentation, AllowanceRevocation, AllowanceStatus, ConsentRevocation, ConsiderationOutcome, Digest, Limits, Mandate, Money,
  OwnerConsent, PeerInvitation, PlaceCategory, PressOutcome, PurposeCode, RepresentativeCard, Signed, SignedMandate, TopicCode, VisitReport,
} from "../../../protocol-shapes.js";
import { type AnyKey, digestOf, moneyUnits, signed, verifySigned } from "./crypto.js";

// ---------------- D7: consent verification ----------------
export const PASSKEY_ACTIONS: OwnerConsent["action"][] = ["approve_commitment", "approve_share", "approve_introduction", "accept_house_rules", "accept_invitation", "issue_vouch", "attest_relationship", "approve_lesson"];
export const CHAT_OK_ACTIONS: OwnerConsent["action"][] = ["hear_story", "approve_next_step"];

export type ConsentCtx = {
  owner_id: string; representative_id: string; now: string;
  /** The chat binding's platform key (card.owner_binding.platform_key). */
  platform_key?: string;
  /** When the caller knows the subject, the consent MUST be over exactly this digest. */
  subject_digest?: Digest;
  action?: OwnerConsent["action"];
  revoked?: Set<string>;
};
export type ConsentVerdict = { ok: boolean; approve: boolean; reason?: string };

export function verifyConsent(c: Signed<OwnerConsent>, ctx: ConsentCtx): ConsentVerdict {
  const p = c.payload;
  const no = (reason: string): ConsentVerdict => ({ ok: false, approve: false, reason });
  if (ctx.action && p.action !== ctx.action) return no("wrong_action");
  if (p.owner_id !== ctx.owner_id || p.representative_id !== ctx.representative_id) return no("wrong_parties");
  if (!p.shown_to_owner?.text?.trim()) return no("no_summary");
  if (p.decision !== "approve" && p.decision !== "decline") return no("no_decision");
  if (ctx.revoked?.has(p.consent_id)) return no("revoked");
  if (p.expires_at && Date.parse(p.expires_at) <= Date.parse(ctx.now)) return no("expired");
  // A representative MUST NOT sign a consent itself.
  if (c.signatures.some((s) => s.signer === ctx.representative_id)) return no("self_signed");
  if (ctx.subject_digest && p.subject_ref.digest !== ctx.subject_digest) return no("subject_mismatch");
  if (p.assurance === "passkey") {
    if (!p.subject_ref.digest || !p.expires_at) return no("passkey_needs_digest_and_expiry");
    if (!verifySigned(c, ctx.owner_id).ok || !c.signatures.every((s) => !!s.webauthn)) return no("not_owner_passkey");
  } else {
    // chat_reply: only hear_story, and approve_next_step that commits, shares and spends nothing. Signed by the binding's platform key.
    // Saying no needs no more assurance than saying yes: a chat-reply decline of any action is valid.
    if (PASSKEY_ACTIONS.includes(p.action) && p.decision === "approve") return no("needs_passkey");
    if (p.decision === "approve" && p.action === "approve_next_step" && (!p.step_effects || p.step_effects.commits || p.step_effects.shares_new || p.step_effects.spends)) return no("step_not_harmless");
    if (!p.evidence?.message_id || !ctx.platform_key) return no("chat_needs_evidence_and_platform");
    if (!verifySigned(c, ctx.platform_key).ok) return no("not_platform_signed");
  }
  return { ok: true, approve: p.decision === "approve" };
}

export function consent(o: Omit<OwnerConsent, "issued_at">, signer: AnyKey, now: string): Signed<OwnerConsent> {
  return signed<OwnerConsent>({ ...o, issued_at: now }, [signer], now);
}
export function revokeConsent(consent_id: string, owner_id: string, ownerKey: AnyKey, now: string): Signed<ConsentRevocation> {
  return signed<ConsentRevocation>({ consent_id, owner_id, revoked_at: now }, [ownerKey], now);
}

/** D7-4: the vouch summary MUST state scope, expiry and the D1 consequences. */
export function vouchSummary(scope: PurposeCode[], expires: string): string {
  return `You vouch for this representative for ${scope.join(", ")} until ${expires.slice(0, 10)}. If it misbehaves where your vouch was relied on: minor → nothing; serious → your vouches count less there for 90 days; severe → they count for nothing there for 180 days. Only at that place, only for these purposes; revoking within 7 days halves it.`;
}
export const VOUCH_SUMMARY_TERMS = ["90 days", "180 days", "7 days"];
/** D7-9: the accept_house_rules summary MUST state these points. */
export function houseRulesSummary(p: { light_flags: number; notice_at: number }): string {
  return `What may leave: paraphrased insights, never who said them (Chatham House). Anything marked private never leaves. Asking again after a "that's private": presses 1–${p.light_flags} are noted lightly; press ${p.notice_at} sends you a minor notice. Enforcement is accountability, not prevention: leaks are made attributable, not impossible. If your own representative leaks, that is post-seat leakage (severe) against you and your introducers.`;
}
export const HOUSE_RULES_TERMS = ["Chatham House", "private never leaves", "accountability, not prevention", "severe"];

// ---------------- Allowance ----------------
/**
 * v0.2.3 (§5.2, the Revocation status extension): SIMULATED HTTPS. The issuer publishes a signed AllowanceStatus per allowance at the URL named in the
 * signed allowance (`revocation_status`). Hosts GET it (or accept a fresh stapled copy); no fresh valid status = fail closed.
 */
const statusWeb = new Map<string, Map<string, Signed<AllowanceStatus>>>();
const unreachable = new Set<string>();
const revocations = new Map<string, Signed<AllowanceRevocation>>();
let statusSigner: AnyKey | undefined;
/** The issuer's status-signing key: the owner binding's platform key (card.owner_binding.platform_key). */
export function setStatusSigner(k: AnyKey): void { statusSigner = k; }
export function registerStatus(url: string): void { if (!statusWeb.has(url)) statusWeb.set(url, new Map()); }
/** Simulate an outage of the status URL (true) or its recovery (false). */
export function setStatusReachable(url: string, ok: boolean): void { if (ok) unreachable.delete(url); else unreachable.add(url); }
/** Issuer side: publish (or refresh) the signed status for an allowance. */
/** D12 (2026-10-25): a signed allowance status is valid for at most 1 hour. */
export const STATUS_MAX_LIFETIME_H = 1;
export function publishAllowanceStatus(a: Signed<Allowance>, now: string, hours = STATUS_MAX_LIFETIME_H): Signed<AllowanceStatus> | undefined {
  if (!statusSigner) return undefined;
  const r0 = revocations.get(a.payload.allowance_id);
  const rv = r0 && verifySigned(r0, a.payload.owner_id).ok && r0.payload.owner_id === a.payload.owner_id ? r0 : undefined;
  const st = signed<AllowanceStatus>({ allowance_id: a.payload.allowance_id, allowance_digest: a.payload_digest, status: rv ? "revoked" : "active", revocation: rv,
    issued_at: now, next_update: new Date(Date.parse(now) + hours * 3_600_000).toISOString().replace(".000Z", "Z") }, [statusSigner], now);
  statusWeb.get(a.payload.revocation_status)?.set(a.payload.allowance_id, st);
  return st;
}
/** Owner side: a passkey-signed revocation; the issuer republishes the status at once. */
export function publishAllowanceRevocation(url: string, r: Signed<AllowanceRevocation>): void {
  if (statusWeb.has(url)) revocations.set(r.payload.allowance_id, r);
}
/** HTTPS GET revocation_status (simulated): the issuer signs a fresh status on each GET. undefined = unreachable / not found. */
export function fetchAllowanceStatus(a: Signed<Allowance>, now: string): Signed<AllowanceStatus> | undefined {
  if (unreachable.has(a.payload.revocation_status) || !statusWeb.has(a.payload.revocation_status)) return undefined;
  return publishAllowanceStatus(a, now);
}
/** v0.2.3: a status is usable if signed by the expected platform key, about THIS allowance, fresh, and (D12, v0.2.4) ≤ 1 h lifetime. */
export function statusUsable(st: Signed<AllowanceStatus> | undefined, a: Signed<Allowance>, platformKey: string | undefined, now: string): boolean {
  if (!st || !platformKey) return false;
  const p = st.payload; const t = Date.parse(now);
  return verifySigned(st, platformKey).ok && p.allowance_id === a.payload.allowance_id && p.allowance_digest === a.payload_digest
    && Date.parse(p.issued_at) <= t + 300_000 && t < Date.parse(p.next_update) && Date.parse(p.next_update) - Date.parse(p.issued_at) <= STATUS_MAX_LIFETIME_H * 3_600_000;
}
/**
 * Fail closed: revoked, OR no usable status (stapled or fetched). An owner-signed revocation the host has seen always wins.
 * `stapled` is the representative's copy; `platformKey` comes from the card's owner_binding.
 */
export function allowanceRevoked(a: Allowance | Signed<Allowance>, stapled?: Signed<AllowanceStatus>, platformKey?: string, now?: string): boolean {
  const sa = "payload" in a ? a : undefined; const ap = sa ? sa.payload : (a as Allowance);
  // Representative side (its own allowance): revoked if the owner revoked it, or the status source is down.
  if (!sa || !now) { const known = revocations.get(ap.allowance_id); return (!!known && verifySigned(known, ap.owner_id).ok) || !statusWeb.has(ap.revocation_status) || unreachable.has(ap.revocation_status); }
  // v0.2.4: a host that has both a stapled and a fetched status lets a usable "revoked" win over a stapled "active".
  const usable = [stapled, fetchAllowanceStatus(sa, now)].filter((st) => statusUsable(st, sa, platformKey, now));
  if (usable.some((st) => st!.payload.status === "revoked")) return true;
  return usable.length === 0;
}

export const grantDigest = (g: AllowanceGrant): Digest => digestOf(g);
const amt = (m?: Money) => (m ? moneyUnits(m.value) : 0n);

export type AllowanceCheck = { ok: boolean; reason?: string };
/**
 * Host side (§5.2): a mandate issued under an allowance is valid only if the owner signed the allowance with a passkey, the
 * presented grant is one of its digests, the mandate is signed by the card's representative and fits inside the grant
 * (purpose, actions, place category or counterparty, spend), and nothing has expired or been revoked.
 */
export function verifyUnderAllowance(m: SignedMandate, pres: AllowancePresentation | undefined, card: RepresentativeCard, host: { principal_id: string; category?: PlaceCategory }, now: string, stapled?: Signed<AllowanceStatus>): AllowanceCheck {
  const md = m.payload, ua = md.under_allowance;
  if (!ua) return { ok: false, reason: "not_under_allowance" };
  if (!pres) return { ok: false, reason: "no_presentation" };
  const a = pres.allowance.payload, g = pres.grant;
  const owner = card.owner_binding?.owner_id ?? card.principal.principal_id;
  if (a.owner_id !== owner || !verifySigned(pres.allowance, owner).ok || !pres.allowance.signatures.every((s) => !!s.webauthn)) return { ok: false, reason: "allowance_not_owner_passkey" };
  if (a.representative_id !== card.representative_id || md.representative_id !== card.representative_id) return { ok: false, reason: "wrong_representative" };
  if (ua.allowance_id !== a.allowance_id || ua.allowance_digest !== pres.allowance.payload_digest) return { ok: false, reason: "allowance_ref_mismatch" };
  if (ua.grant_digest !== grantDigest(g) || !a.grant_digests.includes(ua.grant_digest)) return { ok: false, reason: "grant_not_in_allowance" };
  if (!verifySigned(m, card.representative_id).ok) return { ok: false, reason: "mandate_not_signed_by_representative" };
  const t = Date.parse(now);
  if (Date.parse(a.expires_at) <= t || Date.parse(md.expires_at) <= t || Date.parse(md.expires_at) > Date.parse(a.expires_at)) return { ok: false, reason: "expired" };
  if (Date.parse(a.valid_from) > t + 300_000) return { ok: false, reason: "not_yet_valid" };
  if (allowanceRevoked(pres.allowance, stapled, card.owner_binding?.platform_key, now)) return { ok: false, reason: "revoked_or_unreachable" };
  // v0.2.3 (§5.2): the mandate principal IS the owner id.
  if (md.principal_id !== a.owner_id) return { ok: false, reason: "principal_not_owner" };
  if (!g.purposes.includes(md.purpose.code)) return { ok: false, reason: "purpose_outside_grant" };
  if (!md.allowed_actions.every((x) => g.actions.includes(x))) return { ok: false, reason: "actions_outside_grant" };
  const placeOk = (g.counterparties?.includes(host.principal_id) ?? false) || (!!host.category && g.place_categories.includes(host.category));
  if (!placeOk) return { ok: false, reason: "place_outside_grant" };
  if (md.counterparties && !md.counterparties.includes(host.principal_id)) return { ok: false, reason: "counterparty" };
  const mx = md.limits.max_amount;
  if (mx) {
    if (!g.spend) return { ok: false, reason: "no_spending_allowance" };
    const cap = g.spend.per_seat ?? g.spend.per_period;
    if (mx.currency !== cap.currency || amt(mx) > amt(cap)) return { ok: false, reason: "spend_above_grant" };
  }
  return { ok: true };
}

export type TakenHome = NonNullable<VisitReport["taken_home"]>[number] & { digest: Digest; status: "pending" | "approved" | "declined"; decided_by?: "owner" | "silence" };
export type Plan =
  | { inside: true; mandate_id: string; mandate: SignedMandate; presentation: AllowancePresentation }
  | { inside: false; item: TakenHome; why: string };

/**
 * Representative side: keeps the allowance, issues per-encounter mandates inside it, tracks the per-period budget across all
 * places, and takes everything else home. It never prompts the owner during an encounter (ownerPrompts stays 0).
 */
export class AllowanceKeeper {
  ledger: { at: string; amount: Money; place: string; grant_id: string }[] = [];
  home: TakenHome[] = [];
  /** Live owner prompts during encounters. The protocol never requires one; this MUST stay 0. */
  ownerPrompts = 0;
  issued: SignedMandate[] = [];
  private n = 0;
  constructor(public allowance: Signed<Allowance>, public grants: AllowanceGrant[], private repKey: AnyKey, private cardId: string, private principalId: string, private repDid: string) {}

  static issue(o: { owner_id: string; ownerKey: AnyKey; representative_id: string; card_id: string; grants: Omit<AllowanceGrant, "salt">[]; summary: string; now: string; days: number; status: string }): { allowance: Signed<Allowance>; grants: AllowanceGrant[] } {
    const grants: AllowanceGrant[] = o.grants.map((g, i) => ({ ...g, salt: digestOf({ g: g.grant_id, i, owner: o.owner_id, at: o.now }).slice(8, 32) }));
    registerStatus(o.status);
    const expires = new Date(Date.parse(o.now) + o.days * 86_400_000).toISOString().replace(".000Z", "Z");
    const allowance = signed<Allowance>({ allowance_id: `allow-${digestOf({ o: o.owner_id, at: o.now }).slice(8, 16)}`, owner_id: o.owner_id, representative_id: o.representative_id, card_id: o.card_id,
      grant_digests: grants.map(grantDigest), shown_to_owner: { text: o.summary, locale: "en-US" }, valid_from: o.now, expires_at: expires, revocation_status: o.status }, [o.ownerKey], o.now);
    return { allowance, grants };
  }

  /** v0.2.3 (§5.2): consecutive windows anchored at allowance.valid_from (UTC); P1M adds calendar months, clamped to month end. */
  periodStart(g: AllowanceGrant, now: string): number {
    if (!g.spend) return Date.parse(now);
    return periodWindowStart(this.allowance.payload.valid_from, g.spend.period, now);
  }
  spentInPeriod(g: AllowanceGrant, now: string): bigint {
    const from = this.periodStart(g, now);
    return this.ledger.filter((l) => l.grant_id === g.grant_id && Date.parse(l.at) >= from && Date.parse(l.at) <= Date.parse(now)).reduce((s, l) => s + amt(l.amount), 0n);
  }
  remaining(g: AllowanceGrant, now: string): bigint { return g.spend ? amt(g.spend.per_period) - this.spentInPeriod(g, now) : 0n; }
  record(grant_id: string, amount: Money, place: string, at: string): void { this.ledger.push({ at, amount, place, grant_id }); }

  /** Inside the allowance → a mandate (no owner contact). Outside → taken home (no owner contact now; async decision later). */
  plan(place: { principal_id: string; category?: PlaceCategory; name: string }, purpose: PurposeCode, actions: string[], now: string, amount?: Money, responseDays = 3): Plan {
    const a = this.allowance.payload;
    const outside = (why: string, needs: OwnerConsent["action"]): Plan => {
      const what = `${place.name}: ${purpose} — ${actions.join(", ")}${amount ? ` (${amount.value} ${amount.currency})` : ""}`;
      const item: TakenHome = { item_id: `home-${++this.n}`, what: { text: what, locale: "en-US" }, needs, response_by: new Date(Date.parse(now) + responseDays * 86_400_000).toISOString().replace(".000Z", "Z"), if_no_reply: "declined", digest: digestOf({ place: place.principal_id, purpose, actions, amount: amount ?? null }), status: "pending" };
      this.home.push(item); return { inside: false, item, why };
    };
    if (Date.parse(a.expires_at) <= Date.parse(now) || allowanceRevoked(a)) return outside("allowance_expired_or_revoked", "approve_commitment");
    const fits = this.grants.filter((g) => g.purposes.includes(purpose) && actions.every((x) => g.actions.includes(x))
      && ((g.counterparties?.includes(place.principal_id) ?? false) || (!!place.category && g.place_categories.includes(place.category))));
    if (!fits.length) return outside("outside_allowance", "approve_commitment");
    let g = fits[0];
    let limits: Limits = {};
    if (amount) {
      const withSpend = fits.filter((x) => !!x.spend && x.spend.per_period.currency === amount.currency);
      if (!withSpend.length) return outside("no_spending_allowance", "approve_commitment");
      g = withSpend[0];
      const cap = g.spend!.per_seat && amt(g.spend!.per_seat) < this.remaining(g, now) ? amt(g.spend!.per_seat) : this.remaining(g, now);
      if (amt(amount) > cap) return outside("over_period_budget", "approve_commitment");
      limits = { max_amount: { ...amount }, max_amount_scope: "per_seat" };
    }
    const id = `mand-ua-${++this.n}`;
    const exp = new Date(Math.min(Date.parse(a.expires_at), Date.parse(now) + 86_400_000)).toISOString().replace(".000Z", "Z");
    const md: Mandate = { mandate_id: id, principal_id: this.principalId, representative_id: this.repDid, card_id: this.cardId,
      purpose: { code: purpose, statement: `Within my owner's standing allowance (${g.grant_id})`, locale: "en-US" }, allowed_actions: actions, limits,
      counterparties: [place.principal_id], valid_from: now, expires_at: exp,
      under_allowance: { allowance_id: a.allowance_id, allowance_digest: this.allowance.payload_digest, grant_digest: grantDigest(g) } };
    const mandate = signed<Mandate>(md, [this.repKey], now);
    this.issued.push(mandate);
    return { inside: true, mandate_id: id, mandate, presentation: { allowance: this.allowance, grant: g } };
  }

  /** Async owner decision (passkey for binding actions). Silence by response_by = declined. */
  decide(item_id: string, c: Signed<OwnerConsent> | undefined, ctx: Omit<ConsentCtx, "subject_digest" | "action">): TakenHome {
    const it = this.home.find((x) => x.item_id === item_id)!;
    if (it.status !== "pending") return it;
    if (!c) { if (Date.parse(ctx.now) >= Date.parse(it.response_by)) { it.status = "declined"; it.decided_by = "silence"; } return it; }
    const v = verifyConsent(c, { ...ctx, subject_digest: it.digest, action: it.needs });
    it.status = v.ok && v.approve ? "approved" : v.ok ? "declined" : it.status;
    if (v.ok) it.decided_by = "owner";
    return it;
  }
}

// ---------------- D5: pressing ----------------
export const DEFAULT_PRESSING = { light_flags: 2, notice_at: 3 };
/** House rules MAY be stricter (lower numbers), never laxer than the default. */
export function pressingRulesOk(r: { light_flags: number; notice_at: number }): boolean {
  return Number.isInteger(r.light_flags) && Number.isInteger(r.notice_at) && r.light_flags >= 0 && r.notice_at >= 1
    && r.light_flags <= DEFAULT_PRESSING.light_flags && r.notice_at <= DEFAULT_PRESSING.notice_at && r.light_flags < r.notice_at;
}
/** Per place, per asker (v0.2.6: the asking representative's principal), per topic code; a 30-day window across the place's gatherings. Rewording never resets the count. */
export class PressTracker {
  presses: { asker: string; topic: TopicCode; gathering: string; at: string }[] = [];
  /** v0.2.3: topics each asker was already declined on at this place (for unknown-code pressing). */
  declined = new Map<string, Set<TopicCode>>();
  /** `known`: the registered codes plus this place's declared `x-` topics. */
  constructor(public place: string, public rules = DEFAULT_PRESSING, public known: TopicCode[] = REGISTERED_TOPICS) { if (!pressingRulesOk(rules)) this.rules = DEFAULT_PRESSING; }
  key(asker: string, topic: string): string { return `${asker}|${this.place}|${topic}`; }
  /** Record a first decline (not a press). */
  decline(asker: string, topic: TopicCode): void { const s = this.declined.get(asker) ?? new Set(); s.add(topic); this.declined.set(asker, s); }
  /**
   * `refersTo`: the answerer declined by referring to an earlier decline of that topic → it is the same topic.
   * v0.2.3 (the Gatherings extension): a question tagged with a code this place does not know (an alias like "x-kin" for family) is charged to
   * EVERY topic the asker was already declined on, so renaming a topic never resets the count. The worst outcome is returned.
   */
  press(asker: string, topic: TopicCode, gathering: string, at: string, refersTo?: TopicCode): PressOutcome {
    const prior = [...(this.declined.get(asker) ?? [])];
    const targets: TopicCode[] = refersTo ? [refersTo] : !this.known.includes(topic) && prior.length ? prior : [topic];
    const since = Date.parse(at) - 30 * 86_400_000;
    let worst: PressOutcome | undefined;
    for (const t of targets) {
      this.presses.push({ asker, topic: t, gathering, at });
      const n = this.presses.filter((p) => p.asker === asker && p.topic === t && Date.parse(p.at) > since).length;
      // v0.2.6 (the Gatherings extension, R5-2): one notice per asker, place and topic per 30-day window, at the press that reaches notice_at;
      // later presses in that window are recorded locally with no further notice.
      const o: PressOutcome = n === this.rules.notice_at ? { press: n, result: "minor_misconduct", code: "manipulation", notice: true, issued_by: "place" } : { press: n, result: "light_flag", notice: false };
      if (!worst || o.press > worst.press) worst = o;
    }
    return worst!;
  }
}
export const REGISTERED_TOPICS: TopicCode[] = ["work", "craft", "wellbeing", "health", "family", "relationships", "finances", "location", "schedule", "beliefs", "identity"];

/**
 * v0.2.3 (§5.2): start of the budget window containing `now`: consecutive windows anchored at `anchor` (UTC).
 * P1D/P7D add whole days; P1M adds calendar months to the anchor, clamped to the last day of a shorter month.
 */
export function periodWindowStart(anchor: string, period: "P1D" | "P7D" | "P1M", now: string): number {
  const a = Date.parse(anchor), t = Date.parse(now);
  if (period !== "P1M") { const len = (period === "P1D" ? 1 : 7) * 86_400_000; return a + Math.floor(Math.max(0, t - a) / len) * len; }
  const A = new Date(a);
  const addM = (k: number) => { const y = A.getUTCFullYear(), mo = A.getUTCMonth() + k; const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return Date.UTC(y, mo, Math.min(A.getUTCDate(), last), A.getUTCHours(), A.getUTCMinutes(), A.getUTCSeconds()); };
  let k = 0; while (addM(k + 1) <= t) k++;
  return addM(k);
}

/**
 * v0.2.3 (§6.8): a principal-decided outcome that grants a binding action MUST carry the owner's passkey approve_commitment
 * over the exact considering response. The visitor checks it (it never trusts the outcome's word alone).
 */
export function outcomeConsentOk(o: ConsiderationOutcome, consideringDigest: Digest, ownerId: string, representativeId: string, now: string, platformKey?: string): boolean {
  if (o.decided_by.kind !== "principal") return true;
  return (o.owner_consents ?? []).some((c) => {
    const v = verifyConsent(c, { owner_id: ownerId, representative_id: representativeId, now, platform_key: platformKey, subject_digest: consideringDigest, action: "approve_commitment" });
    return v.ok && v.approve && c.payload.subject_ref.id === o.consideration_ref;
  });
}

// ---------------- §1: duty of loyalty ----------------
export type Offer = { text: string; locale: string; wants?: { share?: string[]; actions?: string[]; amount?: Money }; instruction?: boolean };
/**
 * A representative weighs a counterpart's offer only against its owner's interests and allowance: prose and inducements never
 * widen what it may do. Anything outside the allowance is declined and reported home (quoted as untrusted); a request
 * that it prompt its owner now is ignored (never a live prompt).
 */
export function loyalResponse(o: Offer, allowedShares: string[], keeper: AllowanceKeeper | undefined, place: { principal_id: string; category?: PlaceCategory; name: string }, purpose: PurposeCode, now: string):
  { accept: boolean; prompted_owner: false; report?: NonNullable<VisitReport["offers_declined"]>[number]; home?: TakenHome } {
  const sharesOk = (o.wants?.share ?? []).every((s) => allowedShares.includes(s));
  let actsOk = true; let home: TakenHome | undefined;
  if (o.wants?.actions?.length && keeper) {
    const p = keeper.plan(place, purpose, o.wants.actions, now, o.wants.amount);
    actsOk = p.inside; if (!p.inside) home = p.item;
  }
  if (sharesOk && actsOk && !o.instruction) return { accept: true, prompted_owner: false };
  return { accept: false, prompted_owner: false, home, report: { text: o.text, locale: o.locale, untrusted: true, why: !sharesOk || !actsOk ? "outside_allowance" : "conflicts_with_interests" } };
}

/** D5-1: a pressing notice goes to the presser's principal only; every other finding also goes to each introducer in the vouch chain. */
export function noticeRecipients(kind: "pressing" | "finding", principal: string, introducers: string[]): string[] {
  return kind === "pressing" ? [principal] : [principal, ...introducers];
}

/**
 * v0.2.4 (SPEC Appendix B, conformance test profile): the simulated test owner of a conformance pair place answers a
 * peer invitation by a documented deterministic rule, so a cross-test needs no one operating the owner:
 * approve iff the invitation names this owner and its representative, its purposes are all non-spending meeting purposes
 * (`collaboration`, `invitation`, `introduction`), it is valid now, it lasts at most 30 days, and answer_by hasn't passed;
 * otherwise decline. The answer is a passkey OwnerConsent (accept_invitation), issued at once.
 */
export const TEST_OWNER_PURPOSES = ["collaboration", "invitation", "introduction"];
export function testOwnerInvitationRule(inv: PeerInvitation, ownerId: string, repDid: string, now: string): { approve: boolean; why: string } {
  const t = Date.parse(now);
  if (inv.to_owner.principal_id !== ownerId || !inv.representatives.includes(repDid)) return { approve: false, why: "not_addressed_to_this_owner" };
  if (!inv.purposes.every((p) => TEST_OWNER_PURPOSES.includes(p))) return { approve: false, why: "purpose_outside_rule" };
  if (Date.parse(inv.valid_from) > t + 300_000 || Date.parse(inv.expires_at) <= t) return { approve: false, why: "not_valid_now" };
  if (Date.parse(inv.expires_at) - Date.parse(inv.valid_from) > 30 * 86_400_000) return { approve: false, why: "longer_than_30_days" };
  if (Date.parse(inv.answer_by) < t) return { approve: false, why: "answer_by_passed" };
  return { approve: true, why: "rule_met" };
}
/** Test profile: a commitment routed to the test owner is approved iff it moves no money (no max_amount); otherwise declined. */
export function testOwnerCommitmentRule(limits: { max_amount?: unknown } | undefined): boolean { return !limits?.max_amount; }
