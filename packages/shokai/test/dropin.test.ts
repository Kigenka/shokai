// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 drop-in door): the leaflet template, presets, an async store shared by two instances, the event hook, and
// door.fetch() (the Web Request/Response adapter). In process; fictional people only.
import { createDoor, createRepresentative, leaflet, leafletProblems, memoryStore, fileStore, kvStore, PRESETS, LEAFLET_TEMPLATE, WELL_KNOWN_PATH,
  type DoorOptions, type DoorEvent } from "../src/index.js";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const thrown = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };
const USD = (value: string) => ({ value, currency: "USD" });
const LEAF = { about: "Kettle & Leaf is a small tea shop. We sell loose-leaf teas by the gram and ship within the country.", placeQuestions: ["Which teas does your owner like?"], closing: "The kettle will be on when you come back.", hostName: "Suzu" };
const kettle = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], approvedBy: { name: "Suzu", role: "Owner" }, baseUrl: "http://127.0.0.1:0/shokai", leaflet: LEAF, ...o });

async function main() {
  console.log("SDK drop-in door (v0.4.0)");
  // the leaflet
  const l = leaflet({ ...LEAF, placeName: "Kettle & Leaf" });
  check(l.template === LEAFLET_TEMPLATE && l.markdown.startsWith("## The door stays closed for now. Don't worry.") && l.markdown.includes("### About this place\n\nKettle & Leaf is a small tea shop.") && l.markdown.trimEnd().endsWith("*Suzu, host representative, for Kettle & Leaf*"),
    "leaflet(): the shared text, then About this place in the owner's words, signed off by the host representative");
  check(leafletProblems({ ...LEAF, about: "Short." }).length === 1 && leafletProblems({ ...LEAF, about: LEAF.about + " See https://x.example" }).some((p) => /no links/.test(p))
    && leafletProblems({ ...LEAF, placeQuestions: ["Tell me your name."] }).some((p) => /ending with "\?"/.test(p)) && leafletProblems({ ...LEAF, placeQuestions: ["a?", "b?", "c?", "d?"] }).length === 1 && leafletProblems(LEAF).length === 0,
    "leafletProblems(): length, links, questions that aren't questions, too many questions; none for a good leaflet");
  const door = createDoor(kettle());
  const pol = door.host.cfg.policy as any;
  check(pol.lobby.about["en-US"] === l.about && pol.lobby.how["en-US"] === l.how, "the leaflet is the lobby's about and how: inside the house config the Shōkai host card fingerprints (§2.3)");
  const prose = await door.post("hello, can I buy tea?");
  const brief: any = prose.envelope.messages.map((m: any) => m.payload ?? m).find((p: any) => p.type === "lobby_briefing");
  check(prose.status === 200 && !!brief && JSON.stringify(brief).includes("Kettle & Leaf is a small tea shop"), "an agent without a Shōkai visitor card gets the lobby briefing carrying the leaflet");
  const start = await door.fetch(new Request("http://127.0.0.1:0/shokai/start"));
  const html = await start.text();
  check(start.status === 200 && /text\/html/.test(start.headers.get("content-type") ?? "") && html.includes("<h1>The door stays closed for now. Don&#39;t worry.</h1>".replace("&#39;", "'")) && html.includes("<em>Suzu, host representative, for Kettle &amp; Leaf</em>"),
    "door.fetch(GET <base>/start): the leaflet page");

  // door.fetch(): the §11.1 binding over Web Request/Response
  const ptr = await (await door.fetch(new Request("http://127.0.0.1:0" + WELL_KNOWN_PATH))).json() as any;
  check(ptr.type === "door_pointer" && JSON.stringify(ptr) === JSON.stringify(door.pointer()), "door.fetch(GET /.well-known/shokai): the DoorPointer, the same as GET <base>/");
  const places = await (await door.fetch(new Request("http://127.0.0.1:0/shokai/places"))).json() as any;
  check(places.places?.[0]?.house_digest === door.listing().places[0].house_digest, "door.fetch(GET <base>/places): the listing");
  const nf = await door.fetch(new Request("http://127.0.0.1:0/shokai/nowhere"));
  check(nf.status === 404 && ((await nf.json()) as any).type === "door_pointer", "door.fetch(an unknown door path): 404 with a pointer, never a bare 404");
  check((await door.fetch(new Request("http://127.0.0.1:0/about"))).status === 404, "door.fetch(a path that isn't the door's): a plain 404 for the app to handle");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"] });
  const viaFetch = await aya.visit(door, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true },
    transport: async (u, b) => (await door.fetch(new Request(u, { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } }))).json() as any });
  check(viaFetch.seated, "a whole visit over door.fetch(): admitted with a pass");

  // presets
  const open = createDoor(kettle({ preset: "open" })).host.cfg.policy as any;
  const std = createDoor(kettle()).host.cfg.policy as any;
  check(open.trusted_introducers === "*" && open.account_creation === "open" && JSON.stringify(std.trusted_introducers) === "[]" && std.require_vouch_for.length === 0, "presets: open counts any introducer's vouch; standard (default) counts only named introducers");
  check(thrown(() => createDoor(kettle({ preset: "strict" })))?.code === "SHOKAI_PRESET_INVALID", "strict without named introducers throws SHOKAI_PRESET_INVALID");
  const strictDoor = createDoor(kettle({ preset: "strict", trustedIntroducers: ["did:key:z6MkTeaGuild"] }));
  const strict = strictDoor.host.cfg.policy as any;
  check(strict.require_vouch_for.join() === "purchase,visitation" && strict.purchase_hold_s === 900 && strict.seat_ttl_s === 3600 && strict.account_creation === "introduction_or_invitation" && strict.lobby.readiness.find((r: any) => r.code === "introduction").required === true,
    "strict: an introduction for every purpose, purchases held for the owner, one-hour passes, introduction required in the readiness list");
  const s1 = await aya.visit(strictDoor, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
  check(!s1.seated, "strict: an unintroduced visitor isn't admitted");
  check(Object.keys(PRESETS).join() === "open,standard,strict" && createDoor(kettle({ preset: "open" })).listing().places[0].house_digest !== door.listing().places[0].house_digest, "each preset is a different house config, so a different house digest the owner signs");

  // events
  const ev: DoorEvent[] = [];
  const evDoor = createDoor(kettle({ onEvent: (e) => ev.push(e) }));
  await evDoor.post("hi");
  await aya.visit(evDoor, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
  const types = ev.map((e) => e.type);
  check(types.includes("arrival") && types.includes("leaflet") && types.includes("decision") && types.includes("pass"), "onEvent: arrival, leaflet, decision and pass");
  const flat = JSON.stringify(ev);
  check(!flat.includes("Aya") && !flat.includes(aya.card.payload.principal.principal_id) && !flat.includes(aya.card.payload.representative_id) && ev.every((e) => e.place === "kettle" && /Z$/.test(e.at)),
    "… machine fields only: no names, no owner or representative identifiers");
  const throwing = createDoor(kettle({ onEvent: () => { throw new Error("boom"); } }));
  check((await throwing.post("hi")).status === 200, "a hook that throws never changes an answer");

  // the store: two instances, one state
  const shared = memoryStore();
  const a = createDoor(kettle({ store: shared, keys: undefined })); await a.ready;
  const visit1 = await aya.visit(a, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
  check(visit1.seated && (shared.peek()?.version ?? 0) > 0, "with a store, the door writes its durable state after every message");
  const b = createDoor(kettle({ store: shared })); await b.ready;
  check(JSON.stringify(b.host.durableState()) === JSON.stringify(a.host.durableState()), "a second instance loads the same durable state");
  // instances that take turns never conflict: each reads what the other wrote before answering
  await b.post("hello");
  const versionAfterB = shared.peek()!.version;
  const r = await a.post("hello again");
  check(r.status === 200 && shared.peek()!.version === versionAfterB + 1, "instances taking turns: each reads the other's write first, then answers");
  // a conflict needs a stale read; prove one by racing a save in between sync and persist
  let race = 0; const racy = { load: shared.load, save: async (st: any, v: number) => { if (race++ === 0) { await shared.save(st, shared.peek()!.version); } return shared.save(st, v); } };
  const c = createDoor(kettle({ store: racy })); await c.ready;
  const raced = await c.post("hello");
  const retried = await c.post("hello");
  check(raced.status === 429 && retried.status === 200, "a racing write between read and write: the answer is withheld (429), and the retry is answered");
  check(thrown(() => createDoor(kettle({ store: shared, stateFile: "/tmp/x.json" }))) !== null, "store and stateFile together are refused");
  const dir = mkdtempSync(join(tmpdir(), "shokai-store-")); const fs1 = fileStore(join(dir, "state.json"));
  const fd = createDoor(kettle({ store: fs1 })); await fd.ready; await fd.post("hi");
  const fd2 = createDoor(kettle({ store: fileStore(join(dir, "state.json")) })); await fd2.ready;
  check(((await fs1.load())?.version ?? 0) >= 1 && JSON.stringify(fd2.host.durableState()) === JSON.stringify(fd.host.durableState()), "fileStore: written, and loaded by a new door");
  const kv = new Map<string, string>(); let casCalls = 0;
  const ks = kvStore({ get: async (k) => kv.get(k) ?? null, set: async (k, v) => kv.set(k, v), cas: async (k, exp, next) => { casCalls++; if ((kv.get(k) ?? null) !== exp) return false; kv.set(k, next); return true; } });
  const kd = createDoor(kettle({ store: ks })); await kd.ready; await kd.post("hi");
  check(casCalls >= 1 && kv.has("shokai:door-state"), "kvStore: writes with the service's compare-and-set");
  const msgs = createDoor(kettle({ leaflet: undefined })).onboardingPage();
  check(msgs.includes("Set up a representative"), "without a leaflet, <base>/start is the default setup page (unchanged)");

  console.log(`${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
