// server.mjs: an MCP server with two tools, behind a Shōkai door.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoor } from "@kigenka/shokai";
import { shokaiGate, statelessMcp } from "@kigenka/shokai/mcp";

// Your MCP server, unchanged.
function buildServer() {
  const server = new McpServer({ name: "tea-shop", version: "1.0.0" });
  server.registerTool("menu.view", { description: "List today's teas", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: "sencha, hojicha, genmaicha" }] }));
  server.registerTool("order.place", { description: "Order a tea", inputSchema: { tea: z.string() } },
    async ({ tea }) => ({ content: [{ type: "text", text: `ordered ${tea}` }] }));
  return server;
}

// The door: who may sit down, for what, and what each action will ask the owner for.
const door = createDoor({
  name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "inquiry", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [
    { action: "menu.view", purposes: ["inquiry", "purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: ["name", "address", "payment_method"] },
  ],
});

const port = Number(process.env.PORT ?? 3000);
http.createServer(shokaiGate(door, statelessMcp(buildServer))).listen(port, "127.0.0.1", () => {
  door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
  console.log(`door:  http://127.0.0.1:${port}/shokai/places\nmcp:   http://127.0.0.1:${port}/mcp`);
});
