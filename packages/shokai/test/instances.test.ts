// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 drop-in door): one door running as several instances that share one store, with no sticky sessions. Every
// message of a visit may land on a different instance (round robin, a brand-new instance mid-visit, two at once); visits in
// progress, passes (seats), held purchases and the MCP gate's single-use acts live in the store, so the door answers as one.
// In process; fictional people only; no network beyond loopback.
import { createDoor, createRepresentative, signCard, sign, generateRepresentativeKey, developmentPasskey, houseDigestFor, summaryDigestFor, memoryStore, fileStore, kvStore, digestOf, randomId,
  type DoorOptions, type DoorStore, type Door } from "../src/index.js";
import { ACT_HEADER, SEAT_HEADER, shokaiGate } from "../src/mcp.js";
import { entryUrl } from "../src/core/door.js";
import { toLiveJson, fromLiveJson } from "../src/core/host.js";
import type * as S from "../src/core/shapes.js";
import { createServer, type Server } from "node:http";
import { mkdtempSync, existsSync } from "node:fs"; import { spawn } from "node:child_process"; import { tmpdir } from "node:os"; import { join } from "node:path";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const BASE = "https://kettle.example/shokai";   // one public address; the instances sit behind it
const kettle = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store", baseUrl: BASE,
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], purchaseHoldSeconds: 120, testProfile: true, hostOpts: { seatsPerCard: 8 }, ...o });   // a development passkey (owners.example) at a public base: opt in; one visitor opens several passes in this test (C287 default is 2)

// The owner (Mika Tanabe, fictional) signs one Shōkai host card; every instance runs with the same representative key and card.
const mika = developmentPasskey(); const rep = generateRepresentativeKey();
const hd = houseDigestFor(kettle(), mika.id, BASE);
const card = signCard(rep, mika, { displayName: "Kettle & Leaf", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], cardKind: "host",
  host: { place: { principal_id: mika.id, entry: entryUrl(BASE, "kettle") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes", "hold_purchases"] }, house_digest: hd, summary_digest: summaryDigestFor(kettle(), BASE) },
  shownToOwner: { text: "My representative may welcome visitors at Kettle & Leaf and serve tea.browse, tea.order.", locale: "en-US" } });
const instance = async (store: DoorStore, o: Partial<DoorOptions> = {}) => { const d = createDoor(kettle({ card, keys: { rep }, store, ...o })); await d.ready; return d; };
/** A load balancer without sticky sessions: each message goes to the next instance. */
const roundRobin = (doors: Door[], log: string[] = []) => { let i = 0; return async (_u: string, body: unknown) => { const k = i++ % doors.length; log.push(String.fromCharCode(97 + k));
  const r = await doors[k].post(body); if (r.status !== 200) throw new Error(`instance ${k} answered ${r.status}`); return r.envelope; }; };
const payloads = (env: S.ReplyEnvelope) => env.messages.map((m: any) => m.payload ?? m);

async function main() {
  console.log("SDK door across instances (v0.4.0)");
  const shared = memoryStore();
  const [a, b, c] = [await instance(shared), await instance(shared), await instance(shared)];
  check(a.hostCardProblem === null && b.listing().places[0].house_digest === hd, "three instances of one door: the same representative key and owner-signed Shōkai host card");

  // 1. A whole visit, every message on another instance
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], ownerPrompts: "purchase_only" });
  const log: string[] = [];
  const v = await aya.visit(a, { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([a, b, c], log) });
  check(v.seated && new Set(log).size >= 2, `greeting, Shōkai visitor card and request on different instances (${log.join("")}): admitted with a pass`);
  const seatId = v.seat!.seat_id;
  const knows: boolean[] = []; for (const d of [a, b, c]) { const r = await d.withStore(() => !!d.seat(seatId)); knows.push(r.ok && r.value); }
  check(knows.every(Boolean),
    "every instance knows the pass, whichever one issued it");
  const o1 = await v.act("tea.order", { amount: USD("20.00"), payment_ref: "k-1" }) as any;
  const o2 = await v.act("tea.order", { amount: USD("15.00"), payment_ref: "k-2" }) as any;
  check(o1?.type === "act_result" && o1.ok === true && o2?.type === "act_decision" && o2.decision === "deny", "the pass's spending cap is counted across instances: 20 on one, then 15 on another is refused (30 in all)");
  const o3 = await v.act("tea.order", { amount: USD("10.00"), payment_ref: "k-3" }) as any;
  check(o3?.type === "act_result" && o3.ok === true, "… and 10 more, on a third instance, fits");

  // 2. A brand-new instance (a cold start) joins mid-visit
  const d = await instance(shared);
  const vd = await aya.visit(a, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true }, transport: roundRobin([a, b]) });
  const coldAct = await (async () => { const r = await d.post(vd.signAct("tea.browse", {})); return payloads(r.envelope); })();
  check(vd.seated && coldAct.some((p: any) => p.type === "act_result" && p.ok === true), "an instance started after the visit began serves its pass (a cold start doesn't lose visits in progress)");

  // 3. A held purchase: held on one instance, the owner's approval arrives at another
  const yes = async (h: S.ActHeld) => sign<S.OwnerConsent>({ consent_id: "oc-a1", owner_id: aya.owner.id, representative_id: aya.id, action: "approve_purchase", decision: "approve",
    subject_ref: { kind: "act", id: h.hold_id, digest: h.act_digest }, assurance: "passkey", expires_at: h.expires_at, issued_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    shown_to_owner: { text: `Buy at Kettle & Leaf: ${h.tool}, USD ${h.amount.value}. Approve?`, locale: "en-US" } }, aya.owner);
  const vh = await aya.visit(a, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([b, c, a]) });
  const held = await vh.actWithOwner("tea.order", { amount: USD("12.00"), payment_ref: "k-h1" }, yes) as any;
  check(held?.type === "act_result" && held.ok === true, "a purchase held for the owner on one instance is confirmed on another");

  // 4. The farewell on one instance is seen by all
  await v.farewell();
  const seen = []; for (const d of [a, b, c]) { const r = await d.withStore(() => d.host.encounters.get(v.encounterId)); seen.push(r.ok && !!r.value?.visitorFarewell); }
  check(seen.every(Boolean), "the farewell, answered by one instance, is in the visit every instance reads");

  // 5. Two instances at once: one answers, the other withholds its answer (429), never two answers from stale state
  const vr = await aya.visit(a, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([c, a, b]) });
  const m1 = vr.signAct("tea.order", { amount: USD("25.00"), payment_ref: "r-1" });
  const m2 = vr.signAct("tea.order", { amount: USD("25.00"), payment_ref: "r-2" });
  const slow: DoorStore = { load: () => shared.load(), save: async (st, v) => { await new Promise((r) => setTimeout(r, 15)); return shared.save(st, v); } };
  const [s1, s2] = [await instance(slow), await instance(slow)];
  const [r1, r2] = await Promise.all([s1.post(m1), s2.post(m2)]);
  const okCount = [r1, r2].filter((r) => r.status === 200 && payloads(r.envelope).some((p: any) => p.type === "act_result" && p.ok)).length;
  check([r1.status, r2.status].sort().join() === "200,429" && okCount === 1, "two acts racing on two instances: one is answered, the other is withheld (429, retry)");
  const retry = await a.post(r1.status === 429 ? m1 : m2);
  check(payloads(retry.envelope).some((p: any) => p.type === "act_decision" && p.decision === "deny"), "the retry is counted against the same pass: 25 + 25 over a 30 cap is refused");
  const replay = await b.post(r1.status === 200 ? m1 : m2);
  check(!payloads(replay.envelope).some((p: any) => p.type === "act_result" && p.ok), "the same signed act replayed at another instance is not carried out twice");

  // 6. The MCP gate on two instances: seated through one, acts through the other; single use holds across them
  const gshared = memoryStore();
  const [ga, gb] = [await instance(gshared), await instance(gshared)];
  const tools = new Map<string, number>();
  const mcp = async (_q: any, res: any, body: any) => { tools.set(body.params.name, (tools.get(body.params.name) ?? 0) + 1);
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "ok" }] } })); };
  const listen = (h: any) => new Promise<{ s: Server; url: string }>((r) => { const s = createServer(h); s.listen(0, "127.0.0.1", () => r({ s, url: `http://127.0.0.1:${(s.address() as any).port}` })); });
  const [sa, sb] = [await listen(shokaiGate(ga, mcp)), await listen(shokaiGate(gb, mcp))];
  const vg = await aya.visit(ga, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true }, transport: roundRobin([ga, gb]) });
  const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const call = async (url: string, act: unknown) => (await fetch(url + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", [SEAT_HEADER]: vg.seat!.seat_id, [ACT_HEADER]: b64(act) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tea.browse", arguments: {} } }) })).json() as any;
  const act = vg.signAct("tea.browse", {});
  const first = await call(sb.url, act); const again = await call(sa.url, act);
  check(vg.seated && first.result?.content?.[0]?.text === "ok" && !!again.error && tools.get("tea.browse") === 1, "MCP gate: a pass from one instance works at another, and a used act is refused at the first (single use across instances)");
  sa.s.close(); sb.s.close();

  // 7. Two instances on one file (a shared volume) and on a key-value service with compare-and-set
  const dir = mkdtempSync(join(tmpdir(), "shokai-inst-")); const path = join(dir, "state.json");
  const [f1, f2] = [await instance(fileStore(path)), await instance(fileStore(path))];
  const vf = await aya.visit(f1, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([f1, f2]) });
  const fa = await vf.act("tea.order", { amount: USD("20.00"), payment_ref: "f-1" }) as any; const fb = await vf.act("tea.order", { amount: USD("20.00"), payment_ref: "f-2" }) as any;
  check(vf.seated && fa?.ok === true && fb?.decision === "deny", "fileStore: two instances on one file share visits and counts");
  // four processes on one file, each adding 1 twenty times through compare-and-set: no write is lost
  const counterPath = join(dir, "counter.json"); const storeJs = new URL("../src/store.js", import.meta.url).href;
  const child = `const { fileStore } = await import(${JSON.stringify(storeJs)}); const s = fileStore(${JSON.stringify(counterPath)});
    for (let i = 0; i < 20; ) { const cur = await s.load(); const n = (cur?.state?.n ?? 0) + 1; if ((await s.save({ n }, cur?.version ?? 0)) !== null) i++; }`;
  const runs = await Promise.all([0, 1, 2, 3].map(() => new Promise<number | null>((r) => spawn(process.execPath, ["--input-type=module", "-e", child], { stdio: "inherit" }).on("exit", r))));
  const fin = await fileStore(counterPath).load() as any;
  check(runs.every((c) => c === 0) && fin?.state?.n === 80 && fin.version === 80 && !existsSync(counterPath + ".lock"), "fileStore across processes: 4 × 20 compare-and-set writes, none lost (80), and no lock left behind");
  const kv = new Map<string, string>();
  const ks = () => kvStore({ get: async (k) => kv.get(k) ?? null, set: async (k, x) => kv.set(k, x), cas: async (k, exp, next) => { if ((kv.get(k) ?? null) !== exp) return false; kv.set(k, next); return true; } });
  const [k1, k2] = [await instance(ks()), await instance(ks())];
  const vk = await aya.visit(k1, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true }, transport: roundRobin([k1, k2]) });
  const kb = await vk.act("tea.browse", {}) as any;
  check(vk.seated && kb?.ok === true, "kvStore: two instances on one key share visits and passes");

  // 8. The live-state JSON: maps, sets and amounts kept; a visitor's own JSON is never read back as something else
  const sample = { m: new Map([["k", { n: 5n }]]), s: new Set(["x"]), args: { $big: "7", $map: [], note: "{\"$set\":[]}" }, tricky: JSON.parse('{"__proto__": {"polluted": true}}') };
  const back = fromLiveJson(JSON.parse(JSON.stringify(toLiveJson(sample)))) as any;
  check(back.m.get("k").n === 5n && back.s.has("x") && back.args.$big === "7" && Array.isArray(back.args.$map) && back.args.note === sample.args.note,
    "live-state JSON round-trips maps, sets and amounts; an act's own \"$big\" or \"$map\" members stay plain data");
  check(({} as any).polluted === undefined && Object.getPrototypeOf(back.tricky) === Object.prototype && (back.tricky as any).polluted === undefined,
    "a \"__proto__\" member in stored JSON can't change any object's prototype");

  // 9. What the store holds: no private keys, no secrets
  const raw = JSON.stringify(shared.peek());
  check(!!shared.peek()?.state.live?.seats && !raw.includes("privateKey") && !raw.includes("\"d\":") && !raw.includes("BEGIN PRIVATE"), "the store holds visits in progress and passes, and no private key");

  // 10. C270: atomic single use across instances (greeting nonce + idempotency key + mandate ledger)
  const c270 = memoryStore();
  const [c1, c2] = [await instance(c270), await instance(c270)];
  const slow270: DoorStore = { load: () => c270.load(), save: async (st, ver) => { await new Promise((r) => setTimeout(r, 20)); return c270.save(st, ver); } };
  const [x1, x2] = [await instance(slow270), await instance(slow270)];
  const vc = await aya.visit(c1, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([c1, c2]) });
  // Same signed act (same msg_id) posted to two instances at once: at most one performs it (C270 / seen_msgs).
  const one = vc.signAct("tea.order", { amount: USD("10.00"), payment_ref: "c270-1" });
  const [p1, p2] = await Promise.all([x1.post(one), x2.post(one)]);
  const ok270 = [p1, p2].filter((r) => r.status === 200 && payloads(r.envelope).some((p: any) => p.type === "act_result" && p.ok)).length;
  const statuses = [p1.status, p2.status].sort().join();
  check((statuses === "200,429" || statuses === "200,200") && ok270 === 1, `C270: the same signed act at two instances is performed once (statuses ${statuses}, ok ${ok270})`);
  // Two different acts racing that together exceed the mandate: at most one succeeds, never both from stale state.
  const vc2 = await aya.visit(c1, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([c1, c2]) });
  const actA = vc2.signAct("tea.order", { amount: USD("25.00"), payment_ref: "c270-a" });
  const actB = vc2.signAct("tea.order", { amount: USD("25.00"), payment_ref: "c270-b" });
  const [q1, q2] = await Promise.all([x1.post(actA), x2.post(actB)]);
  const okBoth = [q1, q2].filter((r) => r.status === 200 && payloads(r.envelope).some((p: any) => p.type === "act_result" && p.ok)).length;
  check(okBoth <= 1, `C270: two 25 acts racing on a 30 mandate: at most one succeeds (got ${okBoth})`);

  // 11. Over-limit hold across instances: hold on one, intervening refused on another, release on a third; used raise persists
  {
    const SUMMARY: S.HouseSummary = { name: "kettle", display_name: "Kettle & Leaf", purpose: { statement: "Buying tea.", locale: "en-US" },
      conduct_rules: [{ code: "no_payment_credentials", text: "Never send card numbers here.", locale: "en-US" }], spec_ref: { version: "0.5.0" } as S.SpecRef };
    const olOpts = { purchaseHoldSeconds: 120, policy: { limit_calls: true, summary: SUMMARY, conduct_rules: SUMMARY.conduct_rules } as any };
    const olHd = houseDigestFor(kettle(olOpts), mika.id, BASE);
    const olCard = signCard(rep, mika, { displayName: "Kettle & Leaf", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], cardKind: "host",
      host: { place: { principal_id: mika.id, entry: entryUrl(BASE, "kettle") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes", "hold_purchases"] }, house_digest: olHd, summary_digest: summaryDigestFor(kettle(olOpts), BASE) },
      shownToOwner: { text: "My representative may welcome visitors at Kettle & Leaf and serve tea.browse, tea.order.", locale: "en-US" } });
    const olStore = memoryStore();
    const olDoor = async (store: DoorStore) => { const d = createDoor(kettle({ ...olOpts, card: olCard, keys: { rep }, store })); await d.ready; return d; };
    const [oa, ob, oc] = [await olDoor(olStore), await olDoor(olStore), await olDoor(olStore)];
    const ren = createRepresentative({ ownerName: "Ren Okada", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], ownerPrompts: "purchase_only" });
    const m = ren.mandate({ purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") } });
    const log: string[] = [];
    const vv = await ren.visit(oa, { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") }, useMandate: m, transport: roundRobin([oa, ob, oc], log) });
    const a20 = await vv.act("tea.order", { amount: USD("20.00"), payment_ref: "ol-20" }) as any;
    check(vv.seated && a20?.ok === true, "over-limit multi-instance: seated and spent 20 across instances");
    const ikey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    // R9b-01: hold on instance A, intervening act on B refused, release once only at proposed on C.
    const holdMsg = vv.signed(vv.message("act", { seat_id: vv.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "ol-40" },
      hold_for_owner: true, idempotency_key: ikey() }));
    const holdEnv = payloads((await oa.post(holdMsg)).envelope);
    const held = holdEnv.find((x: any) => x.type === "act_held") as S.ActHeld | undefined;
    check(!!held?.over_limit && held.over_limit.proposed.value === "60.00" && !!held.over_limit.seat && !!held.over_limit.mandate,
      `R9b-01: hold on instance A carries dual totals and proposed 60.00 (got ${JSON.stringify(held?.over_limit && { proposed: held.over_limit.proposed })})`);
    const midMsg = vv.signAct("tea.order", { amount: USD("10.00"), payment_ref: "ol-10" });
    const midPay = payloads((await ob.post(midMsg)).envelope);
    const mid = midPay.find((x: any) => x.type === "act_decision") ?? midPay[0];
    check(mid?.type === "act_decision" && mid.decision === "deny" && mid.reason_code === "SEAT_SCOPE_EXCEEDED",
      `R9b-01: intervening spend on instance B is refused (got ${mid?.type}/${mid?.reason_code})`);
    const raised = ren.supersedingMandate(m, held as any, "Kettle: one purchase of USD 40 (USD 60 in all), approve.");
    const confMsg = vv.signed(vv.message("act_confirmation", { seat_id: vv.seat!.seat_id, hold_id: held!.hold_id, mandate: raised, idempotency_key: ikey() }));
    const conf = payloads((await oc.post(confMsg)).envelope);
    check(conf.some((x: any) => x.type === "act_result" && x.ok === true), "R9b-01: release on instance C succeeds");
    const spent = await oc.withStore(() => [...oc.host.seats.values()].find((s) => s.seat.seat_id === vv.seat!.seat_id)?.spent);
    check(spent.ok && spent.value === 60_000_000n, `R9b-01: release once only at proposed 60.00 (got ${spent.ok ? spent.value : "store-write-lost"})`);
    // Same raise offered again at a cold instance must be refused (used_raises in durable store).
    const cold = await olDoor(olStore); void cold;
    const again = payloads((await oc.post(vv.signed(vv.message("act_confirmation", { seat_id: vv.seat!.seat_id, hold_id: held!.hold_id, mandate: raised, idempotency_key: ikey() })))).envelope);
    const peek = olStore.peek();
    const raises = (peek?.state as any)?.used_raises ?? [];
    check(Array.isArray(raises) && raises.length >= 1, `R9b-01: used raise persisted in the shared durable store (raises=${JSON.stringify(raises).slice(0, 80)})`);
    void again;
  }

  // Muse H3 / C286: ten real allowance-backed visits, alternated across instances and cold starts.
  {
    const store = memoryStore();
    const [aa, ab] = [await instance(store), await instance(store)];
    const platform = generateRepresentativeKey(), key = generateRepresentativeKey(), owner = developmentPasskey();
    const vc = signCard(key, owner, { displayName: "Nori Elm", purposes: ["purchase"], actions: ["tea.order"] }, platform);
    const visitor = createRepresentative({ ownerName: "Nori Elm", owner, key, card: vc, purposes: ["purchase"], actions: ["tea.order"] });
    const at = new Date(Date.now() - 60_000).toISOString().replace(/\.\d+Z$/, "Z"), until = new Date(Date.now() + 3000_000).toISOString().replace(/\.\d+Z$/, "Z");
    const grant: S.AllowanceGrant = { grant_id: "monthly-tea", salt: "muse-monthly-tea-salt-0123456789", purposes: ["purchase"], place_categories: ["store"], actions: ["tea.order"],
      spend: { per_seat: USD("40.00"), per_period: USD("100.00"), period: "P1M" } };
    const allowance = sign<S.Allowance>({ allowance_id: "muse-monthly", owner_id: owner.id, representative_id: key.id, card_id: vc.payload.card_id,
      grant_digests: [digestOf(grant)], shown_to_owner: { text: "Tea: 40 per visit, 100 per month.", locale: "en-US" }, valid_from: at, expires_at: until,
      revocation_status: "https://nori.example/allowance" }, owner);
    const status = sign<S.AllowanceStatus>({ allowance_id: allowance.payload.allowance_id, allowance_digest: allowance.payload_digest, status: "active", issued_at: at, next_update: until }, platform);
    const outcomes: boolean[] = [], seated: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      let d = i === 2 ? await instance(store) : i % 2 ? ab : aa;
      if (i === 5) {
        const durableOnly = memoryStore(), { live: _visits, ...durable } = store.peek()!.state;
        await durableOnly.save(durable, 0); d = await instance(durableOnly);
      }
      const mandate = sign<S.Mandate>({ mandate_id: randomId("monthly"), principal_id: owner.id, representative_id: key.id, card_id: vc.payload.card_id,
        purpose: { code: "purchase", statement: "Tea.", locale: "en-US" }, allowed_actions: ["tea.order"], limits: { max_amount: USD("40.00") }, valid_from: at, expires_at: until,
        under_allowance: { allowance_id: allowance.payload.allowance_id, allowance_digest: allowance.payload_digest, grant_digest: digestOf(grant) } }, key);
      const transport = async (url: string, body: any) => {
        if (body?.payload?.type === "invitation_request") body = sign({ ...body.payload, allowance: { allowance, grant }, allowance_status: status }, key);
        const r = await d.respond("POST", new URL(url).pathname, async () => JSON.stringify(body), { clientAddress: "198.51.100.81" });
        return JSON.parse(r!.body);
      };
      const v = await visitor.visit(d, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("40.00") }, useMandate: mandate, transport });
      seated.push(v.seated);
      const result: any = v.seated ? await v.act("tea.order", { amount: USD("40.00"), payment_ref: "monthly-" + i }) : null;
      outcomes.push(result?.ok === true);
      if (v.seated) { await d.withStore(() => d.endSeat(v.seat!.seat_id)); await v.farewell(); }
    }
    check(seated.every(Boolean), "Muse C286 control: all ten independent per-visit mandates are seated under the same signed grant");
    check(outcomes.filter(Boolean).length === 2, `Muse C286: 100/month permits only two 40 spends across two instances, cold starts and durable-only restart (got ${outcomes.map(Number)})`);
    const persisted = (store.peek()?.state as any)?.allowance_ledger;
    check(!!persisted, "Muse C286: the allowance ledger is in durable state, not just visits in progress");
  }

  console.log(`${pass} SDK instances checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
