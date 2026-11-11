// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 drop-in door): pruning finished visits. A door's stored state stays the size of its recent traffic, not of
// every visit it ever had, while replay protection holds: a greeting nonce, an entry act and an MCP act are each refused for as long
// as they could still be valid, also across instances sharing one store. Time is moved forward with a shifted global clock (the
// door and the visitors both see it). In process; fictional people only; no network beyond loopback.
import { createDoor, createRepresentative, signCard, generateRepresentativeKey, developmentPasskey, houseDigestFor, summaryDigestFor, memoryStore, kvStore,
  type DoorOptions, type DoorStore, type Door } from "../src/index.js";
import { ACT_HEADER, SEAT_HEADER, shokaiGate } from "../src/mcp.js";
import { entryUrl } from "../src/core/door.js";
import type * as S from "../src/core/shapes.js";
import { createServer, type Server } from "node:http";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

// A shifted clock: every `new Date()` and Date.now() in this process runs `offset` ms ahead (the door and the visitors alike).
const RealDate = Date; let offset = 0;
class ShiftedDate extends RealDate {
  constructor(...a: any[]) { if (a.length) super(...(a as [any])); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
}
(globalThis as any).Date = ShiftedDate;
const later = (s: number) => { offset += s * 1000; };
const H = 3600;

const USD = (value: string) => ({ value, currency: "USD" });
const BASE = "https://lanternmoss.example/shokai";
const tea = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "lanternmoss", displayName: "Lanternmoss Tea Room", category: "store", baseUrl: BASE,
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], purchaseHoldSeconds: 120, ...o });
// The owner (Sora Ikeda, fictional) signs one Shōkai host card; every instance runs with the same representative key and card.
const sora = developmentPasskey(); const rep = generateRepresentativeKey();
const card = signCard(rep, sora, { displayName: "Lanternmoss Tea Room", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], cardKind: "host",
  host: { place: { principal_id: sora.id, entry: entryUrl(BASE, "lanternmoss") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes", "hold_purchases"] }, house_digest: houseDigestFor(tea(), sora.id, BASE), summary_digest: summaryDigestFor(tea(), BASE) },
  shownToOwner: { text: "My representative may welcome visitors at Lanternmoss Tea Room and serve tea.browse, tea.order.", locale: "en-US" } });
const instance = async (store: DoorStore, o: Partial<DoorOptions> = {}) => { const d = createDoor(tea({ card, keys: { rep }, store, ...o })); await d.ready; return d; };
const payloads = (env: S.ReplyEnvelope) => env.messages.map((m: any) => m.payload ?? m);
const carriedOut = (env: S.ReplyEnvelope) => payloads(env).some((p: any) => p.type === "act_result" && p.ok === true);
const roundRobin = (doors: Door[], sent: unknown[] = []) => { let i = 0; return async (_u: string, body: unknown) => { sent.push(body);
  const r = await doors[i++ % doors.length].post(body); if (r.status !== 200) throw new Error(`instance answered ${r.status}`); return r.envelope; }; };
const size = (s: { peek(): any }) => JSON.stringify(s.peek()?.state ?? {}).length;
const people = ["Aya Linden", "Ben Okafor", "Chiho Mori", "Dev Arora"].map((ownerName) =>
  createRepresentative({ ownerName, purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], ownerPrompts: "purchase_only" }));
/** One whole visit: admitted with a pass, one purchase, farewell. */
const visitOnce = async (d: Door | Door[], i: number) => { const ds = Array.isArray(d) ? d : [d];
  const v = await people[i % people.length].visit(ds[0], { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin(ds) });
  const o = await v.act("tea.order", { amount: USD("5.00"), payment_ref: "p-" + i }) as any; await v.farewell(); return v.seated && o?.ok === true; };

async function main() {
  console.log("SDK door: pruning finished visits (v0.4.0)");

  // 1. Growth is bounded: four days of traffic, 25 visits a day. Without pruning the state grows with every visit; with the default
  //    (passes last a day, finished visits kept an hour after), it stays about one day of visits plus a week of greeting nonces.
  const kept = memoryStore(), pruned = memoryStore();
  const [dk, dp] = [await instance(kept, { retainFinishedVisitsS: false }), await instance(pruned)];
  const sizes: { kept: number; pruned: number }[] = []; let allOk = true;
  for (let day = 0; day < 4; day++) {
    for (let i = 0; i < 25; i++) { allOk = (await visitOnce(dk, i)) && allOk; allOk = (await visitOnce(dp, i)) && allOk; later(H / 2); }
    later(12 * H); await dp.prune(); sizes.push({ kept: size(kept), pruned: size(pruned) });
  }
  console.log("    state bytes by day (kept everything / pruned): " + sizes.map((s) => `${s.kept}/${s.pruned}`).join(", "));
  check(allOk, "100 visits at each door: every one admitted with a pass and its purchase carried out");
  check(sizes[3].kept > 3.5 * sizes[0].kept, `without pruning the state grows with every visit (${sizes[0].kept} → ${sizes[3].kept} bytes)`);
  // C281: cards without revocation_url get ≤1h seats, so live state turns over quickly and the durable week of greeting
  // nonces (§2.4) dominates growth across a 4-day window. Pruning still keeps the door far below keep-everything.
  check(sizes[3].pruned < 2.2 * sizes[1].pruned && sizes[3].pruned < sizes[3].kept / 2, `with the default retention pruning bounds growth (${sizes[1].pruned} → ${sizes[3].pruned} bytes from day 2 to 4; C281 short seats)`);
  const st: any = pruned.peek()!.state;
  check(st.live.encounters.$map.length <= 50 && st.used_nonces.length === 100, `only recent visits are kept (${st.live.encounters.$map.length} encounters), and every greeting nonce of the last week (${st.used_nonces.length})`);
  later(8 * 24 * H); await dp.prune(); const quiet: any = pruned.peek()!.state;
  check(quiet.live.encounters.$map.length === 0 && quiet.live.seats.$map.length === 0 && quiet.used_nonces.length === 0 && quiet.seen_msgs.length === 0 && quiet.mandate_use.length === 0,
    `after a quiet week nothing of those visits is left (${size(pruned)} bytes: the records and keys §3.6 keeps for good)`);
  check(quiet.records.length > 0 && quiet.known_rp.length > 0, "relationship records and each owner's relying party are kept (§3.6, §9)");

  // 2. Replays stay refused while they could still be valid
  const s2 = memoryStore(); const d2 = await instance(s2); const sent: unknown[] = [];
  const v2 = await people[0].visit(d2, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([d2], sent) });
  const act = v2.signAct("tea.order", { amount: USD("10.00"), payment_ref: "r-1" });
  check(carriedOut((await d2.post(act)).envelope), "a purchase within the pass is carried out");
  later(40 * 60); const p1 = await d2.prune();
  check(p1.ok && p1.value!.encounters === 0 && !carriedOut((await d2.post(act)).envelope), "40 minutes later, after a prune: the pass is still live, nothing of it is dropped, and the same act replayed is not carried out again");
  const greeting = sent[0];
  check(payloads((await d2.post(greeting)).envelope).every((p: any) => p.type !== "invitation_response" || p.decision !== "grant"), "… and its greeting replayed is not admitted again");
  later(26 * H); const p2 = await d2.prune();
  check(p2.ok && p2.value!.encounters >= 1 && !(s2.peek()!.state.live as any).encounters.$map.some(([k]: [string]) => k === v2.encounterId),
    "26 hours later the pass has ended and the visit is pruned");
  check(!carriedOut((await d2.post(act)).envelope), "the act replayed after the prune is still refused (too old to be read, and its pass is gone)");
  check(payloads((await d2.post(greeting)).envelope).length === 0, "the greeting replayed after the prune is discarded unanswered (too old): nobody is admitted on it");
  // The same, with the door's freshness check turned off: what is remembered must refuse the replays on its own.
  const s3 = memoryStore(); const d3 = await instance(s3, { maxMessageAgeS: false }); const sent3: unknown[] = [];
  // A mandate valid for three days: its pass ends after one, but the mandate's count must outlive the pruned visit (§5.1, C175).
  const v3 = await people[1].visit(d3, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true, validSeconds: 3 * 86400 }, transport: roundRobin([d3], sent3) });
  const act3 = v3.signAct("tea.order", { amount: USD("10.00"), payment_ref: "r-3" }); await d3.post(act3);
  const spentBefore = (s3.peek()!.state.mandate_use as any)[0][1].spent;
  later(26 * H); await d3.prune();
  const g3 = payloads((await d3.post(sent3[0])).envelope);
  check(g3.some((p: any) => p.type === "invitation_response" && p.decision === "deny" && p.disposition === "never"),
    "with no freshness check, a greeting replayed a day later still meets its remembered nonce (§2.4: deny never, nobody admitted)");
  const r3 = payloads((await d3.post(act3)).envelope);
  check(!r3.some((p: any) => p.type === "act_result" && p.ok) && (s3.peek()!.state.mandate_use as any)[0][1].spent === spentBefore,
    "with no freshness check, an act replayed after its pass was pruned is refused, and the still-valid mandate's count is kept and unchanged (§5.1)");
  check(d3.host.retention() === 3600 && d2.host.retention() === 3600 && (await instance(memoryStore(), { retainFinishedVisitsS: 60 })).host.retention() === 2100,
    "the retention never goes under 2 × the freshness window + 300 s (60 s asked, 2100 s used with the 900 s default)");

  // 3. The MCP gate: a used act stays refused for as long as its sent_at is within the window; then it is stale anyway
  const gs = memoryStore(); const [ga, gb] = [await instance(gs), await instance(gs)];
  const calls = new Map<string, number>();
  const mcp = async (_q: any, res: any, body: any) => { calls.set(body.params.name, (calls.get(body.params.name) ?? 0) + 1);
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "ok" }] } })); };
  const listen = (h: any) => new Promise<{ s: Server; url: string }>((r) => { const s = createServer(h); s.listen(0, "127.0.0.1", () => r({ s, url: `http://127.0.0.1:${(s.address() as any).port}` })); });
  const [sa, sb] = [await listen(shokaiGate(ga, mcp)), await listen(shokaiGate(gb, mcp))];
  const vg = await people[2].visit(ga, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true }, transport: roundRobin([ga, gb]) });
  const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const call = async (url: string, a: unknown) => (await fetch(url + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", [SEAT_HEADER]: vg.seat!.seat_id, [ACT_HEADER]: b64(a) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tea.browse", arguments: {} } }) })).json() as any;
  const ga1 = vg.signAct("tea.browse", {});
  const first = await call(sa.url, ga1);
  later(4 * 60); await ga.prune(); await gb.prune();
  const again = await call(sb.url, ga1);
  later(7 * 60); await ga.prune();
  const stale = await call(sa.url, ga1);
  check(first.result?.content?.[0]?.text === "ok" && !!again.error && !!stale.error && calls.get("tea.browse") === 1,
    "MCP gate: a used act is refused at the other instance 4 minutes later (after prunes), and 11 minutes later it is stale; the tool ran once");
  const fresh = await call(sb.url, vg.signAct("tea.browse", {}));
  check(fresh.result?.content?.[0]?.text === "ok", "… while a new act under the same live pass still works after the prunes");
  sa.s.close(); sb.s.close();

  // 4. Several instances: pruning is the same on each, and a prune racing a visit never loses an answer or a count
  const ms = memoryStore(); const [a, b, c] = [await instance(ms), await instance(ms), await instance(ms)];
  for (let i = 0; i < 6; i++) await visitOnce([a, b, c], i);
  later(26 * H);
  const live = await people[3].visit(a, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([b, c, a]) });
  const auto: any = ms.peek()!.state;
  check(auto.live.encounters.$map.length === 1 && auto.live.seats.$map.length === 1,
    "with no prune() called, the instances drop the 6 old visits themselves as the new visit's messages arrive (only the live one is left)");
  const raced = await Promise.all([a.prune(), b.prune(), c.prune()]);
  const won = raced.filter((r) => r.ok).length;
  const after: boolean[] = []; for (const d of [a, b, c]) { const r = await d.prune(); after.push(r.ok); }
  check(won >= 1 && after.every(Boolean) && (ms.peek()!.state.live as any).seats.$map.length === 1,
    `three instances prune at once: ${won} write wins and the others are told to retry (no lost write); one by one, each succeeds and the live pass stays`);
  const o1 = await live.act("tea.order", { amount: USD("20.00"), payment_ref: "m-1" }) as any;
  const slow: DoorStore = { load: () => ms.load(), save: async (s, v) => { await new Promise((r) => setTimeout(r, 15)); return ms.save(s, v); } };
  const [x, y] = [await instance(slow), await instance(slow)];
  later(10 * 60);
  const m2 = live.signAct("tea.order", { amount: USD("15.00"), payment_ref: "m-2" });
  const [pr, ar] = await Promise.all([x.prune(), y.post(m2)]);
  const ar2 = ar.status === 429 ? await y.post(m2) : ar;
  check(o1?.ok === true && (pr.ok || ar.status === 200) && payloads(ar2.envelope).some((p: any) => p.type === "act_decision" && p.decision === "deny"),
    "a prune racing an act on another instance: one write wins, the other is withheld and retried, and the pass's cap still counts (20 + 15 over 30 is refused)");
  check(!carriedOut((await c.post(live.signAct("tea.order", { amount: USD("15.00"), payment_ref: "m-3" }))).envelope) &&
    carriedOut((await b.post(live.signAct("tea.order", { amount: USD("10.00"), payment_ref: "m-4" }))).envelope), "… and 10 more fits on a third instance (30 in all)");
  // Instances whose clocks differ by 4 minutes agree on what may go (the windows carry the 300 s skew allowance)
  const ks = new Map<string, string>(); const kv = () => kvStore({ get: async (k) => ks.get(k) ?? null, set: async (k, v) => ks.set(k, v), cas: async (k, e, n) => { if ((ks.get(k) ?? null) !== e) return false; ks.set(k, n); return true; } });
  const [k1, k2] = [await instance(kv()), await instance(kv())];
  k2.host.clock = () => new Date(Date.now() + 240e3).toISOString().replace(/\.\d+Z$/, "Z");
  const vk = await people[0].visit(k1, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([k1, k2]) });
  const ka = vk.signAct("tea.order", { amount: USD("5.00"), payment_ref: "k-1" }); await k1.post(ka);
  later(50 * 60); await k2.prune();
  check(!carriedOut((await k1.post(ka)).envelope) && carriedOut((await k1.post(vk.signAct("tea.order", { amount: USD("5.00"), payment_ref: "k-2" }))).envelope),
    "kvStore, one instance's clock 4 minutes ahead prunes: the live pass is kept, a replay is refused at the other, and a new act works");

  console.log(`${pass} pruning checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
