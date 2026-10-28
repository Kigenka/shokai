// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc4, F3): createDoor() with a door card its owner signed with a passkey, as the reference signing page writes it
// (`signed/<name>.json`), in one tap with other items (Appendix A.1, C195) or on its own. A SOFTWARE WebAuthn authenticator
// (an in-memory P-256 key; rp_id under .invalid) stands in for the owner's phone, as in the signing page's own test. Everything
// runs on loopback; the temp folder is removed. Fictional owner (Ines Calloway) and place only.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { generateKeyPairSync, sign as nodeSign, randomBytes, createHash } from "node:crypto";
import { createDoor, createRepresentative, generateRepresentativeKey, developmentPasskey, sign, fromSigningPage, verifyDoorCard, cardRevocationMessage,
  signCardRevocation, SHOKAI_DOOR_CARD_INVALID, SHOKAI_DOOR_CARD_REVOKED, PROTOCOL, type Transport, type Door } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "..", "..", "..", "..", "reference", "signing-page", "server.mjs");   // dist/test → repo root
const RP = "door-card-test.shokai.invalid", ORIGIN = "https://" + RP;
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest(); const b64u = (b: Buffer) => Buffer.from(b).toString("base64url");
const freePort = () => new Promise<number>((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });

// the software authenticator (CBOR for the attestation object, COSE ES256 key), as in reference/signing-page/test/e2e.mjs
const head = (mt: number, n: number) => n < 24 ? Buffer.from([(mt << 5) | n]) : n < 256 ? Buffer.from([(mt << 5) | 24, n]) : Buffer.from([(mt << 5) | 25, n >> 8, n & 255]);
const enc = (v: any): Buffer => { if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v); if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [enc(k), enc(x)])]); throw new Error("enc"); };
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" }); const jwk = publicKey.export({ format: "jwk" }) as any; const credId = randomBytes(16);
const cose = new Map<number, any>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
let counter = 0; const authData = (withCred: boolean) => { const c = Buffer.alloc(4); c.writeUInt32BE(++counter); const base = Buffer.concat([sha256(RP), Buffer.from([withCred ? 0x45 : 0x05]), c]);
  if (!withCred) return base; const l = Buffer.alloc(2); l.writeUInt16BE(credId.length); return Buffer.concat([base, Buffer.alloc(16), l, credId, enc(cose)]); };
const assertion = (challenge: string) => { const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: ORIGIN })); const ad = authData(false);
  return { credentialId: b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(nodeSign("sha256", Buffer.concat([ad, sha256(cd)]), privateKey)) }; };

const DOOR_PURPOSES = [{ code: "presentation" as const, statement: "Brands present things to Ines." }];
const DOOR_ACTIONS = [{ action: "door.present", purposes: ["presentation" as const], level: "advise" as const, data_asks: [] }];
const cardPayload = (rep: ReturnType<typeof generateRepresentativeKey>, id: string, scope = { purposes: ["presentation"], actions: ["door.present"] }) => ({
  card_id: id, protocol: PROTOCOL, representative_id: rep.id, principal: { principal_id: "$OWNER_DID", kind: "person", display_name: "Ines Calloway" },
  role: "Personal representative of Ines Calloway (my door)", standing: { tier: "standard" }, mandate_scope: scope, locales: ["en-US"],
  representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: b64u(rep.pubRaw) }, issued_at: "$NOW", expires_at: "$IN_30D",
  owner_binding: { method: "passkey_webauthn", owner_id: "$OWNER_DID", rp_id: "$RP_ID" } });

async function main() {
  console.log("SDK door card signed with the owner's passkey (F3)");
  const wren = generateRepresentativeKey();
  const tmp = mkdtempSync(join(tmpdir(), "shokai-doorcard-"));
  const items = { owner_display_name: "Ines Calloway", items: [
    { name: "1-door-card", title: "1 of 3 · Wren keeps your door", summary: ["WHAT: Wren keeps your door.", "CAN: hear brands present things to you.", "FOR: 30 days."], payload: cardPayload(wren, "card-ines-door-1") },
    { name: "2-out-card", title: "2 of 3 · Wren goes out for you", summary: ["WHAT: Wren goes out for you.", "CAN: browse shops.", "FOR: 30 days."], payload: cardPayload(wren, "card-ines-out-1", { purposes: ["visitation"], actions: ["shelf.browse"] }) },
    { name: "3-standby-door", title: "3 of 3 · Your safety slip for the door card", summary: ["WHAT: a slip that withdraws the door card when you send it.", "KEEP: until you need it."],
      payload: { card_id: "card-ines-door-1", principal_id: "$OWNER_DID", revoked_at: "$NOW", reason: "withdrawn", standby: true } } ] };
  const itemsPath = join(tmp, "items.json"); writeFileSync(itemsPath, JSON.stringify(items));
  const TOKEN = b64u(randomBytes(24)), RELAY = b64u(randomBytes(32)); const port = await freePort();
  const srv = spawn("node", [PAGE], { env: { ...process.env, PORT: String(port), RP_ID: RP, TOKEN, RELAY_SECRET: RELAY, DATA_DIR: join(tmp, "data"), ITEMS: itemsPath, TTL_MIN: "2" }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv.stdout!.once("data", r));
  const B = `http://127.0.0.1:${port}/p/${TOKEN}/api/`, H = { "X-Sign-Relay": RELAY };
  const post = async (p: string, body: unknown) => { const r = await fetch(B + p, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; };
  const doors: Door[] = [];
  try {
    const ro = (await post("register/options", {})).body;
    const regCd = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: ro.challenge, origin: ORIGIN }));
    check((await post("register/verify", { clientDataJSON: b64u(regCd), attestationObject: b64u(enc(new Map<string, any>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData(true)]]))) })).status === 200, "the owner's (software) passkey registers on the signing page");
    const bo = (await post("batch/options", { names: ["1-door-card", "2-out-card"] })).body;
    check((await post("batch/verify", assertion(bo.challenge))).status === 200, "one tap approves both cards (A.1, C195)");
    const so = (await post("sign/options", {})).body;
    check(so.name === "3-standby-door" && (await post("sign/verify", assertion(so.challenge))).status === 200, "the safety slip is approved on its own tap");
    const file = (n: string) => readFileSync(join(tmp, "data", "signed", n + ".json"), "utf8");
    const doorCardFile = file("1-door-card"); const doorCard = fromSigningPage<any>(doorCardFile) as any; const slip = fromSigningPage<any>(file("3-standby-door")) as any;
    const owner = doorCard.payload.principal.principal_id as string;
    check(doorCard.signatures[0].alg === "ES256" && doorCard.signatures[0].webauthn.batch?.length === 2 && doorCard.signatures[0].webauthn.batch_index === 0, "the page wrote the door card with a one-tap (batch) passkey signature");

    // 1. accepted: the page's file as is, verified the way a door verifies a visitor's card
    const open = (o: any = {}) => { const d = createDoor({ name: "door-ines", displayName: "Ines's door", category: "x-inbound-door" as any, purposes: DOOR_PURPOSES, actions: DOOR_ACTIONS,
      keys: { rep: wren }, card: JSON.parse(doorCardFile), ownerRpId: RP, ...o }); doors.push(d); return d; };
    const thrown = (f: () => unknown) => { try { f(); return null; } catch (e: any) { return e; } };
    const door = open(); check(door.principalId === owner && door.repId === wren.id && door.host.cfg.card === door.host.cfg.card && door.listing().places[0]?.principal_id === owner,
      "createDoor accepts the passkey-signed door card (the signing page's file as is); its principal is the owner, its representative Wren");
    check(verifyDoorCard(doorCard, { representativeId: wren.id, rpId: RP }).ok, "verifyDoorCard: the batch signature, owner binding, rp_id, dates and key all verify");
    const wire: Transport = async (_u, body) => (await door.post(body)).envelope;
    const brand = createRepresentative({ ownerName: "Harbor Lane Coats (fictional)", kind: "company", purposes: ["presentation"], actions: ["door.present"] });
    const v = await brand.visit({ entry: door.entry, representative_id: door.repId, principal_id: owner, display_name: "Ines's door" } as any, { purpose: "presentation", actions: ["door.present"], transport: wire });
    check(v.placeCheck.ok && v.placeCheck.checked.includes("card signed by the listed principal_id"), "a visiting representative checks the door's card: signed by Ines's passkey, the principal its listing names");
    // one-by-one signature format (no batch), from a software passkey: also accepted
    const solo = developmentPasskey(); const fill = (x: any) => JSON.parse(JSON.stringify(x).replaceAll("$OWNER_DID", solo.id).replaceAll("$RP_ID", solo.rpId)
      .replaceAll("$NOW", new Date(Date.now() - 60e3).toISOString().replace(/\.\d+Z$/, "Z")).replaceAll("$IN_30D", new Date(Date.now() + 30 * 864e5).toISOString().replace(/\.\d+Z$/, "Z")));
    const soloCard = sign(fill(cardPayload(wren, "card-solo-door")), solo);
    check(!thrown(() => open({ card: soloCard, ownerRpId: solo.rpId })), "a card signed item by item (one tap per item) is accepted too");

    // 2. tampered: rejected
    const t1 = JSON.parse(doorCardFile); t1.signed.payload.mandate_scope.actions.push("door.read_private_note");
    check(thrown(() => open({ card: t1 }))?.code === SHOKAI_DOOR_CARD_INVALID, "a tampered card (an action added after signing) is rejected: SHOKAI_DOOR_CARD_INVALID");
    const t2 = JSON.parse(doorCardFile); t2.signed.payload.principal.display_name = "Ines Calloway (verified)"; t2.signed.payload_digest = (sign(t2.signed.payload, solo) as any).payload_digest;
    check(thrown(() => open({ card: t2 }))?.code === SHOKAI_DOOR_CARD_INVALID, "a tampered card with a recomputed digest is rejected (the passkey signature no longer covers it)");
    const t3 = JSON.parse(doorCardFile); t3.signed.signatures[0].webauthn.batch_index = 1;
    check(thrown(() => open({ card: t3 }))?.code === SHOKAI_DOOR_CARD_INVALID, "a one-tap signature pointed at another item of the batch is rejected");
    check(thrown(() => open({ ownerRpId: "sign.example.com" }))?.code === SHOKAI_DOOR_CARD_INVALID, "a card signed for another signing origin than the one expected is rejected");
    check(thrown(() => open({ keys: { rep: generateRepresentativeKey() } }))?.code === SHOKAI_DOOR_CARD_INVALID, "a card for another representative key is rejected");
    check(thrown(() => open({ actions: [...DOOR_ACTIONS, { action: "door.gift", purposes: ["presentation"], level: "advise", data_asks: [] }] }))?.code === SHOKAI_DOOR_CARD_INVALID, "a door offering an action its card doesn't cover is rejected");
    const imp = developmentPasskey(); const forgedCard = sign({ ...doorCard.payload }, imp);
    check(thrown(() => open({ card: forgedCard }))?.code === SHOKAI_DOOR_CARD_INVALID, "a card naming Ines but signed by someone else's passkey is rejected");

    // 3. withdrawn: refused
    check(thrown(() => open({ cardRevocations: [slip] }))?.code === SHOKAI_DOOR_CARD_REVOKED, "with Ines's signed safety slip, the card is refused: SHOKAI_DOOR_CARD_REVOKED");
    const fakeSlip = signCardRevocation(imp, sign({ ...doorCard.payload, principal: { ...doorCard.payload.principal, principal_id: imp.id } }, imp) as any);
    check(!thrown(() => open({ cardRevocations: [{ ...fakeSlip, payload: { ...fakeSlip.payload } }] })), "a revocation signed by anyone else doesn't withdraw it");
    const forgedRev = sign({ card_id: "card-ines-door-1", principal_id: owner, revoked_at: new Date().toISOString().replace(/\.\d+Z$/, "Z") }, imp);
    const courier = createRepresentative({ ownerName: "Bo Arden (fictional)", purposes: ["presentation"], actions: ["door.present"] });
    const cv = await courier.visit({ entry: door.entry, representative_id: door.repId, principal_id: owner, display_name: "Ines's door" } as any, { purpose: "presentation", actions: ["door.present"], transport: wire });
    await cv.send(cv.message("card_revocation", { type: "card_revocation", revocation: forgedRev }));
    check(!door.cardWithdrawn && door.listing().places.length === 1 && !door.withdrawCard(forgedRev), "a forged card_revocation, delivered in a visit or handed to the door, changes nothing");
    await cv.send(cv.message("card_revocation", cardRevocationMessage(slip)));
    check(door.cardWithdrawn && door.listing().places.length === 0, "Ines's slip, delivered by any visitor in a visit, withdraws the running door: its listing is empty");
    const after = await door.post({ hello: "anyone there?" });
    check(after.status === 503 && after.envelope.messages.length === 0 && after.retryAfter === 86400, "a withdrawn door answers no one (503, an empty envelope, retry in a day) until it's started with a new card");
    const d2 = open(); check(d2.withdrawCard(JSON.parse(file("3-standby-door"))) && d2.cardWithdrawn, "on the owner's own computer, door.withdrawCard() takes the slip file as is");
  } finally { srv.kill("SIGTERM"); rmSync(tmp, { recursive: true, force: true }); }
  console.log(`${pass} SDK door card checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
