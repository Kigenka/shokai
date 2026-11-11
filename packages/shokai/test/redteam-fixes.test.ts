// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, red team phase 1 fixes (2026-11-03, provisional): https-only door addresses (C269), the published Shōkai host card checked
// before the visitor shows its own (C268), and context requests checked against the signed house summary (C267). In process; fictional people.
import { createDoor, createRepresentative, inProcess, secureEntry, type Door, type DoorOptions, type Transport } from "../src/index.js";
import type * as S from "../src/core/shapes.js";
import { makeSigned } from "../src/core/crypto.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "taste-blend", displayName: "The Taste Blend table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });
const NEED: S.ContextRequirements = { mode: "before_entry", retention_days: 0, fields: [{ name: "favorite_food", what: "A food you love", why: "To pair tastes at the table.", required: true }] };
const sentCard = (v: any) => v.transcript.some((m: any) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "card_presentation");

async function main() {
  console.log("SDK red team phase 1 fixes");
  // C269: https.
  check(secureEntry("https://shop.example/shokai") && secureEntry("http://127.0.0.1:5170/x") && secureEntry("http://localhost/x") && secureEntry("http://[::1]:8/x"), "https and loopback http are secure entries");
  check(!secureEntry("http://shop.example/shokai") && !secureEntry("http://127.0.0.1.evil.example/x") && !secureEntry("ftp://shop.example/") && !secureEntry("nonsense"), "plain http elsewhere (and lookalikes of loopback) are not");
  const mk = (o: Partial<DoorOptions>) => { try { createDoor(opts(o)); return "ok"; } catch (e) { return (e as any).code ?? String(e); } };
  check(mk({ testProfile: false, baseUrl: "http://shop.example/shokai" }) === "SHOKAI_DOOR_INSECURE", "a door won't start on plain http outside loopback (C269)");
  check(mk({ testProfile: false, baseUrl: "https://shop.example/shokai" }) === "ok" && mk({ testProfile: false, baseUrl: "http://127.0.0.1:5171/shokai" }) === "ok", "https, or loopback for local work, starts");
  const mio = createRepresentative({ ownerName: "Mio", purposes: ["inquiry"], actions: ["concierge.talk"] });
  const plain = await mio.visit({ entry: "http://shop.example/shokai/places/x/entry", representative_id: "did:key:z6MkfictionalHostRepresentative", principal_id: "did:key:z6MkfictionalPrincipal" },
    { purpose: "inquiry", actions: ["concierge.talk"] });
  check(!plain.placeCheck.ok && /isn't https/.test(plain.placeCheck.why ?? "") && plain.transcript.length === 0, "the visitor doesn't even greet a plain-http entry elsewhere: nothing is sent (C269)");

  // C268: the published host card, before the visitor's card.
  const door = createDoor(opts()); const other = createDoor(opts({ name: "lookalike" }));
  // Made before Mio's first visit: Mio keeps the errand's mandate across visits (C175), and a memory-only door refuses a mandate valid
  // before it started (refuse-on-loss, §3.6). Made later, the C267 visit below failed whenever a second boundary fell between the two.
  const table = createDoor(opts({ name: "ctx-table", policy: { context_requirements: NEED } as any }));
  const ok = await mio.visit(door, { purpose: "inquiry", actions: ["concierge.talk"] });
  check(ok.seated && ok.placeCheck.checked.some((c) => /published Shōkai host card/.test(c)), "a door's published host card checks out before the visitor shows its card; seated");
  const swap = (d: Door, getJson: (u: string) => Promise<unknown>): Transport => Object.assign(inProcess(d), { getJson });
  const real = inProcess(door) as any;
  const wrong = await mio.visit(door.listing().places[0], { purpose: "inquiry", actions: ["concierge.talk"], transport: swap(door, async (u) => u.endsWith("/host-card.json") ? (other as any).host.hostCardPublic().body : real.getJson(u)) });
  check(!wrong.placeCheck.ok && /published Shōkai host card doesn't check out/.test(wrong.placeCheck.why ?? "") && !sentCard(wrong), "another place's card published at this entry: the visit ends before the visitor's card is shown");
  const none = await mio.visit(door.listing().places[0], { purpose: "inquiry", actions: ["concierge.talk"], transport: swap(door, async (u) => { if (u.endsWith("/host-card.json")) throw new Error("HTTP 404"); return real.getJson(u); }) });
  check(!none.placeCheck.ok && !sentCard(none), "no published host card from a shokai/0.5 door: the visit ends before the visitor's card is shown");
  // Review 7 R7-01 (C292, visitor side): a door whose own possession proof names another party (a relay) ends the visit, nothing requested.
  const relayed: Transport = Object.assign(async (u: string, body: unknown) => { const r = await real(u, body) as S.ReplyEnvelope;
    return { ...r, messages: r.messages.map((m: any) => m.payload?.type === "card_presentation" ? makeSigned({ ...m.payload, possession_proof: { ...m.payload.possession_proof, audience: "did:key:z6MkSomeOtherVisitor" } }, door.keys.rep, m.payload.sent_at) : m) } as S.ReplyEnvelope; }, { getJson: (u: string) => real.getJson(u) });
  const rv = await mio.visit(door.listing().places[0], { purpose: "inquiry", actions: ["concierge.talk"], transport: relayed });
  check(!rv.seated && !rv.placeCheck.ok && /isn't addressed to me/.test(rv.placeCheck.why ?? "") && !rv.transcript.some((m: any) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "invitation_request"), "C292 visitor side: a door's proof addressed to another party ends the visit before any request (R7-01)");

  // C267: a context request is checked against the signed house summary.
  const v = await mio.visit(table, { purpose: "inquiry", actions: ["concierge.talk"] });
  check(!!v.contextRequest && v.contextRequestRefusal().length === 0, "a request that matches the signed house summary is brought home");
  (v as any).response.context_request = { ...(v as any).response.context_request, fields: [...NEED.fields!, { name: "home_city", what: "Your city", why: "Curious." }] };
  check(!v.contextRequest && v.contextRequestRefusal().includes("undeclared_field:home_city") && /more about you than its signed house rules declare/.test(v.report().outcome_rendered.text), "a request for a field the owner never signed: not brought home, and the report says why");
  (v as any).response.context_request = { ...(v as any).response.context_request, fields: NEED.fields, mode: "admit_then_request" };
  check(!v.contextRequest && v.contextRequestRefusal().includes("mode"), "a request in another mode than the signed one: not brought home");
  // v0.5.1 (§6.12, V05-F10-03): a request that asks for a password is not brought home, and the report says so.
  (v as any).response.context_request = { ...(v as any).response.context_request, fields: [{ name: "account_password", what: "Your account password", why: "To link your order history.", required: true }] };
  check(!v.contextRequest && v.contextRequestRefusal().includes("credential_field:account_password") && /password, a recovery phrase or seed, or a card number/.test(v.report().outcome_rendered.text),
    "a request that asks for a password: not brought home, and the report names the ask");
  console.log(`red team fixes: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
