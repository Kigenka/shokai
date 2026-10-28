// The Engawa: a gathering place (SPEC the Gatherings extension, D4, D5, D7, D8, D10 topic codes).
import type * as S from "./shapes.js";
import { digestOf } from "./crypto.js";
import type { GateResult } from "./gate.js";
import type { Host } from "./host.js";
import { verifyOwnerConsent } from "./trust.js";

type Msg = Record<string, any>;
type Item = { msg: S.GatheringMessage | S.PrivacyDecline; sender_principal: string; room: boolean };
export const ATTEND_ACTION = "gathering.attend";
/** Appendix B.3: a test gathering MAY serve this action (purpose `invitation`). */
const findLast = <T,>(xs: T[], f: (x: T) => boolean): T | undefined => { for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return xs[i]; return undefined; };
export const REQUEST_INVITATION_ACTION = "gathering.request_invitation";
export const TOPICS = new Set(["work", "craft", "wellbeing", "health", "family", "relationships", "finances", "location", "schedule", "beliefs", "identity"]);
const DEFAULT_PRESSING = { light_flags: 2, notice_at: 3 };
const PRESS_WINDOW_MS = 30 * 86400e3;
/** Job-title patterns stripped from takeaways (the Gatherings extension, C63); conformance checks only absence (§11 item 1). */
const TITLE_RE = /\b(head of [\w& -]+?|chief [\w]+ officer|ceo|cto|cfo|coo|founder|co-founder|director|vice president|vp|manager|lead|principal|partner)\b/gi;

export class GatheringPlace {
  attendees = new Map<string, { principal: string; seat: S.SeatGrant; consent_id: string; card: S.RepresentativeCard }>(); // rep id -> entry
  items: Item[] = [];
  declines: { asker: string; topic: string; at: string }[] = [];
  /** the Gatherings extension (v0.2.6): presses per ASKER PRINCIPAL and topic code at this place, 30-day window; never shared between askers. */
  presses = new Map<string, string[]>();
  /** Last notice per asker principal + topic (one per 30-day window). */
  noticed = new Map<string, string>();
  rate = new Map<string, number[]>();
  flags: { asker: string; topic: string; press: number; result: "light_flag" | "minor_misconduct"; at: string }[] = [];
  constructor(public host: Host) {}
  get g(): S.Gathering { return this.host.cfg.gathering!.payload; }
  get gDigest(): string { return this.host.cfg.gathering!.payload_digest; }
  /** D5: house_rules.pressing may be stricter, never laxer; a laxer value is ignored in favor of the defaults. */
  get thresholds() {
    const p = this.g.house_rules.pressing;
    if (!p || !(p.light_flags >= 0) || !(p.notice_at >= 1) || p.light_flags > DEFAULT_PRESSING.light_flags || p.notice_at > DEFAULT_PRESSING.notice_at || p.notice_at <= p.light_flags) return DEFAULT_PRESSING;
    return p;
  }
  topicKnown(t: unknown): t is string { return typeof t === "string" && (TOPICS.has(t) || (t.startsWith("x-") && (this.g.house_rules.topics ?? []).includes(t as S.TopicCode))); }

  /** Pre-gate entry check (the Gatherings extension entry message). Deterministic over verified artifacts. */
  checkEntry(r: S.InvitationRequest, card: S.RepresentativeCard, now: string): { decision: "ok" } | { decision: "fail"; result: GateResult } | undefined {
    if (!r.proposal?.request?.actions?.includes(ATTEND_ACTION)) return undefined;
    const inv = this.g.invitees.find((i) => i.representative_id === card.representative_id && i.principal_id === card.principal.principal_id);
    if (!inv || Date.parse(now) > Date.parse(this.g.ends_at))
      return { decision: "fail", result: { decision: "deny", disposition: "not_a_fit", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: this.g.ends_at } } };
    const owner = card.owner_binding?.owner_id ?? card.principal.principal_id;
    const ok = (r.owner_consents ?? []).some((c) => verifyOwnerConsent(this.host.verifier, c, { action: "accept_house_rules", owner_id: owner,
      subject: { kind: "gathering", id: this.g.gathering_id, digest: this.gDigest }, now, rpId: card.owner_binding?.rp_id, revoked: this.host.revokedConsents }).ok && c.payload.decision === "approve" && c.payload.representative_id === card.representative_id);
    if (!ok) return { decision: "fail", result: { decision: "deny", disposition: "not_now", retry: { kind: "with_credential", credentials: ["owner_consent"] }, ctx: "consent" } };
    return { decision: "ok" };
  }
  admit(r: S.InvitationRequest, card: S.RepresentativeCard, seat: S.SeatGrant) {
    if (!r.proposal.request.actions.includes(ATTEND_ACTION)) return;
    const c = (r.owner_consents ?? []).find((x) => x.payload.action === "accept_house_rules")!;
    this.attendees.set(card.representative_id, { principal: card.principal.principal_id, seat, consent_id: c.payload.consent_id, card });
  }

  /** One press by asker principal `asker` (through representative `rep`) on `topic` (the Gatherings extension v0.2.6). */
  private press(asker: string, topic: string, rep: string, now: string) {
    const key = `${asker}|${topic}`;
    const list = (this.presses.get(key) ?? []).filter((x) => Date.parse(now) - Date.parse(x) <= PRESS_WINDOW_MS);
    list.push(now); this.presses.set(key, list);
    const n = list.length; const { light_flags, notice_at } = this.thresholds;
    if (n <= light_flags) this.flags.push({ asker, topic, press: n, result: "light_flag", at: now });
    else {
      this.flags.push({ asker, topic, press: n, result: "minor_misconduct", at: now });
      const last = this.noticed.get(key);
      if (n >= notice_at && (!last || Date.parse(now) - Date.parse(last) > PRESS_WINDOW_MS)) { this.noticed.set(key, now); this.notice(rep, asker, topic, now); }
      else if (n > notice_at) this.host.note(`press ${n} by ${asker} on ${topic}: recorded, no further notice in this window`);
    }
  }

  /**
   * §11 with the Gatherings or Peer meetings extension (v0.2.3): the guest list is the signed Gathering, delivered to each invitee's representative in a gathering_invitation
   * (held for its inbox); call again with the re-signed Gathering whenever the list changes.
   */
  invitations(): { to: string; message: any; held: true }[] {
    const sg = this.host.cfg.gathering!;
    return this.g.invitees.map((inv) => {
      const enc = { id: this.g.gathering_id, visitor: inv.representative_id, seq: this.seq++ };
      return { to: inv.representative_id, held: true as const, message: this.host.wrap({ ...this.host.hdr(enc, "gathering_invitation", inv.representative_id), gathering: sg, entry: this.host.opts.entryUrl ?? "" }) };
    });
  }
  seq = 0;
  /** Replace the guest list (re-signed by the place) and re-deliver it (§11 with the Gatherings or Peer meetings extension). Attendees no longer invited lose their place in the room. */
  updateGathering(sg: S.Signed<S.Gathering>): { to: string; message: any; held: true }[] {
    this.host.cfg.gathering = sg;
    for (const [rep, a] of this.attendees) if (!sg.payload.invitees.some((i) => i.representative_id === rep && i.principal_id === a.principal)) this.attendees.delete(rep);
    return this.invitations();
  }

  /** gathering_message / privacy_decline from a seated attendee (envelope already verified by Host.handle). */
  onMessage(m: Msg, raw?: unknown): Msg[] {
    const a = this.attendees.get(m.from);
    if (!a) { this.host.note(`${m.type} ${m.msg_id} from ${m.from}: not a seated attendee (or removed from the guest list): refused`); return []; }
    if (m.gathering_id !== this.g.gathering_id) return [];
    const now = this.host.clock();
    // RT-F9 (red team 2026-10-25): a per-sender cap on room items per minute (pilot option), so one guest can't flood every inbox.
    const cap = this.host.opts.roomRatePerMin;
    if (cap !== undefined) {
      const recent = (this.rate.get(m.from) ?? []).filter((t) => Date.parse(now) - t < 60e3);
      if (recent.length >= cap) { this.rate.set(m.from, recent); this.host.note(`${m.type} ${m.msg_id} from ${m.from}: over ${cap} room items a minute; refused, not fanned out`); return []; }
      recent.push(Date.parse(now)); this.rate.set(m.from, recent);
    }
    // §11 with the Gatherings or Peer meetings extension (v0.2.4, C137): a room item has encounter_id = to = the gathering id; the place holds the ORIGINAL signed item for every
    // other seated attendee's inbox. An item not addressed to the room is recorded but not fanned out.
    const toRoom = m.encounter_id === this.g.gathering_id && m.to === this.g.gathering_id;
    if (!toRoom) this.host.note(`${m.type} ${m.msg_id}: not addressed to the room (encounter_id/to ≠ ${this.g.gathering_id}); recorded, not fanned out`);
    const fanOut = () => { if (toRoom && raw && typeof raw === "object" && "payload" in (raw as object))
      for (const rep of this.attendees.keys()) if (rep !== m.from) this.host.outbox.push({ to: rep, message: raw, held: true }); };
    if (m.type === "privacy_decline") {
      if (m.penalized !== false) return [];
      // Presses come from room items alone (v0.2.6). msg_ids are only unique per sender, and a later asker may reuse one an earlier asker
      // used (host-final2-001): resolve in_reply_to to the MOST RECENT room question with that id from another seated attendee, never the first ever seen.
      const isQ = (i: Item) => i.room && i.msg.type === "gathering_message" && i.msg.msg_id === m.in_reply_to && i.msg.from !== m.from;
      const q = toRoom ? (findLast(this.items, (i) => isQ(i) && this.attendees.has(i.msg.from)) ?? findLast(this.items, isQ)) : undefined;
      if (q) {
        const asker = q.sender_principal; const askerRep = q.msg.from; const qTopic = (q.msg as S.GatheringMessage).topic;
        const earlier = this.declines.some((d) => d.asker === asker && d.topic === m.topic);
        // Declined by reference to an earlier decline: the question counts as the same topic (D5), unless already counted.
        if (earlier && qTopic !== m.topic && this.topicKnown(qTopic)) this.press(asker, m.topic, askerRep, now);
        this.declines.push({ asker, topic: m.topic, at: now });
        // the Gatherings extension (v0.2.3): a decline that answers a press says so in `press`; the place checks it against its own count (it cannot rewrite a signed message).
        const count = (this.presses.get(`${asker}|${m.topic}`) ?? []).length;
        if (count > 0 && !m.press) this.host.note(`privacy_decline ${m.msg_id} answers press ${count} but carries no press field (C112)`);
        // v0.2.4: press = {count, light_flags, notice_at}, filled by the decliner from its own count; the place's count stays authoritative.
        const th = this.thresholds;
        if (m.press && (m.press.count !== count || m.press.light_flags !== th.light_flags || m.press.notice_at !== th.notice_at)) this.host.note(`privacy_decline ${m.msg_id}: press field ${JSON.stringify(m.press)} differs from the place's count ${count} / thresholds ${JSON.stringify(th)} (place's count is authoritative)`);
      }
      this.items.push({ msg: m as S.PrivacyDecline, sender_principal: a.principal, room: toRoom });
      fanOut();
      return [];
    }
    if (m.kind === "question" && toRoom) {
      // The asker is the principal (from the card), so a new representative doesn't reset the count (v0.2.6).
      const declined = [...new Set(this.declines.filter((d) => d.asker === a.principal && Date.parse(now) - Date.parse(d.at) <= PRESS_WINDOW_MS).map((d) => d.topic))];
      if (!this.topicKnown(m.topic)) { for (const t of declined) this.press(a.principal, t, m.from, now); }   // unknown topic after a decline: a press on every declined topic
      else if (declined.includes(m.topic)) this.press(a.principal, m.topic, m.from, now);
    }
    this.items.push({ msg: m as S.GatheringMessage, sender_principal: a.principal, room: toRoom });
    fanOut();
    return [];
  }
  /** The press at notice_at: a minor `manipulation` notice from the place to the presser's principal ONLY (no introducers). */
  private notice(rep: string, principal: string, topic: string, now: string) {
    const enc = [...this.host.encounters.values()].find((e) => e.card?.representative_id === rep);
    const n: S.MisconductNotice = { notice_id: "mn-press-" + digestOf({ principal, topic, now }).slice(8, 18), issuer: { principal_id: this.host.cfg.principal_id, display_name: this.host.cfg.display_name },
      subject: { representative_id: rep, card_digest: enc?.cardDigest ?? "", principal_id: principal },
      encounter_id: this.g.gathering_id, vouch_chain: [], findings: [{ code: "manipulation", severity: "minor", observed_at: now, evidence_digest: digestOf(this.flags.filter((f) => f.asker === principal && f.topic === topic)) }],
      effects: [{ party_id: rep, party_role: "representative", scope: ["gathering"], standing_change: "noted" }], issued_at: now };
    const hdrEnc = enc ?? { id: this.g.gathering_id, visitor: rep, seq: 900 };
    // §11.2 (v0.2.4): held for the presser's representative (named in the card), and also under the principal's DID.
    const signedN = this.host.signAsPrincipal(n);
    for (const to of [rep, principal]) this.host.outbox.push({ to, held: true, message: this.host.wrap({ ...this.host.hdr(hdrEnc as any, "misconduct_notice", to), notice: signedN }) });
  }

  /**
   * What may leave the gathering for `viewerRep` (D4 / the Gatherings extension). Accountability, not prevention (D8):
   * this helper shapes what a well-behaved representative takes home; it cannot stop a leak.
   */
  takeaway(viewerRep: string): { text: string; verbatim: boolean; attributed_to?: string; kind: string }[] {
    const viewer = this.attendees.get(viewerRep)?.principal;
    const out: { text: string; verbatim: boolean; attributed_to?: string; kind: string }[] = [];
    for (const it of this.items) {
      const m = it.msg; if (m.type !== "gathering_message") continue;
      if (m.attribution === "private") continue;                              // never leaves
      if (m.from === viewerRep) continue;
      const speaker = this.attendees.get(m.from)?.card;
      const hints = [...(this.host.cfg.affiliation_hints ?? []), ...(speaker && speaker.principal.kind !== "person" ? [speaker.principal.display_name] : []),
        ...(speaker?.role ? [speaker.role] : [])].filter((h) => h && h.length > 2);
      const named = m.attribution === "attributable_with_consent" && !!viewer && (m.attribution_consent_for ?? []).includes(viewer);
      const verbatim = m.verbatim_consent === true;
      let text = verbatim ? m.text.text : paraphrase(m.text.text, hints);
      if (!named) text = strip(text, hints);
      out.push({ text, verbatim, kind: m.kind, ...(named ? { attributed_to: it.sender_principal } : {}) });
    }
    return out;
  }
  snapshot() { return { gathering_id: this.g.gathering_id, thresholds: this.thresholds, attendees: [...this.attendees.keys()], items: this.items.length, flags: this.flags,
    presses: Object.fromEntries([...this.presses].map(([k, v]) => [k, v.length])) }; }
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function strip(s: string, hints: string[]): string {
  let x = s; for (const h of hints) x = x.replace(new RegExp(esc(h), "gi"), "[detail removed]");
  return x.replace(TITLE_RE, "[role removed]");
}
/** Mechanical paraphrase marker (D4 quality is not machine-checkable, §11 item 1): reported speech, hints and titles stripped. */
export function paraphrase(s: string, hints: string[]): string {
  const x = strip(s.replace(/["“”]/g, "").replace(/\b(I|I'm|my|we|our)\b/gi, (w) => ({ i: "they", "i'm": "they're", my: "their", we: "they", our: "their" } as Record<string, string>)[w.toLowerCase()] ?? w), hints);
  return "Someone shared that " + x.charAt(0).toLowerCase() + x.slice(1);
}
