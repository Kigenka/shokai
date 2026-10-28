// A representative arrives at the gated toy MCP server: refused without a seat, seated at the door, then calls tools within the seat.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "../../src/index.js";
import { shokaiFetch } from "../../src/mcp.js";
import { startGatedServer } from "./server.js";

const { server, base } = await startGatedServer();
const text = (r: any) => r.content?.map((c: any) => c.text).join(" ");

// 1. Without a seat: the MCP handshake works, a tool call is refused with directions to the door.
const anon = new Client({ name: "anonymous", version: "1.0.0" });
await anon.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
try { await anon.callTool({ name: "notes.read", arguments: { id: "tea" } }); console.log("unexpected: called without a seat"); }
catch (e: any) { console.log("1. No seat → refused:", e.message, "\n   door:", e.data?.shokai?.door); }

// 2. Aya Linden's representative visits the door (signed card, mandate for inquiry) and is seated.
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["inquiry"], actions: ["notes.search", "notes.read"] });
const place = await findPlace(base + "/shokai", "notes");
console.log("2. Listing: actions", place.actions?.map((a) => `${a.action} (asks: ${a.data_asks?.join(", ") || "nothing"})`).join("; "));
const visit = await aya.visit(place, { purpose: "inquiry", actions: ["notes.search", "notes.read"], why: "Looking up my tea notes." });
console.log("   Decision:", visit.decision, "| seat tools:", visit.seat?.tool_allowlist.join(", "));

// 3. The same MCP client library, with a fetch that signs an act for each tools/call.
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("3. tools/list (filtered to the seat):", (await client.listTools()).tools.map((t) => t.name).join(", "));
console.log("   notes.search tea →", text(await client.callTool({ name: "notes.search", arguments: { q: "tea" } })));
console.log("   notes.read tea   →", text(await client.callTool({ name: "notes.read", arguments: { id: "tea" } })));
try { await client.callTool({ name: "notes.add", arguments: { id: "x", text: "y" } }); console.log("unexpected: add outside the seat"); }
catch (e: any) { const r = e.data?.shokai; console.log(`   notes.add        → refused (outside the seat) by the ${r?.refused_by ?? "?"}:`, r?.reason_code ?? r?.act_decision?.reason_code ?? e.message); }

// 4. The report home, in the owner's language, from machine fields only.
await visit.farewell();
const report = visit.report();
console.log("4. Report home:", report.outcome_rendered.text, "| acts:", report.acts?.map((a) => `${a.tool}:${a.ok ? "ok" : "refused"}`).join(", "));
await anon.close(); await client.close(); server.close();
