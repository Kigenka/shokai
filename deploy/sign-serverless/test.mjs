// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Tests for the serverless signing page beyond the reference e2e (which runs against local.mjs): the three stores, session TTL,
// the one-time token, the admin route, replay and double decisions across requests, a stored item that no longer matches its
// summary, an existing owner credential reused without registering, and the Vercel handlers wired to a REST store.
// Loopback only; software authenticator; no real keys. Usage: node deploy/sign-serverless/test.mjs
import http from "node:http";
import { generateKeyPairSync, sign as nodeSign, randomBytes, createHash } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)), LIB = join(HERE, "site", "api", "_lib"), REF = join(HERE, "..", "..", "reference", "signing-page");
const { createApp, sessionId, checkCredential } = await import(join(LIB, "core.mjs"));
const { memoryStore, dirStore, upstashStore } = await import(join(LIB, "stores.mjs"));
const { sha256, b64u, didJwk } = await import(join(LIB, "webauthn.mjs"));
const C = await import(pathToFileURL(join(HERE, "..", "..", "reference", "engawa", "dist", "src", "crypto.js")).href);
let pass = 0, fail = 0; const check = (c, w) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${w}`); };
const RP = "signing-test.shokai.invalid", ORIGIN = "https://" + RP, ADMIN = b64u(randomBytes(32));
const EX = JSON.parse(readFileSync(join(REF, "items.example.json"), "utf8"));

// A fake Upstash REST endpoint on loopback (the commands the adapter uses, with EX expiry), so the REST adapter is tested for real.
function fakeUpstash(token) {
  const m = new Map(); const live = (k) => { const e = m.get(k); if (e && e.exp && e.exp <= Date.now()) { m.delete(k); return null; } return e ?? null; };
  const srv = http.createServer((req, res) => { let d = ""; req.on("data", (c) => d += c); req.on("end", () => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); return res.end(JSON.stringify({ error: "unauthorized" })); }
    const [cmd, k, v, ...o] = JSON.parse(d); const ex = o.indexOf("EX") >= 0 ? Date.now() + Number(o[o.indexOf("EX") + 1]) * 1000 : 0; let result = null;
    if (cmd === "GET") result = live(k)?.v ?? null;
    else if (cmd === "SET") { if (o.includes("NX") && live(k)) result = null; else { m.set(k, { v, exp: ex }); result = "OK"; } }
    else if (cmd === "GETDEL") { result = live(k)?.v ?? null; m.delete(k); }
    else if (cmd === "INCR") { const e = live(k); const n = Number(e?.v ?? 0) + 1; m.set(k, { v: String(n), exp: e?.exp ?? 0 }); result = n; }
    else if (cmd === "DECR") { const e = live(k); const n = Number(e?.v ?? 0) - 1; m.set(k, { v: String(n), exp: e?.exp ?? 0 }); result = n; }
    else if (cmd === "EXPIRE") { const e = live(k); if (e) e.exp = Date.now() + Number(v) * 1000; result = e ? 1 : 0; }
    else if (cmd === "DEL") { result = m.delete(k) ? 1 : 0; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ result })); }); });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, url: `http://127.0.0.1:${srv.address().port}`, m })));
}

// --- 1. the store contract, for each adapter
const tmp = mkdtempSync(join(tmpdir(), "sign-serverless-"));
const up = await fakeUpstash("t0k");
try {
  let clock = Date.now(); const now = () => clock;
  for (const [name, st, fake] of [["memory", memoryStore(now), true], ["dir", dirStore(join(tmp, "dir"), () => null, now), true], ["upstash (REST, loopback fake)", upstashStore({ url: up.url, token: "t0k" }), false]]) {
    await st.set("a", { x: 1 }); const g = await st.get("a");
    const nx1 = await st.setNX("n", 1), nx2 = await st.setNX("n", 2);
    await st.set("c", "v"); const t1 = await st.take("c"), t2 = await st.take("c");
    const i1 = await st.incr("i", 60), i2 = await st.incr("i", 60); await st.decr("i"); const i3 = await st.get("i");
    check(g?.x === 1 && nx1 === true && nx2 === false && (await st.get("n")) === 1 && t1 === "v" && t2 === null && i1 === 1 && i2 === 2 && Number(i3) === 1, `${name} store: get/set, set-if-free, take-once, counters`);
    await st.set("ttl", 1, 1);
    if (fake) { clock += 1500; } else await new Promise((r) => setTimeout(r, 1100));
    check((await st.get("ttl")) === null, `${name} store: a value with a TTL is gone after it`);
  }
  check((() => { try { upstashStore({ url: "http://storage.example", token: "x" }); return false; } catch { return true; } })(), "the REST store refuses a non-https storage URL (loopback excepted for tests)");
} finally {}

// --- 2. the app, on a memory store with a test clock
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); const jwk = publicKey.export({ format: "jwk" }); const credId = randomBytes(16);
let counter = 0;
const authData = (rp = RP) => { const c = Buffer.alloc(4); c.writeUInt32BE(++counter); return Buffer.concat([sha256(rp), Buffer.from([0x05]), c]); };
const assertion = (challenge, rp = RP) => { const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "https://" + rp })); const ad = authData(rp);
  return { credentialId: b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(nodeSign("sha256", Buffer.concat([ad, sha256(cd)]), privateKey)) }; };
// The credential exactly as the Oct 27 session stored it: public fields only, no sign_count.
const ownerDid = didJwk({ x: jwk.x, y: jwk.y });
const oldCred = { note: "Public data only.", credential_id: b64u(credId), public_key_jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, owner_did: ownerDid, key_id: ownerDid + "#0", rp_id: RP, origin: ORIGIN, alg: "ES256", fmt: "none", created_at: "2026-10-27T07:05:00Z" };

let clock = Date.parse("2026-10-28T10:00:00Z"); const now = () => clock;
const mem = memoryStore(now); const app = createApp({ store: mem, rpId: RP, notice: "test-stage", noticeDays: 90, adminSecret: ADMIN, now });
const adm = (body, secret = ADMIN) => app.admin(new Request("https://x/api/admin", { method: "POST", headers: secret ? { Authorization: `Bearer ${secret}` } : {}, body: JSON.stringify(body) }));
const pg = (token, sub, body) => app.page(new Request(`https://x/p/${token}${sub}`, body === undefined ? {} : { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), token + sub);
const J = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

check((await adm({ op: "create", items: EX }, null)).status === 404 && (await adm({ op: "create", items: EX }, "wrong-" + ADMIN)).status === 404, "admin: no secret, or a wrong one, gets a plain 404");
check((await createApp({ store: memoryStore(), rpId: RP, adminSecret: "short" }).admin(new Request("https://x/api/admin", { method: "POST", headers: { Authorization: "Bearer short" }, body: "{}" }))).status === 404, "admin is off unless SIGN_ADMIN_SECRET is at least 32 characters");
check((await J(await adm({ op: "credential", credential: { ...oldCred, d: "private!" } }))).status === 400 && (await J(await adm({ op: "credential", credential: { ...oldCred, rp_id: "other.example" } }))).status === 400, "admin: a credential with private key material, or for another rp_id, is refused");
check((await J(await adm({ op: "credential", credential: oldCred }))).status === 200 && (await J(await adm({ op: "credential", credential: oldCred }))).status === 409, "admin: the existing public owner credential (Oct 27 shape, no sign_count) is stored once; a second load needs replace: true");
const mixed = { ...EX, items: [EX.items[0], { ...EX.items[1], payload: { ...EX.items[1].payload, representative_key: EX.items[0].payload.representative_key, mandate_scope: EX.items[0].payload.mandate_scope } }] };
const badItems = await J(await adm({ op: "create", items: mixed }));
check(badItems.status === 400 && badItems.body.problems.some((p) => /more than one kind/.test(p)), "admin: items the page can't show in full (here, mixed kinds) are refused when the session is created");
check((await J(await adm({ op: "create", items: EX, ttl_min: 31 }))).status === 400, "admin: a session can't be opened for more than 30 minutes");
const cr = await J(await adm({ op: "create", items: EX, ttl_min: 30, token: "x".repeat(32) }));
const TOKEN = cr.body.token, SID = cr.body.session_id;
check(cr.status === 200 && TOKEN !== "x".repeat(32) && /^[A-Za-z0-9_-]{32}$/.test(TOKEN) && SID === sessionId(TOKEN) && cr.body.url.endsWith(`/p/${TOKEN}/`) && cr.body.owner_credential === "loaded", "admin: a session gets a fresh 24-byte token (a chosen one is ignored on Vercel) and its id is the token's SHA-256");
const dump = JSON.stringify([...(await (async () => { const out = []; for (const k of ["meta", "frozen"]) out.push(await mem.get(`s:${SID}:${k}`)); return out; })())]);
check(!dump.includes(TOKEN), "the token itself is not stored, only its hash");
check((await pg("A".repeat(32), "/")).status === 404 && (await pg("short", "/")).status === 404 && /No signing session is open/.test(await (await pg("A".repeat(32), "/")).text()), "a wrong or malformed token gets the inert page (404)");
let st = await J(await pg(TOKEN, "/api/state"));
check(st.status === 200 && st.body.registered === true && st.body.pending.length === 2 && st.body.notice?.days === 90 && st.body.rp_id === RP, "with the stored credential the owner is already registered: no new passkey, two items waiting, the notice on");
check((await J(await pg(TOKEN, "/api/register/options", {}))).status === 409, "registering a second passkey is refused");
const html = await (await pg(TOKEN, "/")).text(), ab = await pg(TOKEN, "/about");
check(/early, test-stage convenience/.test(html) && ab.status === 200 && /About this signing page/.test(await ab.text()) && ab.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "the page and /about carry the test-stage notice under the same headers");
check((await pg(TOKEN, "/api/decline", JSON.stringify({ pad: "x".repeat(200_000) }))).status === 413, "a body over 100 kB gets 413");
// replay and double decisions
let o = (await J(await pg(TOKEN, "/api/sign/options", {}))).body; const a1 = assertion(o.challenge);
const [r1, r2] = await Promise.all([pg(TOKEN, "/api/sign/verify", a1).then(J), pg(TOKEN, "/api/sign/verify", a1).then(J)]);
check([r1.status, r2.status].sort().join() === "200,400", "the same assertion sent twice at once: one is accepted, the other refused (the challenge is taken once)");
check((await J(await pg(TOKEN, "/api/sign/verify", a1))).status === 400, "replaying it later is refused too");
check((await mem.get(`cred:${RP}`)).sign_count === counter, "the signature counter is saved in the store after each signature");
// a stored item that no longer matches its summary
const frozen = await mem.get(`s:${SID}:frozen`); const saved = structuredClone(frozen);
frozen.items[1].payload.limits.max_amount.value = "999.00"; await mem.set(`s:${SID}:frozen`, frozen);
const t1 = await J(await pg(TOKEN, "/api/state")), t2 = await J(await pg(TOKEN, "/api/sign/options", {}));
check(t1.status === 409 && t2.status === 409 && /no longer matches/.test(t2.body.error), "a stored payload changed after freezing (999.00 USD): the page refuses to show or sign anything");
const f2 = structuredClone(saved); f2.items[1].payload.limits.max_amount.value = "999.00"; f2.items[1].digest = C.digestOf(f2.items[1].payload); await mem.set(`s:${SID}:frozen`, f2);
check((await J(await pg(TOKEN, "/api/state"))).status === 409, "… even when its digest was recomputed: the summary shown (10.00 USD) no longer matches the payload");
const f3 = structuredClone(saved); f3.items[1].facts = f3.items[1].facts.map((x) => x.replace("10.00", "1.00")); await mem.set(`s:${SID}:frozen`, f3);
check((await J(await pg(TOKEN, "/api/state"))).status === 409, "… and when only the stored summary was changed (1.00 USD)");
await mem.set(`s:${SID}:frozen`, saved);
o = (await J(await pg(TOKEN, "/api/sign/options", {}))).body;
check(o.own_tap === true && (await J(await pg(TOKEN, "/api/sign/verify", assertion(o.challenge)))).status === 200, "restored: the mandate (its own tap) is signed");
const res = await J(await adm({ op: "results", session_id: SID }));
const sc = res.body.items?.map((x) => x.signed?.signed); const k = C.resolveDid(ownerDid);
check(res.status === 200 && sc.length === 2 && sc.every((s) => s && C.digestOf(s.payload) === s.payload_digest && C.checkSig(s.signatures[0], s.payload_digest, k, RP).ok) && res.body.items.every((x) => x.decision?.decision === "approved"),
  "admin: the steward reads the signed items back, and each verifies with the reference crypto (A.1)");
check((await pg(TOKEN, "/")).status === 200, "after the last item the link stays open briefly (2 minutes) to show the done screen");
clock += 121e3; check((await pg(TOKEN, "/")).status === 404, "… then it is inert");
check((await J(await adm({ op: "results", session_id: SID }))).status === 200, "the results stay readable to the steward after the link closes (7 days)");
// TTL and close
const s2 = (await J(await adm({ op: "create", items: EX, ttl_min: 30 }))).body;
check((await pg(s2.token, "/")).status === 200, "a second session opens");
clock += 29 * 60e3; check((await pg(s2.token, "/")).status === 200, "it is open at 29 minutes");
clock += 61e3 + 1000; check((await pg(s2.token, "/")).status === 404, "and inert after 30 minutes");
const s3 = (await J(await adm({ op: "create", items: EX, ttl_min: 5 }))).body;
check((await J(await adm({ op: "close", session_id: s3.session_id }))).status === 200 && (await pg(s3.token, "/")).status === 404, "the steward can close a session at once");
// open-challenge bound and admin lockout
const s4 = (await J(await adm({ op: "create", items: { ...EX, items: [EX.items[0]] }, ttl_min: 5 }))).body; await adm({ op: "credential", credential: oldCred });
await mem.del(`cred:${RP}`); const codes = []; for (let i = 0; i < 34; i++) codes.push((await pg(s4.token, "/api/register/options", {})).status);
check(codes.slice(0, 32).every((c) => c === 200) && codes.slice(32).every((c) => c === 429), "open challenges are bounded per session: the 33rd gets 429");
for (let i = 0; i < 20; i++) await adm({ op: "results", session_id: SID }, "wrong-secret-" + i);
check((await adm({ op: "results", session_id: SID })).status === 429, "20 wrong admin secrets lock the admin route for 10 minutes, even for the right one");
clock += 601e3; check((await adm({ op: "results", session_id: SID })).status === 200, "… and it opens again afterwards");

// --- 3. the Vercel handlers (site/api/p.js and admin.js), wired to the REST store through env vars, as on Vercel
{
  process.env.KV_REST_API_URL = up.url; process.env.KV_REST_API_TOKEN = "t0k"; process.env.SIGN_ADMIN_SECRET = ADMIN;
  const P = await import(join(HERE, "site", "api", "p.js")), A = await import(join(HERE, "site", "api", "admin.js"));
  const call = (fn, url, init) => fn(new Request(url, init));
  const cred = { ...oldCred, rp_id: "sign.kigenka.com", origin: "https://sign.kigenka.com" };
  const l = await call(A.POST, "https://sign.kigenka.com/api/admin", { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ op: "credential", credential: cred }) });
  const c = await (await call(A.POST, "https://sign.kigenka.com/api/admin", { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ op: "create", items: EX, ttl_min: 30 }) })).json();
  const s = await call(P.GET, `https://sign.kigenka.com/api/p?p=${c.token}/api/state`), sj = await s.json();
  check(l.status === 200 && s.status === 200 && sj.rp_id === "sign.kigenka.com" && sj.registered && sj.notice?.kind === "test-stage" && sj.pending.length === 2 && sj.pending[1].own_tap,
    "the Vercel handlers, with the store from env vars: rp_id sign.kigenka.com, the test-stage notice, the owner credential reused, the mandate on its own tap");
  check((await call(P.GET, `https://sign.kigenka.com/api/p?p=${"Z".repeat(32)}/`)).status === 404 && [...up.m.keys()].every((x) => x.startsWith("sign:")) && ![...up.m.values()].some((v) => String(v.v).includes(c.token)), "a wrong token is inert; every stored key is prefixed, and the token appears in none");
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
}
// --- 4. two function instances sharing one REST store: one challenge, one decision, whichever instance answers
{
  const mk = () => createApp({ store: upstashStore({ url: up.url, token: "t0k", prefix: "multi:" }), rpId: RP, adminSecret: ADMIN });
  const i1 = mk(), i2 = mk(); const two = { ...EX, items: [EX.items[0], { ...EX.items[0], name: "2-card-b", payload: { ...EX.items[0].payload, card_id: "card-b" } }] };
  await i1.admin(new Request("https://x/api/admin", { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ op: "credential", credential: oldCred }) }));
  const c = await (await i2.admin(new Request("https://x/api/admin", { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ op: "create", items: two, ttl_min: 5 }) }))).json();
  const post = (inst, sub, b) => inst.page(new Request(`https://x/p/${c.token}${sub}`, { method: "POST", body: JSON.stringify(b) }), c.token + sub).then((r) => r.json().then((body) => ({ status: r.status, body })));
  const bo = (await post(i1, "/api/batch/options", { names: ["1-card", "2-card-b"] })).body; const ba = assertion(bo.challenge);
  const [x, y] = await Promise.all([post(i1, "/api/batch/verify", ba), post(i2, "/api/batch/verify", ba)]);
  check([x.status, y.status].sort().join() === "200,400", "two instances get the same one-tap assertion at once: exactly one signs, the other is refused");
}
// --- 5. admin.mjs (the steward's CLI) against the Vercel handlers on loopback: the link goes only to a 0600 file
{
  process.env.KV_REST_API_URL = up.url; process.env.KV_REST_API_TOKEN = "t0k"; process.env.SIGN_ADMIN_SECRET = ADMIN;
  const P = await import(join(HERE, "site", "api", "p.js")), A = await import(join(HERE, "site", "api", "admin.js"));
  const { writeFileSync, statSync, existsSync } = await import("node:fs"); const { spawn } = await import("node:child_process");
  const srv = http.createServer(async (req, res) => { let d = ""; req.on("data", (c) => d += c); req.on("end", async () => {
    const u = new URL(req.url, "http://127.0.0.1"); const r = u.pathname === "/api/admin" ? await A.POST(new Request(u, { method: req.method, headers: req.headers, body: d || undefined })) : await (req.method === "POST" ? P.POST : P.GET)(new Request(`http://127.0.0.1/api/p?p=${u.pathname.slice(3)}`, { method: req.method, body: req.method === "POST" ? d : undefined }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const sf = join(tmp, "admin-secret"); writeFileSync(sf, ADMIN, { mode: 0o600 }); const items = join(tmp, "items.json"); writeFileSync(items, JSON.stringify(EX));
  const run = (...args) => new Promise((ok) => { const c = spawn(process.execPath, [join(HERE, "admin.mjs"), ...args], { env: { ...process.env, SIGN_BASE: base, SIGN_ADMIN_SECRET_FILE: sf } }); let stdout = "", stderr = "";
    c.stdout.on("data", (d) => stdout += d); c.stderr.on("data", (d) => stderr += d); c.on("close", (status) => ok({ status, stdout, stderr })); });
  const link = join(tmp, "link.txt"); const r = await run("create", items, "--link", link, "--ttl", "30");
  const url = existsSync(link) ? readFileSync(link, "utf8").trim() : ""; const token = url.split("/p/")[1]?.replace(/\/$/, "");
  check(r.status === 0 && /^https:\/\/signing-test|^https:\/\/sign\.kigenka\.com\/p\//.test(url) && (statSync(link).mode & 0o777) === 0o600 && !r.stdout.includes(token) && !r.stderr.includes(token) && !r.stdout.includes(ADMIN), "admin.mjs create: the link is written to a 0600 file; neither the token nor the admin secret is printed");
  const sid = /session ([0-9a-f]{64})/.exec(r.stdout)?.[1]; const st = await (await fetch(`${base}/p/${token}/api/state`)).json();
  { const o = await (await fetch(`${base}/p/${token}/api/sign/options`, { method: "POST", body: "{}" })).json();
    const v = await fetch(`${base}/p/${token}/api/sign/verify`, { method: "POST", body: JSON.stringify(assertion(o.challenge, "sign.kigenka.com")) });
    check(v.status === 200, "through the Vercel handlers, the owner's existing passkey signs the first item at rp_id sign.kigenka.com"); }
  const rr = await run("results", sid, "--out", join(tmp, "out")), cl = await run("close", sid);
  check(st.pending?.length === 2 && rr.status === 0 && /approved\t1-card\t[\w-]+\tverifies \(A\.1\)/.test(rr.stdout) && /waiting\t2-mandate/.test(rr.stdout) && existsSync(join(tmp, "out", "signed", "1-card.json")) && existsSync(join(tmp, "out", "decisions.json")) && cl.status === 0 && (await fetch(`${base}/p/${token}/`)).status === 404, "admin.mjs results: the signed item is saved and checked with the reference crypto (verifies, A.1), the rest shown as waiting; close makes the link inert");
  (await import("node:fs")).chmodSync(sf, 0o644); check((await run("results", sid, "--out", join(tmp, "o2"))).status === 2, "admin.mjs refuses an admin secret file others can read");
  srv.close(); delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN;
}
up.srv.close(); rmSync(tmp, { recursive: true, force: true });
console.log(`sign-serverless: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
