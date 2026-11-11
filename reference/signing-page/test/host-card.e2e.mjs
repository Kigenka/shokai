// v0.4.0 (§2.3): the owner signs their door's Shōkai host card on the reference signing page, end to end on loopback. The SDK's
// setup kit prepares the item from house.json (shokai host-card request); the page fills in the house digest, shows the house
// rules and the leaflet, and a SOFTWARE authenticator (rp_id under .invalid) stands in for the owner's phone. The signed card
// then opens the SDK door. Fictional place and people; no real keys; nothing leaves the machine.
import { generateKeyPairSync, sign as nodeSign, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256, b64u } from "../webauthn.mjs";
import net from "node:net";
const HERE = dirname(fileURLToPath(import.meta.url));
const SDK = await import(pathToFileURL(join(HERE, "../../../packages/shokai/dist/src/index.js")).href);
let pass = 0, fail = 0; const check = (c, w) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${w}`); };
console.log("Shōkai host card on the signing page (v0.4.0)");

const house = JSON.parse(readFileSync(join(HERE, "../../../examples/drop-in/house.kettle.json"), "utf8"));
house.door.base_url = "http://127.0.0.1:0/shokai";   // a door on this machine
const rep = SDK.generateRepresentativeKey();
const request = SDK.hostCardRequest(house, SDK.representativePublic(rep));
const tmp = mkdtempSync(join(tmpdir(), "shokai-hostcard-")); writeFileSync(join(tmp, "items.json"), JSON.stringify(request));
const RP = "signing-test.shokai.invalid", ORIGIN = "https://" + RP, TOKEN = b64u(randomBytes(24));
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
// SIGNING_SERVER: the same checks against another implementation of this page (deploy/sign-serverless/local.mjs).
const SERVER = process.env.SIGNING_SERVER ? join(process.cwd(), process.env.SIGNING_SERVER) : join(HERE, "..", "server.mjs");
const srv = spawn("node", [SERVER], { env: { ...process.env, PORT: String(port), RP_ID: RP, TOKEN, DATA_DIR: join(tmp, "data"), ITEMS: join(tmp, "items.json"), TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => srv.stdout.once("data", r));
const B = `http://127.0.0.1:${port}/p/${TOKEN}/`;
const post = async (p, body) => { const r = await fetch(B + "api/" + p, { method: "POST", body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async (p) => (await fetch(B + "api/" + p)).json();
// software authenticator (as in e2e.mjs)
const head = (mt, n) => n < 24 ? Buffer.from([(mt << 5) | n]) : n < 256 ? Buffer.from([(mt << 5) | 24, n]) : Buffer.from([(mt << 5) | 25, n >> 8, n & 255]);
const enc = (v) => { if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v); if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [enc(k), enc(x)])]); throw new Error("enc"); };
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); const jwk = publicKey.export({ format: "jwk" }); const credId = randomBytes(16);
const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
let counter = 0; const authData = (withCred) => { const c = Buffer.alloc(4); c.writeUInt32BE(++counter); const base = Buffer.concat([sha256(RP), Buffer.from([withCred ? 0x45 : 0x05]), c]);
  if (!withCred) return base; const l = Buffer.alloc(2); l.writeUInt16BE(credId.length); return Buffer.concat([base, Buffer.alloc(16), l, credId, enc(cose)]); };
const assertion = (challenge) => { const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN })); const ad = authData(false);
  return { credentialId: b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(nodeSign("sha256", Buffer.concat([ad, sha256(cd)]), privateKey)) }; };

try {
  const ro = (await post("register/options", {})).body;
  const regCd = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro.challenge, origin: ORIGIN }));
  check((await post("register/verify", { clientDataJSON: b64u(regCd), attestationObject: b64u(enc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) })).status === 200 && /Mika Tanabe/.test(ro.user.name), "the owner's passkey registers");
  const st = await get("state"); const it = st.current; const facts = it?.facts ?? []; const quotes = (it?.quoted ?? []).map((q) => q.from + ": " + q.text).join("\n");
  check(/The Shōkai host card for your door/.test(it?.title ?? "") && facts.some((f) => /^KIND: a Shōkai host card/.test(f)), "the page names the item: the Shōkai host card for your door");
  check(facts.some((f) => /^HOUSE: sha-256:\S+, checked/.test(f)) && facts.some((f) => /^PLACE: the door at http:\/\/127\.0\.0\.1:0\/shokai\/places\/kettle\/entry, for you \(this passkey\)/.test(f)), "the house digest is checked against the house config the item carries, and the place is the owner's");
  check(facts.some((f) => /tea\.order: act on behalf, for purchase, spends up to 60\.00 USD per pass, asks for name, address/.test(f)) && facts.some((f) => /introductions welcome, never required/.test(f)), "the house rules in plain words: actions, spending cap, data asks, introductions");
  check(/About this place.*\n?.*Kettle & Leaf is a small tea shop/.test(quotes) && /the shared Shōkai text/.test(quotes) && /Suzu, host representative, for Kettle & Leaf/.test(quotes), "the leaflet preview: the place's words and the shared text, quoted, under the owner's signature");
  check(it?.problems === undefined || it.problems.length === 0, "no problems: every field of the house config is shown");
  check(it?.own_tap === true, "a host card with a spending cap is signed with its own tap");
  const o = (await post("sign/options", {})).body;
  check((await post("sign/verify", assertion(o.challenge))).status === 200, "the owner signs it with their passkey");
  const signed = JSON.parse(readFileSync(join(tmp, "data", "signed", "host-card.json"), "utf8"));
  const card = SDK.fromSigningPage(signed);
  const door = SDK.createDoor(SDK.houseToDoorOptions(house, { card, keys: { rep }, ownerRpId: RP }));
  check(door.hostCardProblem === null && door.listing().places[0].house_digest === card.payload.house_digest, "the signed Shōkai host card opens the SDK door, with the same house digest");
  const aya = SDK.createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["tea.browse"] });
  check((await aya.visit(door, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } })).seated, "a visiting representative is admitted with a pass");
  // a tampered item: the house config changed after the digest was fixed → the page refuses to start
  const bad = JSON.parse(JSON.stringify(request)); bad.items[0].payload.house_digest = "sha-256:" + "A".repeat(43);
  writeFileSync(join(tmp, "bad.json"), JSON.stringify(bad));
  const { checkItems } = await import("../items.mjs");
  check(checkItems(bad).some((p) => /house_digest/.test(p)), "an item whose house_digest isn't its house config's digest is refused before the page starts");
} finally { srv.kill(); }
console.log(`signing page: host card ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
