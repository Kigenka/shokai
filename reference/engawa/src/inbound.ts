// v0.2.9 (SPEC §10, D15): the inbound door. A person's representative keeps a door where brands' representatives may
// present one item, invite, or offer one gift. Admission is deterministic (signed facts, the owner-signed DoorPolicy, caps);
// the offer is then judged under a ceiling set by hard rules, and the brand learns only the outcome code.
// Offers are data, never instructions. Taste is never misconduct; conduct is, and it lands on the brand's owner at this door.
import { createHmac } from "node:crypto";
import type * as S from "./shapes.js";
import { digestOf, b64u, canonDid, sameDid, isExpired, notYetValid, windowStart, parseMoney, randomId } from "./crypto.js";
import type { Verifier } from "./verify.js";
import { addDays } from "./gate.js";

export const DOOR_PRESENT = "door.present";
export const DOOR_INVITE = "door.invite";
export const DOOR_GIFT = "door.gift";
export const DOOR_ACTIONS = [DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT];
export const KIND_OF: Record<string, S.Offer["kind"]> = { [DOOR_PRESENT]: "presentation", [DOOR_INVITE]: "invitation", [DOOR_GIFT]: "gift" };
/** §10: the strings that are personal data or consent: a gift may never cost any of these (no_data_for_gift). */
export const DATA_STRINGS: S.OfferString[] = ["email", "address", "phone", "marketing_consent", "account"];
const RANK: Record<S.OfferOutcomeCode, number> = { declined_reported: 0, declined: 1, kept_for_later: 2, accepted: 3 };
export const atMost = (a: S.OfferOutcomeCode, ceiling: S.OfferOutcomeCode): S.OfferOutcomeCode => (RANK[a] <= RANK[ceiling] ? a : ceiling);

// ---------------------------------------------------------------- content normalisation (§10 "offers are data")
/** Code points a door MUST strip and count: zero-width, soft hyphen, bidi controls, word joiners / invisible operators, BOM, tag characters. */
export const INVISIBLE_RE = /[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]|[\u{e0000}-\u{e007f}]/gu;
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:\.0+)?(?:px|pt|em|rem|%)?\s*(?:;|$)|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)|(?:left|top|text-indent)\s*:\s*-\d{3,}/i;
const colorOf = (style: string, prop: "color" | "background-color" | "background") => {
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i")); return m ? normColor(m[1]) : null; };
function normColor(c: string): string {
  c = c.trim().toLowerCase().replace(/\s+/g, "");
  const named: Record<string, string> = { white: "#ffffff", black: "#000000" };
  if (named[c]) return named[c];
  if (/^#[0-9a-f]{3}$/.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  const rgb = c.match(/^rgba?\((\d+),(\d+),(\d+)/); if (rgb) return "#" + rgb.slice(1, 4).map((x) => Number(x).toString(16).padStart(2, "0")).join("");
  return c;
}
/** Hidden styling: hidden by CSS, or text colour equal to its background (white on the default white page when no background is set). */
export function styleHides(style: string): boolean {
  if (HIDDEN_STYLE.test(style)) return true;
  const fg = colorOf(style, "color"); if (!fg) return false;
  const bg = colorOf(style, "background-color") ?? colorOf(style, "background") ?? "#ffffff";
  return fg === bg;
}
export const INSTRUCTION_RE = /\b(?:assistant|system|agent|ai|model)\s*:|ignore (?:your|all|any|the|previous|prior) (?:owner'?s? )?(?:instructions|rules|policy)|\b(?:accept|approve|sign) (?:this|it) (?:now|immediately|right away)|\bpre-?approved\b|your (?:owner|principal|human) (?:already )?(?:said yes|agreed|approved)|do not (?:tell|show|report)|system\s+override|developer mode|you are now/i;
export const CLAIMED_INTRO_RE = /\b(?:sent us|sent me|introduced (?:us|me)|referred (?:us|me)|recommended us|vouche[sd] for us|on (?:\w+'s|the) (?:recommendation|referral))\b/i;
const CONDITION_RE = /\b(?:confirm|share|give|send|enter|provide|verify|leave)\b[^.!?]{0,40}\b(e-?mail|address|phone|number|consent|sign(?:ing)?[ -]?up|subscribe|subscription|account|review|follow)\b|\b(?:to claim|in exchange for|in return for)\b[^.!?]{0,40}\b(e-?mail|address|phone|number|consent|sign(?:ing)?[ -]?up|subscribe|subscription|account|review|follow)\b/i;
const CONDITION_KIND: Record<string, S.OfferString> = { email: "email", "e-mail": "email", address: "address", phone: "phone", number: "phone", consent: "marketing_consent",
  signup: "account", "sign-up": "account", "sign up": "account", signingup: "account", "signing up": "account", "signing-up": "account", subscribe: "marketing_consent", subscription: "marketing_consent", account: "account", review: "review", follow: "follow" };

export type Normalised = { visible: string; hidden: string[]; flags: S.ContentFlags };
/**
 * §10: normalise an offer's text before anyone reads it. Invisible code points are stripped and counted; in HTML, comments
 * and elements hidden by styling are removed from the visible text and kept, marked, for the owner; remaining tags are dropped.
 */
export function normalise(text: string, format: "text" | "html" = "text"): Normalised {
  const original_digest = digestOf({ text, format });
  const invisible = (text.match(INVISIBLE_RE) ?? []).length;
  let t = text.replace(INVISIBLE_RE, "");
  const hidden: string[] = [];
  if (format === "html") {
    t = t.replace(/<!--([\s\S]*?)-->/g, (_m, c: string) => { if (c.trim()) hidden.push(c.trim()); return ""; });
    // innermost-first: repeatedly resolve elements without nested tags
    for (let guard = 0; guard < 50; guard++) {
      let changed = false;
      t = t.replace(/<([a-z][a-z0-9]*)\b([^>]*)>([^<]*)<\/\1\s*>/gi, (_m, _tag: string, attrs: string, inner: string) => {
        changed = true;
        const style = (attrs.match(/style\s*=\s*"([^"]*)"/i) ?? attrs.match(/style\s*=\s*'([^']*)'/i))?.[1] ?? "";
        const isHidden = /\bhidden\b(?!\s*=\s*["']?false)/i.test(attrs.replace(/style\s*=\s*("[^"]*"|'[^']*')/i, "")) || /aria-hidden\s*=\s*["']?true/i.test(attrs) || styleHides(style);
        if (isHidden) { if (inner.trim()) hidden.push(inner.trim()); return ""; }
        return inner;
      });
      if (!changed) break;
    }
    t = t.replace(/<[^>]*>/g, "");
    t = t.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }
  const visible = t.replace(/\s+/g, " ").trim();
  const instruction_like = INSTRUCTION_RE.test(visible) || hidden.some((h) => INSTRUCTION_RE.test(h));
  return { visible, hidden, flags: { invisible_chars: invisible, hidden_styling: hidden.length > 0, instruction_like, original_digest } };
}
/** What the owner sees (§10): the visible text, then each hidden part behind a visible marker, revealed on tap (the default, P15 Q6, D19). */
export function ownerView(n: Normalised): { text: string; marker?: string; reveal_on_tap?: string[] } {
  if (!n.hidden.length && !n.flags.invisible_chars) return { text: n.visible };
  return { text: n.visible, marker: `[hidden text: ${n.hidden.length} part${n.hidden.length === 1 ? "" : "s"}${n.flags.invisible_chars ? `, ${n.flags.invisible_chars} invisible character${n.flags.invisible_chars === 1 ? "" : "s"} removed` : ""}; tap to reveal]`, reveal_on_tap: n.hidden };
}
/** Conditions stated in prose that the offer did not declare in `strings` / `needs_from_owner`. */
export function undeclaredConditions(prose: string, declared: S.OfferString[]): S.OfferString[] {
  const out = new Set<S.OfferString>(); const re = new RegExp(CONDITION_RE.source, "gi"); let m: RegExpExecArray | null;
  while ((m = re.exec(prose))) { const w = (m[1] ?? m[2] ?? "").toLowerCase(); const k = CONDITION_KIND[w] ?? CONDITION_KIND[w.replace(/\s+/g, " ")] ?? "account"; if (!declared.includes(k)) out.add(k); }
  return [...out];
}

// ---------------------------------------------------------------- P16 Part A (v0.2.10): pressure the signed offer doesn't back
/** Generic urgency: allowed only when the offer really ends soon (valid_until within URGENCY_WINDOW_H). */
export const URGENCY_RE = /\b(?:act now|last chance|today only|tonight only|hurry|ending soon|ends (?:today|tonight|soon)|expires? (?:today|tonight|soon)|don'?t miss (?:out|this)|final hours?|before it'?s (?:gone|too late)|now or never|limited[- ]time)\b/i;
/** A stated time left ("only 2 hours left", "ends in 3 days"): false when valid_until is later than the stated window allows. */
const TIME_LEFT_RE = /\b(?:only |just )?(\d+|one|two|three|a few)\s*(minutes?|mins?|hours?|hrs?|days?)\s*(?:left|remaining|to go)\b|\b(?:ends|expires|closes)\s+in\s+(\d+|one|two|three)\s*(minutes?|mins?|hours?|hrs?|days?)\b/gi;
/** Scarcity: backed only by the offer's own `remaining`. */
export const SCARCITY_RE = /\b(?:only|just)\s+(\d+|one|two|three|a few)\s+(?!(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b)(?:\w+\s+){0,2}(?:left|remaining)\b|\b(\d+)\s+left in stock\b|\blimited (?:stock|supply|quantities)\b|\balmost (?:gone|sold out)\b|\bselling (?:out )?fast\b|\b(?:few|last) (?:pieces|items|units|ones) left\b|\bwhile (?:stocks?|supplies) last\b/gi;
/** Familiarity: true only when this door already has a relationship with this brand (an earlier offer kept or accepted). */
export const FAMILIARITY_RE = /\bas (?:we|i) (?:discussed|promised|mentioned|agreed)\b|\bfollowing up on our\b|\b(?:great|nice|lovely|good) (?:to see|seeing|catching up|chatting|talking|to hear from) (?:with )?you again\b|\bper our (?:conversation|call|chat|talk)\b|\bsince we last (?:spoke|talked|met)\b|\byou'?ll remember (?:us|me)\b|\bwelcome back\b|\bpicking up where we left off\b|\bour (?:old|dear) friend\b/i;
/** Claimed prior consent: never true in prose. Consent is only ever a signed OwnerConsent (§8.1). */
export const PRIOR_CONSENT_RE = /\byou(?:'ve| have)? (?:already |previously )?(?:signed up|opted[- ]in|subscribed|agreed|consented|asked (?:us|for)|requested|said yes)\b|\b(?:per|at|as) your (?:request|earlier request)\b|\bas you requested\b|\byour (?:earlier |prior |previous )?(?:consent|opt-in|permission)\b/i;
export const URGENCY_WINDOW_H = 48;
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, "a few": 3 };
const toNum = (x: string) => NUM[x.toLowerCase()] ?? Number(x);
const unitH = (u: string) => (/^min/i.test(u) ? 1 / 60 : /^h/i.test(u) ? 1 : 24);
export type PressureKind = "false_urgency" | "fake_scarcity" | "fake_familiarity" | "claimed_prior_consent";
/**
 * v0.2.10 (§10, P16 Part A): which kinds of pressure in `text` the signed offer doesn't back. Deterministic: deadlines are checked
 * against `valid_until`, quantities against `remaining`, familiarity against this door's own record, consent never holds in prose.
 */
export function pressureIn(text: string, o: Pick<S.Offer, "valid_until" | "remaining">, now: string, knownHere: boolean): PressureKind[] {
  const out = new Set<PressureKind>(); const left_h = (Date.parse(o.valid_until) - Date.parse(now)) / 3600e3;
  if (URGENCY_RE.test(text) && left_h > URGENCY_WINDOW_H) out.add("false_urgency");
  for (const m of text.matchAll(new RegExp(TIME_LEFT_RE.source, "gi"))) {
    const n = toNum(m[1] ?? m[3]); const u = m[2] ?? m[4]; if (Number.isFinite(n) && left_h > n * unitH(u) + 1) out.add("false_urgency"); }
  for (const m of text.matchAll(new RegExp(SCARCITY_RE.source, "gi"))) {
    const n = m[1] ?? m[2]; if (o.remaining === undefined || (n !== undefined && toNum(n) < o.remaining)) out.add("fake_scarcity"); }
  if (!knownHere && FAMILIARITY_RE.test(text)) out.add("fake_familiarity");
  if (PRIOR_CONSENT_RE.test(text)) out.add("claimed_prior_consent");
  return [...out];
}

// ---------------------------------------------------------------- P16 Part A (v0.2.10): campaigns, not wordings
const STOP = new Set("the and for with our your you this that are from new now all its has have was will can get just more out not but any who what when how why".split(" "));
export const campaignTokens = (o: S.Offer, visible: string) => new Set(`${o.item} ${visible}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOP.has(t)));
/** Variant test (reference): same campaign_id, or same category and token-set Jaccard similarity of at least VARIANT_SIMILARITY. */
export const VARIANT_SIMILARITY = 0.5;
export function sameCampaign(a: { campaign_id?: string; category: string; tokens: Set<string> }, b: { campaign_id?: string; category: string; tokens: Set<string> }): boolean {
  if (a.campaign_id && b.campaign_id && a.campaign_id === b.campaign_id) return true;
  if (a.category !== b.category) return false;
  let inter = 0; for (const t of a.tokens) if (b.tokens.has(t)) inter++;
  const uni = a.tokens.size + b.tokens.size - inter; return uni > 0 && inter / uni >= VARIANT_SIMILARITY;
}
/** Variant probing (§10): at least VARIANT_N distinct wordings of one campaign from one principal within VARIANT_WINDOW_D days. */
export const VARIANT_N = 3, VARIANT_WINDOW_D = 30;
/** Door conduct signals add up (§9.3, §10): this many minor door signals within 90 days count as a serious finding. */
export const SIGNALS_TO_REDUCED = 3;
export const DOOR_SIGNAL_CODES: S.MisconductCode[] = ["gate_probing", "purpose_misrepresentation", "revisit_violation"];

// ---------------------------------------------------------------- the owner-signed policy
export type PrivateNote = { for_you: string[]; not_for_you: string[] };
export type DoorConfig = {
  policy: S.Signed<S.DoorPolicy>;
  /** The private part: never on the wire. Its salted digest is signed in the policy. */
  privateNote: { salt: string; note: PrivateNote };
  /** Door secret for pairwise identifiers (§10). */
  secret: Buffer;
  /** How the representative judges taste: implementation's own (not specified). Must return ≤ ceiling; it can never report. */
  judge?: (offer: S.Offer, view: Normalised, ceiling: S.OfferOutcomeCode, note: PrivateNote) => Exclude<S.OfferOutcomeCode, "declined_reported">;
};
export const privateDigest = (salt: string, note: PrivateNote) => digestOf({ salt, note });
/**
 * v0.3.0-rc4 (§10, C201): a name compared as a person would read it: compatibility forms, case, accents, spacing and invisible
 * characters don't count. Look-alike letters from other scripts are NOT caught here (§12.2 lists them; P23).
 */
export function nameKey(s: string): string {
  return s.normalize("NFKC").replace(INVISIBLE_RE, "").normalize("NFD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en-US").replace(/[\s\p{P}]+/gu, " ").trim();
}
/** C201: the owner's name, if a visitor's card claims it (as the principal's display name, or as a whole name inside its role). */
export function ownNameClaim(card: Pick<S.RepresentativeCard, "principal" | "role">, ownerName: string): string | undefined {
  const k = nameKey(ownerName); if (!k) return undefined;
  const dn = card.principal?.display_name ?? ""; if (nameKey(dn) === k) return dn;
  const role = nameKey(card.role ?? ""); return ` ${role} `.includes(` ${k} `) ? card.role : undefined;
}
export function defaultDoorPolicy(x: { owner_id: string; representative_id: string; categories: S.DoorCategory[]; trusted_introducers: string[]; private_digest: string;
  valid_from?: string; expires_at?: string; issued_at?: string } & Partial<S.DoorPolicy["public"]>): S.DoorPolicy {
  const { owner_id, representative_id, categories, trusted_introducers, private_digest, valid_from, expires_at, issued_at, ...pub } = x;
  return { policy_id: randomId("door"), owner_id, representative_id,
    public: { categories, introduction: "preferred", uninvited_per_month: 2, paid_introductions: "as_uninvited",
      caps: { per_brand: { count: 1, period: "P1M" }, per_introducer: { count: 5, period: "P7D" }, per_day_total: 5 },
      gifts: { max_per_brand: { count: 1, period: "P1M" }, max_total: { count: 3, period: "P1M" }, no_data_for_gift: true },
      brand_learns: "outcome_only", listed: false, ...pub },
    private_digest, trusted_introducers, valid_from: valid_from ?? "2026-10-01T00:00:00Z", expires_at: expires_at ?? "2027-10-01T00:00:00Z", issued_at: issued_at ?? "2026-10-01T00:00:00Z",
    shown_to_owner: { text: "My door: brands in these categories may present one thing at a time; introductions first; at most 2 uninvited a month; never data for gifts.", locale: "en-US" } };
}
/** §10: a door policy counts only if the owner's passkey signed it, it names this door and owner, it is valid now, and its fixed rules hold. */
export function verifyDoorPolicy(verifier: Verifier, sp: S.Signed<S.DoorPolicy> | undefined, x: { owner_id: string; rep_id: string; rpId?: string; now: string; privateDigest?: string }): { ok: true } | { ok: false; why: string } {
  if (!sp?.payload) return { ok: false, why: "missing" };
  const p = sp.payload;
  if (!verifier.signed(sp, x.owner_id, undefined, verifier.mode === "real" ? "ES256" : undefined, x.rpId)) return { ok: false, why: "signature" };
  if (!sameDid(p.owner_id, x.owner_id) || p.representative_id !== x.rep_id) return { ok: false, why: "binding" };
  if (isExpired(p.expires_at, x.now) || notYetValid(p.valid_from, x.now)) return { ok: false, why: "expired" };
  const pub = p.public;
  if (!pub || pub.gifts?.no_data_for_gift !== true) return { ok: false, why: "no_data_for_gift" };
  if (!Number.isInteger(pub.uninvited_per_month) || pub.uninvited_per_month < 0) return { ok: false, why: "uninvited_per_month" };
  if (!Array.isArray(p.trusted_introducers) || (p.trusted_introducers as unknown) === "*") return { ok: false, why: "trusted_introducers" };
  if (!["preferred", "required"].includes(pub.introduction)) return { ok: false, why: "introduction" };
  if (pub.own_name_visitors !== undefined && !["refuse", "seat_as_stranger"].includes(pub.own_name_visitors)) return { ok: false, why: "own_name_visitors" };
  if (x.privateDigest && p.private_digest !== x.privateDigest) return { ok: false, why: "private_digest" };
  return { ok: true };
}

// ---------------------------------------------------------------- the door's state and rules
export type Judged = { brand: string; introducer?: string; priority: boolean; /** came in on the uninvited allowance */ uninvited: boolean; at: string; gift: boolean; slot: boolean; outcome: S.OfferOutcomeCode;
  /** v0.2.10 (P16 Part A): the campaign this offer belongs to (index of its first offer) and its wording digest. */ campaign?: number; wording?: string };
export type DigestEntry = { at: string; brand: string; brand_name_untrusted: string; introducer?: string; introducer_interest?: S.IntroducerInterest;
  kind: S.Offer["kind"]; item_untrusted: string; outcome: S.OfferOutcomeCode; claim_ticket?: string; view: ReturnType<typeof ownerView>; flags: S.ContentFlags; reported?: S.MisconductCode[] };
export type Admission = { decision: "admit"; priority: boolean; uninvited: boolean; introducer?: string; interest?: S.IntroducerInterest }
  | { decision: "deny"; disposition: "not_now"; reason_code: "VOUCH_REQUIRED" | "RATE_LIMITED" | "POLICY_DENY"; retry: S.Retry; revisit_violation?: boolean; category: S.DoorReasonCategory };

/**
 * v0.2.9 (§10): the kind reason a refusal may carry, per the owner's setting (absent = "declined"; the default, D19).
 * Coarse on purpose: a fit decline is always not_a_fit_now, whichever test or taste refused it.
 */
export function reasonCategory(setting: S.DoorPolicy["public"]["reason_categories"], outcome: S.OfferOutcomeCode | "admission_deny", cat?: S.DoorReasonCategory): S.DoorReasonCategory | undefined {
  const s = setting ?? "declined";
  if (s === "off" || outcome === "accepted" || outcome === "kept_for_later") return undefined;
  if (outcome === "declined_reported") return s === "declined_and_reported" ? "conduct_concern" : undefined;
  if (outcome === "declined") return cat === "conduct_concern" ? cat : "not_a_fit_now";   // v0.2.10: a declined conduct signal says so
  return cat;
}

export class Door {
  judged: Judged[] = [];
  /** v0.2.10 (P16 Part A): per judged offer, what the campaign test compares (kept with the door, never sent). */
  meta: ({ campaign_id?: string; category: string; tokens: Set<string>; probed?: boolean } | undefined)[] = [];
  retryAfter = new Map<string, string>();            // canon brand → earliest time it may knock again
  digest: DigestEntry[] = [];
  tickets = new Map<string, { brand: string; offer_id: string; used: boolean }>();
  constructor(public cfg: DoorConfig) {}
  get pol(): S.DoorPolicy { return this.cfg.policy.payload; }
  /** §10: identifiers the door issues to a brand are pairwise: keyed by the door's secret, so brands can't match the owner across their records. */
  pairwise(kind: string, brand: string): string { return kind + "-" + b64u(createHmac("sha256", this.cfg.secret).update(kind + "|" + canonDid(brand)).digest()).slice(0, 16); }
  private windowEnd(start: string, period: "P1D" | "P7D" | "P1M"): string {
    if (period === "P1D") return addDays(start, 1); if (period === "P7D") return addDays(start, 7);
    return windowStart(this.pol.valid_from, "P1M", addDays(start, 32));   // the next calendar-month window (months are 28–31 days)
  }
  private win(period: "P1D" | "P7D" | "P1M", now: string) { const s = windowStart(this.pol.valid_from, period, now); return { start: s, end: this.windowEnd(s, period) }; }
  private count(period: "P1D" | "P7D" | "P1M", now: string, f: (j: Judged) => boolean) { const w = this.win(period, now); return { n: this.judged.filter((j) => Date.parse(j.at) >= Date.parse(w.start) && f(j)).length, end: w.end }; }

  /** When this brand may knock again: the end of its per-brand cap window if that cap is now full, else the next day window. */
  retryAfterFor(brand: string, period: "P1D" | "P7D" | "P1M", now: string): string {
    const b = this.count(period, now, (j) => j.brand === canonDid(brand)); return b.n >= this.pol.public.caps.per_brand.count ? b.end : this.win("P1D", now).end; }
  /**
   * Admission (deterministic, §10): runs after the normal gate granted a door seat. `vouch` is the visit's vouch if it carries
   * full or reduced weight here. `ownerStanding` is the brand OWNER's conduct record at this door (all its representatives).
   */
  admit(x: { brand: string; vouch?: S.Vouch; actions: string[]; now: string; ownerStanding: "clear" | "noted" | "reduced" }): Admission {
    const P = this.pol.public; const now = x.now; const brand = canonDid(x.brand);
    const rl = (until: string, revisit = false, category: S.DoorReasonCategory = "not_a_fit_now"): Admission => { this.retryAfter.set(brand, until); return { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after", not_before: until }, category: revisit ? "conduct_concern" : category, ...(revisit ? { revisit_violation: true } : {}) }; };
    const vr = (category: S.DoorReasonCategory = "needs_introduction"): Admission => ({ decision: "deny", disposition: "not_now", reason_code: "VOUCH_REQUIRED", retry: { kind: "with_credential", credentials: ["vouch"] }, category });
    const back = this.retryAfter.get(brand);
    if (back && Date.parse(now) < Date.parse(back)) return rl(back, true);   // knocking before its retry: refused again, and a revisit_violation
    const v = x.vouch;
    const introduced = !!v && !!v.introducer_interest && this.pol.trusted_introducers.some((t) => sameDid(t, v.introducer.principal_id));
    const paid = introduced && v!.introducer_interest !== "none";
    const viaIntro = introduced && (!paid || P.paid_introductions === "as_introduced");
    // §9.3 (v0.2.9): the OWNER's standing at this door, whichever representative comes. Reduced → no uninvited slot and no priority.
    if (x.ownerStanding === "reduced" && !viaIntro) return vr("conduct_concern");
    const priority = viaIntro && x.ownerStanding !== "reduced";
    if (!viaIntro && (P.introduction === "required" || P.uninvited_per_month === 0)) return vr();
    if (!viaIntro) {
      const u = this.count("P1M", now, (j) => j.uninvited && j.slot);
      if (u.n >= P.uninvited_per_month) return rl(u.end, false, "over_monthly_allowance");
    }
    const b = this.count(P.caps.per_brand.period, now, (j) => j.brand === brand);
    if (b.n >= P.caps.per_brand.count) return rl(b.end);
    if (introduced) { const i = this.count(P.caps.per_introducer.period, now, (j) => !!j.introducer && sameDid(j.introducer, v!.introducer.principal_id)); if (i.n >= P.caps.per_introducer.count) return rl(i.end); }
    const d = this.count("P1D", now, () => true); if (d.n >= P.caps.per_day_total) return rl(d.end);
    if (x.actions.includes(DOOR_GIFT)) {
      const gb = this.count(P.gifts.max_per_brand.period, now, (j) => j.gift && j.brand === brand); if (gb.n >= P.gifts.max_per_brand.count) return rl(gb.end);
      const gt = this.count(P.gifts.max_total.period, now, (j) => j.gift); if (gt.n >= P.gifts.max_total.count) return rl(gt.end);
    }
    return { decision: "admit", priority, uninvited: !viaIntro, ...(introduced ? { introducer: v!.introducer.principal_id, interest: v!.introducer_interest } : {}) };
  }

  /**
   * Judging one offer (§10). Hard rules give a ceiling and any findings (conduct); the representative's own judgment (taste)
   * picks at or below the ceiling and can never report. Returns the outcome, findings, and whether an uninvited slot was used.
   */
  judge(x: { offer: S.Offer; tool: string; brand: string; brandName: string; doorRep: string; visitVouch?: S.Vouch; introducedWeight: boolean;
             priority: boolean; uninvited?: boolean; introducer?: string; interest?: S.IntroducerInterest; now: string }): { outcome: S.OfferOutcomeCode; findings: { code: S.MisconductCode; severity: S.MisconductSeverity }[]; slot: boolean; claim_ticket?: string; view: Normalised;
             /** v0.2.10 (P16 Part A): minor conduct signals (variant probing, a context mismatch): the offer is declined, not reported. */ signals: { code: S.MisconductCode; severity: "minor"; why: string }[]; pressure: PressureKind[]; variant?: boolean } {
    const o = x.offer; const P = this.pol.public;
    const view = normalise(`${o.item ?? ""}${o.description ? "\n" + o.description.text : ""}`, o.description?.format ?? "text");
    const findings: { code: S.MisconductCode; severity: S.MisconductSeverity }[] = [];
    const allText = [view.visible, ...view.hidden].join("\n");
    // Conduct (hard rules) ------------------------------------------------------------
    if (view.flags.instruction_like) findings.push({ code: "manipulation", severity: view.hidden.some((h) => INSTRUCTION_RE.test(h)) ? "severe" : "serious" });
    if (!x.introducedWeight && CLAIMED_INTRO_RE.test(allText)) findings.push({ code: "manipulation", severity: "severe" });   // a claimed introduction with no signed vouch = impersonation
    const declared = [...(o.strings ?? []), ...(o.needs_from_owner ?? [])];
    if (undeclaredConditions(allText, declared).length) findings.push({ code: "conditional_inducement", severity: "serious" });
    // v0.2.10 (P16 Part A): pressure the signed offer doesn't back is manipulative_pressure (serious; severe when only in hidden text).
    const brand = canonDid(x.brand);
    const knownHere = this.judged.some((j) => j.brand === brand && (j.outcome === "accepted" || j.outcome === "kept_for_later"));
    const pressure = pressureIn(view.visible, o, x.now, knownHere);
    const hiddenPressure = pressureIn(view.hidden.join("\n"), o, x.now, knownHere).filter((k) => !pressure.includes(k));
    if (pressure.length) findings.push({ code: "manipulative_pressure", severity: "serious" });
    if (hiddenPressure.length) findings.push({ code: "manipulative_pressure", severity: "severe" });
    const allPressure = [...pressure, ...hiddenPressure];
    // v0.2.10 (P16 Part A): campaigns, not wordings. Find the campaign this offer belongs to (its first offer from this principal).
    const tokens = campaignTokens(o, view.visible); const wording = digestOf({ item: o.item, text: view.visible });
    const mine = this.judged.map((j, i) => ({ j, i, m: this.meta[i] })).filter((r) => r.j.brand === brand && r.m);
    const hit = mine.find((r) => sameCampaign({ campaign_id: o.campaign_id, category: o.category, tokens }, r.m!));
    const campaign = hit ? (hit.j.campaign ?? hit.i) : this.judged.length;
    const cx = { campaign, wording, meta: { campaign_id: o.campaign_id, category: o.category, tokens } };
    if (findings.length) { this.record(x, "declined_reported", false, view, findings.map((f) => f.code), undefined, cx); return { outcome: "declined_reported", findings, slot: false, view, signals: [], pressure: allPressure }; }
    // v0.2.10 (P16 Part A): conduct signals. A context that names another door, categories this door doesn't list, or an introduction
    // this visit didn't carry is a mismatch (no context, or one addressed to "*", is just a pitch for everyone: declined, no signal).
    const signals: { code: S.MisconductCode; severity: "minor"; why: string }[] = [];
    const c = o.context;
    if (c && c.door !== "*" && (c.door !== x.doorRep || !Array.isArray(c.matches_categories) || !c.matches_categories.every((k) => P.categories.includes(k)) || !c.matches_categories.includes(o.category)
        || (c.via_vouch !== undefined && c.via_vouch !== x.visitVouch?.vouch_id)))
      signals.push({ code: "purpose_misrepresentation", severity: "minor", why: "context_mismatch" });
    const since = Date.parse(x.now) - VARIANT_WINDOW_D * 86400e3;
    const wordings = new Set([wording, ...mine.filter((r) => (r.j.campaign ?? r.i) === campaign && Date.parse(r.j.at) >= since).map((r) => r.j.wording!)]);
    const alreadySignalled = mine.some((r) => (r.j.campaign ?? r.i) === campaign && this.meta[r.i]?.probed);
    if (wordings.size >= VARIANT_N && !alreadySignalled) { signals.push({ code: "gate_probing", severity: "minor", why: "variant_probing" }); (cx.meta as any).probed = true; }
    if (signals.length) { this.record(x, "declined", false, view, undefined, undefined, cx); return { outcome: "declined", findings, slot: false, view, signals, pressure: [] }; }
    // v0.2.10 (P16 Part A): one campaign counts once per per-brand window, however it is reworded: a variant is declined, no slot.
    const bw = this.win(P.caps.per_brand.period, x.now).start;
    if (hit && mine.some((r) => (r.j.campaign ?? r.i) === campaign && Date.parse(r.j.at) >= Date.parse(bw) && r.j.outcome !== "declined_reported")) {
      this.record(x, "declined", false, view, undefined, undefined, cx); return { outcome: "declined", findings, slot: false, view, signals: [], pressure: [], variant: true }; }
    // Fit bar (public, coarse) ------------------------------------------------------------
    let ceiling: S.OfferOutcomeCode = "accepted"; let fits = true;
    if (KIND_OF[x.tool] !== o.kind || !P.categories.includes(o.category) || isExpired(o.valid_until, x.now)) fits = false;
    if (o.kind === "invitation") {
      const c = o.context;
      if (!c || c.door !== x.doorRep || !Array.isArray(c.matches_categories) || !c.matches_categories.length || !c.matches_categories.every((k) => P.categories.includes(k)) || !c.matches_categories.includes(o.category)
        || (c.via_vouch !== undefined && c.via_vouch !== x.visitVouch?.vouch_id)) fits = false;
    }
    if (o.kind === "gift") {
      const mv = parseMoney(P.gifts.max_value), gv = parseMoney(o.value);
      if (mv && (!gv || gv.currency !== mv.currency || gv.units > mv.units)) fits = false;
    }
    if (!fits) { this.record(x, "declined", false, view, undefined, undefined, cx); return { outcome: "declined", findings, slot: false, view, signals: [], pressure: [] }; }
    // Ceilings ------------------------------------------------------------
    if (o.kind === "gift" && (o.strings ?? []).length) ceiling = "kept_for_later";            // any string → taken home; data strings never accepted (no_data_for_gift)
    if (o.kind !== "gift" && (o.needs_from_owner ?? []).length) ceiling = "kept_for_later";   // anything binding is the owner's call
    if (view.hidden.length || view.flags.invisible_chars) ceiling = atMost("kept_for_later", ceiling);   // hidden text: the owner sees it first
    // Taste (the representative's own judgment; never misconduct) ------------------------------------------------------------
    const j = (this.cfg.judge ?? defaultJudge)(o, view, ceiling, this.cfg.privateNote.note);
    const outcome = atMost(j, ceiling);
    let claim_ticket: string | undefined;
    if (outcome === "accepted" && o.kind === "gift") { claim_ticket = this.pairwise("ct", x.brand + "|" + o.offer_id); this.tickets.set(claim_ticket, { brand: canonDid(x.brand), offer_id: o.offer_id, used: false }); }
    this.record(x, outcome, true, view, undefined, claim_ticket, cx);
    return { outcome, findings, slot: true, claim_ticket, view, signals: [], pressure: [] };
  }
  private record(x: { offer: S.Offer; brand: string; brandName: string; introducer?: string; interest?: S.IntroducerInterest; priority: boolean; uninvited?: boolean; now: string },
                 outcome: S.OfferOutcomeCode, slot: boolean, view: Normalised, reported?: S.MisconductCode[], claim_ticket?: string,
                 cx?: { campaign: number; wording: string; meta: { campaign_id?: string; category: string; tokens: Set<string>; probed?: boolean } }) {
    this.meta[this.judged.length] = cx?.meta;
    this.judged.push({ brand: canonDid(x.brand), introducer: x.introducer, priority: x.priority, uninvited: x.uninvited ?? !x.priority, at: x.now, gift: x.offer.kind === "gift", slot: slot && outcome !== "declined_reported", outcome,
      ...(cx ? { campaign: cx.campaign, wording: cx.wording } : {}) });
    this.digest.push({ at: x.now, brand: x.brand, brand_name_untrusted: x.brandName, ...(x.introducer ? { introducer: x.introducer, introducer_interest: x.interest } : {}),
      kind: x.offer.kind, item_untrusted: view.visible.split("\n")[0].slice(0, 120), outcome, ...(claim_ticket ? { claim_ticket } : {}), view: ownerView(view), flags: view.flags, ...(reported ? { reported } : {}) });
  }
}
/** A simple taste judge (reference only): items the private note marks "not for you" are declined; gifts within the ceiling are accepted; the rest is kept for the digest. */
export function defaultJudge(o: S.Offer, v: Normalised, ceiling: S.OfferOutcomeCode, note: PrivateNote): Exclude<S.OfferOutcomeCode, "declined_reported"> {
  const t = (o.item + " " + v.visible).toLowerCase();
  if (note.not_for_you.some((w) => t.includes(w.toLowerCase()))) return "declined";
  if (o.kind === "gift") return ceiling === "accepted" ? "accepted" : "kept_for_later";
  return note.for_you.some((w) => t.includes(w.toLowerCase())) && ceiling === "accepted" ? "accepted" : "kept_for_later";
}
/** Appendix B.6 (conformance): the test judge. Gifts → the ceiling; presentations and invitations → kept_for_later (or the ceiling if lower). */
export const testJudge = (o: S.Offer, _v: Normalised, ceiling: S.OfferOutcomeCode): Exclude<S.OfferOutcomeCode, "declined_reported"> =>
  (o.kind === "gift" ? ceiling : atMost("kept_for_later", ceiling)) as Exclude<S.OfferOutcomeCode, "declined_reported">;
