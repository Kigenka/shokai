// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (pre-release review, round 2): admission limits, the encounter cap and the inbound byte boundary, each through the
// shipped door (Door.respond(), door.fetch(), handleHttp(), shokaiDoor()), not only the helpers. Fictional people and places; loopback only.
import { createDoor, createRepresentative, generateRepresentativeKey, sign, verifySigned, memoryStore, randomId, shokaiDoor, type DoorOptions } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const common = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "guard-review", displayName: "Fernhill Reading Room", approvedBy: { name: "Juniper Sato", role: "Owner" },
  purposes: [{ code: "visitation", statement: "Browse" }], actions: [{ action: "menu.view", purposes: ["visitation"], level: "discover", data_asks: [] }], ...o } as DoorOptions);
const entry = (d: any) => new URL(d.entry).pathname;
const at = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const greeting = (from: string) => ({ protocol: "shokai/0.5", encounter_id: randomId("r2"), msg_id: randomId("r2"), sent_at: at(), from, type: "greeting", locales: ["en-US"], nonce: randomId("r2") });

async function admission() {
  const a = generateRepresentativeKey(), b = generateRepresentativeKey();
  // 1. A valid signature by key A on a payload "from" key B is unauthenticated: it counts as anonymous and hits the limit like prose.
  const plain = createDoor(common({ anonRatePerAddr: 2, anonRateTotal: 100 })), mism = createDoor(common({ anonRatePerAddr: 2, anonRateTotal: 100 }));
  const ps: number[] = [], ms: number[] = [];
  for (let i = 0; i < 3; i++) {
    ps.push((await plain.respond("POST", entry(plain), async () => "Hello", { clientAddress: "198.51.100.4" }))!.status);
    const env: any = sign(greeting(b.id) as any, a);
    if (i === 0) check((verifySigned(env) as any).ok && env.signatures[0].signer !== env.payload.from, "control: the mismatched envelope's signature verifies, its signer isn't payload.from");
    ms.push((await mism.respond("POST", entry(mism), async () => JSON.stringify(env), { clientAddress: "198.51.100.4" }))!.status);
  }
  check(ps.join() === "200,200,429", `anonymous quota 2: plain prose 200,200,429 (got ${ps})`);
  check(ms[2] === 429, `the third sender-mismatched envelope is limited like anonymous traffic (got ${ms})`);
  // 2. Newcomer budget (C287): 61 card-less signed greetings from one key and one source → the 61st refused.
  const nd = createDoor(common()), st: number[] = [];
  for (let i = 0; i < 61; i++) st.push((await nd.respond("POST", entry(nd), async () => JSON.stringify(sign(greeting(a.id) as any, a)), { clientAddress: "198.51.100.5" }))!.status);
  check(st.slice(0, 60).every((s) => s === 200) && st[60] === 429, `61st signed greeting from one newcomer principal is refused 429 (got ${st.filter((s) => s === 429).length} × 429)`);
  // 3. Seat caps (C287): three visits with the same signed card through Door.respond → the third is not seated (2 per card).
  const sd = createDoor(common());
  const rep = createRepresentative({ ownerName: "Rowan Achterberg", purposes: ["visitation"], actions: ["menu.view"] });
  const transport = async (url: string, body: unknown) => JSON.parse((await sd.respond("POST", new URL(url).pathname, async () => JSON.stringify(body), { clientAddress: "198.51.100.8" }))!.body);
  const vs: any[] = []; for (let i = 0; i < 3; i++) vs.push(await rep.visit(sd, { purpose: "visitation", actions: ["menu.view"], transport } as any));
  const live = [...(sd.host as any).seats.values()].filter((s: any) => !s.unseated && Date.parse(s.seat.expires_at) > Date.now()).length;
  check(!!vs[0].seated && !!vs[1].seated && !vs[2].seated && vs[2].response?.disposition === "not_now", `third concurrent seat for one card → not_now (seated: ${vs.map((v) => !!v.seated)})`);
  check(live === 2, `two live seats for the card, not three (got ${live})`);
}

async function capacity() {
  const sum = (r: any) => r.envelope.messages.map((m: any) => m.payload.type + (m.payload.ok === false || m.payload.disposition ? ":" + (m.payload.disposition ?? "not_ok") : ""));
  for (const [label, shared] of [["memory", false], ["memoryStore", true]] as const) {
    const store = shared ? memoryStore() : undefined;
    const d = createDoor(common({ ...(store ? { store } : {}), hostOpts: { maxEncounters: 1 } } as any)); await (d as any).ready;
    const alice = createRepresentative({ ownerName: "Alice Fenwick", purposes: ["visitation"], actions: ["menu.view"] });
    const bob = createRepresentative({ ownerName: "Bob Ilunga", purposes: ["visitation"], actions: ["menu.view"] });
    const v: any = await alice.visit(d, { purpose: "visitation", actions: ["menu.view"] });
    await d.post(v.signAct("menu.view", {})); await v.farewell();
    const w: any = await bob.visit(d, { purpose: "visitation", actions: ["menu.view"] });
    const after: any = await d.post(v.signAct("menu.view", {}));
    check(d.host.encounters.has(v.encounterId), `${label}, cap 1: Alice's closed encounter with a live pass is kept when Bob arrives`);
    check(!w.seated, `${label}, cap 1: Bob (the newcomer) is refused while the only room holds a live pass`);
    check(after.status === 200 && after.envelope.messages.some((m: any) => m.payload.type === "act_result"), `${label}, cap 1: Alice can still act after farewell + Bob (got ${after.status} ${sum(after)})`);
  }
}

async function inbound() {
  const make = () => createDoor(common({ name: "review", policy: { max_message_bytes: 4096 } } as any));
  // Web fetch: a 1 MiB stream is cancelled at the limit and answered 413, not buffered.
  let streamed = 0, cancelled = false;
  const body = new ReadableStream({ pull(c) { if (streamed >= 1024 * 1024) return c.close(); const b = new Uint8Array(16384).fill(120); streamed += b.length; c.enqueue(b); }, cancel() { cancelled = true; } });
  const r = await make().fetch(new Request("http://127.0.0.1/shokai/places/review/entry", { method: "POST", body, duplex: "half", headers: { "content-type": "application/json" } } as any));
  check(r.status === 413 && cancelled && streamed < 1024 * 1024, `Web fetch: oversized stream → 413, cancelled after ${streamed} bytes`);
  // Node handleHttp: 1 MiB in chunks → 413, reading stops.
  let nstream = 0; const nreq: any = { method: "POST", url: "/shokai/places/review/entry", headers: { "content-type": "application/json" }, socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() { for (let i = 0; i < 64; i++) { nstream += 16384; yield Buffer.alloc(16384, 120); } } };
  let nstatus = 0; await make().handleHttp(nreq, { writeHead(s: number) { nstatus = s; }, end() {} } as any);
  check(nstatus === 413 && nstream < 1024 * 1024, `Node handleHttp: oversized body → 413 after ${nstream} bytes`);
  // Received bytes (C239): legal JSON whitespace that takes a valid greeting over max_message_bytes is refused (no answer in its encounter).
  const rep = generateRepresentativeKey(); const signed: any = sign(greeting(rep.id) as any, rep);
  const padded = " ".repeat(8192) + JSON.stringify(signed);
  const pr = await make().fetch(new Request("http://127.0.0.1/shokai/places/review/entry", { method: "POST", body: padded, headers: { "content-type": "application/json" } }));
  const pd: any = await pr.json();
  check(!pd.messages.some((m: any) => m.payload.encounter_id === signed.payload.encounter_id && m.payload.type !== "farewell"), `padded greeting (${Buffer.byteLength(padded)} received bytes > 4096) gets no answer in its encounter`);
  const cr: any = await (await make().fetch(new Request("http://127.0.0.1/shokai/places/review/entry", { method: "POST", body: JSON.stringify(signed) }))).json();
  check(cr.messages.some((m: any) => m.payload.encounter_id === signed.payload.encounter_id), "control: the same greeting compact is answered");
  // Strict UTF-8 (C284): an invalid byte is refused (400), never decoded to U+FFFD and processed.
  const bad = Buffer.concat([Buffer.from(JSON.stringify(signed).slice(0, -2)), Buffer.from([0xff]), Buffer.from("}}")]);
  const ur = await make().fetch(new Request("http://127.0.0.1/shokai/places/review/entry", { method: "POST", body: bad }));
  check(ur.status === 400, `Web fetch: invalid UTF-8 → 400 (got ${ur.status})`);
  let es = 0; const ereq: any = { method: "POST", url: "/shokai/places/review/entry", originalUrl: "/shokai/places/review/entry", headers: {}, socket: { remoteAddress: "127.0.0.1" }, resume() {},
    async *[Symbol.asyncIterator]() { yield bad; } };
  await shokaiDoor(make())(ereq, { writeHead(s: number) { es = s; }, end() {}, headersSent: false } as any, () => {});
  check(es === 400, `Express adapter: invalid UTF-8 → 400 (got ${es})`);
  let ex = 0; await shokaiDoor(make())({ ...ereq, rawBody: bad } as any, { writeHead(s: number) { ex = s; }, end() {}, headersSent: false } as any, () => {});
  check(ex === 400, `Express adapter (rawBody bytes): invalid UTF-8 → 400 (got ${ex})`);
}

async function main() {
  console.log("SDK round-2 guards (admission, capacity, inbound bytes; pre-release review)");
  await admission(); await capacity(); await inbound();
  console.log(`round2 guards: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
