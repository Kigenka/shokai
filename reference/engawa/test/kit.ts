// Test-only visitor kit: builds real signed cards, mandates, vouches, allowances, allowance statuses, consents and ritual messages (v0.2.3).
import type * as S from "../src/shapes.js";
import { makeSigned, makeOwnerSigned, newEd25519, newPasskeyOwner, b64u, digestOf, randomId, type Ed25519Signer, type PasskeyOwner } from "../src/crypto.js";
import { possessionPayload } from "../src/verify.js";
import { appendLog, type FetchCache } from "../src/trust.js";
import type { Host, Out } from "../src/host.js";

export type Visitor = { rep: Ed25519Signer; owner: PasskeyOwner | Ed25519Signer; platform: Ed25519Signer; kind: S.PrincipalKind; name: string; card: S.SignedCard; locales: string[] };
export const NOW = "2026-10-24T20:00:00Z";
export function clockAt(iso: string) { let t = Date.parse(iso); return { now: () => new Date(t).toISOString().replace(".000Z", "Z"), advance: (s: number) => { t += s * 1000; } }; }

export function visitor(name: string, kind: S.PrincipalKind, scope: S.RepresentativeCard["mandate_scope"], opts: { locales?: string[]; imprint?: S.PrincipalImprint; claims?: S.CardClaim[]; rp_id?: string | null; owner?: PasskeyOwner | Ed25519Signer } = {}): Visitor {
  const rep = newEd25519(); const owner = opts.owner ?? (kind === "person" ? newPasskeyOwner() : newEd25519()); const platform = newEd25519();
  const card: S.RepresentativeCard = { card_id: "card-" + name.toLowerCase().replace(/\W+/g, "-"), protocol: "shokai/0.3", representative_id: rep.id,
    principal: { principal_id: owner.id, kind, display_name: name }, role: name + "'s representative", standing: { tier: "standard" }, mandate_scope: scope,
    locales: opts.locales ?? ["en-US"], representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) },
    issued_at: "2026-10-01T00:00:00Z", expires_at: "2027-04-01T00:00:00Z", ...(opts.imprint ? { imprint: opts.imprint } : {}), ...(opts.claims ? { claims: opts.claims } : {}),
    ...(kind === "person" ? { owner_binding: { method: "passkey_webauthn" as const, owner_id: owner.id, platform_key: platform.id, ...(opts.rp_id === null ? {} : { rp_id: opts.rp_id ?? (owner as PasskeyOwner).rpId }) } as S.RepresentativeCard["owner_binding"] } : {}) };
  return { rep, owner, platform, kind, name, locales: card.locales, card: signBy(owner, card) };
}
export function signBy<T>(s: PasskeyOwner | Ed25519Signer, p: T): S.Signed<T> { return s.kind === "passkey" ? makeOwnerSigned(p, s, NOW) : makeSigned(p, s, NOW); }
export function mandate(v: Visitor, purpose: S.PurposeCode, actions: string[], limits: S.Limits = {}, extra: Partial<S.Mandate> = {}): S.SignedMandate {
  return signBy(v.owner, { mandate_id: randomId("mand"), principal_id: v.owner.id, representative_id: v.rep.id, card_id: v.card.payload.card_id,
    purpose: { code: purpose, statement: "Purpose statement for " + purpose, locale: "en-US" }, allowed_actions: actions, limits,
    valid_from: "2026-10-20T00:00:00Z", expires_at: "2026-12-31T00:00:00Z", ...extra });
}
export const LOG_BASE = "https://introducer.example/shokai/revocations/";
/** A vouch whose revocation log is published (as if the host fetched it: an empty, reachable log) in `cache`. */
export function vouch(introducer: Ed25519Signer | PasskeyOwner, introName: string, v: Visitor, purposes: S.PurposeCode[], cache: FetchCache | null, id = randomId("vouch"), claims?: string[], extra: Partial<S.Vouch> = {}): S.SignedVouch {
  const url = LOG_BASE + encodeURIComponent(introducer.id);
  if (cache && !cache.has(url)) cache.set(url, { ok: true, at: NOW, body: [] });
  return signBy(introducer, { vouch_id: id, introducer: { principal_id: introducer.id, display_name: introName }, subject: { representative_id: v.rep.id, card_digest: v.card.payload_digest },
    scope: { purposes, ...(claims ? { claims } : {}) }, revocation_log: url, relationship: "known_personally", issued_at: "2026-10-18T00:00:00Z", expires_at: "2026-12-31T00:00:00Z", ...extra });
}
export function revoke(introducer: Ed25519Signer, vouchId: string, at: string, cache: FetchCache | null, notice_ref?: string): S.Signed<S.VouchRevocation> {
  const r = makeSigned<S.VouchRevocation>({ vouch_id: vouchId, introducer_id: introducer.id, revoked_at: at, ...(notice_ref ? { notice_ref } : {}) }, introducer, at);
  if (cache) { const url = LOG_BASE + encodeURIComponent(introducer.id); const log = ((cache.get(url)?.body as S.RevocationLogEntry[]) ?? []); appendLog(log, r); cache.set(url, { ok: true, at, body: log }); }
  return r;
}
/** §5.2 / the Revocation status extension: an AllowanceStatus signed by the owner binding's platform key. */
export function allowanceStatus(v: Visitor, allowance: S.Signed<S.Allowance>, status: "active" | "revoked", issued_at = NOW, next_update = new Date(Date.parse(NOW) + 3600e3).toISOString().replace(".000Z", "Z"), signer: Ed25519Signer = v.platform): S.Signed<S.AllowanceStatus> {
  return makeSigned<S.AllowanceStatus>({ allowance_id: allowance.payload.allowance_id, allowance_digest: allowance.payload_digest, status, issued_at, next_update }, signer, issued_at);
}
/** §11.2: a signed inbox_poll by the recipient. */
export function inboxPoll(signer: Ed25519Signer, to: string, sent_at = NOW, since?: string): S.Signed<any> {
  return makeSigned({ protocol: "shokai/0.3", encounter_id: "inbox", msg_id: randomId("poll"), sent_at, from: signer.id, to, type: "inbox_poll", ...(since ? { since } : {}) }, signer, sent_at);
}
export function ownerConsent(owner: PasskeyOwner, rep: string, action: S.OwnerConsent["action"], subject: S.OwnerConsent["subject_ref"], extra: Partial<S.OwnerConsent> = {}): S.Signed<S.OwnerConsent> {
  return makeOwnerSigned<S.OwnerConsent>({ consent_id: randomId("oc"), owner_id: owner.id, representative_id: rep, action, decision: "approve", subject_ref: subject, assurance: "passkey",
    expires_at: "2026-12-31T00:00:00Z", shown_to_owner: { text: `Approve ${action} for ${subject.kind} ${subject.id}.`, locale: "en-US" }, issued_at: NOW, ...extra }, owner, NOW);
}

/** A ritual session against one host; collects every outbound message. */
export class Session {
  enc = randomId("enc"); seq = 0; /** v0.2.7 (§2.2): msg_ids are unique per sender, also across sessions that share an encounter id (pair places). */ sid = randomId("s"); hostNonce = ""; transcript: Out[] = []; last: any[] = [];
  constructor(public h: Host, public v: Visitor | null, public fromId?: string) {}
  get from() { return this.v?.rep.id ?? this.fromId ?? "urn:shokai:anon:wanderer"; }
  msg(type: string, body: Record<string, unknown>): any {
    return { protocol: "shokai/0.3", encounter_id: this.enc, msg_id: `${this.enc}-${this.sid}-v${++this.seq}`, sent_at: NOW, from: this.from, to: this.h.cfg.rep_id, type, ...body };
  }
  send(m: any, sign = true): any[] {
    const wire = sign && this.v ? makeSigned(m, this.v.rep, NOW) : { payload: m, payload_digest: digestOf(m), signatures: [] };
    return this.sendRaw(wire);
  }
  sendRaw(wire: any): any[] {
    const out = this.h.handle(wire); this.transcript.push(...out);
    this.last = out.map((o) => (o.message?.payload ?? o.message));
    for (const x of this.last) if (x.type === "greeting" && x.nonce && x.encounter_id === this.enc) this.hostNonce = x.nonce;
    return this.last;
  }
  greet(sign = true, extra: Record<string, unknown> = {}) { return this.send(this.msg("greeting", { locales: this.v?.locales ?? ["en-US"], nonce: randomId("n-vis"), ...extra }), sign); }
  present(card = this.v!.card, proofKey = this.v!.rep, nonce?: string) {
    const proof = makeSigned(possessionPayload(this.enc, nonce ?? this.hostNonce), proofKey, NOW).signatures[0];
    return this.send(this.msg("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id } }));
  }
  receipt(d = "sha-256:hostcard") { return this.send(this.msg("card_receipt", { card_digest: d })); }
  introduce(v: S.SignedVouch | null, extra: Record<string, unknown> = {}) { return this.send(this.msg("introduction", { vouch: v, ...extra })); }
  request(m: S.SignedMandate, request: S.Proposal["request"], extra: Record<string, unknown> = {}, prose = "We would love to work with you.") {
    return this.send(this.msg("invitation_request", { card_digest: this.v!.card.payload_digest, mandate: m,
      proposal: { request, value_to_counterparty: { text: prose, locale: "en-US" }, etiquette_register: "first_meeting" }, ...extra }));
  }
  /** Full ritual up to the request (card_receipt is optional in v0.2.2; sent here unless skipReceipt). */
  ritual(v: S.SignedVouch | null, m: S.SignedMandate, request: S.Proposal["request"], extra: Record<string, unknown> = {}, prose?: string, skipReceipt = false) {
    this.greet(); this.present(); if (!skipReceipt) this.receipt(); this.introduce(v, extra.invitation_ref ? { invitation_ref: extra.invitation_ref } : {});
    const { invitation_ref, ...rest } = extra; void invitation_ref;
    return this.request(m, request, { ...(v ? { vouch_digest: v.payload_digest } : {}), ...rest }, prose);
  }
  response() { return this.last.find((x) => x.type === "invitation_response"); }
}
export { digestOf };
