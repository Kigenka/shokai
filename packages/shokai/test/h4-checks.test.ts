// Red team H4 (C277): v050.site_binding (§3.1.1) and v050.host_budget_declared (§6.11) pass or skip at the reference door,
// and fail against deliberately broken stub doors.
import http from "node:http";
import { runConformance, type Ctx } from "../src/conformance/runner.js";
import { v050H4Checks, type Fetcher } from "../src/conformance/v050-h4.js";
import { createDoor } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const listen = (h: http.RequestListener) => new Promise<{ s: http.Server; port: number }>((r) => { const s = http.createServer(h); s.listen(0, "127.0.0.1", () => r({ s, port: (s.address() as any).port })); });
const st = (ctx: Ctx, id: string) => ctx.results.find((x) => x.id === id)?.status;

console.log("Red team H4 checks (C277)");
// ---- the reference door
const door = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });
const srv = await listen(async (req, res) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
const base = `http://127.0.0.1:${srv.port}/shokai`;
door.setBaseUrl(base);
const listing: any = await (await fetch(base + "/places")).json();
const refCtx: Ctx = { base, results: [], place: listing?.places?.[0], listing };
await v050H4Checks(refCtx);
for (const id of ["v050.site_binding", "v050.host_budget_declared"]) check(["pass", "skip", "na"].includes(String(st(refCtx, id))), `the reference door: ${id} is pass or skip (${st(refCtx, id) ?? "missing"})`);
const rr = await runConformance(base);
for (const id of ["v050.site_binding", "v050.host_budget_declared"]) {
  const x = rr.results.find((r) => r.id === id)?.status;
  check(x === "pass" || x === "skip" || x === "na", `the runner reports ${id} (${x ?? "missing"})`);
}
srv.s.close();

// ---- broken stub doors
const entry = "https://door.example/shokai/places/tea/entry";
const pid = "did:web:door.example";
const place = { name: "tea", entry, principal_id: pid, spec_ref: { version: "0.5.0" }, actions: [] };
const stub = (routes: Record<string, unknown>): Fetcher => async (url: string) =>
  url in routes ? new Response(JSON.stringify(routes[url]), { status: 200, headers: { "content-type": "application/json" } }) : new Response("not found", { status: 404 });
const card = (site: string) => ({ payload: { kind: "host", place: { principal_id: pid, site } }, payload_digest: "sha-256:x", signatures: [{ alg: "EdDSA", value: "x" }] });
const run = async (routes: Record<string, unknown>) => { const ctx: Ctx = { base: "https://door.example/shokai", results: [], place, listing: { places: [place] } }; await v050H4Checks(ctx, { fetcher: stub(routes) }); return ctx; };
const lobby = { messages: [] };

const unlisted = await run({ [entry + "/host-card.json"]: card("https://shop.example"), [entry]: lobby,
  "https://shop.example/.well-known/shokai": { type: "door_pointer", places: [{ entry: "https://door.example/shokai/places/other/entry", principal_id: pid }] } });
check(st(unlisted, "v050.site_binding") === "fail", `a card naming a site whose own file doesn't list the entry fails v050.site_binding (${st(unlisted, "v050.site_binding")})`);
const malformed = await run({ [entry + "/host-card.json"]: card("https://Shop.example/"), [entry]: lobby });
check(st(malformed, "v050.site_binding") === "fail", `a place.site that isn't a serialized origin fails v050.site_binding (${st(malformed, "v050.site_binding")})`);
const noPid = await run({ [entry + "/host-card.json"]: card("https://shop.example"), [entry]: lobby,
  "https://shop.example/.well-known/shokai": { type: "door_pointer", places: [{ entry }] } });
check(st(noPid, "v050.site_binding") === "fail", `a door on another origin whose site item carries no principal_id fails v050.site_binding (${st(noPid, "v050.site_binding")})`);
const bound = await run({ [entry + "/host-card.json"]: card("https://shop.example"), [entry]: lobby,
  "https://shop.example/.well-known/shokai": { type: "door_pointer", places: [{ entry, principal_id: pid }] } });
check(st(bound, "v050.site_binding") === "pass", `a properly bound door passes v050.site_binding (${st(bound, "v050.site_binding")})`);
check(st(bound, "v050.host_budget_declared") === "skip", `with no summary and no lobby briefing, v050.host_budget_declared skips (${st(bound, "v050.host_budget_declared")})`);

const leaky = await run({ [entry + "/house-summary.json"]: { name: "tea", policy: { host_budget: { mode: "metered", time_zone: "Asia/Tokyo" } } }, [entry]: lobby });
check(st(leaky, "v050.host_budget_declared") === "fail", `a house summary showing policy.host_budget fails v050.host_budget_declared (${st(leaky, "v050.host_budget_declared")})`);
const leakyLobby = await run({ [entry + "/house-summary.json"]: { name: "tea" }, [entry]: { messages: [{ payload: { type: "lobby_briefing", host_budget: { mode: "subscription" } } }] } });
check(st(leakyLobby, "v050.host_budget_declared") === "fail", `a lobby briefing showing host_budget fails v050.host_budget_declared (${st(leakyLobby, "v050.host_budget_declared")})`);
check(st(leakyLobby, "v050.site_binding") === "skip", `no host card served: v050.site_binding skips (${st(leakyLobby, "v050.site_binding")})`);

console.log(`\nH4 checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
