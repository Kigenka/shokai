// The gate: a pure, deterministic function of verified artifacts, structured request fields, policy version,
// host context and evaluation time (SPEC §6.4). Prose is never read here (§6.5). Amounts are exact (D10).
import type { Limits, Mandate, RepresentativeCard, Vouch, SeekingDeclaration, RelationshipRecord, Condition, Retry,
  ReasonCode, SeatGrant, ProofLevel, ConsiderationRoute, PurposeCode, ReadinessRequirement, RevisitHint, Disposition, Digest, MinProof, Money } from "./shapes.js";
import type { PlacePolicy, ActionPolicy } from "./policy.js";
import { parseMoney, moneyOf } from "./crypto.js";

export type VouchWeight = "full" | "reduced" | "suspended" | "none";
export type Approval = { consideration_ref: string; actions: string[]; limits?: Limits; until: string };

export type GateCtx = {
  now: string;
  policy: PlacePolicy;
  host_principal_id: string;
  seeking?: SeekingDeclaration;
  verified: boolean;                 // card verified at step 2
  card: RepresentativeCard;
  mandate: Mandate | null;           // null ⇒ mandate failed verification
  vouch: { vouch: Vouch; weight: VouchWeight } | null;   // weight already reflects scope/expiry/revocation/introducer penalty
  /** Introduction counted at full weight without a vouch (a valid PeerInvitation, the Peer meetings extension). */
  introduced_by_invitation?: boolean;
  request: { actions: string[]; limits?: Limits; data_classes?: string[] };
  approval: Approval | null;         // valid ConsiderationOutcome approval cited via consideration_ref
  record: RelationshipRecord | null; // local relationship snapshot (host context)
  trust: { never: boolean };
  /** §2.5: evidence the host fetched itself, url -> digest of fetched content. */
  fetched: Map<string, string>;
  /** §4 (v0.2.3): the presented vouch's revocation log was unreachable (a setup failure: no weight, nothing recorded). */
  vouch_log_unreachable?: boolean;
  seat_id: string;
  consideration_ref: string;
};

export type GateResult =
  | { decision: "grant"; seat: SeatGrant }
  | { decision: "conditional"; conditions: [Condition, ...Condition[]]; retry: Retry; reason_code?: ReasonCode }
  | { decision: "deny"; disposition: Disposition; retry: Retry; reason_code?: ReasonCode; ctx?: "card" | "paused" | "mandate" | "evidence" | "consent";
      readiness_requirements?: Omit<ReadinessRequirement, "detail" | "owner_text">[]; revisit?: Omit<RevisitHint, "note"> }
  | { decision: "considering"; consideration_ref: string; routed_to: ConsiderationRoute; response_by: string };

const PL: ProofLevel[] = ["self_declared", "evidenced", "vouched", "verified"];
export const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400e3).toISOString().replace(".000Z", "Z");
export const addSec = (iso: string, s: number) => new Date(Date.parse(iso) + s * 1e3).toISOString().replace(".000Z", "Z");
const minIso = (a: string, b: string) => (Date.parse(a) <= Date.parse(b) ? a : b);

/** v0.2.8 (§4, P2): `account.create` is account-creating at every place; a place may name more in policy.account_actions. */
export const ACCOUNT_CREATE = "account.create";
export const createsAccount = (P: PlacePolicy, action: string) => action === ACCOUNT_CREATE || (P.account_actions ?? []).includes(action);
/**
 * v0.2.8 (§4, P2): does this request carry a money operation or an account-creating action? Then a vouch under
 * `trusted_introducers: "*"` carries no weight: only introducers the place names can introduce for these.
 */
export function needsNamedIntroducer(P: PlacePolicy, actions: string[], limits?: Limits): boolean {
  const amt = parseMoney(limits?.max_amount);
  return actions.some((a) => P.spending_actions.includes(a) || createsAccount(P, a)) || (!!amt && amt.units > 0n);
}
/** v0.2.8 (§7.2, P10): the session-wide cap of a limits object: session_max_amount under per_operation, else max_amount. */
export const sessionCapOf = (l: Limits | undefined): Money | undefined =>
  !l ? undefined : l.max_amount_scope === "per_operation" ? (l.session_max_amount ?? l.max_amount) : l.max_amount;

/** Which limit fields of `req` exceed `bound` (absent in bound = unconstrained; amounts exact, D10). */
export function limitsExceeding(req: Limits | undefined, bound: Limits | undefined): (keyof Limits)[] {
  const out: (keyof Limits)[] = []; if (!req || !bound) return out;
  const a = parseMoney(req.max_amount), b = parseMoney(bound.max_amount);
  if (a && b && (a.currency !== b.currency || a.units > b.units)) out.push("max_amount");
  // v0.2.8 (§7.2, P10): a requested session cap above the bound's session cap (its session_max_amount, else max_amount) is over too.
  const rs = parseMoney(req.session_max_amount), bs = parseMoney(sessionCapOf(bound) ?? bound.max_amount);
  if (rs && bs && (rs.currency !== bs.currency || rs.units > bs.units)) out.push("session_max_amount");
  for (const k of ["max_operations", "rate_per_hour", "max_session_s"] as const)
    if (req[k] !== undefined && bound[k] !== undefined && req[k]! > bound[k]!) out.push(k);
  if (req.data_classes && bound.data_classes && req.data_classes.some((d) => !bound.data_classes!.includes(d))) out.push("data_classes");
  return out;
}
/** Intersection of limits: the tighter value of each field present. Currency mismatch ⇒ zero (fail safe). */
export function intersectLimits(...ls: (Limits | undefined)[]): Limits {
  const r: Limits = {};
  for (const l of ls) {
    if (!l) continue;
    const a = parseMoney(l.max_amount), cur = parseMoney(r.max_amount);
    if (a) {
      if (!cur) r.max_amount = { value: l.max_amount!.value, currency: l.max_amount!.currency };
      else if (a.currency !== cur.currency) r.max_amount = { value: "0", currency: cur.currency };
      else if (a.units < cur.units) r.max_amount = { value: l.max_amount!.value, currency: l.max_amount!.currency };   // amounts keep their canonical wire form
    }
    for (const k of ["max_operations", "rate_per_hour", "max_session_s"] as const)
      if (l[k] !== undefined) r[k] = r[k] === undefined ? l[k] : Math.min(r[k]!, l[k]!);
    if (l.data_classes) r.data_classes = r.data_classes ? r.data_classes.filter((d) => l.data_classes!.includes(d)) : [...l.data_classes];
  }
  return r;
}
function lowerLimit(m: Limits, over: (keyof Limits)[], reqCurrency?: string): Limits {
  const p: Limits = {};
  for (const k of over) {
    if (k === "max_amount") p.max_amount = m.max_amount ? { value: m.max_amount.value, currency: m.max_amount.currency } : { value: "0", currency: reqCurrency ?? "USD" };
    else if (k === "data_classes") p.data_classes = m.data_classes;
    else if (k === "session_max_amount") { const c = sessionCapOf(m) ?? m.max_amount; if (c) p.session_max_amount = { value: c.value, currency: c.currency }; }
    else (p as Record<string, unknown>)[k] = m[k];
  }
  return p;
}

/**
 * §2.5 effective proof level. `evidenced` needs an EvidenceRef with content_digest that the host fetched and matched;
 * `vouched` needs a full-weight vouch presented here that names the item (scope.claims or evidence_refs).
 */
export function effectiveLevel(asserted: ProofLevel, item: { id?: string; area?: string; evidence_refs: { kind: string; ref: string; content_digest?: string }[] },
  ctx: { vouch: GateCtx["vouch"]; ownerBound: boolean; fetched: Map<string, string> }): ProofLevel {
  const refs = item.evidence_refs ?? [];
  const evid = refs.some((r) => !!r.content_digest && ctx.fetched.get(r.ref) === r.content_digest);
  const v = ctx.vouch?.weight === "full" ? ctx.vouch.vouch : null;
  const vouchNamed = !!v && (refs.some((r) => r.kind === "vouch" && r.ref === v.vouch_id) || (!!item.id && (v.scope.claims ?? []).includes(item.id)));
  const verified = item.area === "identity" && ctx.ownerBound;
  let eff: ProofLevel = "self_declared";
  if (asserted === "verified") eff = verified ? "verified" : vouchNamed ? "vouched" : evid ? "evidenced" : "self_declared";
  else if (asserted === "vouched") eff = vouchNamed ? "vouched" : evid ? "evidenced" : "self_declared";
  else if (asserted === "evidenced") eff = evid ? "evidenced" : "self_declared";
  return PL.indexOf(eff) <= PL.indexOf(asserted) ? eff : asserted;   // never exceeds the asserted level
}
export function targetLevel(card: RepresentativeCard, target: string, ctx: { vouch: GateCtx["vouch"]; ownerBound: boolean; fetched: Map<string, string> }): ProofLevel | null {
  const [kind, name] = target.split(".");
  let items: { proof_level: ProofLevel; evidence_refs: { kind: string; ref: string; content_digest?: string }[]; area?: string; id?: string }[] = [];
  if (kind === "imprint" && card.imprint && (name in card.imprint))
    items = ((card.imprint as Record<string, any[]>)[name] ?? []).map((f) => ({ ...f, id: f.facet_id }));
  if (kind === "claim") items = (card.claims ?? []).filter((c) => c.area === name).map((c) => ({ ...c, id: c.claim_id }));
  let best = -1;
  for (const it of items) best = Math.max(best, PL.indexOf(effectiveLevel(it.proof_level, it, ctx)));
  return best < 0 ? null : PL[best];
}

export function gate(i: GateCtx): GateResult {
  const P = i.policy;
  if (i.trust.never) return { decision: "deny", disposition: "never", retry: { kind: "never" } };
  if (!i.verified) return { decision: "deny", disposition: "not_now", retry: { kind: "with_credential", credentials: ["signed_card"] }, ctx: "card" };
  if (!i.mandate) return { decision: "deny", disposition: "not_now", reason_code: "MANDATE_INVALID", retry: { kind: "with_credential", credentials: ["signed_mandate"] }, ctx: "mandate" };
  const m = i.mandate; const req = i.request;
  const reqLimits: Limits = { ...(req.limits ?? {}), ...(req.data_classes ? { data_classes: req.data_classes } : {}) };
  const approved = i.approval && Date.parse(i.approval.until) >= Date.parse(i.now) ? i.approval : null;
  const policyAction = (a: string): ActionPolicy | undefined => P.actions.find((x) => x.action === a && x.purposes.includes(m.purpose.code))
    ?? (approved?.actions.includes(a) ? { action: a, purposes: [m.purpose.code], level: "introduce_to_human", limits: approved.limits } : undefined);

  // D11: a mandate without max_amount authorizes no spending: spending actions are outside it, any amount exceeds it.
  const mandateSpends = !!parseMoney(m.limits?.max_amount);
  const inMandate = (a: string) => m.allowed_actions.includes(a) && (mandateSpends || !P.spending_actions.includes(a));
  const inM = req.actions.filter(inMandate);
  const outM = req.actions.filter((a) => !inMandate(a));
  const over = limitsExceeding(reqLimits, m.limits);
  const reqAmt = parseMoney(reqLimits.max_amount);
  if (!mandateSpends && reqAmt && reqAmt.units > 0n && !over.includes("max_amount")) over.unshift("max_amount");

  // §4 (v0.2.3): an introduction is required but the vouch's log was unreachable ⇒ setup failure, not_now / VOUCH_REQUIRED, retry after ≤ 1 day.
  const vouchSetup: GateResult = { decision: "deny", disposition: "not_now", reason_code: "VOUCH_REQUIRED", retry: { kind: "after", not_before: addDays(i.now, 1) } };
  // §4 (v0.2.4, C130): where an introduction (or a full-weight vouch for considering) is needed and none was presented (or it counts
  // as none), the answer is not_now / VOUCH_REQUIRED with retry [vouch] and readiness `introduction`, never not_a_fit.
  const vouchMissing: GateResult = { decision: "deny", disposition: "not_now", reason_code: "VOUCH_REQUIRED", retry: { kind: "with_credential", credentials: ["vouch"] },
    readiness_requirements: [{ code: "introduction", required: true }] };
  const countsAsNone = !i.vouch || i.vouch.weight === "none" || i.vouch.weight === "suspended";
  const blockedOnlyByIntro = () => countsAsNone && !i.introduced_by_invitation && eligible({ ...i, vouch: null, introduced_by_invitation: true });
  const needsIntroOnly = () => !!i.vouch_log_unreachable && blockedOnlyByIntro();
  const introAnswer = (): GateResult | null => (needsIntroOnly() ? vouchSetup : blockedOnlyByIntro() ? vouchMissing : null);
  // D2 fixed order (§6.7), before host policy.
  if (outM.length > 0 && inM.length === 0) {
    if (outM.every((a) => P.considering.actions.includes(a)) && eligible(i)) return considering(i);
    if (outM.every((a) => P.considering.actions.includes(a)) && introAnswer()) return introAnswer()!;
    return { decision: "deny", disposition: "not_now", reason_code: "MANDATE_SCOPE_EXCEEDED", retry: { kind: "with_credential", credentials: ["signed_mandate"] }, ctx: "mandate" };
  }
  if (outM.length > 0 || over.length > 0) {
    const conds: Condition[] = [];
    if (outM.length > 0) {
      const narrow = inM.filter((a) => !!policyAction(a));   // in-mandate ∩ policy (D11)
      if (narrow.length === 0) return { decision: "deny", disposition: "not_now", reason_code: "MANDATE_SCOPE_EXCEEDED", retry: { kind: "with_credential", credentials: ["signed_mandate"] }, ctx: "mandate" };
      conds.push({ code: "narrow_actions", params: { actions: narrow } });
    }
    if (over.length > 0) conds.push({ code: "lower_limit", params: lowerLimit(m.limits ?? {}, over, reqAmt?.currency) });
    return { decision: "conditional", conditions: conds as [Condition, ...Condition[]], reason_code: "MANDATE_SCOPE_EXCEEDED", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
  }

  // Inside the mandate: host policy for this purpose (§6.7 last line → §6.8 or not_a_fit).
  // §3.3 (v0.2.3): a purpose the place doesn't list ⇒ not_now / PURPOSE_NOT_SERVED, retry with a new mandate (the lobby lists the served purposes).
  const servedPurpose = P.purposes.some((p) => p.code === m.purpose.code) || !!approved;
  if (!servedPurpose) return { decision: "deny", disposition: "not_now", reason_code: "PURPOSE_NOT_SERVED", retry: { kind: "with_credential", credentials: ["signed_mandate"] } };
  const notInPolicy = req.actions.filter((a) => !policyAction(a));
  if (notInPolicy.length > 0) {
    if (notInPolicy.every((a) => P.considering.actions.includes(a)) && eligible(i)) return considering(i);
    if (notInPolicy.every((a) => P.considering.actions.includes(a)) && introAnswer()) return introAnswer()!;
    return { decision: "deny", disposition: "not_a_fit", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: addDays(i.now, P.not_a_fit_retry_days) } };
  }
  const aps = req.actions.map((a) => policyAction(a)!);

  // Vouch requirement by purpose (a valid peer invitation counts as the introduction, the Peer meetings extension).
  if (P.require_vouch_for.includes(m.purpose.code) && !i.introduced_by_invitation && i.vouch?.weight !== "full" && i.vouch?.weight !== "reduced" && i.vouch_log_unreachable)
    return vouchSetup;
  if (P.require_vouch_for.includes(m.purpose.code) && !i.introduced_by_invitation && i.vouch?.weight !== "full" && i.vouch?.weight !== "reduced")
    return vouchMissing;

  // min_proof on effective levels (§2.5, C32). Only a verified visitor sees min_proof detail (it is verified here).
  const ownerBound = !!i.card.owner_binding;
  for (const ap of aps) for (const mp of ap.min_proof ?? []) {
    const lvl = targetLevel(i.card, mp.target, { vouch: i.vouch, ownerBound, fetched: i.fetched });
    if (lvl === null || PL.indexOf(lvl) < PL.indexOf(mp.level)) {
      const min_proof: MinProof = { action: ap.action, target: mp.target, level: mp.level };
      return { decision: "deny", disposition: "not_now", retry: { kind: "with_credential", credentials: ["claim_evidence"] }, ctx: "evidence",
        readiness_requirements: [{ code: "claim_evidence", required: true, min_proof }] };
    }
  }

  // Seeking-gated actions (G4a/G4b).
  for (const ap of aps) if (ap.requires_open_seeking_item) {
    const item = i.seeking?.items.find((x) => x.item_id === ap.requires_open_seeking_item);
    if (!item || item.status !== "open") {
      const nb = addDays(i.now, P.paused_retry_days);
      return { decision: "deny", disposition: "not_now", retry: { kind: "after", not_before: nb }, ctx: "paused",
        revisit: { when: { kind: "seeking_item_open", seeking_id: i.seeking?.seeking_id ?? "", item_id: ap.requires_open_seeking_item }, not_before: nb } };
    }
  }

  // Grant: seat = policy ∩ mandate ∩ request (§6.1, §7.1, C10). A mandate without max_amount ⇒ no max_amount ⇒ no spending (D11).
  const limits = intersectLimits(...aps.map((a) => a.limits), m.limits, reqLimits, approved?.limits);
  if (!mandateSpends) delete limits.max_amount;
  if (!reqLimits.max_amount) delete limits.max_amount;   // v0.2.3 (§6.1, C114): no max_amount requested ⇒ none in the seat
  if (limits.max_amount && m.limits?.max_amount_scope) limits.max_amount_scope = m.limits.max_amount_scope;
  else delete limits.max_amount_scope;
  delete limits.session_max_amount;
  // v0.2.8 (§7.2, P10): a per_operation seat still has a session-wide cap: the tightest of the mandate's session cap (its
  // session_max_amount, default its max_amount), the request's, the place's per-seat action limits and any approval. Never above them.
  if (limits.max_amount_scope === "per_operation") {
    let sc: Money | undefined;
    for (const c of [sessionCapOf(m.limits), reqLimits.session_max_amount, ...aps.map((a) => a.limits?.max_amount), approved?.limits?.max_amount]) {
      const x = parseMoney(c), cur = parseMoney(sc); if (!x) continue;
      if (!cur) sc = { value: c!.value, currency: c!.currency };
      else if (x.currency !== cur.currency) sc = { value: "0", currency: cur.currency };
      else if (x.units < cur.units) sc = { value: c!.value, currency: c!.currency };
    }
    if (sc) limits.session_max_amount = sc;
  }
  const levels = [...new Set(aps.map((a) => a.level))];
  // Seat lifetime: the session limit if any, else the place's seat TTL (default one day, as in L0b/G7/PA2), never past the mandate.
  let expires = minIso(m.expires_at, addSec(i.now, P.seat_ttl_s ?? 86400));
  if (limits.max_session_s) expires = minIso(expires, addSec(i.now, limits.max_session_s));
  return { decision: "grant", seat: { seat_id: i.seat_id, levels, tool_allowlist: [...req.actions], access_mode: P.access_mode,
    brand: { label: i.card.role || `${i.card.principal.display_name} representative`, vendor_warranted: true }, expires_at: expires, mandate_id: m.mandate_id, limits } };
}

/** §6.8 eligibility by policy alone. */
function eligible(i: GateCtx): boolean {
  if (!i.verified || !i.mandate) return false;
  if (i.vouch && (i.vouch.weight === "reduced" || i.vouch.weight === "suspended")) return false;
  if (i.policy.considering.requires_introduction && i.vouch?.weight !== "full" && !i.introduced_by_invitation) return false;
  if ((i.record?.misconduct ?? []).some((x) => x.severity === "severe")) return false;
  return true;
}
function considering(i: GateCtx): GateResult {
  return { decision: "considering", consideration_ref: i.consideration_ref, routed_to: i.policy.considering.routed_to,
    response_by: addDays(i.now, i.policy.considering.response_days) };
}
export type { Digest, PurposeCode, Money };
