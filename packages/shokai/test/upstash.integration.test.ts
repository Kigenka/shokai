// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Opt-in integration test: the drop-in door's kvStore on a real Upstash Redis (REST API, no package), as a door on Vercel would use
// it. Not part of `npm test`. Runs only with SHOKAI_UPSTASH_IT=1 and the store's REST address and token in the environment
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL / KV_REST_API_TOKEN as Vercel's integration names them):
//   set -a; . ./path/to/your-upstash.env; set +a; SHOKAI_UPSTASH_IT=1 npm run test:upstash
// `--fake` runs the same checks against a loopback stand-in (no network), to check the test itself. Every key it writes is under
// a fresh `shokai-it:<run>:` prefix and is deleted at the end. Never prints the address or the token. Fictional people only.
import { createDoor, createRepresentative, signCard, generateRepresentativeKey, developmentPasskey, houseDigestFor, summaryDigestFor, kvStore,
  type DoorOptions, type DoorStore, type Door } from "../src/index.js";
import { entryUrl } from "../src/core/door.js";
import type * as S from "../src/core/shapes.js";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

/** Compare-and-set in one Lua script: the value is replaced only if its SHA-1 is still the one we read (or it is still absent). */
const CAS_LUA = `local cur = redis.call('GET', KEYS[1])
if ARGV[1] == '' then if cur then return 0 end
elseif (not cur) or redis.sha1hex(cur) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;
type Timing = { op: string; ms: number; bytes: number };
/** kvStore's three functions over Upstash's REST API (one HTTPS POST per command), timed. */
export function upstashKv(o: { url: string; token: string; timings?: Timing[] }) {
  if (!/^https:\/\//.test(o.url) && !/^http:\/\/127\.0\.0\.1[:/]/.test(o.url)) throw new Error("the store's address must be https");
  const cmd = async (op: string, args: unknown[]) => {
    const body = JSON.stringify(args); const t0 = performance.now();
    const r = await fetch(o.url, { method: "POST", headers: { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(10_000) });
    const j: any = await r.json().catch(() => ({})); o.timings?.push({ op, ms: performance.now() - t0, bytes: body.length });
    if (!r.ok || j.error) throw new Error(`store ${op} failed (${r.status})`); return j.result;
  };
  return {
    get: (key: string) => cmd("GET", ["GET", key]) as Promise<string | null>,
    set: (key: string, value: string) => cmd("SET", ["SET", key, value]),
    cas: async (key: string, expected: string | null, next: string) =>
      Number(await cmd("CAS", ["EVAL", CAS_LUA, "1", key, expected === null ? "" : createHash("sha1").update(expected, "utf8").digest("hex"), next])) === 1,
    del: (key: string) => cmd("DEL", ["DEL", key]),
  };
}

/** A loopback stand-in for --fake: GET, SET, DEL and the CAS script above, with a little delay. */
function fakeUpstash(token: string): Promise<{ url: string; close(): void }> {
  const kv = new Map<string, string>();
  const s = createServer((q, res) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => setTimeout(() => {
    if (q.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end("{}"); return; }
    const a = JSON.parse(b) as string[]; let result: unknown = null;
    if (a[0] === "GET") result = kv.get(a[1]) ?? null;
    else if (a[0] === "SET") { kv.set(a[1], a[2]); result = "OK"; }
    else if (a[0] === "DEL") result = kv.delete(a[1]) ? 1 : 0;
    else if (a[0] === "EVAL") { const [, , , key, exp, next] = a; const cur = kv.get(key);
      const ok = exp === "" ? cur === undefined : cur !== undefined && createHash("sha1").update(cur, "utf8").digest("hex") === exp; if (ok) kv.set(key, next); result = ok ? 1 : 0; }
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ result })); }, 2)); });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(s.address() as any).port}`, close: () => s.close() })));
}

const USD = (value: string) => ({ value, currency: "USD" });
const BASE = "https://lanternmoss.example/shokai";
const tea = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "lanternmoss", displayName: "Lanternmoss Tea Room", category: "store", baseUrl: BASE,
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], purchaseHoldSeconds: 120, ...o });
const sora = developmentPasskey(); const rep = generateRepresentativeKey();
const card = signCard(rep, sora, { displayName: "Lanternmoss Tea Room", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], cardKind: "host",
  host: { place: { principal_id: sora.id, entry: entryUrl(BASE, "lanternmoss") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes", "hold_purchases"] }, house_digest: houseDigestFor(tea(), sora.id, BASE), summary_digest: summaryDigestFor(tea(), BASE) },
  shownToOwner: { text: "My representative may welcome visitors at Lanternmoss Tea Room and serve tea.browse, tea.order.", locale: "en-US" } });
const payloads = (env: S.ReplyEnvelope) => env.messages.map((m: any) => m.payload ?? m);
const carriedOut = (env: S.ReplyEnvelope) => payloads(env).some((p: any) => p.type === "act_result" && p.ok === true);
const roundRobin = (doors: Door[]) => { let i = 0; return async (_u: string, body: unknown) => {
  for (let tries = 0; ; tries++) { const r = await doors[i++ % doors.length].post(body); if (r.status === 200) return r.envelope; if (r.status !== 429 || tries > 5) throw new Error(`instance answered ${r.status}`); } }; };
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

async function main() {
  const fake = process.argv.includes("--fake");
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL; const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!fake && (process.env.SHOKAI_UPSTASH_IT !== "1" || !url || !token)) { console.log("upstash integration: skipped (set SHOKAI_UPSTASH_IT=1 and the store's REST address and token)"); return; }
  const stand = fake ? await fakeUpstash("t0k") : null;
  const timings: Timing[] = []; const up = upstashKv({ url: stand?.url ?? url!, token: stand ? "t0k" : token!, timings });
  const run = "shokai-it:" + randomBytes(6).toString("hex") + ":"; const keys: string[] = []; const K = (k: string) => { keys.push(run + k); return run + k; };
  console.log(`kvStore on ${fake ? "a loopback stand-in (--fake)" : "Upstash Redis (REST)"}; keys under a fresh run prefix`);
  try {
    // 1. Compare-and-set as kvStore needs it
    const ck = K("cas");
    const c1 = await up.cas(ck, null, "one"); const c2 = await up.cas(ck, null, "two"); const c3 = await up.cas(ck, "one", "three"); const c4 = await up.cas(ck, "one", "four");
    check(c1 && !c2 && c3 && !c4 && (await up.get(ck)) === "three", "compare-and-set: create only if absent, replace only if unchanged since read (SHA-1 compared in one Lua script)");
    // 2. Writers racing on one key through kvStore: none lost
    const ctr = K("counter"); const writers = 4, each = 10;
    const t0 = performance.now(); let conflicts = 0;
    await Promise.all(Array.from({ length: writers }, async () => { const s = kvStore(up, ctr);
      for (let i = 0; i < each; ) { const cur = await s.load(); const n = ((cur?.state as any)?.n ?? 0) + 1; if ((await s.save({ n } as any, cur?.version ?? 0)) !== null) i++; else conflicts++; } }));
    const fin: any = await kvStore(up, ctr).load();
    check(fin?.state?.n === writers * each && fin.version === writers * each, `${writers} writers × ${each} compare-and-set writes, none lost (${conflicts} conflicts retried, ${Math.round(performance.now() - t0)} ms)`);
    // 3. One door, three instances on one key, no sticky sessions
    const dk = K("door"); const inst = async (o: Partial<DoorOptions> = {}) => { const d = createDoor(tea({ card, keys: { rep }, store: kvStore(up, dk), ...o })); await d.ready; return d; };
    const [a, b, c] = [await inst(), await inst(), await inst()];
    const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], ownerPrompts: "purchase_only" });
    const tv = performance.now();
    const v = await aya.visit(a, { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([a, b, c]) });
    const visitMs = performance.now() - tv;
    const o1 = await a.post(v.signAct("tea.order", { amount: USD("20.00"), payment_ref: "u-1" }));
    const o2 = await b.post(v.signAct("tea.order", { amount: USD("15.00"), payment_ref: "u-2" }));
    const o3 = await c.post(v.signAct("tea.order", { amount: USD("10.00"), payment_ref: "u-3" }));
    check(v.seated && carriedOut(o1.envelope) && !carriedOut(o2.envelope) && carriedOut(o3.envelope),
      `a visit across three instances is admitted with a pass (${Math.round(visitMs)} ms for the ritual); its spending cap counts across them (20 ok, 15 refused, 10 ok)`);
    // 4. Two acts racing on two instances: one answered, the other withheld (429), never both from stale state
    const vr = await aya.visit(a, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") }, mandate: { fresh: true }, transport: roundRobin([c, a, b]) });
    const m1 = vr.signAct("tea.order", { amount: USD("5.00"), payment_ref: "r-1" }); const m2 = vr.signAct("tea.order", { amount: USD("5.00"), payment_ref: "r-2" });
    const [d1, d2] = [await inst(), await inst()];
    const [r1, r2] = await Promise.all([d1.post(m1), d2.post(m2)]);
    const st = [r1.status, r2.status].sort().join();
    check(st === "200,429" || st === "200,200", `two acts at once on two instances: ${st === "200,429" ? "one answered, the other withheld (429, retry)" : "both answered one after the other (no overlap this time)"}`);
    const retry = r1.status === 429 ? await a.post(m1) : r2.status === 429 ? await a.post(m2) : null;
    const replay = await c.post(r1.status === 200 ? m1 : m2);
    check(vr.seated && carriedOut((r1.status === 200 ? r1 : r2).envelope) && (!retry || carriedOut(retry.envelope)) && !carriedOut(replay.envelope), "the withheld act goes through on retry, and an act already carried out, replayed at another instance, is not carried out again");
    // 5. Pruning on the real store
    const pr = await b.prune(); const size = JSON.stringify((await kvStore(up, dk).load())?.state ?? {}).length;
    check(pr.ok, `door.prune() runs against the store with its version check (state now ${size} bytes)`);
  } finally {
    for (const k of keys) await up.del(k).catch(() => {});
    const left = (await Promise.all(keys.map((k) => up.get(k).catch(() => "?")))).filter((x) => x !== null).length;
    check(left === 0, `cleanup: the run's ${keys.length} keys deleted`);
    stand?.close();
  }
  const by = (op: string) => timings.filter((t) => t.op === op);
  for (const op of ["GET", "CAS", "SET"]) { const t = by(op); if (!t.length) continue;
    console.log(`    ${op}: n=${t.length} p50=${pct(t.map((x) => x.ms), 0.5).toFixed(1)} ms p95=${pct(t.map((x) => x.ms), 0.95).toFixed(1)} ms max body=${Math.max(...t.map((x) => x.bytes))} bytes`); }
  console.log(`${pass} upstash integration checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
