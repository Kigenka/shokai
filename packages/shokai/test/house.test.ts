// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 drop-in door): house.json, the one file both ways in write. checkHouse, the preview the owner reads, the
// host-card request the owner signs (here with a stand-in passkey), and the door it opens. Fictional people and places only.
import { readFileSync } from "node:fs";
import { createDoor, createRepresentative, checkHouse, houseToDoorOptions, previewHouse, hostCardRequest, fillHostCardItem, signHostCardForDevelopment,
  houseDigestFor, developmentPasskey, generateRepresentativeKey, representativePublic, leaflet, leafletHtml, SHOKAI_HOUSE_CHANGED, type House } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const thrown = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };
const HOUSE: House = JSON.parse(readFileSync(new URL("../../../../examples/drop-in/house.kettle.json", import.meta.url), "utf8"));
const local = (h: House): House => ({ ...h, door: { ...h.door, base_url: "http://127.0.0.1:0/shokai" } });
const edit = (f: (h: any) => void): any => { const h = JSON.parse(JSON.stringify(HOUSE)); f(h); return h; };
const at = (h: any) => checkHouse(h).map((p) => p.path);

async function main() {
  console.log("SDK house.json (v0.4.0)");
  check(checkHouse(HOUSE).length === 0, "the example house.json passes checkHouse");
  check(at(edit((h) => { h.leaflet.about += " Our teas are certified organic."; })).includes("leaflet.about"), "the place's own words: \"certified\" is flagged (Shōkai checks signatures, not places)");
  check(at(edit((h) => { h.leaflet.closing = "Bring your credit card next time."; })).includes("leaflet.closing"), "… and so is asking for payment details");
  check(at(edit((h) => { delete h.offers.actions[1].limits; })).includes("offers.actions[1].limits.max_amount"), "a spending action needs a cap per pass");
  check(at(edit((h) => { h.offers.actions[1].data_asks = ["payment_method"]; })).includes("offers.actions[1].data_asks[0]"), "a door never asks for payment details as a data ask");
  check(at(edit((h) => { h.preset = "strict"; })).includes("introducers"), "strict needs named introducers");
  check(at(edit((h) => { h.door.base_url = "http://kettle.example/shokai"; })).includes("door.base_url") && at(edit((h) => { h.door.base_url = "https://kettle.example"; })).includes("door.base_url"), "the door's base URL: https, with a path");
  check(at(edit((h) => { h.owner.kind = "organization"; })).includes("owner.approver"), "an organization names who approved its Shōkai host card");
  check(at(edit((h) => { h.offers.actions[0].purposes = ["support"]; })).includes("offers.actions[0].purposes"), "an action's purposes must be offered");
  check(thrown(() => houseToDoorOptions(edit((h) => { h.place.name = "Kettle Leaf"; })))?.code === "SHOKAI_HOUSE_INVALID", "houseToDoorOptions refuses a house with problems");

  const preview = previewHouse(HOUSE);
  check(preview.includes("Kettle & Leaf (store): a Shōkai door at https://kettle.example/shokai") && preview.includes("tea.order (act on behalf; for purchase), spending at most 60.00 USD per pass, asking for name, address")
    && preview.includes("The door stays closed for now. Don't worry.") && preview.includes("*Suzu, host representative, for Kettle & Leaf*"), "previewHouse: the rules in plain words, then the whole leaflet");
  check(!/\b(certif|bouncer|interview|bot)\b/i.test(preview) && !/(?<!Shōkai (visitor|host|invitation) )\bcards?\b/.test(preview.replace(/Shōkai (visitor|host|invitation) card/g, "")), "the preview follows the copy rules (no bare \"card\", no banned words)");

  // the owner signs the host card (stand-in passkey here); the door opens with it
  const owner = developmentPasskey(); const rep = generateRepresentativeKey();
  const req = hostCardRequest(local(HOUSE), representativePublic(rep));
  const flat = JSON.stringify(req);
  check(req.items[0].payload && (req.items[0].payload as any).house_digest === "$HOUSE_DIGEST" && (req.items[0].payload as any).principal.principal_id === "$OWNER_DID", "hostCardRequest: the owner's DID and the house digest are filled in only when the owner's passkey exists");
  check(!/"(priv|d)"\s*:/.test(flat) && !flat.includes("shokai-ed25519-pkcs8:"), "… and the request carries no private key");
  const card = signHostCardForDevelopment(req, owner);
  const opts = houseToDoorOptions(local(HOUSE), { card, keys: { rep }, ownerRpId: owner.rpId });
  const { houseDigest } = fillHostCardItem(req.items[0], owner.id, owner.rpId);
  check(houseDigest === houseDigestFor(houseToDoorOptions(local(HOUSE)), owner.id, "http://127.0.0.1:0/shokai"), "the request's house digest is exactly houseDigestFor() of the same house");
  const door = createDoor(opts);
  check(door.hostCardProblem === null && door.listing().places[0].house_digest === houseDigest, "the door opens with the owner-signed Shōkai host card");
  const brief: any = (await door.post("hello")).envelope.messages.map((m: any) => m.payload ?? m).find((p: any) => p.type === "lobby_briefing");
  check(JSON.stringify(brief).includes("Kettle & Leaf is a small tea shop") && JSON.stringify(brief).includes("Suzu, host representative, for Kettle & Leaf"), "an agent without a Shōkai visitor card gets the leaflet, signed off by the host representative");
  check(door.onboardingPage() === leafletHtml(leaflet({ ...opts.leaflet!, placeName: "Kettle & Leaf" }), "Kettle & Leaf"), "<base>/start is the same leaflet");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation", "purchase"], actions: ["tea.browse", "tea.order"] });
  check((await aya.visit(door, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } })).seated, "a visiting representative with a Shōkai visitor card is admitted with a pass");
  const changed = edit((h) => { h.leaflet.closing = "The kettle is always on."; });
  check(thrown(() => createDoor(houseToDoorOptions(local(changed), { card, keys: { rep }, ownerRpId: owner.rpId })))?.code === SHOKAI_HOUSE_CHANGED, "one word of the leaflet changed after signing: the door won't open (SHOKAI_HOUSE_CHANGED)");
  check(thrown(() => signHostCardForDevelopment(req, { ...owner, rpId: "kettle.com" })) !== null, "signHostCardForDevelopment refuses anything but a reserved test name");

  console.log(`${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
