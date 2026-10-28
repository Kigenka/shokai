/**
 * The Shōkai reference signing page (SIGNING.md; SPEC Appendix A.1). A small, dependency-free Node server an owner can run.
 * LOCAL BY DEFAULT: listens on 127.0.0.1. A phone reaches it only through an https front you choose for RP_ID (your own domain).
 *
 * Flow: (a) the owner creates a passkey for RP_ID (unless DATA_DIR/owner-credential.json already has one);
 *       (b) the items in ITEMS are filled in with the owner's DID and frozen (stable digests);
 *       (c) the owner approves the items with ONE passkey tap after seeing all of them listed (SPEC Appendix A.1, C195, D23:
 *           one assertion over JCS({"batch": [digests]}); each item still gets its own signature copy with webauthn.batch and
 *           batch_index), or, as a fallback, approves or declines each one with its own tap, in order. Output: DATA_DIR/signed/<name>.json.
 * Env: RP_ID (the page's hostname), TOKEN (path secret, ≥ 24 chars), ITEMS (items JSON, see items.example.json), DATA_DIR,
 *      PORT (8797), TTL_MIN (default 30: the server exits by itself), RELAY_SECRET (optional: only a front carrying it in
 *      X-Sign-Relay gets through), NOTICE ("none", the default, or "test-stage": shows the test-stage notice of
 *      deploy/SIGNING-PAGE-PLAN.md on every screen, a line on the done screen and an /about page), NOTICE_DAYS (the advance notice
 *      the test-stage text promises before the address changes; default 90, never less).
 * No private key exists here: the passkey's private half never leaves the owner's device.
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { verifyRegistration, verifyAssertion, digestBytes, digestOf, b64u } from "./webauthn.mjs";
import { buildItems, checkItems, iso } from "./items.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8797), RP_ID = process.env.RP_ID, TOKEN = process.env.TOKEN;
const TTL_MIN = Number(process.env.TTL_MIN ?? 30);
// RELAY_SECRET (optional): every request must then carry it in X-Sign-Relay, so only your https front reaches the page.
const RELAY = process.env.RELAY_SECRET ? createHash("sha256").update(process.env.RELAY_SECRET).digest() : null;
const relayOk = (req) => !RELAY || timingSafeEqual(createHash("sha256").update(String(req.headers["x-sign-relay"] ?? "")).digest(), RELAY);
let closing = false;
const closeSoon = (why) => { if (closing) return; closing = true; log(why + "; closing in 2 minutes (single-use link)"); setTimeout(() => { srv.close(); process.exit(0); }, 120e3).unref(); };
if (!RP_ID || !/^[a-z0-9.-]+$/.test(RP_ID) || !TOKEN || TOKEN.length < 24) { console.error("RP_ID (a hostname) and TOKEN (≥ 24 chars) are required"); process.exit(2); }
const NOTICE = process.env.NOTICE ?? "none", NOTICE_DAYS = Number(process.env.NOTICE_DAYS ?? 90);
if (!["none", "test-stage"].includes(NOTICE) || !Number.isInteger(NOTICE_DAYS) || NOTICE_DAYS < 90) { console.error('NOTICE must be "none" or "test-stage", and NOTICE_DAYS a whole number of days, at least 90'); process.exit(2); }
const ORIGIN = "https://" + RP_ID, BASE = `/p/${TOKEN}`;
const DATA = process.env.DATA_DIR ?? join(HERE, "run-data");   // run-data/ is git-ignored: it holds the public credential and the signed items
mkdirSync(join(DATA, "signed"), { recursive: true, mode: 0o700 }); chmodSync(DATA, 0o700);
const SESSION = JSON.parse(readFileSync(process.env.ITEMS ?? join(HERE, "items.example.json"), "utf8"));
const problems = checkItems(SESSION); if (problems.length) { console.error("items not ready:\n  " + problems.join("\n  ")); process.exit(2); }
const CRED = join(DATA, "owner-credential.json"), FROZEN = join(DATA, "frozen-items.json"), DECISIONS = join(DATA, "decisions.json");
const J = (f) => JSON.parse(readFileSync(f, "utf8")), W = (f, x) => writeFileSync(f, JSON.stringify(x, null, 2) + "\n", { mode: 0o600 });
const log = (...a) => console.log(iso(), ...a);
const loadCred = () => { const c = existsSync(CRED) ? J(CRED) : null; return c && c.rp_id === RP_ID ? c : null; };
const decisions = () => existsSync(DECISIONS) ? J(DECISIONS) : {};

function items() {
  const c = loadCred(); if (!c) return null;
  if (!existsSync(FROZEN)) { const it = buildItems(SESSION, c.owner_did, RP_ID); W(FROZEN, { owner_did: c.owner_did, rp_id: RP_ID, built_at: iso(), items: it }); log("items frozen", it.map((x) => `${x.name} ${x.digest_short}`).join(", ")); }
  const f = J(FROZEN); if (f.owner_did !== c.owner_did || f.rp_id !== RP_ID) throw new Error("frozen items belong to another passkey; start a fresh DATA_DIR");
  return f.items;
}
const nextItem = () => { const it = items(); if (!it) return null; const d = decisions(); return it.find((x) => !d[x.name]) ?? null; };
const pendingItems = () => { const it = items(); if (!it) return []; const d = decisions(); return it.filter((x) => !d[x.name]); };
const MAX_BATCH = 16;
/** A.1 (C195, D23): the batch challenge digest, digest(JCS({"batch": [d1 … dn]})), in the order the page showed the items. */
const batchDigest = (digests) => digestOf({ batch: digests });

// Open challenges are bounded: expired ones are dropped, and at MAX_CHALLENGES the page answers 429 until one expires or is used.
const challenges = new Map(), MAX_CHALLENGES = 32;
const tooMany = () => Object.assign(new Error("too many open requests on this page; wait a few minutes and try again"), { status: 429 });
const setChallenge = (ch, v) => { const now = Date.now(); for (const [k, x] of challenges) if (x.exp < now) challenges.delete(k);
  if (!challenges.has(ch) && challenges.size >= MAX_CHALLENGES) throw tooMany(); challenges.set(ch, v); return ch; };
const newChallenge = (kind, extra = {}) => setChallenge(b64u(randomBytes(32)), { kind, exp: Date.now() + 5 * 60e3, ...extra });
const takeChallenge = (ch, kind) => { const v = challenges.get(ch); challenges.delete(ch); if (!v || v.kind !== kind || v.exp < Date.now()) throw new Error("challenge unknown, used or expired"); return v; };

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
const send = (res, s, type, body) => { res.writeHead(s, { ...HEADERS, "Content-Type": type }); res.end(body); };
const json = (res, s, o) => send(res, s, "application/json", JSON.stringify(o));
// A body over MAX_BODY is refused at once with 413 (by its Content-Length, or as soon as it grows past the limit), and the
// connection is closed after the answer: the page never buffers more than MAX_BODY.
const MAX_BODY = 100_000, tooBig = () => Object.assign(new Error("request too large"), { status: 413, close: true });
const readBody = (req) => new Promise((ok, bad) => {
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return bad(tooBig());
  let d = "", done = false; req.on("data", (c) => { if (done) return; d += c; if (d.length > MAX_BODY) { done = true; req.pause(); bad(tooBig()); } });
  req.on("end", () => { if (done) return; try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } }); });
/** WebAuthn signature counter (§A.1 doesn't rely on it; this page does, for itself): when the authenticator counts, each assertion
 *  must count higher than the last one this page saw, or it is refused as a possible cloned authenticator, and nothing is signed. */
const checkCounter = (c, n) => { const last = c.sign_count ?? 0; if ((last > 0 || n > 0) && n <= last) throw new Error("the passkey's signature counter didn't go up (a copied authenticator?); nothing was signed"); };
const saveCounter = (c, n) => { if (n > 0) W(CRED, { ...J(CRED), sign_count: n }); };
const STATIC = { "": ["index.html", "text/html; charset=utf-8"], "/": ["index.html", "text/html; charset=utf-8"], "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"],
  ...(NOTICE === "test-stage" ? { "/about": ["about.html", "text/html; charset=utf-8"] } : {}) };
/** HTML pages: the test-stage blocks (<!--notice-->…<!--/notice-->) are kept only with NOTICE=test-stage; {{RP_ID}} and {{NOTICE_DAYS}} are
 *  filled in (RP_ID is a checked hostname and NOTICE_DAYS a whole number, so neither can carry markup). */
const render = (file) => { const raw = readFileSync(join(HERE, "public", file)); if (!file.endsWith(".html")) return raw;
  const t = raw.toString("utf8").replace(/<!--notice-->([\s\S]*?)<!--\/notice-->/g, (_, inner) => NOTICE === "test-stage" ? inner : "");
  return t.replaceAll("{{RP_ID}}", RP_ID).replaceAll("{{NOTICE_DAYS}}", String(NOTICE_DAYS)); };
/** What the page shows for an item: `summary` (alias `facts`) is built on the server from the payload's machine fields
 *  (describe.mjs); `quoted` is free text written by someone else, which the page shows as a marked quote. */
const pub = (it) => it && { name: it.name, title: it.title, kind: it.kind, summary: it.facts, facts: it.facts, quoted: it.quoted, own_tap: it.own_tap, digest_short: it.digest_short };

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!relayOk(req) || (url.pathname !== BASE && !url.pathname.startsWith(BASE + "/"))) return send(res, 404, "text/plain", "Not found");
  const sub = url.pathname.slice(BASE.length);
  try {
    if (req.method === "GET" && STATIC[sub]) return send(res, 200, STATIC[sub][1], render(STATIC[sub][0]));
    if (req.method === "GET" && sub === "/api/state") {
      const c = loadCred(), it = c ? items() : null, d = decisions();
      return json(res, 200, { registered: !!c, rp_id: RP_ID, total: it?.length ?? SESSION.items.length, done: it ? it.filter((x) => d[x.name]).map((x) => ({ name: x.name, title: x.title, decision: d[x.name].decision, via: d[x.name].via })) : [],
        current: pub(c ? nextItem() : null), pending: c ? pendingItems().map(pub) : [], max_batch: MAX_BATCH,
        notice: NOTICE === "test-stage" ? { kind: "test-stage", days: NOTICE_DAYS, about: "about" } : null });
    }
    if (req.method === "POST" && sub === "/api/register/options") {
      if (loadCred()) return json(res, 409, { error: "A passkey is already set up for this page." });
      return json(res, 200, { challenge: newChallenge("reg"), rp: { id: RP_ID, name: "Shōkai owner passkey" }, user: { id: b64u(randomBytes(16)), name: `${SESSION.owner_display_name} (Shōkai owner)`, displayName: `${SESSION.owner_display_name} (Shōkai owner)` },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, attestation: "none", timeout: 120000 });
    }
    if (req.method === "POST" && sub === "/api/register/verify") {
      if (loadCred()) return json(res, 409, { error: "A passkey is already set up for this page." });
      const b = await readBody(req); const cd = JSON.parse(Buffer.from(b.clientDataJSON, "base64url").toString("utf8"));
      takeChallenge(cd.challenge, "reg");
      const cred = verifyRegistration(b, { challenge: cd.challenge, rpId: RP_ID, origin: ORIGIN });
      W(CRED, { note: "Public data only. The private key never leaves the owner's device.", credential_id: cred.credential_id, public_key_jwk: cred.public_key_jwk, owner_did: cred.owner_did, key_id: cred.owner_did + "#0", sign_count: cred.sign_count,
        rp_id: RP_ID, origin: ORIGIN, alg: "ES256", fmt: cred.fmt, created_at: iso() });
      log("registered", cred.credential_id.slice(0, 10) + "…", cred.owner_did.slice(0, 24) + "…"); items();
      return json(res, 200, { ok: true });
    }
    // One tap for several items (SPEC Appendix A.1, C195, D23). The page has listed every item in `names`, in this order, with its
    // plain-words summary; the owner approves them all with one assertion whose challenge is the batch digest.
    if (req.method === "POST" && sub === "/api/batch/options") {
      const c = loadCred(); if (!c) return json(res, 409, { error: "Create your passkey first." });
      const b = await readBody(req); const pend = pendingItems(); const names = Array.isArray(b.names) ? b.names : [];
      if (names.length < 2 || names.length > MAX_BATCH || new Set(names).size !== names.length) return json(res, 409, { error: "One tap covers 2 to 16 different items; for one item, approve it on its own." });
      const chosen = names.map((n) => pend.find((x) => x.name === n));
      if (chosen.some((x) => !x)) return json(res, 409, { error: "an item in this list is not waiting for you" });
      if (chosen.some((x) => x.own_tap)) return json(res, 409, { error: "An item that can spend money, or one this page doesn't fully recognize, gets its own tap; it can't be part of one tap." });
      const digests = chosen.map((x) => x.digest), challenge = batchDigest(digests).slice(8);
      setChallenge(challenge, { kind: "batch", exp: Date.now() + 5 * 60e3, names, digests });
      return json(res, 200, { challenge, rpId: RP_ID, allowCredentials: [{ type: "public-key", id: c.credential_id }], userVerification: "required", timeout: 120000, items: chosen.map(pub) });
    }
    if (req.method === "POST" && sub === "/api/batch/verify") {
      const b = await readBody(req), c = loadCred(); const cd = JSON.parse(Buffer.from(b.clientDataJSON, "base64url").toString("utf8"));
      const { names, digests } = takeChallenge(cd.challenge, "batch"); const pend = pendingItems();
      const chosen = names.map((n) => pend.find((x) => x.name === n));
      if (chosen.some((x, i) => !x || x.digest !== digests[i])) throw new Error("the items changed or were decided since they were shown; nothing was signed");
      const { signCount } = verifyAssertion(b, { credential: c, challenge: cd.challenge, rpId: RP_ID, origin: ORIGIN }); checkCounter(c, signCount); saveCounter(c, signCount);
      const at = iso(), d = decisions();
      chosen.forEach((it, i) => {
        const sig = { alg: "ES256", key_id: c.key_id, signer: c.owner_did, signed_at: at, value: b.signature,
          webauthn: { authenticator_data: b.authenticatorData, client_data_json: b.clientDataJSON, credential_id: b.credentialId, rp_id: RP_ID, batch: digests, batch_index: i } };
        W(join(DATA, "signed", it.name + ".json"), { note: `${it.title}. Signed with the owner's passkey in one tap with ${chosen.length - 1} other item(s) (Appendix A.1, C195), rp_id ${RP_ID}.`, signed: { payload: it.payload, payload_digest: it.digest, signatures: [sig] } });
        d[it.name] = { decision: "approved", at, via: "one_tap", batch_size: chosen.length };
      });
      W(DECISIONS, d); log("signed in one tap", chosen.map((x) => `${x.name} ${x.digest_short}`).join(", ")); if (!nextItem()) closeSoon("every item decided");
      return json(res, 200, { ok: true, signed: chosen.map((x) => ({ name: x.name, title: x.title, digest_short: x.digest_short })), next: pub(nextItem()) });
    }
    if (req.method === "POST" && sub === "/api/sign/options") {
      const c = loadCred(); if (!c) return json(res, 409, { error: "Create your passkey first." });
      const it = nextItem(); if (!it) return json(res, 409, { error: "Nothing is waiting for you." });
      const challenge = digestBytes(it.digest).toString("base64url");   // A.1: base64url of the 32 raw digest bytes
      setChallenge(challenge, { kind: "sign", exp: Date.now() + 5 * 60e3, name: it.name });
      return json(res, 200, { challenge, rpId: RP_ID, allowCredentials: [{ type: "public-key", id: c.credential_id }], userVerification: "required", timeout: 120000, ...pub(it) });
    }
    if (req.method === "POST" && sub === "/api/sign/verify") {
      const b = await readBody(req), c = loadCred(); const cd = JSON.parse(Buffer.from(b.clientDataJSON, "base64url").toString("utf8"));
      const { name } = takeChallenge(cd.challenge, "sign"); const it = nextItem();
      if (!it || it.name !== name) throw new Error("that item is no longer the one waiting");
      const { signCount } = verifyAssertion(b, { credential: c, challenge: cd.challenge, rpId: RP_ID, origin: ORIGIN }); checkCounter(c, signCount); saveCounter(c, signCount);
      const sig = { alg: "ES256", key_id: c.key_id, signer: c.owner_did, signed_at: iso(), value: b.signature,
        webauthn: { authenticator_data: b.authenticatorData, client_data_json: b.clientDataJSON, credential_id: b.credentialId, rp_id: RP_ID } };
      W(join(DATA, "signed", it.name + ".json"), { note: `${it.title}. Signed with the owner's passkey (Appendix A.1), rp_id ${RP_ID}.`, signed: { payload: it.payload, payload_digest: it.digest, signatures: [sig] } });
      W(DECISIONS, { ...decisions(), [it.name]: { decision: "approved", at: iso(), via: "one_by_one" } }); log("signed", it.name, it.digest_short); if (!nextItem()) closeSoon("every item decided");
      return json(res, 200, { ok: true, title: it.title, digest_short: it.digest_short, next: pub(nextItem()) });
    }
    if (req.method === "POST" && sub === "/api/decline") {
      const b = await readBody(req); const it = nextItem();
      if (!it || b.name !== it.name) return json(res, 409, { error: "that item is no longer the one waiting" });
      W(DECISIONS, { ...decisions(), [it.name]: { decision: "declined", at: iso() } }); log("declined", it.name); if (!nextItem()) closeSoon("every item decided");
      return json(res, 200, { ok: true, next: pub(nextItem()) });
    }
    return send(res, 404, "text/plain", "Not found");
  } catch (e) { log("error", sub, e.message); if (e.close) res.setHeader("Connection", "close"); json(res, e.status ?? 400, { error: String(e.message) }); if (e.close) res.on("finish", () => req.destroy()); }
});
srv.listen(PORT, "127.0.0.1", () => log(`Shōkai signing page on 127.0.0.1:${PORT}${BASE.slice(0, 6)}…, rp_id ${RP_ID}, closes in ${TTL_MIN} min`));
setTimeout(() => { log("session time is up; closing"); srv.close(); process.exit(0); }, TTL_MIN * 60e3).unref();
