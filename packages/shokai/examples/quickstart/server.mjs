// server.mjs: an MCP server with two tools, behind a Shōkai door.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoor } from "@kigenka/shokai";
import { shokaiGate, statelessMcp } from "@kigenka/shokai/mcp";

const PRICES = { sencha: "6.00", hojicha: "5.50", genmaicha: "5.00" }; // USD, mock

// Your MCP server, unchanged. A tool that spends takes an `amount` argument and checks it against its own price.
function buildServer() {
  const server = new McpServer({ name: "tea-shop", version: "1.0.0" });
  server.registerTool("menu.view", { description: "List today's teas and prices (USD)", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: Object.entries(PRICES).map(([t, p]) => `${t} ${p}`).join(", ") }] }));
  server.registerTool("order.place", { description: "Order one tea; amount must equal its price",
    inputSchema: { tea: z.string(), amount: z.object({ value: z.string(), currency: z.string() }) } },
    async ({ tea, amount }) => PRICES[tea] === amount.value && amount.currency === "USD"
      ? { content: [{ type: "text", text: `ordered ${tea} for ${amount.value} USD` }] }
      : { isError: true, content: [{ type: "text", text: `${tea} costs ${PRICES[tea] ?? "?"} USD` }] });
  return server;
}

// The door: who may be admitted, for what, which actions spend, and what each action will ask the owner for.
const door = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },   // the person who approved this door's Shōkai host card
  name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [
    { action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
  ],
  spendingActions: ["order.place"],
});

const port = Number(process.env.PORT ?? 3000);
http.createServer(shokaiGate(door, statelessMcp(buildServer))).listen(port, "127.0.0.1", () => {
  door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
  console.log(`door:  http://127.0.0.1:${port}/shokai/places\nmcp:   http://127.0.0.1:${port}/mcp`);
});
