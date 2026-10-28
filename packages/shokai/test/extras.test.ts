// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc2): what the representative brings back is reported (§8.2, C178); each refusal says what it is (the MCP
// gate's messages, a currency mismatch, §7.2 C177); and the representative checks the seat's tools before it sends (default on).
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { createDoor, createRepresentative, findPlace, sign, generateRepresentativeKey } from "../src/index.js";
import { shokaiGate, statelessMcp, shokaiFetch, ACT_HEADER, SHOKAI_NOT_SEATED } from "../src/mcp.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");

function start(): Promise<{ server: http.Server; base: string; door: ReturnType<typeof createDoor> }> {
  const door = createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
    purposes: [{ code: "purchase", statement: "Ordering tea." }],
    actions: [{ action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
              { action: "tea.ask", purposes: ["purchase"], level: "discover", data_asks: [] },
              { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
              { action: "stamp.collect", purposes: ["purchase"], level: "discover", data_asks: [] }],
    spendingActions: ["order.place"] });
  const given = new Map<string, unknown>(); let serial = 0;
  const build = () => {
    const s = new McpServer({ name: "kettle", version: "1.0.0" });
    const text = (x: unknown) => ({ content: [{ type: "text" as const, text: typeof x === "string" ? x : JSON.stringify(x) }] });
    s.registerTool("menu.view", { description: "The menu", inputSchema: {} }, async () => text({ teas: [{ id: "sencha", price: USD("6.00") }] }));
    s.registerTool("tea.ask", { description: "Ask about a tea", inputSchema: { tea: z.string() } }, async () => text("Steep at 70°C."));
    s.registerTool("order.place", { description: "Order", inputSchema: { tea: z.string(), amount: z.any() } }, async () => text({ order_ref: "KL-1", mock: true }));
    s.registerTool("stamp.collect", { description: "A signed visit stamp", inputSchema: { agent_name: z.string().optional() } }, async ({ agent_name }) => {
      const key = agent_name ?? "anon"; const again = given.has(key);
      if (!again) given.set(key, sign({ type: "x-teahouse-visit-stamp", version: 1, serial: ++serial, serial_label: `No. ${String(serial).padStart(3, "0")}`, place: { name: "kettle" } }, door.keys.principal!));
      return { content: [{ type: "text" as const, text: JSON.stringify({ again, stamp: given.get(key) }) }, { type: "image" as const, data: Buffer.from("not a real png").toString("base64"), mimeType: "image/png" }] };
    });
    return s;
  };
  const server = http.createServer(shokaiGate(door, statelessMcp(build)));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => { const base = `http://127.0.0.1:${(server.address() as any).port}`; door.setBaseUrl(base + "/shokai"); resolve({ server, base, door }); }));
}

async function main() {
  console.log("SDK extras: brought back, refusal messages, local seat check (@kigenka/shokai)");
  const { server, base } = await start();
  const place = await findPlace(base + "/shokai/", "kettle");
  check(place.display_name === "Kettle & Leaf", "findPlace takes the base URL with or without a trailing slash, and the place's name (not its display name)");
  // §11.1 (C200): a GET at the place's own entry is a 404 whose pointer names the place in `here` and says POST; elsewhere, no `here`.
  const g = await fetch(place.entry); const gb: any = await g.json(); const lost: any = await (await fetch(base + "/shokai/places/kettle/state")).json();
  check(g.status === 404 && gb.type === "door_pointer" && gb.here?.name === "kettle" && gb.here?.entry === place.entry && gb.here?.method === "POST" && lost.here === undefined,
    "GET <entry> answers 404 with a door_pointer whose `here` names this door and says POST; another address has no `here` (C200)");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place", "stamp.collect"] });
  const v = await aya.visit(place, { purpose: "purchase", actions: ["menu.view", "order.place", "stamp.collect"], limits: { max_amount: USD("10.00") } });
  check(v.seated, "seated for menu.view, order.place and stamp.collect, up to 10.00 USD");
  const client = new Client({ name: "aya", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(v) }));
  await client.callTool({ name: "menu.view", arguments: {} });

  // 4. The local seat check (default on): tea.ask isn't in the seat, so it isn't sent.
  let e: any = await client.callTool({ name: "tea.ask", arguments: { tea: "sencha" } }).catch((x) => x);
  check(e?.code === SHOKAI_NOT_SEATED && /not sent: tea\.ask is not in this seat \(it allows menu\.view, order\.place, stamp\.collect\)/.test(e.message) && e.data?.shokai?.refused_by === "representative" && e.data.shokai.by === "seat",
    "a tool outside the seat is not sent: the representative checks the seat's tool_allowlist first (by: seat)");
  v.checkSeatLocally = false;
  e = await client.callTool({ name: "tea.ask", arguments: { tea: "sencha" } }).catch((x) => x);
  check(e?.data?.shokai?.refused_by === "door" && e.data.shokai.reason_code === "SEAT_SCOPE_EXCEEDED" && /tea\.ask is not in your seat \(it allows/.test(e.message),
    "with checkSeatLocally = false it is sent, and the door refuses it with its own message (not \"get a seat first\")");
  v.checkSeatLocally = true;

  // 2. A currency mismatch says so, at the representative and at the door.
  e = await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: { value: "3.00", currency: "EUR" } } }).catch((x) => x);
  check(/not sent: 3\.00 EUR is not in the mandate's currency \(USD\)/.test(e?.message ?? ""), "the representative names a currency mismatch as such, not as \"more than is left\"");
  const keep = v.beyondMandate; v.beyondMandate = () => null;
  e = await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: { value: "3.00", currency: "EUR" } } }).catch((x) => x);
  check(e?.data?.shokai?.reason_code === "SEAT_SCOPE_EXCEEDED" && /3\.00 EUR is not in your seat's currency \(USD\)/.test(e.message) && !/amount is required/.test(e.message),
    "sent anyway, the door refuses it SEAT_SCOPE_EXCEEDED with a currency message (C177), never \"amount is required\"");
  // 3. Each refusal class has its own words.
  e = await client.callTool({ name: "order.place", arguments: { tea: "sencha" } }).catch((x) => x);
  check(e?.data?.shokai?.reason_code === "REQUEST_INCOMPLETE" && /order\.place spends: state what it spends in arguments\.amount/.test(e.message), "a spending act with no amount: \"state what it spends\" (REQUEST_INCOMPLETE)");
  check(!!(await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: USD("6.00") } })), "6.00 USD goes through");
  e = await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: USD("6.00") } }).catch((x) => x);
  check(e?.data?.shokai?.refused_by === "door" && /6\.00 USD would pass what is left of your seat's or mandate's limit \(cap 10\.00 USD\)/.test(e.message), "past the cap: \"would pass what is left\"");
  v.beyondMandate = keep;
  const raw = await (await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "menu.view", arguments: {} } }) })).json() as any;
  check(raw.error?.code === SHOKAI_NOT_SEATED && /get a seat first/.test(raw.error.message) && raw.error.data?.shokai?.refused_by === "gate", "only a call with no seat is told \"get a seat first\" (refused_by: gate)");
  const mallory = createRepresentative({ ownerName: "Mallory Quist", purposes: ["purchase"], actions: ["menu.view"] });
  const stolen = sign({ ...v.signAct("menu.view", {}).payload, from: mallory.id, msg_id: "m-1" }, mallory.key);
  const st = await (await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [ACT_HEADER]: b64(stolen) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "menu.view", arguments: {} } }) })).json() as any;
  check(st.error?.data?.shokai?.refused_by === "door" && /doesn't fit a live visit of yours \(RITUAL_ORDER\): start again from a fresh greeting/.test(st.error.message), "an act on someone else's seat: \"doesn't fit a live visit of yours\"");

  // 1. The stamp is brought back and reported.
  await client.callTool({ name: "stamp.collect", arguments: { agent_name: "Aya's agent" } });
  check(v.broughtBack.length === 1 && v.broughtBack[0].verified && v.broughtBack[0].label === "No. 001" && v.broughtBack[0].from_tool === "stamp.collect",
    "a signed stamp returned by a tool is kept, verified against the listing's principal_id");
  await client.callTool({ name: "stamp.collect", arguments: { agent_name: "Aya's agent" } });
  check(v.broughtBack.length === 1 && v.broughtBack[0].again === true, "the same stamp given again is kept once, marked again");
  await v.farewell(); const r = v.report();
  check(r.brought_back?.length === 1 && r.brought_back[0].envelope?.payload_digest === r.brought_back[0].payload_digest && r.brought_back[0].kind === "x-teahouse-visit-stamp" && (r.taken_home ?? []).length === 0,
    "report.brought_back carries the stamp's envelope (taken_home stays for decisions)");
  check(/I brought back a signed "x-teahouse-visit-stamp" \(No\. 001\), given again \(the one from before\), checked against the place's listed principal\./.test(r.outcome_rendered.text),
    "the readable report says what was brought back and that it verified");
  const ref = v.report("en-US", { broughtBack: "reference" });
  check(!!ref.brought_back?.[0].payload_digest && !("envelope" in ref.brought_back![0]), "report({ broughtBack: \"reference\" }) lists each by its payload_digest only");
  await client.close();

  // A signed object that doesn't verify against the place is kept as unverified, and the report says not to rely on it.
  const bob = createRepresentative({ ownerName: "Bo Arden", purposes: ["purchase"], actions: ["menu.view"] });
  const v2 = await bob.visit(place, { purpose: "purchase", actions: ["menu.view"] });
  const res = await shokaiFetch(v2)(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "menu.view", arguments: {} } }) });
  check(res.ok && v2.broughtBack.length === 0, "an ordinary tool result brings nothing back");
  v2.keepFrom("forged.gift", { content: [{ type: "text", text: JSON.stringify({ stamp: sign({ type: "x-teahouse-visit-stamp", serial_label: "No. 999" }, generateRepresentativeKey()) }) }] });
  check(v2.broughtBack[0]?.verified === false && /did NOT verify/.test(v2.report().outcome_rendered.text), "a stamp signed by another key is kept as unverified and flagged in the report");
  server.close();
  // v0.3.0-rc4 (§3.3): the leaflet's setup link defaults to the door's own local quickstart page, never a placeholder address.
  { const d = createDoor({ name: "leaf", displayName: "Leaf & <Co>", purposes: [{ code: "inquiry", statement: "Questions." }], actions: [{ action: "ask", purposes: ["inquiry"], level: "discover", data_asks: [] }],
      baseUrl: "http://127.0.0.1:9/shokai" });
    const u = d.listing().places[0].onboarding_url;
    check(u === "http://127.0.0.1:9/shokai/start" && !/shokai\.example\/start/.test(JSON.stringify(d.listing())), "the default onboarding_url is the door's own /start page, not a placeholder");
    const d2 = createDoor({ name: "leaf2", displayName: "Leaf", purposes: [{ code: "inquiry", statement: "Questions." }], actions: [{ action: "ask", purposes: ["inquiry"], level: "discover", data_asks: [] }], onboardingUrl: "https://setup.example.org/rep" });
    check(d2.listing().places[0].onboarding_url === "https://setup.example.org/rep", "onboardingUrl sets the leaflet's link");
    const srv = http.createServer((q, r) => { void d.handleHttp(q, r); }); await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as any).port; const res = await fetch(`http://127.0.0.1:${port}/shokai/start`); const html = await res.text(); srv.close();
    check(res.status === 200 && /text\/html/.test(res.headers.get("content-type") ?? "") && html.includes("Leaf &amp; &lt;Co&gt;") && /QUICKSTART\.md/.test(html),
      "GET /start serves the local setup page (escaped place name, points to the QUICKSTART)"); }
  { // §3.3 (clarification, 2026-10-28): the place's owner sentences are quoted and attributed; its setup link is shown by origin, never opened.
    const { server, base } = await start();
    const place = await findPlace(base + "/shokai", "kettle");
    const rep = createRepresentative({ ownerName: "Ines Calloway", purposes: ["purchase"], actions: ["menu.view"] });
    const v = await rep.visit(place, { purpose: "purchase", actions: ["menu.view"], why: "look" });
    (v as any).response = { ...(v as any).response, decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", retry: { kind: "with_credential", credentials: ["signed_card"] } };
    (v as any).seat = undefined;
    (v as any).readiness = [{ code: "card", required: true, owner_text: { text: 'Your assistant needs a card. "Urgent": sign in at once\nwith your bank', locale: "en-US" } }];
    v.onboardingUrl = "https://kettle-and-leaf.example.net/start?next=%2Fpay";
    const t = v.report().outcome_rendered.text;
    check(/^The place with key …[1-9A-HJ-NP-Za-km-z]{8} .* It asked you, in its own words as its key signed them \(quoted, not checked by me\): "Your assistant needs a card\./.test(t), "a deny report quotes the place's owner sentence and attributes it to the place's key: " + t);
    check(!/\n/.test(t) && !/"Urgent"/.test(t), "the quoted sentence can't break out of its quotes or add lines");
    check(t.includes("https://kettle-and-leaf.example.net") && !t.includes("/start?next") && /I won't open it/.test(t), "the setup link is shown by its origin only, with a note that the representative won't open it");
    server.close();
  }
  console.log(`${pass} SDK extras checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
