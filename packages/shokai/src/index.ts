// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// @kigenka/shokai: the reference TypeScript SDK for Shōkai, the agent introduction protocol (spec v0.3.0, wire shokai/0.3).
// The protocol logic lives in ./core, synced byte for byte from the reference implementation that passes every conformance suite
// (scripts/sync-core.mjs). This file is the developer-facing surface: doors, representatives, visits, signing and verification.
import type * as S from "./core/shapes.js";
import { Host, type HostOpts, type Out } from "./core/host.js";
import { RealVerifier, type KeyRegistry } from "./core/verify.js";
import { possessionPayload } from "./core/verify.js";
import { placeListing, doorPointer, entryUrl, inboxUrl, lobbyUrl } from "./core/door.js";
import type { PlaceConfig, PlacePolicy, ActionPolicy } from "./core/policy.js";
import type { FetchCache } from "./core/trust.js";
import { parsePublicKey, makeSigned, makeOwnerSigned, newEd25519, newPasskeyOwner, digestOf, jcs, b64u, sha256, randomId, resolveDid, checkSig, sameDid, canonDid,
  parseMoney, edKeyToRaw, didKeyFromEdRaw, didKeyFragment, badTimestamps, isExpired, notYetValid, type Ed25519Signer, type PasskeyOwner } from "./core/crypto.js";
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { PROTOCOL, SPEC_VERSION, SPEC_REF, TEST_PROFILE } from "./core/version.js";
import { doorMayFetch, readCapped, DOOR_FETCH_TIMEOUT_MS } from "./fetch-policy.js";

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

export type CardInput = { displayName: string; kind?: S.PrincipalKind; role?: string; purposes: S.PurposeCode[]; actions: string[]; locales?: string[]; validDays?: number };
/**
 * A representative card signed by its owner (a person's card carries the passkey owner binding, §2.3).
 * `validDays` defaults to 180; the protocol sets no lifetime. Shorter is safer (it limits what a stolen representative key can
 * do, §2.6): the representative skills ask for 90 days or less, so pass `validDays: 90` there.
 */
export function signCard(rep: Ed25519Signer, owner: PasskeyOwner | Ed25519Signer, c: CardInput, platform: Ed25519Signer = newEd25519()): S.SignedCard {
  const at = plusDays(nowIso(), -1 / 1440); const kind = c.kind ?? (owner.kind === "passkey" ? "person" : "company");
  const card: S.RepresentativeCard = { card_id: randomId("card"), protocol: PROTOCOL, representative_id: rep.id,
    principal: { principal_id: owner.id, kind, display_name: c.displayName }, role: c.role ?? `${c.displayName}'s representative`, standing: { tier: "standard" },
    mandate_scope: { purposes: c.purposes, actions: c.actions }, locales: c.locales ?? ["en-US"],
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) }, issued_at: at, expires_at: plusDays(at, c.validDays ?? 180),
    ...(owner.kind === "passkey" ? { owner_binding: { method: "passkey_webauthn" as const, owner_id: owner.id, platform_key: platform.id, rp_id: owner.rpId } as S.RepresentativeCard["owner_binding"] } : {}) };
  return sign(card, owner, at);
}
/**
 * What the owner signs in a mandate (§5.1). `limits.max_amount` is the spending allowance: without it the mandate authorises
 * no spending at all (D11), and the non-spending purposes (`visitation`, `invitation`, `introduction`) must not carry one.
 * Validity: `validSeconds` (e.g. 7200 for two hours) wins over `validDays` (default 30 days for signMandate).
 */
export type MandateInput = { purpose: S.PurposeCode; statement?: string; actions: string[]; limits?: S.Limits; validDays?: number; validSeconds?: number };
/** A mandate the owner signs: one purpose, the actions allowed, and limits (§5.1). */
export function signMandate(rep: Ed25519Signer, owner: PasskeyOwner | Ed25519Signer, card: S.SignedCard, m: MandateInput): S.SignedMandate {
  // v0.3.0-rc4 (§3.6): valid from now, not back-dated, so a place that restarted without its state seats a mandate signed after it.
  const at = nowIso();
  const until = m.validSeconds !== undefined ? plusDays(nowIso(), m.validSeconds / 86400) : plusDays(at, m.validDays ?? 30);
  return sign<S.Mandate>({ mandate_id: randomId("mand"), principal_id: owner.id, representative_id: rep.id, card_id: card.payload.card_id,
    purpose: { code: m.purpose, statement: m.statement ?? `Purpose: ${m.purpose}`, locale: "en-US" }, allowed_actions: m.actions, limits: m.limits ?? {},
    valid_from: at, expires_at: until }, owner, at);
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
  locales?: string[];
  /**
   * Where the lobby's leaflet sends a visitor's owner to set up a representative (§3.3). Default: the env SHOKAI_ONBOARDING_URL,
   * else this door's own setup page at `<baseUrl>/start` (a short local quickstart the door serves; no outside address assumed).
   */
  onboardingUrl?: string;
  /** Where this door is reachable, e.g. http://127.0.0.1:3000/shokai. Used in listings and replies. */
  baseUrl?: string;
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
};

/** A Shōkai door: the place's representative at its entrance. Wraps the reference Host (the full ritual, gate and seats). */
export class Door {
  readonly host: Host; readonly keys: { rep: Ed25519Signer; principal?: Ed25519Signer }; readonly base: string; readonly fetched: FetchCache = new Map();
  constructor(readonly opts: DoorOptions) {
    if (opts.card) {
      opts = { ...opts, card: fromSigningPage<S.RepresentativeCard>(opts.card) as S.SignedCard };
      if (!opts.keys?.rep) throw Object.assign(new Error("door card refused: an owner-signed door card needs keys.rep, the representative key it names"), { code: SHOKAI_DOOR_CARD_INVALID });
      const v = verifyDoorCard(opts.card as S.SignedCard, { representativeId: opts.keys.rep.id, rpId: opts.ownerRpId, revocations: opts.cardRevocations,
        purposes: opts.purposes.map((p) => p.code), actions: opts.actions.map((a) => a.action) });
      if (!v.ok) throw Object.assign(new Error(`door card refused: ${v.why}`), { code: v.code });
      this.keys = { rep: opts.keys.rep };
    } else this.keys = { rep: opts.keys?.rep ?? newEd25519(), principal: opts.keys?.principal ?? newEd25519() };
    this.base = (opts.baseUrl ?? "http://127.0.0.1:0/shokai").replace(/\/$/, "");
    const cfg = doorConfig(opts, this.keys, this.base);
    const restored = opts.stateFile && existsSync(opts.stateFile) ? JSON.parse(readFileSync(opts.stateFile, "utf8")) : null;
    // §3.6: memory-only state means refuse-on-loss from construction; a new state file means a new place (nothing to lose).
    const epoch = opts.stateFile ? undefined : nowIso();
    this.host = new Host(cfg, this.keys.rep, this.keys.principal ?? null, new RealVerifier(), undefined,
      { fetched: this.fetched, entryUrl: entryUrl(this.base, opts.name), inboxUrl: inboxUrl(this.base, opts.name), testProfile: !!opts.testProfile, uniqueActRefs: true,
        ...(epoch ? { stateEpoch: epoch } : {}), ...(opts.hostOpts ?? {}) });
    if (restored) this.host.restoreDurable(restored);
    this.save();
  }
  /** Write the durable state to stateFile, if there is one (atomic: a temp file, then rename). */
  save() {
    const f = this.opts.stateFile; if (!f) return;
    writeFileSync(f + ".tmp", JSON.stringify(this.host.durableState())); renameSync(f + ".tmp", f);
  }
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
  get entry() { return entryUrl(this.base, this.opts.name); }
  get lobby() { return lobbyUrl(this.base, this.opts.name); }
  get inbox() { return inboxUrl(this.base, this.opts.name); }
  /** Point the door at its real address once the server is listening (listings and replies carry it). */
  setBaseUrl(base: string) { (this as { base: string }).base = base.replace(/\/$/, ""); this.host.opts.entryUrl = this.entry; this.host.opts.inboxUrl = this.inbox; }
  /** GET <base>/places (§3.1). */
  listing(): S.PlaceListing { return placeListing(this.base, this.cardWithdrawn ? [] : [this.host], nowIso()); }
  /** GET <base>/ and any unknown address: the machine-readable pointer, never a bare 404 (§3.1). */
  pointer(): S.DoorPointer { return doorPointer(this.base, [this.host]); }
  /** §11.1 (C200): the 404 pointer for a request to one of this door's own addresses names it in `here`, with `method: "POST"`. */
  pointerHere(): S.DoorPointer { return doorPointer(this.base, [this.host], this.host); }
  /** POST <entry> or <lobby>: any arrival gets an answer; prose and malformed bodies get the lobby (§3.1, §11.1). */
  async post(body: unknown): Promise<{ status: number; envelope: S.ReplyEnvelope; retryAfter?: number }> {
    let m: unknown = body;
    if (typeof body === "string") { try { m = JSON.parse(body); } catch { m = body; } }
    await this.prefetch(m);
    if (this.cardWithdrawn) return { status: 503, envelope: { protocol: PROTOCOL, messages: [] } as unknown as S.ReplyEnvelope, retryAfter: 86400 };
    let env: S.ReplyEnvelope; try { env = this.host.entryPost(m); } catch { env = this.host.entryPost(String(body)); }
    this.save();
    if (this.host.capacityRefused) return { status: 429, envelope: env, retryAfter: 60 };
    return { status: 200, envelope: env };
  }
  /** POST <inbox>: held messages for the signer of a valid inbox_poll (§11.2). */
  pollInbox(body: unknown) { let m: unknown = body; if (typeof body === "string") { try { m = JSON.parse(body); } catch { m = null; } } const r = this.host.inboxPost(m); this.save(); return r; }
  /**
   * Check one signed act against the seat it names: signature, seat holder, the seat's tools, operations and spending caps (§7).
   * Returns the door's signed act_result, or its signed act_decision (a refusal with a retry).
   */
  authorizeAct(signedAct: unknown): { ok: true; result: S.ActResult } | { ok: false; decision: any } {
    const outs = this.host.handle(signedAct); this.save();
    const msgs = outs.map((o) => o.message?.payload ?? o.message);
    const r = msgs.find((x) => x.type === "act_result"); if (r?.ok) return { ok: true, result: r };
    return { ok: false, decision: msgs.find((x) => x.type === "act_decision") ?? msgs[0] ?? { type: "act_decision", decision: "deny", reason_code: "SEAT_SCOPE_EXCEEDED" } };
  }
  /** The seat a seat id names, if it is live. */
  seat(seatId: string): S.SeatGrant | undefined { const st = (this.host.seats as Map<string, any>).get(seatId); return st && !st.unseated ? st.seat : undefined; }
  /** A Node http handler for the §11 binding under this door's base path. Returns false if the request isn't for the door. */
  async handleHttp(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, body?: string): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname; const basePath = new URL(this.base).pathname.replace(/\/$/, "");
    if (!(path === basePath || path.startsWith(basePath + "/"))) return false;
    const rest = path.slice(basePath.length) || "/";
    const send = (code: number, x: unknown, h: Record<string, string> = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...h }); res.end(JSON.stringify(x)); };
    if (req.method === "GET" && rest === "/") { send(200, this.pointer()); return true; }
    if (req.method === "GET" && rest === "/places") { send(200, this.listing()); return true; }
    if (req.method === "GET" && rest === "/start") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(startPage(this.opts.displayName)); return true; }
    const raw = body ?? (req.method === "POST" ? await readBody(req) : "");
    if (req.method === "POST" && (rest === `/places/${this.name}/entry` || rest === `/places/${this.name}/lobby`)) {
      const r = await this.post(raw); send(r.status, r.envelope, r.retryAfter ? { "retry-after": String(r.retryAfter) } : {}); return true;
    }
    if (req.method === "POST" && rest === `/places/${this.name}/inbox`) { const r = this.pollInbox(raw); send(r.status, r.body); return true; }
    const own = [`/places/${this.name}/entry`, `/places/${this.name}/lobby`, `/places/${this.name}/inbox`].includes(rest);
    send(404, own ? this.pointerHere() : this.pointer()); return true;
  }
  /** The door fetches what it must check itself: vouch revocation logs, allowance status, evidence (§2.5, §4, §5.2). */
  private async prefetch(raw: any) {
    const p = raw?.payload ?? raw; if (!p || typeof p !== "object") return;
    const urls: string[] = [];
    const st = p.allowance?.allowance?.payload?.revocation_status; if (typeof st === "string") urls.push(st);
    const log = p.vouch?.payload?.revocation_log; if (typeof log === "string") urls.push(log);
    const crl = p.card?.payload?.revocation_url; if (typeof crl === "string") urls.push(crl);   // v0.3.0-rc4 (§2.6, C191)
    for (const url of urls) {
      const at = nowIso();
      // rc4: https only outside the test profile, and never the door's own host or network (fetch-policy.ts); refused = unreachable (fail closed).
      if (!doorMayFetch(url, !!this.opts.testProfile)) { this.fetched.set(url, { ok: false, at }); continue; }
      try { const r = await fetch(url, { signal: AbortSignal.timeout(DOOR_FETCH_TIMEOUT_MS), redirect: "error" }); const buf = await readCapped(r);
        if (!buf) { this.fetched.set(url, { ok: false, at }); continue; }   // over the size cap: unreachable (fail closed)
        let body: unknown; try { body = JSON.parse(buf.toString("utf8")); } catch { body = undefined; }
        this.fetched.set(url, { ok: r.ok && body !== undefined, at, body, digest: "sha-256:" + b64u(sha256(buf)) });
      } catch { this.fetched.set(url, { ok: false, at }); }
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
<li>Try it first, on your own computer: <code>npx @kigenka/shokai demo</code> (Node 20+) shows a whole visit and the report home, with fictional actors. If you were given a <code>.tgz</code> or the source instead, install that.</li>
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
/**
 * F3 (rc4): verify a door card its owner signed with a passkey, with the checks a door applies to a visitor's card (§2.1–§2.3, §2.6):
 * strict timestamps; the signature by `principal.principal_id` (ES256 for a person, against `owner_binding.rp_id`, one-tap
 * batches included, A.1/C195); `owner_binding` naming the same owner; the protocol; issued and not expired; the representative key
 * binding `representative_id`; and no matching revocation signed by the owner. Optionally the representative, rp_id and scope it must have.
 */
export function verifyDoorCard(card: S.SignedCard, o: { representativeId?: string; rpId?: string; revocations?: S.Signed<S.CardRevocation>[];
  purposes?: string[]; actions?: string[]; now?: string } = {}): { ok: true } | { ok: false; code: typeof SHOKAI_DOOR_CARD_INVALID | typeof SHOKAI_DOOR_CARD_REVOKED; why: string } {
  const bad = (why: string) => ({ ok: false as const, code: SHOKAI_DOOR_CARD_INVALID, why });
  const p = card?.payload; if (!p || typeof p !== "object") return bad("not a signed card");
  const now = o.now ?? nowIso(); const ob = p.owner_binding; const pid = p.principal?.principal_id;
  if (typeof pid !== "string") return bad("the card names no principal");
  if (badTimestamps(card).length) return bad("a timestamp is not in the strict form (§2.2)");
  if (p.protocol !== PROTOCOL) return bad(`the card is for ${p.protocol}, not ${PROTOCOL}`);
  if (!ob || ob.method !== "passkey_webauthn" || typeof ob.rp_id !== "string" || !ob.rp_id) return bad("the card has no passkey owner binding with an rp_id");
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
  for (const r of o.revocations ?? []) {
    const rp = r?.payload; if (!rp || rp.card_id !== p.card_id || !sameDid(rp.principal_id, pid) || (rp.card_digest && rp.card_digest !== card.payload_digest)) continue;
    if (verifySigned(r, { expectSigner: pid, rpId: ob.rp_id }).ok) return { ok: false, code: SHOKAI_DOOR_CARD_REVOKED, why: "the owner has withdrawn this card" };
  }
  return { ok: true };
}
export function createDoor(opts: DoorOptions): Door { return new Door(opts); }
export async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); return Buffer.concat(chunks).toString("utf8");
}

function doorConfig(o: DoorOptions, k: { rep: Ed25519Signer; principal?: Ed25519Signer }, base: string): PlaceConfig {
  const locales = o.locales ?? ["en-US"]; const at = plusDays(nowIso(), -1 / 1440);
  const policy: PlacePolicy = {
    policy_version: `${o.name}-1`, supported_locales: locales, access_mode: "session", category: o.category ?? "x-service",
    purposes: o.purposes.map((p) => ({ code: p.code, statement: { text: p.statement, locale: "en-US" } })),
    actions: o.actions, spending_actions: o.spendingActions ?? [],
    considering: { actions: [], routed_to: { kind: "role", role: "Owner", human: true }, response_days: 14, requires_introduction: true },
    require_vouch_for: o.requireVouchFor ?? [], trusted_introducers: o.trustedIntroducers ?? [],
    lobby: { about: { "en-US": o.about ?? `${o.displayName} meets representatives at the door.` },
      how: { "en-US": o.how ?? "Greet, present a signed card, introduce yourself (a vouch is optional), then ask within a mandate your owner signed." },
      onboarding_url: o.onboardingUrl ?? process.env.SHOKAI_ONBOARDING_URL ?? `${base}/start`, receipt_ttl_days: 7,
      readiness: [{ code: "card", required: true }, { code: "owner_binding", required: true }, { code: "purpose", required: true }, { code: "introduction", required: false }] },
    receipt_echo_limit: 3, probing_threshold: 3, probing_window_s: 86400, ritual_retry_s: 60, not_a_fit_retry_days: 30, paused_retry_days: 30, enforce_owner_passkey: true,
    ...(o.policy ?? {}) };
  if (o.card) { const c = o.card as S.SignedCard; return { name: o.name, display_name: o.displayName, principal_id: canonDid(c.payload.principal.principal_id), rep_id: k.rep.id, policy, card: c }; }
  const card = sign<S.RepresentativeCard>({ card_id: "card-" + o.name, protocol: PROTOCOL, representative_id: k.rep.id,
    principal: { principal_id: k.principal!.id, kind: "company", display_name: o.displayName }, role: "Front-door representative", standing: { tier: "principal" },
    mandate_scope: { purposes: o.purposes.map((p) => p.code), actions: o.actions.map((a) => a.action) }, locales,
    representative_key: { key_id: k.rep.key_id, alg: "Ed25519", public_key: b64u(k.rep.pubRaw) }, issued_at: at, expires_at: plusDays(at, 365) }, k.principal!, at);
  return { name: o.name, display_name: o.displayName, principal_id: k.principal!.id, rep_id: k.rep.id, policy, card };
}

// ------------------------------------------------------------------ representatives and visits (§3.2, §5.3, §7, §8.2)

export type Transport = (url: string, body: unknown) => Promise<S.ReplyEnvelope>;
/** POST JSON to a door address over HTTP (§11). */
export const httpTransport: Transport = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), redirect: "error" });
  const j = await r.json().catch(() => null) as S.ReplyEnvelope | null;
  if (!j || !Array.isArray(j.messages)) throw new Error(`door at ${url} answered ${r.status} without a ReplyEnvelope`);
  return j;
};
/** Talk to a Door object in the same process (tests, examples). */
export const inProcess = (door: Door): Transport => async (_url, body) => (await door.post(body)).envelope;

// ------------------------------------------------------------------ the representative's mandate ledger (§5.1, §8.2, C176)

/** One visit made under a mandate, with every act tried in it (`local: true` = refused by the representative, never sent). */
export type LedgerVisit = { encounter_id: string; place: string; place_id?: string; at: string; decision?: string; seat_id?: string;
  acts: { tool: string; amount?: S.Money; ok: boolean; at: string; local?: true; interrupted?: true }[]; reported_in?: string[] };
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
  card?: S.SignedCard };
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
    this.card = opts.card ?? signCard(this.key, this.owner, { displayName: opts.ownerName, kind: opts.kind, purposes: opts.purposes, actions: opts.actions, locales: opts.locales });
  }
  get id() { return this.key.id; }
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
    const target: VisitTarget = to instanceof Door ? { entry: to.entry, representative_id: to.repId, principal_id: to.principalId, display_name: to.opts.displayName, actions: to.listing().places[0]?.actions } : to;
    const transport = ask.transport ?? (to instanceof Door ? inProcess(to) : httpTransport);
    const v = new Visit(this, target.entry, target.representative_id, transport, target.display_name, target);
    const held = ask.useMandate ?? (ask.mandate?.fresh ? undefined : this.heldMandate(ask.purpose, ask.actions, ask.limits));
    const mandate = held ?? this.mandate({ purpose: ask.purpose, actions: ask.actions, limits: ask.limits, statement: ask.mandate?.statement, validSeconds: ask.mandate?.validSeconds ?? 86400 });
    const entry = this.hold(mandate); v.mandateReused = !!held && entry.visits.length > 0;
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
export type VisitTarget = { entry: string; representative_id: string; principal_id?: string; display_name?: string; actions?: S.PlaceAction[] };
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
};
/** Find a place in a door's listing (GET <base>/places). */
export async function findPlace(base: string, name?: string): Promise<S.PlaceListingEntry> {
  const r = await fetch(base.replace(/\/$/, "") + "/places"); const l = await r.json() as S.PlaceListing;
  const p = name ? l.places.find((x) => x.name === name) : l.places[0]; if (!p) throw new Error(`no place ${name ?? ""} at ${base}`);
  return p;
}

/** One encounter: every message sent and received, the decision, the seat, and acts within it. */
export class Visit {
  readonly encounterId = randomId("enc"); private seq = 0; private hostNonce = ""; readonly transcript: { dir: "out" | "in"; message: any }[] = [];
  response?: any; seat?: S.SeatGrant; acts: { tool: string; amount?: S.Money; ok: boolean; args?: Record<string, unknown>; result?: unknown; decision?: unknown; local?: true; offer_outcome?: S.OfferOutcomeCode; interrupted?: "unreachable" | "seat_gone" }[] = [];
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
  private logAct(tool: string, ok: boolean, amount?: S.Money, local?: true, interrupted?: true) {
    const e = this.ledgerEntry; const lv = e?.visits.find((x) => x.encounter_id === this.encounterId); if (!e || !lv) return;
    lv.acts.push({ tool, ...(amount ? { amount } : {}), ok, at: nowIso(), ...(local ? { local } : {}), ...(interrupted ? { interrupted } : {}) }); this.rep.ledger.put(e);
  }
  /**
   * The representative's own check before an act is sent (§5.1, C176): null if it fits what remains of the mandate, else why not.
   * The door checks too (C175); this keeps the representative from attempting what its owner didn't allow.
   */
  beyondMandate(tool: string, args: Record<string, unknown> = {}): string | null {
    const e = this.ledgerEntry; if (!e) return null; const t = mandateTotals(e); const left = t.remaining;
    if (left?.operations !== undefined && left.operations < 1) return `the mandate's ${e.mandate.payload.limits.max_operations} actions are used up`;
    const amt = parseMoney(this.spendOf(tool, args)); const capLeft = parseMoney(left?.amount);
    if (amt && amt.units > 0n && capLeft && amt.currency !== capLeft.currency)
      return `${money(args.amount as S.Money)} is not in the mandate's currency (${capLeft.currency}); the owner allowed ${money(e.mandate.payload.limits.max_amount!)}`;
    if (amt && amt.units > 0n && capLeft && amt.units > capLeft.units)
      return `${money(args.amount as S.Money)} is more than the ${money(left!.amount!)} left of the mandate`;
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
  keep(envelope: S.Signed<unknown>, opts: { tool?: string; again?: boolean } = {}): BroughtBack | undefined {
    if (!isEnvelope(envelope)) return undefined;
    const prior = this.broughtBack.find((b) => b.payload_digest === envelope.payload_digest);
    if (prior) { if (opts.again) prior.again = true; return prior; }
    const pid = this.target?.principal_id; const v = pid ? verifySigned(envelope, { expectSigner: pid }) : { ok: false as const, why: "no principal_id" };
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
  readonly placeCheck: { ok: boolean; why?: string; checked: string[]; unchecked?: true } = { ok: true, checked: [] };
  private myNonce = ""; private hostCard?: S.SignedCard;
  constructor(readonly rep: Representative, readonly entry: string, readonly hostId: string, private transport: Transport, readonly hostName?: string, readonly target?: VisitTarget) {}
  private placeFails(why: string) { if (this.placeCheck.ok) { (this.placeCheck as { ok: boolean }).ok = false; this.placeCheck.why = why; } }
  /** The place answered before it showed its card: nothing about it was checked, so the check can't count as passed. */
  private placeUnchecked() { if (this.placeCheck.ok && !this.placeCheck.checked.length) { this.placeFails("the place answered before it showed its card, so nothing about it was checked"); this.placeCheck.unchecked = true; } }
  /** A ritual message header for this encounter (§2.2). */
  message(type: string, body: Record<string, unknown>): any {
    return { protocol: PROTOCOL, encounter_id: this.encounterId, msg_id: `${this.encounterId}-v${++this.seq}`, sent_at: nowIso(), from: this.rep.id, to: this.hostId, type, ...body };
  }
  signed(m: any) { return makeSigned(m, this.rep.key, m.sent_at); }
  async send(m: any): Promise<any[]> {
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
      if (x.type === "card_presentation" && x.card) this.hostCard = x.card;
      if (x.courtesy?.text) this.hostSaid.push({ text: x.courtesy.text, locale: x.courtesy.locale, untrusted: true });
      if (x.type === "invitation_response") { this.response = x; if (x.seat) this.seat = x.seat; if (x.readiness_requirements) this.readiness = x.readiness_requirements; }
      if (x.type === "lobby_briefing" && typeof x.onboarding_url === "string") this.onboardingUrl = x.onboarding_url;
    }
    return out;
  }
  async ritual(mandate: S.SignedMandate, actions: string[], limits: S.Limits | undefined, vouch: S.SignedVouch | null, why?: string) {
    this.mandateSent = mandate; this.myNonce = randomId("n");
    if (!this.target?.principal_id) this.placeFails("no principal_id to check the place against: pass the listing entry from findPlace (§3.1)");
    await this.send(this.message("greeting", { locales: this.rep.card.payload.locales, nonce: this.myNonce }));
    if (!this.hostNonce && !this.response) this.placeFails("the place's listed representative did not answer the greeting");
    if (!this.placeCheck.ok) return;
    const card = this.rep.card; const proof = makeSigned(possessionPayload(this.encounterId, this.hostNonce), this.rep.key, nowIso()).signatures[0];
    await this.send(this.message("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id } }));
    if (!this.placeCheck.ok) return;
    if (this.response) { this.placeUnchecked(); return; }   // the place has already answered (e.g. a deny for this card): no request follows
    this.checkHostCard();
    if (!this.placeCheck.ok) return;
    await this.send(this.message("introduction", { vouch }));
    await this.send(this.message("invitation_request", { card_digest: card.payload_digest, mandate, ...(vouch ? { vouch_digest: vouch.payload_digest } : {}),
      proposal: { request: { actions, ...(limits ? { limits } : {}) }, value_to_counterparty: { text: why ?? "A short visit on my owner's behalf.", locale: "en-US" }, etiquette_register: "first_meeting" } }));
  }
  /** §3.1 (C104): the place's card must match the listing entry this visit followed, and prove possession of its key now. */
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
    if (!cp?.possession_proof || !verifier.possession(cp.possession_proof, c.payload, this.encounterId, this.myNonce)) return this.placeFails("the place's possession proof doesn't verify over this visit's nonce (a copied card?)");
    this.placeCheck.checked.push("card names the listed representative_id and binds its key", "possession proof over this visit's nonce", "every message signed by the listed representative_id");
  }
  get decision(): string | undefined { return this.response?.decision; }
  /** The nonce in the place's last greeting (for possession proofs). */
  get lastHostNonce(): string { return this.hostNonce; }
  get seated(): boolean { return !!this.seat && this.placeCheck.ok; }
  /** Sign an act within the seat without sending it (for the MCP gate's Shokai-Act header). */
  signAct(tool: string, args: Record<string, unknown> = {}): S.Signed<S.Act> {
    if (!this.seat) throw new Error("not seated");
    return this.signed(this.message("act", { seat_id: this.seat.seat_id, tool, arguments: args }));
  }
  /** Send an act to the door and record the door's answer (§7.2). */
  async act(tool: string, args: Record<string, unknown> = {}) {
    if (!this.seat) throw new Error("not seated");
    const pre = this.beforeSend(tool, args);
    const spend = this.spendOf(tool, args);
    if (pre) { this.acts.push({ tool, ...(spend ? { amount: spend } : {}), ok: false, args, local: true }); this.logAct(tool, false, spend, true);
      return { type: "act_decision", decision: "deny", refused_by: "representative", by: pre.by, why: pre.why }; }
    let out: any[];
    try { out = await this.send(this.message("act", { seat_id: this.seat.seat_id, tool, arguments: args })); }
    catch (err) {
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
  /** Record an act performed elsewhere (e.g. through the MCP gate) so the report home includes it. */
  recordAct(tool: string, ok: boolean, args: Record<string, unknown> = {}, local?: true) {
    const spend = this.spendOf(tool, args);
    this.acts.push({ tool, ok, args, ...(spend ? { amount: spend } : {}), ...(local ? { local } : {}) });
    this.logAct(tool, ok, spend, local);
  }
  async farewell(outcome: "completed" | "withdrawn" | "taken_home" = "completed") {
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
export function placeLabel(principalId: string | undefined, displayName: string | undefined, verified: boolean): string {
  const id = !principalId ? undefined : principalId.startsWith("did:web:") ? decodeURIComponent(principalId.slice(8).split(":")[0])
    : `the place with key …${principalId.split("#")[0].slice(-8)}`;
  const name = displayName ? `"${displayName}"` : undefined;
  if (id && verified) return name ? `${id} (claims to be ${name}; not verified)` : id;
  return name ? `a place that claims to be ${name} (not verified)` : "an unverified place";
}
export function visitReport(v: Visit, locale = "en-US", opts: ReportOptions = {}): S.VisitReport {
  const r = v.response ?? {}; const owner = v.rep.owner.id;
  const host = placeLabel(v.target?.principal_id, v.hostName, v.placeCheck.ok && !v.placeCheck.unchecked); const at = nowIso(); const reportId = randomId("rep");
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
    + `In all under this mandate: ${n(totals!.acts_done, "action")} done, ${totals!.acts_refused} refused; spent ${totals!.spent.length ? list(totals!.spent.map(money)) : "nothing"}`
    + `${mcap ? ` of the ${money(mcap)} allowed, ${money(totals!.remaining!.amount!)} left` : ""}.`;
  const spentText = mandateText ? "" : spent.length ? `Spent ${list(spent.map(money))}${cap && spent.length === 1 && spent[0].currency === cap.currency ? ` of the ${money(cap)} allowed` : ""}.`
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
  const clean = (t: unknown) => typeof t === "string" ? t.replace(/[\u0000-\u001f\u007f\u2028\u2029"“”]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : "";
  const asked = ((v as any).readiness as S.ReadinessRequirement[] | undefined ?? []).map((x) => clean(x.owner_text?.text)).filter(Boolean);
  const ob = v.onboardingUrl ? (() => { try { const u = new URL(v.onboardingUrl!); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } })() : null;
  const placeAskedText = (asked.length ? ` It asked you, in its own words as its key signed them (quoted, not checked by me): ${asked.map((t) => `"${t}"`).join(" ")}.` : "")
    + (ob ? ` It points to a setup page at ${ob}. I won't open it; open it yourself only if you trust ${ob}.` : "");
  let text: string;
  if (!v.placeCheck.ok && !v.placeCheck.unchecked) text = `I didn't go in: ${host} didn't match its listing (${v.placeCheck.why}). Nothing was asked for and nothing was done.`;
  else if (r.decision === "grant") text = `${host} seated me for ${list(seatActions.map((a) => `"${a}"`))}, ${list(limitBits)}. `
    + `I did ${okActs} action${okActs === 1 ? "" : "s"}${refused ? `; ${refused} ${refused === 1 ? "was" : "were"} refused` : "; none were refused"}. ${spentText}`.trim() + offerText + mandateText + bbText + interruptedText;
  else if (r.decision === "deny") text = `${host} didn't seat me (${r.disposition}${r.reason_code ? ", " + r.reason_code : ""})${r.retry?.kind === "after" && r.retry?.not_before ? `; I may try again after ${when(r.retry.not_before, locale, tz)}` : r.retry?.kind === "with_credential" ? `; it would need: ${list(r.retry.credentials ?? [])}` : r.retry?.kind === "never" ? "; I won't try again" : ""}. Nothing was done.` + placeAskedText;
  else if (r.decision === "conditional") text = `${host} would seat me only if conditions are met; nothing was done.`;
  else if (r.decision === "considering") text = `${host} is considering the request${r.response_by ? ` and will answer by ${when(r.response_by, locale, tz)}` : ""}; nothing happens until it answers, and no answer by then means no.`;
  else text = `No decision from ${host}; nothing was done.`;
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
    outcome_rendered: { text, locale },
    voice: { text: `On ${when(at, locale, tz)} I visited ${host} for you. ${text} I showed them the card you signed (your display name "${cp.principal.display_name}" and your owner ID)${sentRequest ? " and one mandate" : ""}.${asksText} If you don't reply, nothing happens.`, locale },
    ...(v.seat ? { seat: { actions: v.seat.tool_allowlist, ...(v.seat.limits ? { limits: v.seat.limits } : {}) } } : {}),
    acts: v.acts.map((a) => ({ tool: a.tool, ...(a.amount ? { amount: a.amount } : {}), ok: a.ok })), ...(spent.length ? { spent } : {}), shared, ...(under_mandate ? { under_mandate } : {}),
    ...(bb.length ? { brought_back: bb.map(({ envelope, ...b }) => (opts.broughtBack === "reference" ? b : { ...b, envelope })) } : {}),
    host_said: (v as any).hostSaid, taken_home: [], offers_declined: [],
    ...((v as any).readiness ? { readiness_requirements: (v as any).readiness } : {}),
    next_step: { text: nextText, requires_owner_approval: true, if_no_reply: "nothing_happens" } };
}

export { possessionPayload, randomId };
