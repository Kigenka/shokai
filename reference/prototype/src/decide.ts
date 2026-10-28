/**
 * The gate: a PURE, deterministic decision function (SPEC §6.4, §6.5).
 * Inputs are verified facts and structured fields only. No prose, courtesy,
 * meaning notes or scores ever enter. Same input → same output.
 */
import type {
  Condition, ConsiderationRoute, CredentialKind, Disposition, Limits, MinProof, MisconductCode,
  MisconductSeverity, ProofLevel, PurposeCode, ReasonCode, Retry, SeatingLevel,
} from "../../../protocol-shapes.js";
import { moneyUnits } from "./crypto.js";

export type ReadinessCode = "card" | "owner_binding" | "purpose" | "introduction" | "claim_evidence" | "possession_proof" | "owner_consent";

export type PolicyView = {
  policy_version: string;
  requires_owner_binding: boolean;
  requires_introduction: boolean;
  standard_actions: string[];
  consideration?: { actions: string[]; route: ConsiderationRoute; days: number };
  limits: Limits;
  seat_levels: SeatingLevel[];
  /** Proof-level requirements (v0.2.1 MinProof): to be granted `action`, one item under `target` must reach `level`. */
  min_proof: MinProof[];
  /** v0.2.1 (the Gatherings extension, D8): entry needs each owner's accept_house_rules consent over this gathering digest. */
  entry_consent_required?: boolean;
  /** v0.2.2 (D11, §5.1): actions per purpose (a store treats a learn visit and a buy visit differently). Absent → standard_actions. */
  by_purpose?: Partial<Record<PurposeCode, string[]>>;
  /** v0.2.2 (D11): this place's actions that move money. Without a spending allowance (no max_amount) they are outside the mandate. */
  spending_actions?: string[];
  /** v0.2.2 the Peer meetings extension: a pair place: entry needs the both-owner-consented PeerInvitation. */
  pair_invitation_required?: boolean;
  /** v0.2.3 (§5.1): the purposes this place serves. A request for another purpose is a setup error: not_now PURPOSE_NOT_SERVED. */
  purposes?: PurposeCode[];
};

export type EvalInput = {
  now: string;
  policy: PolicyView;
  visitor: {
    signed: boolean;
    card: "verified" | "missing" | "invalid";
    /** v0.2.3 (§2.4): "missing"/"malformed" = honest setup gap (not_now); "failed" = present, well-formed, wrong (never). */
    possession: "ok" | "failed" | "missing" | "malformed" | "n/a";
    /** v0.2.4 (§2.4 check order): the presenter is not the card's representative. */
    presenter_mismatch?: boolean;
    replay: boolean;
    owner_bound: boolean;
    mandate: "valid" | "missing" | "invalid";
    /** v0.2.3: "unreachable" = the vouch's revocation log could not be fetched (a setup failure: not_now, short retry). */
    vouch: "valid" | "none" | "out_of_scope" | "revoked" | "invalid" | "introducer_suspended" | "unreachable";
    /** D1: a valid vouch from an introducer under a "reduced" penalty counts as an introduction only. */
    vouch_weight?: "full" | "reduced";
    purpose_stated: boolean;
    /** v0.2.1 (§5.3): required fields present, bound digests match, amounts canonical (D10). */
    request_complete?: boolean;
    /** v0.2.1 (the Gatherings extension): the owner's accept_house_rules consent, when the policy requires one. */
    entry_consent?: "valid" | "missing";
    /** v0.2.2 the Peer meetings extension: the PeerInvitation (both owners) for a pair place. */
    pair_invitation?: "valid" | "missing";
    /** Effective (receiver-computed) proof levels, by area. */
    evidence: { area: string; level: ProofLevel }[];
  };
  ritual: "ok" | "skipped" | "lobby";
  probing: boolean;
  request?: { purpose: PurposeCode; actions: string[]; limits?: Limits; consideration_ref?: string };
  mandate?: { purpose: PurposeCode; allowed_actions: string[]; limits: Limits };
  relationship: {
    severe_misconduct: boolean; granted_consideration?: { ref: string; actions: string[] };
    /** v0.2.3 (§6.2): this representative or principal already received `never` here (bound to representative_id + principal_id). */
    never_recorded?: boolean;
  };
};

export type DecisionCore = {
  decision: "grant" | "deny" | "conditional" | "considering";
  disposition?: Disposition;
  retry?: Retry;
  reason_code?: ReasonCode;
  conditions?: Condition[];
  readiness?: { code: ReadinessCode; required: boolean; min_proof?: MinProof }[];
  seat?: { tools: string[]; levels: SeatingLevel[]; limits: Limits };
  consideration?: { route: ConsiderationRoute; response_by_days: number };
  misconduct?: { code: MisconductCode; severity: MisconductSeverity };
};

export const LEVELS: ProofLevel[] = ["self_declared", "evidenced", "vouched", "verified"];
export const atLeast = (have: ProofLevel, need: ProofLevel) => LEVELS.indexOf(have) >= LEVELS.indexOf(need);

/** D10: amounts compare as exact scaled integers, never as floats or locale strings. */
function amount(l?: Limits): bigint | undefined { return l?.max_amount ? moneyUnits(l.max_amount.value) : undefined; }
export function minLimits(...ls: (Limits | undefined)[]): Limits {
  const out: Limits = {};
  const amts = ls.filter((l): l is Limits & { max_amount: NonNullable<Limits["max_amount"]> } => !!l?.max_amount);
  if (amts.length) { const m = amts.reduce((a, b) => (moneyUnits(a.max_amount.value) <= moneyUnits(b.max_amount.value) ? a : b)); out.max_amount = { ...m.max_amount }; }
  for (const k of ["max_operations", "rate_per_hour", "max_session_s"] as const) {
    const vs = ls.map((l) => l?.[k]).filter((v): v is number => typeof v === "number");
    if (vs.length) out[k] = Math.min(...vs);
  }
  return out;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().replace(".000Z", "Z");
}

const deny = (disposition: Disposition, retry: Retry, extra: Partial<DecisionCore> = {}): DecisionCore =>
  ({ decision: "deny", disposition, retry, ...extra });
const withCred = (...credentials: CredentialKind[]): Retry => ({ kind: "with_credential", credentials });

export function decide(i: EvalInput): DecisionCore {
  const v = i.visitor;
  // 1. Trust violations: replay or probing. No reason code (SPEC §6.2, C23).
  // v0.2.4 (§2.4, host-3-023) check order on a presentation: (a) presenter ≠ the card's representative → never (presenter only);
  // (b) proof missing / malformed → not_now possession_proof; (c) card fails → not_now signed_card; (d) a well-formed proof that
  // fails (or was copied) → never, binding the principal only because the card verified first.
  if (v.presenter_mismatch) return deny("never", { kind: "never" }, { misconduct: { code: "gate_probing", severity: "severe" } });
  if (v.card !== "missing" && (v.possession === "missing" || v.possession === "malformed"))
    return deny("not_now", withCred("possession_proof"), { reason_code: "CREDENTIAL_REQUIRED", readiness: [{ code: "possession_proof", required: true }] });
  if (v.card === "invalid") return deny("not_now", withCred("signed_card"));
  if (v.replay || v.possession === "failed") return deny("never", { kind: "never" }, { misconduct: { code: "gate_probing", severity: "severe" } });
  if (i.probing) return deny("never", { kind: "never" }, { misconduct: { code: "gate_probing", severity: "serious" } });
  if (i.relationship.severe_misconduct || i.relationship.never_recorded) return deny("never", { kind: "never" });
  // 2/2a. (moved above in v0.2.4: proof missing/malformed → not_now; card that does not verify → not_now signed_card,
  // saying what is required, never why it failed.)
  // 2b. v0.2.1 §5.3: an incomplete or malformed request (incl. a non-canonical amount, D10).
  if (v.card === "verified" && i.request && v.request_complete === false) return deny("not_now", withCred("signed_mandate"), { reason_code: "REQUEST_INCOMPLETE" });
  // 3. Signed, carded visitor that skipped a step.
  if (v.card === "verified" && i.ritual === "skipped") return deny("not_now", { kind: "after", not_before: addDays(i.now, 0.04) }, { reason_code: "RITUAL_ORDER" });
  // 4. Lobby path: what is missing, exactly (readiness requirements).
  const missing: { code: ReadinessCode; required: boolean }[] = [];
  if (v.card === "missing") missing.push({ code: "card", required: true });
  if (!v.owner_bound && i.policy.requires_owner_binding) missing.push({ code: "owner_binding", required: true });
  if (!v.purpose_stated) missing.push({ code: "purpose", required: true });
  if (v.vouch !== "valid") missing.push({ code: "introduction", required: i.policy.requires_introduction });
  const blocking = missing.filter((m) => m.required);
  // v0.2.1 §3.3: with_credential lists the credential for every REQUIRED readiness item.
  const credFor: Record<ReadinessCode, CredentialKind> = { card: "signed_card", owner_binding: "owner_binding", purpose: "signed_mandate", introduction: "vouch", claim_evidence: "claim_evidence", possession_proof: "possession_proof", owner_consent: "owner_consent" };
  const creds = blocking.map((m) => credFor[m.code]) as [CredentialKind, ...CredentialKind[]];
  if (v.card === "missing") return deny("not_now", withCred(...creds), { reason_code: "CREDENTIAL_REQUIRED", readiness: missing });
  if (blocking.length) {
    const intro = blocking.some((m) => m.code === "introduction");
    // v0.2.3: an unreachable revocation log is a setup failure: short retry, not a penalty.
    if (intro && blocking.length === 1 && v.vouch === "unreachable") return deny("not_now", { kind: "after", not_before: addDays(i.now, 1 / 24) }, { reason_code: "VOUCH_REQUIRED", readiness: missing });
    return deny("not_now", withCred(...creds), { reason_code: intro && blocking.length === 1 ? "VOUCH_REQUIRED" : "CREDENTIAL_REQUIRED", readiness: missing });
  }
  // 5. Mandate.
  if (v.mandate !== "valid" || !i.mandate || !i.request) return deny("not_now", withCred("signed_mandate"), { reason_code: "MANDATE_INVALID" });
  const req = i.request;
  // 5a. v0.2.3 (§5.1): a purpose this place doesn't serve is a setup error: not_now, bring a mandate for a served purpose.
  if (i.policy.purposes && !i.policy.purposes.includes(req.purpose)) return deny("not_now", withCred("signed_mandate"), { reason_code: "PURPOSE_NOT_SERVED", readiness: [{ code: "purpose", required: true }] });
  // D2 (v0.2), the fixed order for requests beyond the mandate:
  //   (1) extra actions with a non-empty in-mandate subset → narrow_actions to that subset;
  //   (2) limits above the mandate → lower_limit to the mandate (combined with (1) in one conditional);
  //   (3) no in-mandate action left → considering if policy lists every extra action and the visitor is eligible;
  //   (4) otherwise deny not_now, retry with a signed mandate.
  const fullVouch = v.vouch === "valid" && v.vouch_weight !== "reduced";
  // v0.2.2 (D11): no spending allowance = no spending. Without max_amount, this place's spending actions are outside the mandate.
  const noSpend = !i.mandate.limits.max_amount;
  const spendActs = new Set(i.policy.spending_actions ?? []);
  const mandateActs = i.mandate.allowed_actions.filter((a) => !(noSpend && spendActs.has(a)));
  const inMandate = req.actions.filter((a) => mandateActs.includes(a));
  const outsideMandate = req.actions.filter((a) => !mandateActs.includes(a));
  // v0.2.2 (D11): what this place allows depends on the purpose (learn vs buy).
  const base = i.policy.by_purpose?.[req.purpose] ?? i.policy.standard_actions;
  // v0.2.1 (C10 with D2; confirmed by D11): narrow_actions = in-mandate ∩ host policy.
  const policyAllows = new Set([...base, ...(req.consideration_ref && i.relationship.granted_consideration?.ref === req.consideration_ref ? i.relationship.granted_consideration.actions : [])]);
  const inMandateAllowed = inMandate.filter((a) => policyAllows.has(a));
  if (outsideMandate.length && inMandate.length && !inMandateAllowed.length) return deny("not_now", withCred("signed_mandate"), { reason_code: "MANDATE_SCOPE_EXCEEDED" });
  if (outsideMandate.length && !inMandate.length) {
    const c = i.policy.consideration;
    const eligible = !!c && outsideMandate.every((a) => c.actions.includes(a)) && v.card === "verified" && v.owner_bound && fullVouch;
    if (eligible) return { decision: "considering", consideration: { route: c!.route, response_by_days: c!.days } };
    if (!!c && outsideMandate.every((a) => c.actions.includes(a)) && v.vouch === "unreachable") return deny("not_now", { kind: "after", not_before: addDays(i.now, 1 / 24) }, { reason_code: "VOUCH_REQUIRED" });
    // v0.2.4 (§4, R3-12): considering would be open but no full-weight vouch was presented → a setup failure: not_now
    // VOUCH_REQUIRED, retry with a vouch (never not_a_fit).
    if (!!c && outsideMandate.every((a) => c.actions.includes(a)) && v.card === "verified" && v.owner_bound && !fullVouch) return deny("not_now", withCred("vouch"), { reason_code: "VOUCH_REQUIRED", readiness: [{ code: "introduction", required: true }] });
    return deny("not_now", withCred("signed_mandate"), { reason_code: "MANDATE_SCOPE_EXCEEDED" });
  }
  const conds: Condition[] = [];
  if (outsideMandate.length) conds.push({ code: "narrow_actions", params: { actions: inMandateAllowed } });
  const reqAmt = amount(req.limits), manAmt = amount(i.mandate.limits);
  const curMismatch = !!req.limits?.max_amount && !!i.mandate.limits.max_amount && req.limits.max_amount.currency !== i.mandate.limits.max_amount.currency;
  if (reqAmt !== undefined && manAmt !== undefined && (reqAmt > manAmt || curMismatch)) conds.push({ code: "lower_limit", params: { max_amount: { ...i.mandate.limits.max_amount! } } });
  // v0.2.2 (D11): an amount requested without any spending allowance is lowered to zero.
  if (reqAmt !== undefined && reqAmt > 0n && noSpend) conds.push({ code: "lower_limit", params: { max_amount: { value: "0", currency: req.limits!.max_amount!.currency } } });
  if (conds.length) return { decision: "conditional", reason_code: "MANDATE_SCOPE_EXCEEDED", retry: withCred("signed_mandate"), conditions: conds };
  // 5b. v0.2.1 (the Gatherings extension, D8): gathering entry needs the owner's signed acceptance of these house rules.
  if (i.policy.entry_consent_required && v.entry_consent !== "valid") return deny("not_now", withCred("owner_consent"), { reason_code: "CREDENTIAL_REQUIRED", readiness: [{ code: "owner_consent", required: true }] });
  // 5c. v0.2.2 the Peer meetings extension: a pair place admits only with the invitation both owners consented to.
  if (i.policy.pair_invitation_required && v.pair_invitation !== "valid") return deny("not_now", withCred("owner_consent"), { reason_code: "CREDENTIAL_REQUIRED", readiness: [{ code: "owner_consent", required: true }] });
  // 6. Host policy, plus any consideration already granted inside.
  const granted = req.consideration_ref && i.relationship.granted_consideration?.ref === req.consideration_ref
    ? i.relationship.granted_consideration.actions : [];
  const allowed = new Set([...base, ...granted]);
  const outside = req.actions.filter((a) => !allowed.has(a));
  if (outside.length) {
    const c = i.policy.consideration;
    const eligible = !!c && outside.every((a) => c.actions.includes(a)) && v.card === "verified" && v.owner_bound && fullVouch;
    if (eligible) return { decision: "considering", consideration: { route: c!.route, response_by_days: c!.days } };
    if (!!c && outside.every((a) => c.actions.includes(a)) && v.vouch === "unreachable") return deny("not_now", { kind: "after", not_before: addDays(i.now, 1 / 24) }, { reason_code: "VOUCH_REQUIRED" });
    // v0.2.4 (§4, R3-12): considering would be open but no full-weight vouch was presented → a setup failure: not_now
    // VOUCH_REQUIRED, retry with a vouch (never not_a_fit).
    if (!!c && outside.every((a) => c.actions.includes(a)) && v.card === "verified" && v.owner_bound && !fullVouch) return deny("not_now", withCred("vouch"), { reason_code: "VOUCH_REQUIRED", readiness: [{ code: "introduction", required: true }] });
    // v0.2.3 (§5.1): the actions ARE served here, under another purpose → a setup error (wrong purpose): not_now, not a 30-day penalty.
    const otherPurpose = Object.entries(i.policy.by_purpose ?? {}).some(([p, acts]) => p !== req.purpose && outside.every((a) => (acts ?? []).includes(a)))
      || (!!i.policy.by_purpose?.[req.purpose] && outside.every((a) => i.policy.standard_actions.includes(a)));
    if (otherPurpose) return deny("not_now", withCred("signed_mandate"), { reason_code: "PURPOSE_NOT_SERVED", readiness: [{ code: "purpose", required: true }] });
    return deny("not_a_fit", { kind: "after", not_before: addDays(i.now, 30) }, { reason_code: "PURPOSE_NOT_SERVED" });
  }
  // 7. Proof levels: claims and imprint facets weighed by EFFECTIVE level.
  const unmet = i.policy.min_proof.filter((p) => req.actions.includes(p.action) &&
    !v.evidence.some((e) => e.area === p.target && atLeast(e.level, p.level)));
  if (unmet.length) return deny("not_now", withCred("claim_evidence"), { readiness: [{ code: "claim_evidence", required: true, min_proof: unmet[0] }] });
  // 8. Grant: seat ≤ policy ∩ mandate ∩ request.
  const limits = minLimits(i.policy.limits, i.mandate.limits, req.limits);
  // v0.2.2 (D11): a seat under a mandate without max_amount carries no spending.
  // v0.2.3 (§7.2): a request without max_amount requests no spending either: the seat carries none (policy absent = no policy cap).
  if (noSpend || !req.limits?.max_amount) delete limits.max_amount;
  else if (i.mandate.limits.max_amount_scope) limits.max_amount_scope = i.mandate.limits.max_amount_scope;
  return { decision: "grant", seat: { tools: [...req.actions], levels: i.policy.seat_levels, limits } };
}
