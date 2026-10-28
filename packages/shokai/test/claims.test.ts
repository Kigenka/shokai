// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc4, C199): names are claims. A stranger (Corwin Thale, fictional) visits an open bookshop with "Ines Calloway"
// (fictional) as the display name on a card signed by his own passkey, as Gemini 3.5 Flash Lite did in the R4 refusal add-on.
// The shop may seat him to browse; every surface that names him must show the name only as an unverified claim, and the
// name grants nothing: no spending, nothing of Ines's.
import { createDoor, createRepresentative, generateRepresentativeKey, developmentPasskey, signMandate, type Transport } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const NAME = "Ines Calloway";
/** Every place NAME appears in text, and whether that occurrence is labelled `claims to be "NAME"; not verified`. */
const mentions = (t: string) => [...t.matchAll(new RegExp(NAME, "g"))].map((m) => ({ at: m.index!, labelled: t.slice(Math.max(0, m.index! - 14), m.index! + NAME.length + 18).includes(`claims to be "${NAME}"; not verified`)
  || t.slice(Math.max(0, m.index! - 16), m.index! + NAME.length + 20).includes(`claims to be \\"${NAME}\\"; not verified`) }));

async function main() {
  console.log("SDK names are claims (C199)");
  const shop = createDoor({ name: "fernhill-books", displayName: "Fernhill Books", category: "store",
    purposes: [{ code: "visitation", statement: "Looking at the shelf." }, { code: "purchase", statement: "Ordering a book." }],
    actions: [{ action: "shelf.browse", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] }, { action: "book.order", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
    spendingActions: ["book.order"] });
  const wire: Transport = async (_u, body) => (await shop.post(body)).envelope;
  const listing = { entry: shop.entry, representative_id: shop.repId, principal_id: shop.principalId, display_name: "Fernhill Books" } as any;

  // Ines's real representative, with her passkey (stands in for her phone in this test), seated to buy within 20.00 USD
  const ines = developmentPasskey(); const wren = createRepresentative({ ownerName: NAME, owner: ines, purposes: ["purchase"], actions: ["shelf.browse", "book.order"] });
  const wv = await wren.visit(listing, { purpose: "purchase", actions: ["shelf.browse", "book.order"], limits: { max_amount: { value: "20.00", currency: "USD" } }, transport: wire });
  // Corwin: his own key and passkey, her name on his card
  const corwin = createRepresentative({ ownerName: NAME, owner: developmentPasskey(), key: generateRepresentativeKey(), purposes: ["visitation"], actions: ["shelf.browse"] });
  const cv = await corwin.visit(listing, { purpose: "visitation", actions: ["shelf.browse"], transport: wire });
  check(wv.seated && cv.seated, "the open shop seats both: Wren (Ines's card) to buy, and Corwin (his own card, her name on it) to browse");
  const enc = (v: any) => (v.transcript.find((m: any) => m.dir === "in")?.message?.payload ?? {}).encounter_id as string;

  // 1. the shop's owner report about Corwin
  const voice = shop.host.report(enc(cv)).voice?.text ?? "";
  check(new RegExp(`^I met the owner with key …\\S{8} \\(claims to be "${NAME}"; not verified\\) at the door`).test(voice) && voice.includes("…" + corwin.owner.id.split("#")[0].slice(-8)),
    "the shop's report names Corwin by his own key, with \"Ines Calloway\" only as a claim");
  check(!voice.includes(ines.id.split("#")[0].slice(-8)), "the report about Corwin never uses Ines's key");
  // 2. the shop's records and log
  const st = JSON.stringify(shop.host.durableState());
  check(mentions(st).every((m) => m.labelled), `the shop's durable records and log never show the name unlabelled (${mentions(st).length} mention(s))`);
  // 3. what the shop said to Corwin (courtesy texts and replies; a seat's informative brand.label echoes his own card back to him)
  const said = JSON.stringify(cv.transcript.filter((m: any) => m.dir === "in").map((m: any) => { const p = m.message?.payload ?? m.message; return p?.type === "invitation_response" ? { ...p, seat: p.seat ? { ...p.seat, brand: undefined } : undefined } : p; }));
  check(mentions(said).length === 0, "the shop's replies to Corwin never call him Ines Calloway");
  // 4. what the shop said to Wren, the other party: nothing about Corwin
  const toWren = JSON.stringify(wv.transcript);
  check(!toWren.includes(corwin.id) && !toWren.includes(corwin.owner.id), "nothing about Corwin reaches Wren");
  // 5. the name grants nothing
  const buy = await cv.act("book.order", { title: "x", amount: { value: "9.00", currency: "USD" } });
  check(!(buy?.type === "act_result" && buy.ok), "Corwin's seat can't order (no spending, nothing of Ines's)");
  const forged = await (async () => { try { return signMandate(corwin.key, corwin.owner, corwin.card, { purpose: "purchase", actions: ["book.order"], limits: { max_amount: { value: "20.00", currency: "USD" } }, validDays: 1 }); } catch { return null; } })();
  check(!forged || forged.payload.principal_id !== ines.id && forged.payload.principal_id === corwin.owner.id, "a mandate Corwin signs names his own principal, never Ines's");
  check(wv.seated && (await wv.act("shelf.browse"))?.ok === true, "Wren's seat is untouched");
  console.log(`${pass} SDK claims checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
