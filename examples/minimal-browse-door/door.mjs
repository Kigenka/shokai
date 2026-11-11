// SPDX-License-Identifier: Apache-2.0
// A Shōkai v0.5.0 Core Door (browse), written from SPEC.md alone: Node built-ins only, no Shōkai SDK, memory-only state.
// Review 4 R4-02: it follows the profile's normative definition (§0.1): every Core Door check except those Appendix F excludes,
// plus the profile rules (self-certifying principals, browse-only acts, nothing fetched, seats ≤ 3600 s). So it also serves the
// lobby (§3.3), DoorPointer 404s (§11.1), I-JSON with duplicate names refused (C284), the decision shape (§6.1), mandates and their
// ledgers (§5.1), probing (§9.3), idempotent acts (C233), a message cap (§3.4) and the farewell rules (§3.2, §3.5). That makes it
// longer than a sketch (about 300 lines); it is still one file. The SDK's conformance runner checks it with --claim browse, and check.mjs
// runs the in-process checks named in evidence.json (host-ended seats, revocation storage pressure, start-up refusals).
import http from "node:http";
import { createHash, createPublicKey, generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
const TAG = "shokai/0.5", SKEW = 300e3, SEAT_S = 3600, PROBE_N = 3, PROBE_WINDOW = 24 * 3600e3, NEVER_MS = 180 * 864e5, DAY = 864e5;
const DEFAULTS = { message_cap: 30, max_message_bytes: 65536, unverified_per_min: 60, unverified_total_per_min: 600, newcomer_per_min: 60, newcomer_source_per_min: 600, seats_per_card: 2, seats_per_source: 16, revocation_store: 10000, seen_revocations_per_principal: 16, unseen_revocations_per_principal: 16, unseen_revocations_total: 10000, encounter_bound: 10000, encounter_idle_s: 120 };
const SPEC = { version: "0.5.0", url: "https://shokai.example/spec/v0.5.0" }, B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// ---- canonical JSON, digests, keys (§2.1, §2.2, Appendix A)
const jcs = (v) => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(",")}]`
  : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",")}}`;
const sha = (b) => createHash("sha256").update(b).digest(), b64u = (b) => Buffer.from(b).toString("base64url"), unb = (s) => Buffer.from(String(s), "base64url");
const digest = (p) => "sha-256:" + b64u(sha(jcs(p))), now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z"), iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;   // C93: RFC 3339, UTC, whole seconds
const b58 = (b) => { let x = BigInt("0x" + (b.toString("hex") || "0")), s = ""; while (x > 0n) { s = B58[Number(x % 58n)] + s; x /= 58n; } const z = b.findIndex((c) => c); return "1".repeat(z < 0 ? b.length : z) + s; };
const unb58 = (s) => { let x = 0n; for (const c of s) { const i = B58.indexOf(c); if (i < 0) return Buffer.alloc(0); x = x * 58n + BigInt(i); } const h = x.toString(16); return Buffer.from(h.length % 2 ? "0" + h : h, "hex"); };
const SPKI = Buffer.from("302a300506032b6570032100", "hex"), edKey = (raw) => createPublicKey({ key: Buffer.concat([SPKI, raw]), format: "der", type: "spki" });
const didKey = (raw) => "did:key:z" + b58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]));
/** Browse doors accept self-certifying principals (C295): did:key (Ed25519) and did:jwk (P-256). Nothing is fetched. */
function resolve(did) { try { const d = String(did).split("#")[0];
  if (d.startsWith("did:key:z")) { const b = unb58(d.slice(9)); return b[0] === 0xed && b[1] === 1 && b.length === 34 ? { alg: "Ed25519", key: edKey(b.subarray(2)) } : null; }
  if (d.startsWith("did:jwk:")) { const j = JSON.parse(unb(d.slice(8))); return j.kty === "EC" && j.crv === "P-256" ? { alg: "ES256", key: createPublicKey({ key: { kty: j.kty, crv: j.crv, x: j.x, y: j.y }, format: "jwk" }) } : null; }
  } catch { /* unreadable id */ } return null; }
const selfCertifying = (did) => /^did:(key|jwk):/.test(String(did));
/** One signature over a digest (Appendix A): Ed25519 over the 32 digest bytes, or a passkey (ES256 WebAuthn) assertion. */
function sigOk(s, d, k) { try {
  if (s.alg === "Ed25519" && k.alg === "Ed25519") return verify(null, unb(d.slice(8)), k.key, unb(s.value));
  if (s.alg !== "ES256" || k.alg !== "ES256" || !s.webauthn?.rp_id || s.webauthn.batch) return false;
  const cdb = unb(s.webauthn.client_data_json), cd = JSON.parse(cdb), ad = unb(s.webauthn.authenticator_data), rp = s.webauthn.rp_id;
  return cd.type === "webauthn.get" && cd.challenge === d.slice(8) && cd.origin === "https://" + rp && !cd.crossOrigin && cd.topOrigin === undefined
    && sha(rp).equals(ad.subarray(0, 32)) && (ad[32] & 5) === 5 && verify("sha256", Buffer.concat([ad, sha(cdb)]), k.key, unb(s.value)); } catch { return false; } }
const sameDid = (a, b) => String(a ?? "").split("#")[0] === String(b ?? "").split("#")[0];
const signedBy = (env, did) => { const k = resolve(did); let d; try { d = digest(env?.payload); } catch { return false; }
  return !!k && env?.payload_digest === d && Array.isArray(env.signatures) && env.signatures.some((s) => sameDid(s?.signer, did) && sigOk(s, d, k)); };
/** C284: I-JSON. A body with a duplicate member name is malformed (the lobby), whatever JSON.parse would keep. */
function hasDuplicateNames(t) { const st = [];
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (c === "{") st.push(new Set()); else if (c === "}") st.pop();
    else if (c === '"') { let j = i + 1; while (j < t.length && t[j] !== '"') j += t[j] === "\\" ? 2 : 1; const raw = t.slice(i, j + 1); i = j; let k = j + 1; while (/\s/.test(t[k] ?? "")) k++;
      if (t[k] === ":" && st.length) { const key = JSON.parse(raw), s = st[st.length - 1]; if (s.has(key)) return true; s.add(key); } } }
  return false; }
function newKey() { const { privateKey, publicKey } = generateKeyPairSync("ed25519"); const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12), id = didKey(raw), key_id = id + "#" + id.slice(8);
  const sig = (d) => ({ alg: "Ed25519", key_id, signer: id, signed_at: now(), value: b64u(sign(null, unb(d.slice(8)), privateKey)) });
  return { id, key_id, raw, sig, sign: (p) => { const d = digest(p); return { payload: p, payload_digest: d, signatures: [sig(d)] }; } }; }
const IKEY = (k) => typeof k === "string" && /^[A-Za-z0-9_-]+$/.test(k) && unb(k).length >= 16 && unb(k).length <= 32 && b64u(unb(k)) === k;   // C233
/** C235: a payment card number (13–19 digits, spaces or dashes between, passing the Luhn sum) is never taken or echoed. */
const luhn = (d) => { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; };
const carriesCard = (x) => (JSON.stringify(x ?? null).match(/\d(?:[ -]?\d){12,18}/g) ?? []).some((r) => { const d = r.replace(/[ -]/g, ""); for (let n = 13; n <= Math.min(19, d.length); n++) for (let i = 0; i + n <= d.length; i++) if (luhn(d.slice(i, i + n))) return true; return false; });
const money = (x) => JSON.stringify(x ?? {}).includes('"amount"') || JSON.stringify(x ?? {}).includes('"max_amount"');

/** C284 (review 6 R6-05): a number token must denote the same value as the double it parses to, re-serialised as JCS writes it. */
const decimalKey = (t) => { const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(t); if (!m) return "NaN:" + t; const frac = m[3] ?? "", digits = (m[2] + frac).replace(/^0+/, "");
  if (!digits) return "0"; const k = digits.replace(/0+$/, ""); return m[1] + k + "e" + (Number(m[4] ?? 0) - frac.length + (digits.length - k.length)); };
function inexactNumber(t) { let inStr = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; } if (c === '"') { inStr = true; continue; }
  if (/[-0-9]/.test(c)) { let j = i; while (j < t.length && /[-+0-9.eE]/.test(t[j])) j++; const tok = t.slice(i, j), v = Number(tok); if (!Number.isFinite(v) || decimalKey(tok) !== decimalKey(String(v))) return true; i = j - 1; } } return false; }
/** C284: I-JSON beyond duplicate names: no lone surrogates, every number finite and, if an integer, exact. */
/** C284: the one reading of a body, or undefined. */
const readOne = (body) => hasDuplicateNames(body) || inexactNumber(body) ? undefined : JSON.parse(body);
function iJsonOk(v) { if (typeof v === "string") return v.isWellFormed(); if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(iJsonOk); if (v && typeof v === "object") return Object.entries(v).every(([k, x]) => k.isWellFormed() && iJsonOk(x)); return true; }

/** C236: a door refuses to start on a setting it can't serve as signed. */
function checkConfig(c) { const bad = [];
  for (const k of ["message_cap", "unseen_revocations_per_principal", "unseen_revocations_total", "encounter_bound", "encounter_idle_s", "unverified_per_min", "unverified_total_per_min", "newcomer_per_min", "newcomer_source_per_min", "seats_per_card", "seats_per_source", "revocation_store", "seen_revocations_per_principal"])
    if (!Number.isInteger(c[k]) || c[k] < 1) bad.push(`${k} must be a positive integer`);
  if (!Number.isInteger(c.max_message_bytes) || c.max_message_bytes < 4096) bad.push("max_message_bytes must be an integer of at least 4096");
  if (!c.display || typeof c.display !== "string") bad.push("no summary: a display name is required");
  if (bad.length) throw new Error("refusing to start (C236): " + bad.join("; ")); }

export function startDoor(opts = {}) {
  const cfg = { port: 0, name: "tea", display: "Kiyomi Tea (browse demo)", ...DEFAULTS, ...opts }; checkConfig(cfg);
  const { name, display } = cfg; let port = cfg.port;
  const owner = newKey(), rep = newKey(); let base, entry, lobbyUrl, inbox, hostCard;
  const ACTIONS = [{ action: "menu.view", purposes: ["visitation", "inquiry"], spends: false, needs: "standard", data_asks: [] }];
  const MENU = [{ item: "sencha", price: { value: "6.00", currency: "USD" } }, { item: "hojicha", price: { value: "5.50", currency: "USD" } }];
  const PURPOSES = [{ code: "visitation", statement: { text: "Looking at the menu and asking questions.", locale: "en-US" } }, { code: "inquiry", statement: { text: "Questions about a tea.", locale: "en-US" } }];
  const summary = { name, display_name: display, purpose: { statement: "A tea shop. Browse the menu; nothing is sold here by agents.", locale: "en-US" },
    retention_days: 0, message_cap: cfg.message_cap, max_message_bytes: cfg.max_message_bytes, offers: ACTIONS.map((a) => ({ action: a.action, label: "See the menu" })), spec_ref: SPEC };
  const policy = { preset: "browse", actions: ACTIONS, spending_actions: [], account_actions: [], account_creation: false, lobby: true, message_cap: cfg.message_cap, max_message_bytes: cfg.max_message_bytes, summary };
  let house_digest;   // §2.3: digest of JCS({name, display_name, principal_id, policy}), set once the owner's key exists (below)
  // State. Memory only (C295 allows it). `nevers` maps a bound principal or key to when the binding lifts (≤ 180 days, §2.4, §9.3).
  const byVisitor = new Map(), enc = new Map(), seats = new Map(), nonces = new Map(), revocations = [], nevers = new Map(), probes = new Map(), ledger = new Map(), idem = new Map(), hits = new Map(), outbox = new Map();
  const known = new Set();   // principals with a seat here (no longer newcomers, C287)
  const undecided = new Map(); // C238 R5-01: principals whose in-force revocation was dropped (store full) → their new seats fail closed
  const courtesy = (text, register = "first_meeting") => ({ locale: "en-US", locale_match: "exact", register, text });
  const basis = (m) => ({ policy_version: "tea-browse-2", input_digest: digest(m), decided_at: now() });
  const hdr = (e, type, extra = {}, to = e.visitor) => rep.sign({ protocol: TAG, encounter_id: e.id, msg_id: `${e.id}-h${++e.seq}`, sent_at: now(), from: rep.id, to, type, ...extra });
  const retryOf = { signed_card: { kind: "with_credential", credentials: ["signed_card"] }, mandate: { kind: "with_credential", credentials: ["signed_mandate"] },
    proof: { kind: "with_credential", credentials: ["possession_proof"] }, later: (s = 60) => ({ kind: "after", not_before: iso(Date.now() + s * 1e3) }), never: { kind: "never" } };
  const appealUrl = () => base + "/appeal";
  /** §6.1: every refusal carries retry, courtesy and basis; `in_reply_to` except in the lobby (§3.1). A deny closes the encounter to requests (§3.5). */
  const deny = (e, m, disposition, reason_code, retry, extra = {}, to) => { e.decided = true; if (disposition === "never") e.closed = true;
    return hdr(e, "invitation_response", { ...(m ? { in_reply_to: m.msg_id } : {}), decision: "deny", disposition, ...(reason_code ? { reason_code } : {}), retry,
      courtesy: courtesy(disposition === "never" ? "We won't continue this visit." : "Not this time; the details say what would help."), basis: basis(m ?? {}), ...extra }, to); };
  /** §2.4, §9.3, C288: a long refusal states when it lifts (≤ 180 days) and how to appeal. */
  const denyNever = (e, m, until) => deny(e, m, "never", undefined, retryOf.never, { courtesy: courtesy(`We won't continue this visit. ${until ? `This lasts until ${iso(until)}; to` : "To"} appeal, see ${appealUrl()} or send an owner-signed appeal to ${inbox}.`, "adversarial") });
  const bound = (id) => { const t = nevers.get(String(id ?? "").split("#")[0]); if (t && t <= Date.now()) { nevers.delete(String(id).split("#")[0]); return 0; } return t ?? 0; };
  const bind = (id) => { const t = Date.now() + NEVER_MS; nevers.set(String(id).split("#")[0], t); return t; };
  const readiness = (code, text, owner_text = text) => [{ code, required: true, detail: { text, locale: "en-US" }, owner_text: { text: owner_text, locale: "en-US" }, how: { kind: "link", url: base + "/onboard" } }];
  const actDeny = (e, m, disposition, reason_code, retry = retryOf.mandate) => hdr(e, "act_decision", { in_reply_to: m.msg_id, seat_id: String(m.seat_id ?? ""), tool: String(m.tool ?? ""),
    decision: "deny", disposition, ...(reason_code ? { reason_code } : {}), retry, courtesy: courtesy("I can't do that within this seat.", "established"), basis: basis(m) });
  /** §2.6, C295: delivered revocations only. A revocation binds only cards of the principal that signed it; by digest, or by card_id for every card with it. */
  const isRevoked = (c, d) => revocations.some((r) => (r.until === undefined || r.until >= Date.now()) && sameDid(r.principal, c?.principal?.principal_id) && (r.card_digest ? r.card_digest === d : r.card_id === c?.card_id));
  /** §3.3: the lobby, in a fresh lobby encounter addressed to a fresh anonymous id, with no in_reply_to. */
  function lobby() { const e = { id: "lobby-" + b64u(randomBytes(9)), visitor: "urn:shokai:anon:" + b64u(randomBytes(9)), seq: 0 };
    return [hdr(e, "greeting", { locales: ["en-US"], nonce: b64u(randomBytes(16)), courtesy: courtesy(`Welcome to ${display}.`) }),
      hdr(e, "lobby_briefing", { about: courtesy(summary.purpose.statement), how_this_place_works: { text: "Representatives send a signed greeting, present a card their owner signed, and ask to see the menu.", locale: "en-US" },
        onboarding_url: base + "/onboard", purposes: PURPOSES, spec_ref: SPEC, inbox, actions: ACTIONS, templates: { card: {}, mandate: {} } }),
      { ...deny(e, null, "not_now", "CREDENTIAL_REQUIRED", { kind: "with_credential", credentials: ["signed_card", "owner_binding", "signed_mandate"] },
        { readiness_requirements: [...readiness("card", "A Shōkai visitor card signed by your owner, and a signed greeting.", "Your agent needs a visitor card you signed."),
          ...readiness("owner_binding", "For a person: the card's owner binding (a passkey).", "If you are a person, sign your agent's card with your passkey.").map((x) => ({ ...x, required: true })),
          ...readiness("purpose", "A signed mandate for one of the listed purposes.", "Tell your agent what it may do here, and sign it."),
          ...readiness("introduction", "No introduction is needed here.", "No one needs to introduce you here.").map((x) => ({ ...x, required: false })),
          ...readiness("claim_evidence", "No claim evidence is needed here.", "Nothing else is needed.").map((x) => ({ ...x, required: false }))] }) },
      hdr(e, "farewell", { outcome: "declined", courtesy: courtesy("Thank you for visiting.") })]; }
  const pointer = (here) => ({ type: "door_pointer", protocol: TAG, place_listing: base + "/places", start_with: "greeting", spec_ref: SPEC,
    places: [{ name, entry, lobby: lobbyUrl, onboarding_url: base + "/onboard", inbox, principal_id: owner.id }], ...(here ? { here: { name, entry, lobby: lobbyUrl, onboarding_url: base + "/onboard", inbox, method: "POST" } } : {}) });
  const listing = () => ({ type: "place_listing", protocol: TAG, door: base + "/", published_at: now(), places: [{ name, display_name: display, principal_id: owner.id, representative_id: rep.id,
    entry, lobby: lobbyUrl, inbox, onboarding_url: base + "/onboard", locales: ["en-US"], purposes: PURPOSES, category: "tea_shop", actions: ACTIONS, spec_ref: SPEC, house_digest,
    accepted_tags: [TAG], profile: "core-door-browse" }] });
  const proofFor = (p, k, id, nonce) => { try { return verify(null, unb(digest({ encounter_id: id, nonce, audience: rep.id }).slice(8)), k, unb(p.value ?? "")); } catch { return false; } };

  /** §2.4: the presentation check, in the spec's order. Returns the answer, or null when the card is good. */
  function presentation(e, m) {
    const c = m.card?.payload, p = m.possession_proof;
    // (0) a Shōkai host card shown as a visitor's credential → the wrong-kind refusal (C202), first (R6-01): costs nothing but a new visit
    if (c?.kind === "host") return [deny(e, m, "not_now", "CREDENTIAL_REQUIRED", retryOf.signed_card, { readiness_requirements: readiness("card_kind", "This door expects a Shōkai visitor card.",
      "This door expects a Shōkai visitor card. You presented a Shōkai host card. Please come back with your Shōkai visitor card, or ask your owner for one.") })];
    // §2.1 (review 4 R4-07): public_key has one encoding, base64url of the raw 32-byte key; anything else is a malformed card.
    const raw = (() => { const pk = String(c?.representative_key?.public_key ?? ""); return /^[A-Za-z0-9_-]{43}$/.test(pk) ? unb(pk) : null; })();
    if (!c || c.representative_key?.alg !== "Ed25519" || !raw) return [deny(e, m, "not_now", "CREDENTIAL_REQUIRED", retryOf.signed_card, { readiness_requirements: readiness("card", "Present a card whose representative_key is an Ed25519 key, as base64url of its raw 32 bytes (the one encoding).") })];   // malformed: a setup failure
    const cardKey = edKey(raw);
    // (1) the card isn't the presenter's → never, binding the presenter only; its key isn't the key its id resolves to → not_now (R6-01)
    if (!sameDid(c.representative_id, m.from)) return [denyNever(e, m, bind(m.from))];
    if (didKey(raw) !== String(m.from).split("#")[0]) return [deny(e, m, "not_now", "CREDENTIAL_REQUIRED", retryOf.signed_card, { readiness_requirements: readiness("card", "Your card's representative_key isn't the key of its representative_id: ask your owner for a reissued card.") })];
    // (2) the proof is missing, malformed, made for another door, or fails without being a copy → not_now (a setup failure, C288)
    const wellFormed = p && p.alg === "Ed25519" && unb(p.value ?? "").length === 64 && p.key_id === c.representative_key.key_id && sameDid(p.signer, m.from);
    const here = wellFormed && sameDid(m.to, rep.id) && sameDid(p.audience, rep.id) && proofFor(p, cardKey, e.id, e.nonce);
    const copied = wellFormed && !here && sameDid(p.audience, rep.id) && (byVisitor.get(String(m.from).split("#")[0]) ?? []).some((o) => o !== e && o.nonce && proofFor(p, cardKey, o.id, o.nonce));
    const proofRefusal = () => deny(e, m, "not_now", "CREDENTIAL_REQUIRED", retryOf.proof, { readiness_requirements: readiness("possession_proof", "Start a new visit (a fresh greeting) and sign the proof over that encounter, its nonce and this door's id.") });
    if (!wellFormed || !sameDid(m.to, rep.id) || !sameDid(p.audience, rep.id)) return [proofRefusal()];          // (2) form and address only
    // (3) the card's signature or times; did:web principals aren't resolved here (C295)
    const cardRefusal = (code = "CREDENTIAL_REQUIRED") => deny(e, m, "not_now", code, retryOf.signed_card, { readiness_requirements: readiness("card", "Present your own Shōkai visitor card, signed by your owner.") });
    const rp = c.owner_binding?.rp_id;                                                                                                // C94 C128: the passkey's relying party is the card's own
    if (!selfCertifying(c.principal?.principal_id) || !signedBy(m.card, c.principal.principal_id) || (rp !== undefined && !m.card.signatures.every((x) => x.alg !== "ES256" || x.webauthn?.rp_id === rp)) || !TS.test(c.issued_at ?? "") || !TS.test(c.expires_at ?? "")
      || Date.parse(c.expires_at) < Date.now() || Date.parse(c.issued_at) > Date.now() + SKEW) return [cardRefusal()];
    // (3a) revoked → not_now, no reason code (§2.6)
    if (isRevoked(c, m.card.payload_digest)) return [deny(e, m, "not_now", undefined, retryOf.signed_card)];
    // (3b) a well-formed proof that fails over this encounter without being a copy → not_now, as in (2) (§2.4's one order, R5-04)
    if (!here && !copied) return [proofRefusal()];
    // (4) a copied proof: only the card key's holder can send it (step 1) → not_now as in (2), nothing bound (R6-01)
    if (copied) return [proofRefusal()];
    if (c.crit !== undefined) return [cardRefusal("UNSUPPORTED_CRITICAL")];                                                           // C289: this door implements no critical member
    return null; }
  // C299 / C300 / C301 (H1, 2026-11-09): wire tags compare numerically; a min_protocol that isn't a wire tag is malformed; one above the request's own tag is the version-mismatch lobby only.
  const wireTagKey = (t) => { const m = String(t ?? "").match(/^shokai\/(\d+)(?:\.(\d+))?$/); if (!m) return null; if (/^0\d/.test(m[1]) || (m[2] !== undefined && /^0\d/.test(m[2]))) return null; return [Number(m[1]), Number(m[2] ?? 0)]; };
  const minProtocolMalformed = (p) => p?.min_protocol !== undefined && !wireTagKey(p.min_protocol);
  const minProtocolAbove = (p, tag) => { const a = wireTagKey(p?.min_protocol), b = wireTagKey(tag); return !!(a && b && (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]))); };
  function mandateProblem(e, md) {   // §5.1, C3, C116, C188, C300
    const p = md?.payload; if (!p) return "REQUEST_INCOMPLETE";
    const crit = Array.isArray(p.crit) ? p.crit : p.crit !== undefined ? [p.crit] : [];
    if (crit.some((x) => x !== "min_protocol")) return "UNSUPPORTED_CRITICAL";                                                     // C289: this door implements min_protocol (C300, C301) and no other critical member
    if (minProtocolMalformed(p)) return "MANDATE_INVALID";                                                                          // C300: not a wire tag
    const scope = e.card.mandate_scope ?? {};
    if (!signedBy(md, e.principal) || !sameDid(p.principal_id, e.principal) || !sameDid(p.representative_id, e.visitor) || p.card_id !== e.card.card_id
      || !TS.test(p.valid_from ?? "") || !TS.test(p.expires_at ?? "") || Date.parse(p.valid_from) > Date.now() + SKEW || Date.parse(p.expires_at) < Date.now()
      || !(p.allowed_actions ?? []).every((a) => (scope.actions ?? []).includes(a)) || (p.purpose && !(scope.purposes ?? []).includes(p.purpose.code ?? p.purpose))
      || (Array.isArray(p.counterparties) && !p.counterparties.some((x) => sameDid(x, owner.id)))) return "MANDATE_INVALID";
    return null; }
  function request(e, m) {   // §3.2 step 5, §6.7 order, §9.3 probing, C295 browse only
    if (e.step < 3 || e.decided) return [deny(e, m, "not_now", "RITUAL_ORDER", retryOf.later(0))];                                     // after the introduction; a deny closed it (§3.5)
    const until = bound(e.principal) || bound(e.visitor); if (until) return [denyNever(e, m, until)];
    if (isRevoked(e.card, e.cardDigest)) return [deny(e, m, "not_now", undefined, retryOf.signed_card)];
    const r = m.proposal?.request ?? {}, acts = Array.isArray(r.actions) ? r.actions : [];
    if (!m.mandate || !acts.length || m.card_digest !== e.cardDigest) return [deny(e, m, "not_now", "REQUEST_INCOMPLETE", retryOf.mandate)];  // C28, C68
    const why = mandateProblem(e, m.mandate); if (why) return [deny(e, m, "not_now", why, retryOf.mandate)];
    const md = m.mandate.payload, inMandate = acts.filter((a) => (md.allowed_actions ?? []).includes(a)), browse = (a) => ACTIONS.some((x) => x.action === a);
    if (minProtocolAbove(md, m.protocol ?? TAG)) return lobby();                                                                   // C301: version-mismatch lobby only; no visitor invitation_response
    const inCard = acts.some((a) => (e.card.mandate_scope?.actions ?? []).includes(a));                                              // R4-08: inside the card, a new mandate fixes it
    if (!inMandate.length && inCard) return [deny(e, m, "not_now", "MANDATE_SCOPE_EXCEEDED", retryOf.mandate)];
    if (!inMandate.length && !acts.every(browse)) return [deny(e, m, "not_now", "MANDATE_SCOPE_EXCEEDED", retryOf.mandate)];          // R6-03: an action the place doesn't list never counts
    if (!inMandate.length) {                                                                                                          // §9.3: the one probing cause
      const shapes = (probes.get(e.principal) ?? []).filter((x) => x.at > Date.now() - PROBE_WINDOW), shape = jcs({ actions: [...acts].sort(), limits: r.limits ?? null });
      if (!shapes.some((x) => x.shape === shape)) shapes.push({ shape, at: Date.now() }); probes.set(e.principal, shapes);
      if (shapes.length >= PROBE_N) return [denyNever(e, m, bind(e.principal))];
      return [deny(e, m, "not_now", "MANDATE_SCOPE_EXCEEDED", retryOf.signed_card, { readiness_requirements: readiness("card", "Your card doesn't cover these actions; your owner would need to sign a new card.") })]; }   // R6-03: its own answer
    if (money(r.limits) || money(md.limits)) return [deny(e, m, "not_a_fit", "POLICY_DENY", retryOf.later())];                         // browse only: no amounts
    const fit = inMandate.filter(browse);
    if (inMandate.length < acts.length) {                                                                                             // §6.7 rule 1: partial overlap
      if (!fit.length) return [deny(e, m, "not_now", "MANDATE_SCOPE_EXCEEDED", retryOf.mandate)];
      return [hdr(e, "invitation_response", { in_reply_to: m.msg_id, decision: "conditional", conditions: [{ code: "narrow_actions", params: { actions: fit } }], reason_code: "MANDATE_SCOPE_EXCEEDED",
        retry: retryOf.mandate, courtesy: courtesy("Some of this is possible: the conditions say which part."), basis: basis(m) })]; }
    if (fit.length < acts.length) return [deny(e, m, "not_a_fit", "POLICY_DENY", retryOf.later())];                                  // inside the mandate, outside the policy (§6.2)
    if (stillFull(e.card?.principal?.principal_id)) return [deny(e, m, "not_now", undefined, retryOf.later(300))];             // C238 R5-01: fail closed for that principal's new seats only
    const open = [...seats.values()].filter((s) => !s.ended && Date.parse(s.expires_at) > Date.now());                               // C287 seat caps
    if (open.filter((s) => s.cardDigest === e.cardDigest).length >= cfg.seats_per_card || (!known.has(e.principal) && open.filter((s) => s.source === e.source && !s.knownAtGrant).length >= cfg.seats_per_source))
      return [deny(e, m, "not_now", "RATE_LIMITED", retryOf.later())];
    e.decided = true; const exp = Math.min(Date.now() + SEAT_S * 1e3, Date.parse(md.expires_at));
    const seat = { seat_id: "seat-" + b64u(randomBytes(16)), levels: ["discover"], tool_allowlist: acts, access_mode: "session", expires_at: iso(exp), mandate_id: md.mandate_id, ...(md.limits ? { limits: md.limits } : {}) };
    seats.set(seat.seat_id, { ...seat, visitor: e.visitor, principal: e.principal, card: e.card, cardDigest: e.cardDigest, maxOps: md.limits?.max_operations, mandateExp: Date.parse(md.expires_at), enc: e, repeats: 0, source: e.source, knownAtGrant: known.has(e.principal) });
    known.add(e.principal); e.farewellSent = true;
    return [hdr(e, "invitation_response", { in_reply_to: m.msg_id, decision: "grant", basis: basis(m), courtesy: courtesy("Thank you. You are welcome to proceed within the seat described."), seat }),
      hdr(e, "farewell", { outcome: "seated", courtesy: courtesy("Your seat is ready. Enjoy the menu.") })]; }
  function act(e, m) {   // §7.2, C193 order, C189 answers
    const s = seats.get(m.seat_id); if (!s || !sameDid(s.visitor, m.from)) return [actDeny(e, m, "not_a_fit", "SEAT_SCOPE_EXCEEDED")];
    if (m.idempotency_key !== undefined && !IKEY(m.idempotency_key)) return [actDeny(e, m, "not_now", "REQUEST_INCOMPLETE")];
    const ik = m.idempotency_key ? `${m.from}|${m.seat_id}|${m.idempotency_key}` : null;
    if (ik && idem.has(ik)) { if (++s.repeats > 10) return [actDeny(e, m, "not_now", "RATE_LIMITED", retryOf.later())]; return idem.get(ik); }
    if (s.ended || Date.parse(s.expires_at) <= Date.now()) return [actDeny(e, m, "not_now", "SEAT_SCOPE_EXCEEDED")];
    if (isRevoked(s.card, s.cardDigest)) return [actDeny(e, m, "not_now", undefined, retryOf.signed_card)];                            // C198
    if (carriesCard(m.arguments)) return [actDeny(e, m, "not_now", "CREDENTIAL_NOT_ACCEPTED", retryOf.later(0))];                      // (5a) C235
    if (!s.tool_allowlist.includes(m.tool) || money(m.arguments)) return [actDeny(e, m, "not_a_fit", "SEAT_SCOPE_EXCEEDED")];
    const lk = String(s.principal).split("#")[0] + "|" + s.mandate_id, used = ledger.get(lk)?.n ?? 0; if (s.maxOps !== undefined && used >= s.maxOps) return [actDeny(e, m, "not_now", "SEAT_SCOPE_EXCEEDED")];   // (9), C189
    ledger.set(lk, { n: used + 1, until: s.mandateExp });                                                                             // C188: keyed with the principal
    const out = [hdr(e, "act_result", { in_reply_to: m.msg_id, seat_id: s.seat_id, tool: m.tool, ok: true, result: { menu: MENU } })]; if (ik) idem.set(ik, out); return out; }
  /** C234: the host ends a live seat. One closing farewell `completed`, held for the visitor at the inbox, once per seat. */
  function endSeat(seat_id) { const s = seats.get(seat_id); if (!s || s.ended) return false; s.ended = true;
    const q = outbox.get(String(s.visitor).split("#")[0]) ?? []; q.push(hdr(s.enc, "farewell", { outcome: "completed", seat_id, courtesy: courtesy("This seat has ended. Thank you for visiting.") })); outbox.set(String(s.visitor).split("#")[0], q); return true; }
  /** §2.6, C238: verify, then keep. A full store drops expired entries first, otherwise fails closed (no new seats, no acts). */
  //   §2.6 (fix check 2, N1): a revocation for a card this door has seen is kept until that card expires and never dropped while in force; one for a
  //   card it hasn't seen goes to a bounded store (per principal and in total, oldest first), since nothing bounds how many a free key can sign.
  //   Failing closed means no new seat for a card whose status can't be decided; it never silences the door and lifts as entries expire.
  const seenCards = new Map();   // card digest → { principal, card_id, expires }
  function takeRevocation(env) { const r = env?.payload; if (!r || !selfCertifying(r.principal_id) || !signedBy(env, r.principal_id) || !(r.card_digest || r.card_id)) return;
    const pr = String(r.principal_id).split("#")[0], card_id = r.card_digest ? undefined : r.card_id;
    if (revocations.some((x) => x.principal === pr && x.card_digest === r.card_digest && x.card_id === card_id)) return;           // a duplicate changes nothing
    const seen = [...seenCards.entries()].filter(([d, c]) => sameDid(c.principal, pr) && (r.card_digest ? d === r.card_digest : c.card_id === r.card_id));
    const entry = { principal: pr, card_digest: r.card_digest, card_id, until: seen.length ? Math.max(...seen.map(([, c]) => c.expires)) : undefined, at: Date.now() };
    if (!seen.length) { const mine = revocations.filter((x) => x.until === undefined && x.principal === pr), all = revocations.filter((x) => x.until === undefined);
      if (mine.length >= cfg.unseen_revocations_per_principal) revocations.splice(revocations.indexOf(mine[0]), 1);
      else if (all.length >= cfg.unseen_revocations_total) revocations.splice(revocations.indexOf(all[0]), 1);
      revocations.push(entry); return; }
    for (let i = revocations.length - 1; i >= 0; i--) if (revocations[i].until !== undefined && revocations[i].until < Date.now()) revocations.splice(i, 1);   // expired first
    const mineSeen = revocations.filter((x) => x.until !== undefined && x.principal === pr);                                        // R5-01: a full bucket drops only its own oldest
    if (mineSeen.length >= cfg.seen_revocations_per_principal) revocations.splice(revocations.indexOf(mineSeen[0]), 1);
    else { const allSeen = revocations.filter((x) => x.until !== undefined);
      if (allSeen.length >= cfg.revocation_store) { const o = allSeen[0]; revocations.splice(revocations.indexOf(o), 1);              // full in total: drop the oldest, and fail closed
        undecided.set(o.principal, Math.max(undecided.get(o.principal) ?? 0, o.until)); } }                                         // for that principal only, until its entry would have lapsed
    revocations.push(entry); }
  const stillFull = (principal) => { for (const [k, t] of undecided) if (t < Date.now()) undecided.delete(k);
    return principal === undefined ? undecided.size > 0 : undecided.has(String(principal).split("#")[0]); };

  function handle(env, source) {   // one parsed body at the entry or lobby address (C120) → the messages to send back
    if (!env || typeof env !== "object" || Array.isArray(env) || !("payload" in env) || !Array.isArray(env.signatures) || !env.signatures.length) return lobby();   // prose, batches, unsigned (§3.3, C183)
    let d; try { d = digest(env.payload); } catch { return lobby(); }
    if (d !== env.payload_digest) return [];                                                                                          // §2.2: tampered, unanswered
    const m = env.payload; if (!m || typeof m !== "object" || m.protocol !== TAG || typeof m.type !== "string" || typeof m.from !== "string" || typeof m.encounter_id !== "string"
      || typeof m.msg_id !== "string" || !TS.test(m.sent_at ?? "") || !signedBy(env, m.from)) return lobby();                          // other versions, bad signature, bad time form
    if (/\d{13,19}/.test(m.msg_id + m.encounter_id)) return lobby();                                                                 // C235: never echo a card number from a header
    if (Math.abs(Date.parse(m.sent_at) - Date.now()) > SKEW) return lobby();
    if (m.type === "card_revocation") { takeRevocation(m.revocation); return []; }                                                   // taken in even when failing closed
    if (m.to !== undefined && !sameDid(m.to, rep.id) && m.type !== "card_presentation") return [];                                   // §2.2: addressed to another party
    let e = enc.get(m.encounter_id);
    if (m.type === "greeting") {
      if (e && e.greetingDigest === env.payload_digest && sameDid(e.visitor, m.from)) return e.greetingReply;                       // R3-11: an exact redelivery gets the original reply
      if (e) { const side = { id: e.id, visitor: e.visitor, seq: (e.seq += 1) + 500 };                                                // changes nothing in the encounter
        return [deny(side, m, "not_now", "RITUAL_ORDER", retryOf.later(0), {}, m.from)]; }                                            // C142: an outsider, or a second greeting
      if (enc.size >= cfg.encounter_bound) { const idle = Date.now() - cfg.encounter_idle_s * 1e3;                                    // C152 C266: bounded, idle encounters dropped first
        for (const [k, o] of enc) { if (enc.size < cfg.encounter_bound) break; if ((o.last ?? 0) < idle && ![...seats.values()].some((s) => s.enc === o && !s.ended)) { enc.delete(k); const l = byVisitor.get(String(o.visitor).split("#")[0]); if (l) l.splice(l.indexOf(o), 1); } }
        if (enc.size >= cfg.encounter_bound) return [deny({ id: m.encounter_id, visitor: m.from, seq: 0 }, m, "not_now", "RATE_LIMITED", retryOf.later())]; }
      e = { id: m.encounter_id, visitor: m.from, seq: 0, nonce: b64u(randomBytes(16)), vnonce: m.nonce, step: 1, n: 0, source, greetingDigest: env.payload_digest, last: Date.now() }; enc.set(e.id, e);
      const vk = String(m.from).split("#")[0]; byVisitor.set(vk, [...(byVisitor.get(vk) ?? []).slice(-31), e]);                    // a copy can only come from the sender's own encounters
      for (const [k, t] of nonces) if (t < Date.now() - DAY) nonces.delete(k);
      if (nonces.size >= cfg.encounter_bound * 4) nonces.delete(nonces.keys().next().value);
      const nk = vk + "|" + m.nonce;                                                                                                   // §2.4: keyed (from, nonce)
      if (typeof m.nonce !== "string" || !m.nonce || nonces.has(nk)) { e.closed = true; e.decided = true;                          // §2.4 C57: reuse → never, binding nothing
        return (e.greetingReply = [deny(e, m, "never", undefined, retryOf.never, { courtesy: courtesy(`We won't continue this visit. This greeting's nonce was already used; start a new visit with a fresh one. To appeal, see ${appealUrl()}.`, "adversarial") })]); }
      nonces.set(nk, Date.now());
      return (e.greetingReply = [hdr(e, "greeting", { locales: ["en-US"], nonce: e.nonce, courtesy: courtesy(`Welcome to ${display}.`) })]); }
    if (!e) return m.type === "act" ? act({ id: m.encounter_id, visitor: m.from, seq: 1000 }, m)
      : [deny({ id: m.encounter_id, visitor: m.from, seq: 1000 }, m, "not_now", "RITUAL_ORDER", retryOf.later(0))];                    // no such encounter: start with a greeting
    if (sameDid(e.visitor, m.from)) e.last = Date.now();
    if (!sameDid(e.visitor, m.from)) return [deny({ id: e.id, visitor: e.visitor, seq: (e.seq += 1) + 500 }, m, "not_now", "RITUAL_ORDER", retryOf.later(0), {}, m.from)];   // C142: an outsider changes nothing
    if (m.type === "farewell" && !e.farewellSent && !e.decided && !["withdrawn", "taken_home"].includes(m.outcome)) return e.step < 2 ? lobby() : [deny(e, m, "not_now", "RITUAL_ORDER", retryOf.later(0))];   // §3.2
    if (m.type === "farewell") { if (e.farewellSent) return []; e.farewellSent = true; e.decided = true; e.closed = true; return [hdr(e, "farewell", { outcome: "completed", courtesy: courtesy("Thank you for visiting.") })]; }   // §3.5, C234
    if (++e.n > cfg.message_cap) return m.type === "act" ? [actDeny(e, m, "not_now", "RATE_LIMITED", retryOf.later())] : [deny(e, m, "not_now", "RATE_LIMITED", retryOf.later())];
    if (m.type === "act") return act(e, m);                                                                                           // C10: a granted seat still answers after the farewell
    if (e.closed) return [deny(e, m, "not_now", "RITUAL_ORDER", retryOf.later(0))];                                                    // §3.5: closed
    if (m.type === "card_presentation") {
      if (e.step !== 1) return [deny(e, m, "not_now", "RITUAL_ORDER", retryOf.later(0))];                                              // one card per encounter
      const until = bound(m.from); if (until) return [denyNever(e, m, until)];
      if (m.card && Array.isArray(m.card.signatures) && !m.card.signatures.length) return lobby();                                    // C50: a card with zero signatures is the lobby
      const bad = presentation(e, m); if (bad) return bad;
      const c = m.card.payload; seenCards.set(m.card.payload_digest, { principal: String(c.principal.principal_id).split("#")[0], card_id: c.card_id, expires: Date.parse(c.expires_at) }); e.step = 2; e.card = c; e.cardDigest = m.card.payload_digest; e.principal = c.principal.principal_id;
      const proof = rep.sign({ encounter_id: e.id, nonce: e.vnonce ?? "", audience: m.from }).signatures[0];                          // §2.4: the door's proof names the visitor
      return [hdr(e, "card_presentation", { in_reply_to: m.msg_id, card: hostCard, possession_proof: { ...proof, audience: m.from } }), hdr(e, "card_receipt", { in_reply_to: m.msg_id, card_digest: e.cardDigest })]; }
    if (m.type === "introduction") { if (e.step < 2) return lobby(); if (e.step !== 2) return [deny(e, m, "not_now", "RITUAL_ORDER", retryOf.later(0))]; e.step = 3; return []; }   // vouches are not weighed (C295)
    if (m.type === "invitation_request") return e.step < 2 ? lobby() : request(e, m);                                              // §3.2: before a verified card, the lobby deny
    return lobby(); }                                                                                                                 // C289: an unknown type is a malformed body

  const server = http.createServer(async (req, res) => {
    const send = (code, body, h = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", ...h }); res.end(JSON.stringify(body)); };
    const source = req.socket.remoteAddress, minute = Math.floor(Date.now() / 60e3);
    const count = (k, limit) => { const key = k + "|" + minute, n = (hits.get(key) ?? 0) + 1; hits.set(key, n); if (hits.size > 50000) for (const x of hits.keys()) if (!x.endsWith("|" + minute)) hits.delete(x); return n > limit; };
    const unverified = (staticRead = false) => count("u:" + source, cfg.unverified_per_min) | (!staticRead && count("u:*", cfg.unverified_total_per_min));   // C278: per address; in total except static reads (R6-02)
    const tooMany = () => send(429, { protocol: TAG, messages: [] }, { "retry-after": String(60 - (Math.floor(Date.now() / 1e3) % 60)) });
    const path = new URL(req.url, base).pathname;
    if (req.method === "GET") { if (unverified(true)) return tooMany();
      if (path === "/") return send(200, pointer());
      if (path === "/places") return send(200, listing());
      if (path === `/${name}/entry/host-card.json`) return send(200, hostCard);
      if (path === `/${name}/entry/house-summary.json`) return send(200, summary);                                                      // C248: its digest is on the host card
      return send(404, pointer([`/${name}/entry`, `/${name}/lobby`, `/${name}/inbox`].includes(path))); }
    if (req.method !== "POST" || ![`/${name}/entry`, `/${name}/lobby`, `/${name}/inbox`].includes(path)) return send(404, pointer());
    let body = ""; for await (const c of req) { body += c; if (body.length > cfg.max_message_bytes) return send(413, { protocol: TAG, messages: [] }); }   // C239
    let env; try { env = readOne(body); if (!iJsonOk(env)) env = undefined; } catch { env = undefined; }
    const p = env?.payload, signer = typeof p?.from === "string" && signedBy(env, p.from) ? p.from : null;
    if (path.endsWith("/inbox")) { if (p?.type !== "inbox_poll" || !signer) return send(403, { protocol: TAG, messages: [] });
      const k = String(signer).split("#")[0], q = outbox.get(k) ?? []; outbox.delete(k); return send(200, { protocol: TAG, messages: q }); }
    const e = signer && enc.get(p.encounter_id), seated = signer && [...seats.values()].some((s) => sameDid(s.visitor, signer) && !s.ended && Date.parse(s.expires_at) > Date.now());
    if (!signer || !(e?.step >= 2 || seated)) { if (unverified()) return tooMany(); }                                                 // C278: nothing verified yet
    if (signer && !known.has(e?.principal ?? "") && !seated && (count("n:" + String(signer).split("#")[0], cfg.newcomer_per_min) | count("ns:" + source, cfg.newcomer_source_per_min))) return tooMany();   // C287
    send(200, { protocol: TAG, messages: handle(env, source) });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => { port = server.address().port;
    base = `http://127.0.0.1:${port}`; entry = `${base}/${name}/entry`; lobbyUrl = `${base}/${name}/lobby`; inbox = `${base}/${name}/inbox`;
    house_digest = digest({ name, display_name: display, principal_id: owner.id, policy });
    const t = Date.now();
    hostCard = owner.sign({ card_id: "host-" + name, kind: "host", protocol: TAG, representative_id: rep.id, principal: { principal_id: owner.id, kind: "company", display_name: display },
      role: "Front-door representative", standing: { tier: "principal" }, mandate_scope: { purposes: ["visitation", "inquiry"], actions: ACTIONS.map((a) => a.action) }, locales: ["en-US"],
      representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.raw) }, issued_at: iso(t - 60e3), expires_at: iso(t + 30 * 864e5),
      place: { principal_id: owner.id, entry }, host_scope: { actions: ACTIONS.map((a) => a.action), duties: ["seat"] }, house_digest, summary_digest: digest(summary), preset: "browse",
      shown_to_owner: { text: `${display}'s host representative may welcome visitors and show them the menu (menu.view), until ${iso(t + 30 * 864e5).slice(0, 10)}.`, locale: "en-US" },
      org_approval: { approver: { name: "Kiyomi Arai", role: "Owner" }, approved_at: iso(t - 60e3) } });
    ok({ server, base, entry, inbox, rep: rep.id, principal: owner.id, endSeat, seatsOf: (v) => [...seats.values()].filter((s) => sameDid(s.visitor, v)).map((s) => s.seat_id),
      failingClosed: (p) => stillFull(p), sizes: () => ({ encounters: enc.size, nonces: nonces.size, revocations: revocations.length }), close: () => new Promise((r) => server.close(r)) }); }));
}
if (import.meta.url === `file://${process.argv[1]}`) startDoor({ port: Number(process.env.PORT ?? 0), ...(process.env.LIMIT ? { unverified_per_min: Number(process.env.LIMIT), newcomer_per_min: Number(process.env.LIMIT) } : {}) }).then((d) => console.log(`browse door on ${d.base} (Ctrl-C to stop)`));
/** The door's own crypto, for the SDK-free vector check in check.mjs (Appendix A.2, R4-04). */
export const internals = { readBody: (t) => { try { const v = readOne(t); return v !== undefined && iJsonOk(v); } catch { return false; } }, jcs, digest, resolve, sigOk, signedBy, verifyProof: (proof, payload, myId) => sameDid(proof?.audience, myId) && sameDid(payload?.audience, myId)
  && (() => { const k = resolve(proof.signer); return !!k && sigOk(proof, digest(payload), k); })() };
