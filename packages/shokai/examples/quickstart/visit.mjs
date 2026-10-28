// visit.mjs: Aya Linden's representative arrives, is seated, and uses the MCP server within its seat.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const base = process.env.BASE ?? "http://127.0.0.1:3000";

// 1. Without a seat, a tool call is refused, with directions to the door.
const stranger = new Client({ name: "stranger", version: "1.0.0" });
await stranger.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
await stranger.callTool({ name: "menu.view", arguments: {} }).catch((e) => console.log("stranger:", e.message));

// 2. A representative with a card its owner signed (a development passkey here; a real passkey in production).
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["inquiry"], actions: ["menu.view"] });

// 3. Look before you join: the listing says what each action will ask the owner for.
const place = await findPlace(base + "/shokai", "tea-shop");
for (const a of place.actions) console.log(`listing: ${a.action} asks for ${a.data_asks.join(", ") || "nothing"}`);

// 4. The ritual: greeting, signed card, introduction, a request within a mandate Aya signed.
const visit = await aya.visit(place, { purpose: "inquiry", actions: ["menu.view"], why: "Aya wants to see today's teas." });
console.log("decision:", visit.decision, "| seat:", visit.seat?.tool_allowlist);

// 5. The same MCP client, with a fetch that signs an act for each tool call.
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("tools in my seat:", (await client.listTools()).tools.map((t) => t.name));
console.log("menu.view:", (await client.callTool({ name: "menu.view", arguments: {} })).content[0].text);
await client.callTool({ name: "order.place", arguments: { tea: "sencha" } }).catch((e) => console.log("order.place:", e.message));

// 6. Report home to Aya.
await visit.farewell();
console.log("report:", visit.report().outcome_rendered.text);
await stranger.close(); await client.close();
