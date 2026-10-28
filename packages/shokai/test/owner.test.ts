// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK owner helpers (v0.3.0-rc4): card revocation (§2.6), owner links (§2.8), and signing with a real passkey through the browser
// module (Appendix A.1), here with a software authenticator standing in for the browser. Fictional place and owner only.
import { createDoor, createRepresentative, signCardRevocation, signOwnerLink, passkeyRequest, signedFromPasskeyAssertion, verifySigned,
  developmentPasskey, digestOf as nodeDigest, exportRepresentativeKey, importRepresentativeKey, generateRepresentativeKey, sign as sdkSign, signCard,
  type Door, type Transport } from "../src/index.js";
import { jcs as browserJcs, digestOf as browserDigest, signWithPasskey } from "../src/browser.js";
import { newEd25519, signPasskey, b64u, sha256, jcs } from "../src/core/crypto.js";
import { verifyOwnerLink } from "../src/core/trust.js";
import { RealVerifier } from "../src/core/verify.js";
import { sign as nodeSign } from "node:crypto";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const keys = { rep: newEd25519(), principal: newEd25519() };
const shop = (): Door => createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store", keys,
  purposes: [{ code: "visitation", statement: "Looking at the menu." }], actions: [{ action: "menu.view", purposes: ["visitation"], level: "discover", data_asks: [] }] });
const direct = (d: Door): Transport => async (_u, body) => (await d.post(body)).envelope;

async function main() {
  console.log("SDK owner helpers (@kigenka/shokai)");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["menu.view"] });
  // revocation
  const rev = signCardRevocation(aya.owner, aya.card, { reason: "key_lost" });
  check(verifySigned(rev, { expectSigner: aya.owner.id }).ok && rev.payload.card_digest === aya.card.payload_digest && rev.payload.reason === "key_lost", "a card revocation is signed by the card's principal and names the card's digest");
  let threw = false; try { signCardRevocation(developmentPasskey(), aya.card); } catch { threw = true; }
  check(threw, "someone other than the card's principal can't revoke it");
  check(signCardRevocation(aya.owner, aya.card, { standby: true }).payload.standby === true, "a standby revocation can be signed now and kept for later");
  const d = shop();
  const before = await aya.visit(d.listing().places[0], { purpose: "visitation", actions: ["menu.view"], transport: direct(d) });
  check(before.seated, "before the revocation the representative is seated");
  check(d.host.acceptCardRevocation(rev) === true, "the door accepts the owner's revocation");
  const after = await aya.visit(d.listing().places[0], { purpose: "visitation", actions: ["menu.view"], transport: direct(d) });
  check(!after.seated, "after the revocation the same card is not seated (§2.6, C191)");
  // owner link
  const facetA = developmentPasskey(), facetB = developmentPasskey();
  const link = signOwnerLink(facetA, facetB, { audience: keys.principal.id, validDays: 90 });
  const v = verifyOwnerLink(new RealVerifier(), link, { audience: keys.principal.id, principal: facetA.id, now: new Date().toISOString().replace(/\.\d+Z$/, "Z"), rpOf: () => facetA.rpId });
  check(v.ok && v.other === facetB.id && link.signatures.length === 2, "an owner link carries both passkey signatures and verifies for its audience (C196)");
  threw = false; try { signOwnerLink(facetA, facetB, { audience: keys.principal.id, validDays: 401 }); } catch { threw = true; }
  check(threw, "an owner link can't last more than 400 days");
  // browser module and real-passkey round trip
  const payload = { b: [1, "x", { z: true, a: null }], a: "Shōkai" };
  check(browserJcs(payload) === jcs(payload) && (await browserDigest(payload)) === nodeDigest(payload), "the browser module's JCS and digest match the SDK byte for byte");
  const owner = developmentPasskey();
  const req = passkeyRequest(payload, { rpId: owner.rpId });
  check(req.publicKey.challenge === req.payload_digest.slice(8) && req.publicKey.userVerification === "required", "passkeyRequest: the challenge is the digest (A.1), user verification required");
  // a software authenticator in place of navigator.credentials.get
  const g = globalThis as any; const prevNav = g.navigator;
  Object.defineProperty(g, "navigator", { configurable: true, value: { credentials: { get: async (o: any) => {
    const challenge = b64u(Buffer.from(o.publicKey.challenge)); const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "https://" + o.publicKey.rpId }));
    const ad = Buffer.concat([sha256(o.publicKey.rpId), Buffer.from([0x05]), Buffer.from([0, 0, 0, 1])]);
    const sig = nodeSign("sha256", Buffer.concat([ad, sha256(cd)]), owner.priv);
    return { rawId: new Uint8Array(16).buffer, response: { clientDataJSON: cd, authenticatorData: ad, signature: sig } }; } } } });
  try {
    const { payload_digest, assertion } = await signWithPasskey(payload, { rpId: owner.rpId });
    const env = signedFromPasskeyAssertion(payload, assertion, { ownerDid: owner.id, rpId: owner.rpId });
    check(payload_digest === env.payload_digest && verifySigned(env, { expectSigner: owner.id, rpId: owner.rpId }).ok, "signWithPasskey → signedFromPasskeyAssertion: a real-passkey-shaped signature that verifies");
    threw = false; try { signedFromPasskeyAssertion({ ...payload, a: "changed" }, assertion, { ownerDid: owner.id, rpId: owner.rpId }); } catch { threw = true; }
    check(threw, "an assertion over another payload is refused before it is used");
  } finally { Object.defineProperty(g, "navigator", { configurable: true, value: prevNav }); }
  void signPasskey;

  // Keeping the representative's key (R4 reader friction): one line of text for a keyring, back to the same did:key.
  const k = generateRepresentativeKey(); const line = exportRepresentativeKey(k); const back = importRepresentativeKey(line + "\n");
  const env = sdkSign({ note: "kept" }, back);
  check(back.id === k.id && back.key_id === k.key_id && /^shokai-ed25519-pkcs8:[A-Za-z0-9_-]+$/.test(line) && verifySigned(env, { expectSigner: k.id }).ok,
    "exportRepresentativeKey → importRepresentativeKey gives back the same did:key, and what it signs verifies as the original key");
  const bad = (t: string) => { try { importRepresentativeKey(t); return ""; } catch (e) { return (e as Error).message; } };
  const m1 = bad("hello"), m2 = bad("shokai-ed25519-pkcs8:" + "QUJDRA"), m3 = bad(exportRepresentativeKey(k).replace(/.$/, "") + "");
  check(!!m1 && !!m2 && !m1.includes("hello") && !m2.includes("QUJDRA") && !!m3 && !m3.includes(line.slice(25, 45)), "anything else is refused, and the error never echoes what it was given");
  const dev = createRepresentative({ ownerName: "Pia Lund", purposes: ["visitation"], actions: ["menu.list"] });
  const pia = developmentPasskey(); const card = signCard(k, pia, { displayName: "Pia Lund", purposes: ["visitation"], actions: ["menu.list"], validDays: 90 });
  const real = createRepresentative({ ownerName: "Pia Lund", purposes: ["visitation"], actions: ["menu.list"], key: back, owner: pia, card });
  const days = (Date.parse(card.payload.expires_at) - Date.parse(card.payload.issued_at)) / 86400e3;
  const defDays = (Date.parse(dev.card.payload.expires_at) - Date.parse(dev.card.payload.issued_at)) / 86400e3;
  check(dev.isDevelopmentOwner && !real.isDevelopmentOwner && real.key.id === k.id && Math.round(days) === 90 && Math.round(defDays) === 180,
    "createRepresentative says when its card was self-signed by a development stand-in (isDevelopmentOwner); validDays: 90 gives a 90-day card (default 180)");
  console.log(`${pass} SDK owner checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
