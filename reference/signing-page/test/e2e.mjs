// The reference signing page, end to end on loopback: a SOFTWARE WebAuthn authenticator (an in-memory P-256 key, rp_id under
// .invalid) stands in for the owner's phone. Checks the page flow, the WebAuthn profile (origin, crossOrigin, replay), and that
// every signed item verifies with the reference crypto (SPEC Appendix A.1). Nothing leaves the machine; no real keys.
import { generateKeyPairSync, sign as nodeSign, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256, b64u } from "../webauthn.mjs";
import net from "node:net";
const HERE = dirname(fileURLToPath(import.meta.url));
// SIGNING_SERVER: run the same checks against another implementation of this page (deploy/sign-serverless/local.mjs).
const SERVER = process.env.SIGNING_SERVER ? join(process.cwd(), process.env.SIGNING_SERVER) : join(HERE, "..", "server.mjs");
const C = await import(pathToFileURL(join(HERE, "../../engawa/dist/src/crypto.js")).href);
let pass = 0, fail = 0; const check = (c, w) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${w}`); };

const tmp = mkdtempSync(join(tmpdir(), "shokai-signing-")); const RP = "signing-test.shokai.invalid", ORIGIN = "https://" + RP;
const TOKEN = b64u(randomBytes(24)), RELAY_SECRET = b64u(randomBytes(32));
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const srv = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port), RP_ID: RP, TOKEN, RELAY_SECRET, DATA_DIR: join(tmp, "data"), ITEMS: join(HERE, "..", "items.example.json"), TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.once("data", r));
const B = `http://127.0.0.1:${port}/p/${TOKEN}/`, H = { "X-Sign-Relay": RELAY_SECRET };
const post = async (p, body) => { const r = await fetch(B + "api/" + p, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async (p) => (await fetch(B + "api/" + p, { headers: H })).json();

// software authenticator (CBOR for the attestation object, COSE ES256 key)
const head = (mt, n) => n < 24 ? Buffer.from([(mt << 5) | n]) : n < 256 ? Buffer.from([(mt << 5) | 24, n]) : Buffer.from([(mt << 5) | 25, n >> 8, n & 255]);
const enc = (v) => { if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v); if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [enc(k), enc(x)])]); throw new Error("enc"); };
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); const jwk = publicKey.export({ format: "jwk" }); const credId = randomBytes(16);
const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
let counter = 0; const authData = (withCred) => { const c = Buffer.alloc(4); c.writeUInt32BE(++counter); const base = Buffer.concat([sha256(RP), Buffer.from([withCred ? 0x45 : 0x05]), c]);
  if (!withCred) return base; const l = Buffer.alloc(2); l.writeUInt16BE(credId.length); return Buffer.concat([base, Buffer.alloc(16), l, credId, enc(cose)]); };
const assertion = (challenge, extra = {}, origin = ORIGIN) => { const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, ...extra })); const ad = authData(false);
  return { credentialId: b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(nodeSign("sha256", Buffer.concat([ad, sha256(cd)]), privateKey)) }; };

try {
  check((await fetch(B, { headers: H })).status === 200 && /Sign with your passkey/.test(await (await fetch(B, { headers: H })).text()), "the page loads with the token and the relay secret");
  check((await fetch(B)).status === 404, "without the relay secret: 404");
  { const h = await (await fetch(B, { headers: H })).text(); const st0 = await get("state");
    check(!/test-stage|notice|\{\{/.test(h) && st0.notice === null && (await fetch(B + "about", { headers: H })).status === 404, "NOTICE unset: no test-stage notice, no /about, no unfilled placeholders"); }
  check((await fetch(`http://127.0.0.1:${port}/p/${"x".repeat(32)}/`, { headers: H })).status === 404, "a wrong token: 404");
  check((await post("sign/options", {})).status === 409, "nothing can be signed before the passkey exists");
  const ro = (await post("register/options", {})).body;
  check(ro.rp.id === RP && ro.authenticatorSelection.userVerification === "required" && ro.pubKeyCredParams[0].alg === -7 && /Aya Linden/.test(ro.user.name), "register options: rp, user verification required, ES256, the owner's name");
  const regCd = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro.challenge, origin: ORIGIN }));
  check((await post("register/verify", { clientDataJSON: b64u(regCd), attestationObject: b64u(enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) })).status === 200, "the passkey registers");
  check((await post("register/options", {})).status === 409, "a second passkey can't be registered on the same page");
  let st = await get("state"); check(st.registered && st.current?.name === "1-card" && st.total === 2, "two items queued, the card first");
  let o = (await post("sign/options", {})).body;
  check((await post("sign/verify", assertion(o.challenge, {}, "https://evil.example"))).status === 400, "an assertion from another origin is refused (A.1, exact origin)");
  o = (await post("sign/options", {})).body;
  check((await post("sign/verify", assertion(o.challenge, { crossOrigin: true }))).status === 400, "an assertion made inside another site's frame is refused (crossOrigin, C195)");
  o = (await post("sign/options", {})).body; const a = assertion(o.challenge);
  check((await post("sign/verify", a)).status === 200, "the owner approves the card");
  check((await post("sign/verify", a)).status === 400, "replaying the same assertion is refused");
  { o = (await post("sign/options", {})).body; const saved = counter; counter = 1; const low = assertion(o.challenge); counter = saved;
    const r = await post("sign/verify", low); check(r.status === 400 && /counter/.test(r.body.error) && !existsSync(join(tmp, "data", "signed", "2-mandate.json")), "an assertion whose signature counter didn't go up is refused (possible copied authenticator); nothing is signed"); }
  o = (await post("sign/options", {})).body; check(o.name === "2-mandate" && o.summary[0].startsWith("WHAT:") && o.facts.some((f) => /at most 10\.00 USD in total/.test(f)) && o.own_tap === true, "the mandate is offered next, in plain words built from its fields (10.00 USD in total), as an item with its own tap");
  check((await post("sign/verify", assertion(o.challenge))).status === 200, "the owner approves the mandate");
  st = await get("state"); check(!st.current && st.done.length === 2 && st.done.every((d) => d.decision === "approved"), "both approved; nothing waiting");
  const S = (n) => JSON.parse(readFileSync(join(tmp, "data", "signed", n + ".json"), "utf8")).signed;
  const card = S("1-card"), mand = S("2-mandate"); const owner = card.payload.principal.principal_id;
  check(owner.startsWith("did:jwk:") && card.payload.owner_binding.rp_id === RP && !JSON.stringify(card).includes("$OWNER_DID") && !JSON.stringify(mand).includes("$NOW"), "the items were filled in with the owner's DID, rp_id and dates");
  const k = C.resolveDid(owner);
  check(C.digestOf(card.payload) === card.payload_digest && C.checkSig(card.signatures[0], card.payload_digest, k, RP).ok, "the signed card verifies with the reference crypto (A.1)");
  check(C.digestOf(mand.payload) === mand.payload_digest && C.checkSig(mand.signatures[0], mand.payload_digest, k, RP).ok, "the signed mandate verifies with the reference crypto (A.1)");
  check(!existsSync(join(tmp, "data", "owner-key.json")) && !/"d"\s*:/.test(readFileSync(join(tmp, "data", "owner-credential.json"), "utf8")), "no private key is stored anywhere: only the public credential");
} finally { srv.kill(); rmSync(tmp, { recursive: true, force: true }); }

// One passkey tap for every item (SPEC Appendix A.1, C195, D23): a second page, three items, one assertion.
{
  const tmp2 = mkdtempSync(join(tmpdir(), "shokai-signing-batch-"));
  const ex = JSON.parse(readFileSync(join(HERE, "..", "items.example.json"), "utf8"));
  // Two cards (no money: they may share one tap) and the mandate (it can spend: it always gets its own tap).
  const door = JSON.parse(JSON.stringify(ex.items[0])); door.name = "2-door-card"; door.title = "Your door card"; door.payload.card_id = "card-example-aya-door";
  door.payload.mandate_scope = { purposes: ["presentation"], actions: ["door.present"] };
  const mandate = ex.items[1]; mandate.name = "3-mandate"; ex.items = [ex.items[0], door, mandate]; const itemsPath = join(tmp2, "items.json"); (await import("node:fs")).writeFileSync(itemsPath, JSON.stringify(ex));
  const port2 = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const srv2 = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port2), RP_ID: RP, TOKEN, RELAY_SECRET, DATA_DIR: join(tmp2, "data"), ITEMS: itemsPath, TTL_MIN: "2", NOTICE: "test-stage" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv2.stdout.once("data", r));
  const B2 = `http://127.0.0.1:${port2}/p/${TOKEN}/`;
  const post2 = async (p, body) => { const r = await fetch(B2 + "api/" + p, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const get2 = async (p) => (await fetch(B2 + "api/" + p, { headers: H })).json();
  try {
    const ro2 = (await post2("register/options", {})).body;
    const cd2 = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro2.challenge, origin: ORIGIN }));
    check((await post2("register/verify", { clientDataJSON: b64u(cd2), attestationObject: b64u(enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) })).status === 200, "one tap: a fresh page, the passkey registers");
    const st2 = await get2("state");
    check(st2.pending.length === 3 && st2.pending.every((p) => p.title && p.summary.length && p.summary[0].startsWith("WHAT:") && p.digest_short) && st2.pending.filter((p) => p.own_tap).map((p) => p.name).join() === "3-mandate",
      "one tap: the page gets every waiting item, each with its title, plain-words facts and fingerprint, and the spending mandate marked for its own tap");
    const html = await (await fetch(B2, { headers: H })).text();
    { const ab = await fetch(B2 + "about", { headers: H }); const at = await ab.text();
      check(/early, test-stage convenience/.test(html) && html.includes(`here <strong>${RP}</strong>`) && /at least 90 days in advance/.test(html) && html.indexOf('id="notice"') < html.indexOf('id="reg"') && !html.includes("{{"),
        "NOTICE=test-stage: the short notice is on the first screen, before \"Create my passkey\", with this page's address and the 90-day warning");
      check(/This is a test-stage page; if its address ever changes, you'll hear from us first\./.test(html), "… and its one line is on the done screen");
      check(ab.status === 200 && /About this signing page/.test(at) && at.includes(RP) && /at least 90 days/.test(at) && !at.includes("{{") && ab.headers.get("content-security-policy")?.includes("default-src 'none'"), "… and /about gives the full text and FAQ under the same headers");
      check(st2.notice?.kind === "test-stage" && st2.notice.days === 90, "… and the state says so (kind, 90 days)"); }
    check(/id="allItems"/.test(html) && /one passkey tap/.test(html) && /one by one/.test(html), "one tap: the page has the itemized list, the one-tap button and the one-by-one fallback");
    check((await post2("batch/options", { names: st2.pending.map((p) => p.name) })).status === 409, "one tap refuses a batch that includes an item that can spend money");
    const names = st2.pending.filter((p) => !p.own_tap).map((p) => p.name);
    check((await post2("batch/options", { names: [names[0]] })).status === 409, "one tap needs at least two items (one item is signed on its own)");
    check((await post2("batch/options", { names: [names[0], names[0]] })).status === 409, "one tap refuses a list with a repeated item");
    check((await post2("batch/options", { names: [names[0], "not-shown"] })).status === 409, "one tap refuses an item that isn't waiting (nothing unseen is batched)");
    let bo = (await post2("batch/options", { names })).body;
    const frozen = JSON.parse(readFileSync(join(tmp2, "data", "frozen-items.json"), "utf8")).items; const digests = names.map((n) => frozen.find((x) => x.name === n).digest);
    check(bo.challenge === C.batchDigest(digests).slice(8) && bo.items.length === 2, "the challenge is the batch digest, JCS({batch: [d1, d2]}), in the order shown");
    check((await post2("batch/verify", assertion(bo.challenge, {}, "https://evil.example"))).status === 400, "one tap: an assertion from another origin is refused");
    bo = (await post2("batch/options", { names })).body; const ba = assertion(bo.challenge);
    const r = await post2("batch/verify", ba);
    check(r.status === 200 && r.body.signed.length === 2, "one passkey tap approves both cards");
    check((await post2("batch/verify", ba)).status === 400, "replaying the one-tap assertion is refused");
    const st3 = await get2("state"); check(st3.current?.name === "3-mandate" && st3.done.length === 2 && st3.done.every((d) => d.decision === "approved" && d.via === "one_tap"), "both cards recorded as approved in one tap; the mandate waits for its own tap");
    { const mo = (await post2("sign/options", {})).body; check((await post2("sign/verify", assertion(mo.challenge))).status === 200, "the mandate is approved with its own tap"); }
    check((await post2("sign/options", {})).status === 409, "nothing is left waiting");
    const S2 = (n) => JSON.parse(readFileSync(join(tmp2, "data", "signed", n + ".json"), "utf8")).signed;
    const signed = names.map(S2); const owner2 = signed[0].payload.principal.principal_id; const k2 = C.resolveDid(owner2);
    check(signed.every((e, i) => C.digestOf(e.payload) === e.payload_digest && e.signatures.length === 1 && e.signatures[0].webauthn.batch_index === i
      && JSON.stringify(e.signatures[0].webauthn.batch) === JSON.stringify(digests) && C.checkSig(e.signatures[0], e.payload_digest, k2, RP).ok),
      "each item carries its own signature copy (batch, batch_index) and verifies on its own with the reference crypto (A.1)");
    const moved = { ...signed[0].signatures[0], webauthn: { ...signed[0].signatures[0].webauthn, batch_index: 1 } };
    check(!C.checkSig(moved, signed[0].payload_digest, k2, RP).ok, "an item's signature pointed at another position in the batch is refused");
    check(!C.checkSig(signed[0].signatures[0], signed[1].payload_digest, k2, RP).ok, "one item's signature copy can't be used for another item");
  } finally { srv2.kill(); rmSync(tmp2, { recursive: true, force: true }); }
}
// B2 (adversarial review): what the page shows comes from the payload, never from what the item's supplier wrote about it.
{
  const tmp3 = mkdtempSync(join(tmpdir(), "shokai-signing-lies-"));
  const ex = JSON.parse(readFileSync(join(HERE, "..", "items.example.json"), "utf8"));
  const card = ex.items[0]; card.title = "Just a look at the menu"; card.summary = ["CAN: look at the menu, nothing else."];
  card.payload.mandate_scope.actions.push("account.close");
  const m = ex.items[1]; m.title = "A tiny limit at Kettle & Leaf"; m.summary = ["SPEND: at most 1.00 USD, only at Kettle & Leaf."];
  m.payload.limits.max_amount = { value: "500.00", currency: "USD" }; delete m.payload.counterparties;
  m.payload.purpose.statement = "Only 1.00 USD, only at Kettle & Leaf.";
  const odd = { name: "3-odd", title: "Nothing to see", summary: ["A harmless note."], payload: { thing_id: "x-1", transfer: { to: "did:key:z6MkAttacker", amount: { value: "900.00", currency: "USD" } } } };
  ex.items = [card, m, odd]; const itemsPath = join(tmp3, "items.json"); (await import("node:fs")).writeFileSync(itemsPath, JSON.stringify(ex));
  const port3 = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const srv3 = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port3), RP_ID: RP, TOKEN, RELAY_SECRET, DATA_DIR: join(tmp3, "data"), ITEMS: itemsPath, TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv3.stdout.once("data", r));
  const B3 = `http://127.0.0.1:${port3}/p/${TOKEN}/`;
  const post3 = async (p, body, raw) => { const r = await fetch(B3 + "api/" + p, { method: "POST", headers: H, body: raw ?? JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  try {
    const ro3 = (await post3("register/options", {})).body; const cd3 = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro3.challenge, origin: ORIGIN }));
    await post3("register/verify", { clientDataJSON: b64u(cd3), attestationObject: b64u(enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) });
    const st = await (await fetch(B3 + "api/state", { headers: H })).json(); const [c3, m3, o3] = st.pending; const F = (x) => x.facts.join("\n"), Qt = (x) => x.quoted.map((q) => q.text).join("\n");
    check(/account\.close/.test(F(c3)) && !/Just a look/.test(c3.title) && /Just a look/.test(Qt(c3)) && c3.quoted[0].from.includes("not checked"),
      "a card whose supplier says \"just a look\" but whose payload allows account.close: the facts list account.close; the supplier's words appear only as a marked quote");
    check(/500\.00 USD/.test(F(m3)) && !/\b1\.00 USD/.test(F(m3)) && /500\.00 USD/.test(m3.title) && /ANY place/.test(F(m3)) && /1\.00 USD/.test(Qt(m3)),
      "a mandate whose supplier says 1.00 USD at one shop but whose payload says 500.00 USD anywhere: the title and facts say 500.00 USD and ANY place; 1.00 USD appears only in quotes");
    check(o3.kind === "unknown" && o3.own_tap && /transfer\.to: did:key:z6MkAttacker/.test(F(o3)) && /900\.00 USD/.test(F(o3)) && !/harmless/.test(F(o3)),
      "an item of a kind the page doesn't know: every field is listed as it is (the recipient and 900.00 USD), it gets its own tap, and its note is only a quote");
    const big = await post3("decline", null, JSON.stringify({ pad: "x".repeat(200_000) }));
    check(big.status === 413, "a body over 100 kB is refused at once with 413");
    const st2 = await (await fetch(B3 + "api/state", { headers: H })).json();
    check(st2.pending.length === 3, "the page still answers normally after refusing the large body");
  } finally { srv3.kill(); rmSync(tmp3, { recursive: true, force: true }); }
  // The open-challenge bound, directly: a fresh page with no passkey answers 429 once 32 registration challenges are open.
  const tmp4 = mkdtempSync(join(tmpdir(), "shokai-signing-flood-"));
  const port4 = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const srv4 = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port4), RP_ID: RP, TOKEN, RELAY_SECRET, DATA_DIR: join(tmp4, "data"), ITEMS: join(HERE, "..", "items.example.json"), TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv4.stdout.once("data", r));
  try {
    const codes = []; for (let i = 0; i < 40; i++) codes.push((await fetch(`http://127.0.0.1:${port4}/p/${TOKEN}/api/register/options`, { method: "POST", headers: H, body: "{}" })).status);
    check(codes.slice(0, 32).every((c) => c === 200) && codes.slice(32).every((c) => c === 429), "open challenges are bounded: the 33rd open registration request gets 429");
  } finally { srv4.kill(); rmSync(tmp4, { recursive: true, force: true }); }
  // An allowance whose grants aren't carried, or don't match its grant_digests, can't be shown in full: the page won't start.
  const { spawnSync } = await import("node:child_process"); const { writeFileSync } = await import("node:fs"); const { digestOf } = await import("../webauthn.mjs");
  const tmp5 = mkdtempSync(join(tmpdir(), "shokai-signing-allow-"));
  const grant = { grant_id: "g1", salt: "c2FsdHNhbHRzYWx0c2FsdA", purposes: ["purchase"], place_categories: ["tea_shop"], actions: ["order.place"], spend: { per_period: { value: "30.00", currency: "USD" }, period: "P7D" } };
  const allowance = (grants, digests) => ({ owner_display_name: "Aya Linden", items: [{ name: "1-allow", title: "x", summary: ["x"], grants, payload: { allowance_id: "al-1", owner_id: "$OWNER_DID", representative_id: "did:key:z6MkokRDcCS1nEmZSBSvjKMPHpk5yoevvfFD6fLKegemF85j", card_id: "card-example-aya-1", grant_digests: digests, shown_to_owner: { text: "Small things, at most 5 USD a week.", locale: "en" }, valid_from: "$NOW", expires_at: "$IN_30D", revocation_status: "https://status.example/al-1" } }] });
  const startWith = (doc) => { const f = join(tmp5, "items-" + Math.random() + ".json"); writeFileSync(f, JSON.stringify(doc)); return spawnSync("node", [SERVER], { env: { ...process.env, PORT: "0", RP_ID: RP, TOKEN: "t".repeat(32), DATA_DIR: join(tmp5, "d"), ITEMS: f, TTL_MIN: "1" }, timeout: 4000 }); };
  const noGrants = startWith(allowance(undefined, [digestOf(grant)])), wrong = startWith(allowance([{ ...grant, spend: { ...grant.spend, per_period: { value: "3.00", currency: "USD" } } }], [digestOf(grant)]));
  check(noGrants.status === 2 && wrong.status === 2 && /grant_digests/.test(String(noGrants.stderr)), "an allowance without its grants, or with grants that don't match grant_digests, stops the page from starting");
  const { describe } = await import("../describe.mjs"); const d = describe(allowance([grant], [digestOf(grant)]).items[0].payload, { grants: [grant] });
  check(d.own_tap && d.facts.some((f) => /up to 30\.00 USD each week/.test(f) && /keeps this period total across places/.test(f)) && d.quotes.some((q) => /5 USD a week/.test(q.text)),
    "an allowance with matching grants: the page shows 30.00 USD a week from the grant (the shown_to_owner text saying 5 USD is only a quote), notes the period total is kept by the representative, and gives it its own tap");
  // N1 (defender review): every signed field is shown, at any depth, including fields signed by digest that the item carries.
  {
    const ex0 = JSON.parse(readFileSync(join(HERE, "..", "items.example.json"), "utf8")); const card0 = ex0.items[0].payload;
    const card1 = { ...card0, owner_binding: { ...card0.owner_binding, platform_key: "did:key:z6MkChatAppKeyChatAppKeyChatAppKey" }, principal: { ...card0.principal, extra_seal: { by: "did:key:z6MkNested", note: "a nested thing" } } };
    const dc = describe(card1, { ownerDid: "$OWNER_DID" }); const T = dc.facts.join("\n") + "\n" + dc.quotes.map((x) => x.text).join("\n");
    check(/CHAT KEY: did:key:z6MkChatAppKeyChatAppKeyChatAppKey/.test(T) && /alone can sign/.test(T), "a card's owner_binding.platform_key is shown in full, with what it can sign");
    check(T.includes(card0.representative_key.public_key) && T.includes(card0.representative_key.key_id) && /Ed25519/.test(T), "the representative key is shown in full: key id, algorithm and public key");
    check(/principal\.extra_seal\.by: did:key:z6MkNested/.test(T) && /a nested thing/.test(T), "a nested field the describer doesn't know is listed as it is, at its full path");
    const g2 = { ...grant, grant_id: "g2", hidden_extra: { forward_to: "did:key:z6MkSomewhereElse" } };
    const da = describe(allowance([g2], [digestOf(g2)]).items[0].payload, { grants: [g2] }); const TA = da.facts.join("\n");
    check(da.problems.length === 0 && /grants\[0\]\.hidden_extra\.forward_to: did:key:z6MkSomewhereElse/.test(TA) && /grants\[0\]\.salt: /.test(TA), "an allowance grant's leftover fields (here hidden_extra.forward_to, and its salt) are listed too");
    const pol = (priv, digest) => ({ policy_id: "pol-1", owner_id: "did:jwk:o", representative_id: "did:key:z6MkDoor", public: { categories: ["store"], introduction: "preferred", uninvited_per_month: 2, paid_introductions: "as_uninvited", listed: false },
      private_digest: digest, trusted_introducers: [], valid_from: "2026-10-28T00:00:00Z", expires_at: "2026-11-28T00:00:00Z", issued_at: "2026-10-28T00:00:00Z", shown_to_owner: { text: "Your door rules.", locale: "en-US" } });
    const priv = { salt: "c2FsdHNhbHRzYWx0c2FsdA", note: { likes: ["green tea"], never: ["payday loans"] } };
    const dp = describe(pol(priv, digestOf(priv)), { private: priv }), dn = describe(pol(priv, digestOf(priv))), dw = describe(pol(priv, digestOf({ ...priv, note: { likes: [] } })), { private: priv });
    check(dp.problems.length === 0 && dp.facts.some((f) => f.startsWith("private.note.never[0]:")) && dp.quotes.some((x) => x.text === "payday loans") && dp.facts.some((f) => f.includes(digestOf(priv))), "door rules: the private part the digest stands for is shown, field by field, with the digest");
    check(dn.problems.some((x) => /private part/.test(x)) && dw.problems.some((x) => /private part/.test(x)), "door rules without their private part, or with one that doesn't match private_digest, can't be signed");
    const bidi = describe({ ...card0, role: "Personal\u202Erepresentative" }, {}), deep = describe({ thing_id: "x", a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 1 } } } } } } } } } }, {});
    check(bidi.problems.some((x) => /invisible/.test(x)) && deep.problems.some((x) => /deeper/.test(x)), "a value the page can't show faithfully (an invisible direction mark, nesting deeper than 8) is a problem, so the page won't sign it");
    // N2: kind confusion. A mandate that also carries a card's fields is refused; anything with an amount gets its own tap.
    const m0 = ex0.items[1].payload; const mixed = { ...m0, representative_key: card0.representative_key, principal: card0.principal, mandate_scope: card0.mandate_scope, owner_binding: card0.owner_binding };
    const dm = describe(mixed, {}); check(dm.kind === "ambiguous" && dm.own_tap && dm.problems.some((x) => /more than one kind/.test(x)), "a mandate that also carries a card's fields is refused as mixed kinds, not shown as a card");
    const mixedDoc = { ...ex0, items: [ex0.items[0], { ...ex0.items[1], payload: { ...mixed, principal_id: "$OWNER_DID" } }] }, rMixed = startWith(mixedDoc);
    check(rMixed.status === 2 && /more than one kind/.test(String(rMixed.stderr)), "… and a page given such an item won't start");
    const cardAmt = { ...card0, card_id: "card-amt", standing: { tier: "provisional", deposit: { value: "50.00", currency: "USD" } } };
    const dAmt = describe(cardAmt, {}); check(dAmt.kind === "card" && dAmt.own_tap && /50\.00 USD \(standing\.deposit\)/.test(dAmt.facts.join("\n")), "a card that carries an amount anywhere gets its own tap, and the amount is named");
    const tmp6 = mkdtempSync(join(tmpdir(), "shokai-signing-amt-")); const itemsAmt = join(tmp6, "items.json");
    writeFileSync(itemsAmt, JSON.stringify({ ...ex0, items: [ex0.items[0], { name: "2-card-amt", title: "Another card", summary: ["x"], payload: { ...cardAmt, principal: { ...card0.principal } } }] }));
    const port6 = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
    const srv6 = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port6), RP_ID: RP, TOKEN, RELAY_SECRET, DATA_DIR: join(tmp6, "data"), ITEMS: itemsAmt, TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((r) => srv6.stdout.once("data", r));
    const B6 = `http://127.0.0.1:${port6}/p/${TOKEN}/`; const post6 = async (p, body) => { const r = await fetch(B6 + "api/" + p, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
    try {
      const ro6 = (await post6("register/options", {})).body; const cd6 = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro6.challenge, origin: ORIGIN }));
      await post6("register/verify", { clientDataJSON: b64u(cd6), attestationObject: b64u(enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) });
      const st6 = await (await fetch(B6 + "api/state", { headers: H })).json();
      check(st6.pending.find((x) => x.name === "2-card-amt")?.own_tap === true && (await post6("batch/options", { names: st6.pending.map((x) => x.name) })).status === 409,
        "on a running page, two cards where one carries an amount can't share one tap (409)");
    } finally { srv6.kill(); rmSync(tmp6, { recursive: true, force: true }); }
  }
  rmSync(tmp5, { recursive: true, force: true });
}
// The frozen owner signing profile vectors (conformance/test-vectors.json passkey_profile, A.1) against this page's verifier.
{
  const { verifyAssertion } = await import("../webauthn.mjs");
  const TV = JSON.parse(readFileSync(new URL("../../../conformance/test-vectors.json", import.meta.url), "utf8")); const PF = TV.passkey_profile;
  const jwk = JSON.parse(Buffer.from(PF.did.slice(8), "base64url").toString("utf8"));
  const ok = (sig, challenge) => { try { verifyAssertion({ credentialId: sig.webauthn.credential_id, clientDataJSON: sig.webauthn.client_data_json, authenticatorData: sig.webauthn.authenticator_data, signature: sig.value },
    { credential: { credential_id: sig.webauthn.credential_id, public_key_jwk: jwk }, challenge, rpId: PF.rp_id, origin: "https://" + PF.rp_id }); return true; } catch { return false; } };
  check(Object.values(PF.cases).every((c) => ok(c.signature, PF.digest.slice(8)) === (c.expect === true)), "the page's verifier agrees with the passkey_profile vectors: crossOrigin false ok; crossOrigin true, topOrigin, port, http, subdomain refused");
  check(PF.batch.signatures.every((sg) => ok(sg, PF.batch.batch_digest.slice(8))), "… and accepts the one-tap batch assertion for its batch challenge");
}
{
  const { spawnSync } = await import("node:child_process");
  const bad = (env) => spawnSync("node", [SERVER], { env: { ...process.env, PORT: "0", RP_ID: RP, TOKEN: "t".repeat(32), DATA_DIR: join(tmp, "bad"), TTL_MIN: "1", ...env }, timeout: 10000 }).status;
  check(bad({ NOTICE: "maybe" }) === 2 && bad({ NOTICE: "test-stage", NOTICE_DAYS: "30" }) === 2 && bad({ NOTICE: "test-stage", NOTICE_DAYS: "90.5" }) === 2, "an unknown NOTICE, or notice days under 90 or not whole, stops the page from starting");
}
console.log(`signing page: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
