// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, red team phase 1 (L3): a place's own words (its display name, its reasons) never reach the owner's report carrying
// bidi overrides, isolates, zero-width or tag characters. In process; fictional people; no network.
import { createDoor, createRepresentative, placeLabel, sitePlaceLabel } from "../src/index.js";
import { stripInvisible } from "../src/outside.js";

const BIDI = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]|[\u{e0000}-\u{e007f}]/u;
let fail = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fail++; console.error("FAIL", m); } };

async function main() {
  const evil = "Harborlight Savings & Trust\u202E.evil.example\u2066x\u2069\u200B\u{E0041}";
  ok(!BIDI.test(stripInvisible(evil)), "stripInvisible removes bidi, zero-width and tag characters");
  ok(stripInvisible("Café Mañana") === "Café Mañana", "ordinary text is unchanged");
  ok(!BIDI.test(placeLabel(undefined, evil, false)), "placeLabel strips them");
  ok(!BIDI.test(placeLabel("did:key:z6MkExampleKey12345678", evil, true)), "placeLabel (verified key) strips them");
  ok(!BIDI.test(sitePlaceLabel("https://harborlight.example", evil)), "sitePlaceLabel strips them");

  // End to end: a door whose display name carries an RLO; the owner's report has none.
  let door;
  try {
    door = createDoor({ approvedBy: { name: "Mallory", role: "Owner" }, name: "harborlight", displayName: evil, category: "store",
      purposes: [{ code: "inquiry", statement: "Look\u202E around." }], actions: [{ action: "menu.view", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true } as any);
  } catch { ok(true, "door refused the name (also safe)"); }
  if (door) {
    const rep = createRepresentative({ ownerName: "Ines", purposes: ["inquiry"], actions: ["menu.view"] } as any);
    const v = await (rep as any).visit(door, { purpose: "inquiry", actions: ["menu.view"], mandate: { fresh: true } });
    const out = JSON.stringify(v.report());
    ok(!BIDI.test(out), "the owner's report carries no bidi or invisible character");
    ok(out.includes("Harborlight Savings & Trust"), "the place's name is still shown");
  }
  console.log(`bidi: ${n - fail}/${n} checks passed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
