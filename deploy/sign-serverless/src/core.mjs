// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The rc4 reference signing page (reference/signing-page/server.mjs) as stateless request handlers for Vercel Functions.
// Same page, same rules: summaries built from every signed field (describe.mjs), items the page can't show in full refused,
// mixed kinds refused, amounts on their own tap, one-tap batches (A.1, C195, D23), the signature counter, 413 and 429 limits,
// the test-stage notice and /about. What the long-running server kept in memory or files now lives in a store (stores.mjs):
//   cred:<rp_id>               the PUBLIC owner credential (no private key exists anywhere on the server)
//   s:<sid>:meta               the session: items as loaded, created_at, expires_at (sid = SHA-256 of the token; the token isn't stored)
//   s:<sid>:frozen             items filled in for the owner and frozen (digests stable while the owner reads them)
//   s:<sid>:ch:<challenge>     an open challenge (5 minutes, taken once: GETDEL)        s:<sid>:open   open-challenge count
//   s:<sid>:dec:<name>         the owner's decision (SET NX: an item is decided once)  s:<sid>:signed:<name>  the signed output
// Handlers take a WHATWG Request and return a Response.
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { verifyRegistration, verifyAssertion, digestBytes, digestOf, b64u } from "./webauthn.mjs";
import { buildItems, checkItems, iso } from "./items.mjs";
import { describe } from "./describe.mjs";
import { PAGES } from "./pages.mjs";

export const MAX_BODY = 100_000, MAX_BATCH = 16, MAX_CHALLENGES = 32, CHALLENGE_S = 300, KEEP_RESULTS_S = 7 * 86400, MAX_TTL_MIN = 30;
const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
export const INERT_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>No signing session is open</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>No signing session is open</h1><p>This page is only used for short, private signing sessions. There is nothing here right now.</p></main></body></html>';
const send = (s, type, body, extra = {}) => new Response(body, { status: s, headers: { ...HEADERS, "Content-Type": type, ...extra } });
const json = (s, o) => send(s, "application/json", JSON.stringify(o));
const inert = () => send(404, "text/html; charset=utf-8", INERT_HTML);
const err = (status, message) => Object.assign(new Error(message), { status });
const sha = (s) => createHash("sha256").update(s).digest();
const TOKEN_RE = /^[A-Za-z0-9_-]{24,128}$/;
export const sessionId = (token) => sha(token).toString("hex");
const pub = (it) => it && { name: it.name, title: it.title, kind: it.kind, summary: it.facts, facts: it.facts, quoted: it.quoted, own_tap: it.own_tap, digest_short: it.digest_short };
const STATIC = { "": ["index", "text/html; charset=utf-8"], "/": ["index", "text/html; charset=utf-8"], "/app.js": ["app", "text/javascript; charset=utf-8"], "/style.css": ["style", "text/css; charset=utf-8"], "/about": ["about", "text/html; charset=utf-8"] };

/** Read a JSON body, refusing more than MAX_BODY bytes at once (by Content-Length, or as soon as the stream grows past it). */
export async function readJson(req) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw err(413, "request too large");
  if (!req.body) return {};
  const rd = req.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > MAX_BODY) { rd.cancel().catch(() => {}); throw err(413, "request too large"); } parts.push(value); }
  const t = Buffer.concat(parts).toString("utf8"); try { return t ? JSON.parse(t) : {}; } catch { throw err(400, "the request is not JSON"); }
}

/** Check a public owner credential before it is stored: the right rp_id, a P-256 public key, and no private key material. */
export function checkCredential(c, rpId) {
  const p = [];
  if (!c || typeof c !== "object") return ["not an object"];
  if (c.rp_id !== rpId) p.push(`rp_id must be ${rpId}`);
  if (!c.credential_id || !c.owner_did?.startsWith("did:jwk:") || !c.key_id) p.push("credential_id, owner_did (did:jwk) and key_id are required");
  const k = c.public_key_jwk; if (!k || k.kty !== "EC" || k.crv !== "P-256" || !k.x || !k.y) p.push("public_key_jwk must be a P-256 public key");
  if (/"d"\s*:/.test(JSON.stringify(c)) || "private_key" in c || "private_key_jwk" in c) p.push("this looks like it holds a private key; only the public credential may be stored");
  return p;
}

export function createApp({ store, rpId, notice = "none", noticeDays = 90, adminSecret, allowGivenToken = false, now = () => Date.now(), log = () => {} }) {
  if (!rpId || !/^[a-z0-9.-]+$/.test(rpId)) throw new Error("rpId must be a hostname");
  if (!["none", "test-stage"].includes(notice) || !Number.isInteger(noticeDays) || noticeDays < 90) throw new Error('notice must be "none" or "test-stage", and noticeDays a whole number of days, at least 90');
  const ORIGIN = "https://" + rpId;
  const adminHash = adminSecret && adminSecret.length >= 32 ? sha(adminSecret) : null;
  const render = (name) => { const raw = PAGES[name]; if (!name.match(/index|about/)) return raw;
    const t = raw.replace(/<!--notice-->([\s\S]*?)<!--\/notice-->/g, (_, inner) => notice === "test-stage" ? inner : "");
    return t.replaceAll("{{RP_ID}}", rpId).replaceAll("{{NOTICE_DAYS}}", String(noticeDays)); };

  const loadCred = async () => { const c = await store.get(`cred:${rpId}`); return c && c.rp_id === rpId ? c : null; };

  async function session(token) {
    if (!TOKEN_RE.test(token ?? "")) return null;
    const sid = sessionId(token), meta = await store.get(`s:${sid}:meta`);
    if (!meta || !(Date.parse(meta.expires_at) > now())) return null;
    return { sid, meta, ttl: Math.max(1, Math.ceil((Date.parse(meta.expires_at) - now()) / 1000)) };
  }
  /** The frozen items, built once when the owner's credential exists, and re-checked on every read: each digest must match its
   *  payload and each summary must match what describe() says about that payload now. A stored item that changed is refused. */
  async function items(S, c) {
    if (!c) return null;
    const K = `s:${S.sid}:frozen`;
    let f = await store.get(K);
    if (!f) {
      // The grants and private parts an item carries are filled in the same way as its payload (same time), and kept, so
      // every later read can re-check the summary against the payload.
      const t = now(), withExtras = { ...S.meta.items, items: S.meta.items.items.map((it) => ({ ...it, payload: { grants: it.grants ?? null, private: it.private ?? null } })) };
      const built = buildItems(S.meta.items, c.owner_did, rpId, t), ex = buildItems(withExtras, c.owner_did, rpId, t);
      const extras = Object.fromEntries(built.map((it, i) => [it.name, { grants: ex[i].payload.grants ?? undefined, private: ex[i].payload.private ?? undefined }]));
      await store.setNX(K, { owner_did: c.owner_did, rp_id: rpId, built_at: iso(now()), items: built, extras }, KEEP_RESULTS_S);
      f = await store.get(K); log("items frozen", f.items.map((x) => `${x.name} ${x.digest_short}`).join(", "));
    }
    if (f.owner_did !== c.owner_did || f.rp_id !== rpId) throw err(409, "these items were frozen for another passkey; ask for a new link");
    for (const it of f.items) {
      const x = f.extras?.[it.name] ?? {}, d = describe(it.payload, { ownerDid: c.owner_did, grants: x.grants, private: x.private });
      if (digestOf(it.payload) !== it.digest || JSON.stringify(d.facts) !== JSON.stringify(it.facts) || d.own_tap !== it.own_tap || d.problems.length)
        throw err(409, "a stored item no longer matches what the page showed for it; nothing can be signed on this link");
    }
    return f.items;
  }
  const decisions = async (S, its) => Object.fromEntries((await Promise.all(its.map(async (x) => [x.name, await store.get(`s:${S.sid}:dec:${x.name}`)]))).filter(([, d]) => d));
  const decide = async (S, name, d) => { if (!(await store.setNX(`s:${S.sid}:dec:${name}`, d, KEEP_RESULTS_S))) throw err(409, "that item was already decided"); };
  const closeSoon = async (S) => { const until = Math.min(Date.parse(S.meta.expires_at), now() + 120e3);
    await store.set(`s:${S.sid}:meta`, { ...S.meta, expires_at: iso(until), closed_reason: "every item decided" }, Math.max(1, Math.ceil((until - now()) / 1000))); log("every item decided; the link closes in 2 minutes"); };

  async function setChallenge(S, ch, v) {
    if (await store.get(`s:${S.sid}:ch:${ch}`)) { await store.set(`s:${S.sid}:ch:${ch}`, { ...v, exp: now() + CHALLENGE_S * 1000 }, CHALLENGE_S); return ch; }   // the same challenge asked for again
    const n = await store.incr(`s:${S.sid}:open`, CHALLENGE_S);
    if (n > MAX_CHALLENGES) { await store.decr(`s:${S.sid}:open`); throw err(429, "too many open requests on this page; wait a few minutes and try again"); }
    await store.set(`s:${S.sid}:ch:${ch}`, { ...v, exp: now() + CHALLENGE_S * 1000 }, CHALLENGE_S); return ch;
  }
  async function takeChallenge(S, ch, kind) {
    if (typeof ch !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(ch)) throw err(400, "challenge unknown, used or expired");
    const v = await store.take(`s:${S.sid}:ch:${ch}`); if (v) await store.decr(`s:${S.sid}:open`);
    if (!v || v.kind !== kind || v.exp < now()) throw err(400, "challenge unknown, used or expired"); return v;
  }
  const clientData = (b) => { try { return JSON.parse(Buffer.from(String(b.clientDataJSON), "base64url").toString("utf8")); } catch { throw err(400, "clientDataJSON is not readable"); } };
  const checkCounter = (c, n) => { const last = c.sign_count ?? 0; if ((last > 0 || n > 0) && n <= last) throw err(400, "the passkey's signature counter didn't go up (a copied authenticator?); nothing was signed"); };
  const saveCounter = async (c, n) => { if (n > 0) await store.set(`cred:${rpId}`, { ...c, sign_count: n }); };

  /** /p/<token>/<sub> */
  async function page(req, path) {
    const token = String(path ?? "").split("/")[0], sub = String(path ?? "").slice(token.length);
    const S = await session(token); if (!S) return inert();
    try {
      if (req.method === "GET" && STATIC[sub]) { if (sub === "/about" && notice !== "test-stage") return send(404, "text/plain", "Not found"); return send(200, STATIC[sub][1], render(STATIC[sub][0])); }
      if (!sub.startsWith("/api/")) return send(404, "text/plain", "Not found");
      const c = await loadCred(), its = await items(S, c), d = its ? await decisions(S, its) : {};
      const pending = its ? its.filter((x) => !d[x.name]) : [], next = pending[0] ?? null;
      if (req.method === "GET" && sub === "/api/state")
        return json(200, { registered: !!c, rp_id: rpId, total: its?.length ?? S.meta.items.items.length, expires_at: S.meta.expires_at,
          done: its ? its.filter((x) => d[x.name]).map((x) => ({ name: x.name, title: x.title, decision: d[x.name].decision, via: d[x.name].via })) : [],
          current: pub(next), pending: pending.map(pub), max_batch: MAX_BATCH, notice: notice === "test-stage" ? { kind: "test-stage", days: noticeDays, about: "about" } : null });
      if (req.method !== "POST") return send(404, "text/plain", "Not found");
      const b = await readJson(req);
      if (sub === "/api/register/options") {
        if (c) return json(409, { error: "A passkey is already set up for this page." });
        const ch = await setChallenge(S, b64u(randomBytes(32)), { kind: "reg" });
        return json(200, { challenge: ch, rp: { id: rpId, name: "Shōkai owner passkey" }, user: { id: b64u(randomBytes(16)), name: `${S.meta.items.owner_display_name} (Shōkai owner)`, displayName: `${S.meta.items.owner_display_name} (Shōkai owner)` },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, attestation: "none", timeout: 120000 });
      }
      if (sub === "/api/register/verify") {
        if (c) return json(409, { error: "A passkey is already set up for this page." });
        const cd = clientData(b); await takeChallenge(S, cd.challenge, "reg");
        const cred = verifyRegistration(b, { challenge: cd.challenge, rpId, origin: ORIGIN });
        const rec = { note: "Public data only. The private key never leaves the owner's device.", credential_id: cred.credential_id, public_key_jwk: cred.public_key_jwk, owner_did: cred.owner_did, key_id: cred.owner_did + "#0", sign_count: cred.sign_count, rp_id: rpId, origin: ORIGIN, alg: "ES256", fmt: cred.fmt, created_at: iso(now()) };
        if (!(await store.setNX(`cred:${rpId}`, rec))) return json(409, { error: "A passkey is already set up for this page." });
        log("registered", cred.credential_id.slice(0, 10) + "…"); await items(S, rec);
        return json(200, { ok: true });
      }
      if (!c) return json(409, { error: "Create your passkey first." });
      if (sub === "/api/batch/options") {
        const names = Array.isArray(b.names) ? b.names : [];
        if (names.length < 2 || names.length > MAX_BATCH || new Set(names).size !== names.length) return json(409, { error: "One tap covers 2 to 16 different items; for one item, approve it on its own." });
        const chosen = names.map((n) => pending.find((x) => x.name === n));
        if (chosen.some((x) => !x)) return json(409, { error: "an item in this list is not waiting for you" });
        if (chosen.some((x) => x.own_tap)) return json(409, { error: "An item that can spend money, or one this page doesn't fully recognize, gets its own tap; it can't be part of one tap." });
        const digests = chosen.map((x) => x.digest), ch = digestOf({ batch: digests }).slice(8);
        await setChallenge(S, ch, { kind: "batch", names, digests });
        return json(200, { challenge: ch, rpId, allowCredentials: [{ type: "public-key", id: c.credential_id }], userVerification: "required", timeout: 120000, items: chosen.map(pub) });
      }
      if (sub === "/api/batch/verify") {
        const cd = clientData(b); const { names, digests } = await takeChallenge(S, cd.challenge, "batch");
        const chosen = names.map((n) => pending.find((x) => x.name === n));
        if (chosen.some((x, i) => !x || x.digest !== digests[i])) throw err(400, "the items changed or were decided since they were shown; nothing was signed");
        const { signCount } = verifyAssertion(b, { credential: c, challenge: cd.challenge, rpId, origin: ORIGIN }); checkCounter(c, signCount); await saveCounter(c, signCount);
        const at = iso(now());
        for (const [i, it] of chosen.entries()) {
          await decide(S, it.name, { decision: "approved", at, via: "one_tap", batch_size: chosen.length });
          const sig = { alg: "ES256", key_id: c.key_id, signer: c.owner_did, signed_at: at, value: b.signature,
            webauthn: { authenticator_data: b.authenticatorData, client_data_json: b.clientDataJSON, credential_id: b.credentialId, rp_id: rpId, batch: digests, batch_index: i } };
          await store.set(`s:${S.sid}:signed:${it.name}`, { note: `${it.title}. Signed with the owner's passkey in one tap with ${chosen.length - 1} other item(s) (Appendix A.1, C195), rp_id ${rpId}.`, signed: { payload: it.payload, payload_digest: it.digest, signatures: [sig] } }, KEEP_RESULTS_S);
        }
        log("signed in one tap", chosen.map((x) => `${x.name} ${x.digest_short}`).join(", "));
        const left = pending.filter((x) => !names.includes(x.name)); if (!left.length) await closeSoon(S);
        return json(200, { ok: true, signed: chosen.map((x) => ({ name: x.name, title: x.title, digest_short: x.digest_short })), next: pub(left[0] ?? null) });
      }
      if (sub === "/api/sign/options") {
        if (!next) return json(409, { error: "Nothing is waiting for you." });
        const ch = digestBytes(next.digest).toString("base64url");   // A.1: base64url of the 32 raw digest bytes
        await setChallenge(S, ch, { kind: "sign", name: next.name });
        return json(200, { challenge: ch, rpId, allowCredentials: [{ type: "public-key", id: c.credential_id }], userVerification: "required", timeout: 120000, ...pub(next) });
      }
      if (sub === "/api/sign/verify") {
        const cd = clientData(b); const { name } = await takeChallenge(S, cd.challenge, "sign");
        if (!next || next.name !== name) throw err(400, "that item is no longer the one waiting");
        const { signCount } = verifyAssertion(b, { credential: c, challenge: cd.challenge, rpId, origin: ORIGIN }); checkCounter(c, signCount); await saveCounter(c, signCount);
        await decide(S, next.name, { decision: "approved", at: iso(now()), via: "one_by_one" });
        const sig = { alg: "ES256", key_id: c.key_id, signer: c.owner_did, signed_at: iso(now()), value: b.signature,
          webauthn: { authenticator_data: b.authenticatorData, client_data_json: b.clientDataJSON, credential_id: b.credentialId, rp_id: rpId } };
        await store.set(`s:${S.sid}:signed:${next.name}`, { note: `${next.title}. Signed with the owner's passkey (Appendix A.1), rp_id ${rpId}.`, signed: { payload: next.payload, payload_digest: next.digest, signatures: [sig] } }, KEEP_RESULTS_S);
        log("signed", next.name, next.digest_short); const after = pending[1] ?? null; if (!after) await closeSoon(S);
        return json(200, { ok: true, title: next.title, digest_short: next.digest_short, next: pub(after) });
      }
      if (sub === "/api/decline") {
        if (!next || b.name !== next.name) return json(409, { error: "that item is no longer the one waiting" });
        await decide(S, next.name, { decision: "declined", at: iso(now()) }); log("declined", next.name); const after = pending[1] ?? null; if (!after) await closeSoon(S);
        return json(200, { ok: true, next: pub(after) });
      }
      return send(404, "text/plain", "Not found");
    } catch (e) { log("error", sub, e.message); return json(e.status ?? 400, { error: String(e.message) }); }
  }

  /** POST /api/admin, Authorization: Bearer <SIGN_ADMIN_SECRET>. Ops: credential, create, results, close. A wrong or missing
   *  secret gets the same 404 as an unknown path; 20 failures in 10 minutes lock the admin route for the rest of that window. */
  async function admin(req) {
    if (!adminHash || req.method !== "POST") return send(404, "text/plain", "Not found");
    if (((await store.get("admin:fail")) ?? 0) >= 20) return json(429, { error: "locked for a while after repeated failures" });
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!timingSafeEqual(sha(given), adminHash)) { await store.incr("admin:fail", 600); return send(404, "text/plain", "Not found"); }
    try {
      const b = await readJson(req);
      if (b.op === "credential") {
        const p = checkCredential(b.credential, rpId); if (p.length) return json(400, { error: "credential refused", problems: p });
        const { d, private_key, private_key_jwk, ...pubOnly } = b.credential;
        const ok = b.replace === true ? (await store.set(`cred:${rpId}`, pubOnly), true) : await store.setNX(`cred:${rpId}`, pubOnly);
        return ok ? json(200, { ok: true, owner_did: pubOnly.owner_did }) : json(409, { error: "a credential is already stored for this rp_id; send replace: true to overwrite it" });
      }
      if (b.op === "create") {
        const p = checkItems(b.items); if (p.length) return json(400, { error: "items not ready", problems: p });
        const ttlMin = Number(b.ttl_min ?? MAX_TTL_MIN); if (!Number.isInteger(ttlMin) || ttlMin < 1 || ttlMin > MAX_TTL_MIN) return json(400, { error: `ttl_min must be a whole number from 1 to ${MAX_TTL_MIN}` });
        const token = allowGivenToken && typeof b.token === "string" && TOKEN_RE.test(b.token) ? b.token : b64u(randomBytes(24));
        const sid = sessionId(token), expires = iso(now() + ttlMin * 60e3);
        if (!(await store.setNX(`s:${sid}:meta`, { created_at: iso(now()), expires_at: expires, items: b.items }, ttlMin * 60))) return json(409, { error: "session exists" });
        const S = await session(token), c = await loadCred(); if (c) await items(S, c);
        log("session created", sid.slice(0, 12), "until", expires);
        return json(200, { token, session_id: sid, expires_at: expires, url: `${ORIGIN}/p/${token}/`, owner_credential: c ? "loaded" : "none (the owner creates a passkey first)" });
      }
      if (b.op === "results") {
        if (!/^[0-9a-f]{64}$/.test(b.session_id ?? "")) return json(400, { error: "session_id" });
        const f = await store.get(`s:${b.session_id}:frozen`); const meta = await store.get(`s:${b.session_id}:meta`);
        if (!f) return json(404, { error: "no frozen items for this session (expired, or the owner never opened it)" });
        const out = await Promise.all(f.items.map(async (it) => ({ name: it.name, title: it.title, digest: it.digest, decision: await store.get(`s:${b.session_id}:dec:${it.name}`), signed: await store.get(`s:${b.session_id}:signed:${it.name}`) })));
        return json(200, { session_id: b.session_id, open: !!meta && Date.parse(meta.expires_at) > now(), owner_did: f.owner_did, rp_id: f.rp_id, items: out });
      }
      if (b.op === "close") {
        if (!/^[0-9a-f]{64}$/.test(b.session_id ?? "")) return json(400, { error: "session_id" });
        await store.del(`s:${b.session_id}:meta`); log("session closed by the steward", b.session_id.slice(0, 12)); return json(200, { ok: true });
      }
      return json(400, { error: "unknown op" });
    } catch (e) { return json(e.status ?? 400, { error: String(e.message) }); }
  }
  return { page, admin };
}
