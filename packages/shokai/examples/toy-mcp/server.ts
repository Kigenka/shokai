// A toy MCP server (three note tools) behind a Shōkai door. The gate itself is the ten lines marked below.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoor } from "../../src/index.js";
import { shokaiGate, statelessMcp } from "../../src/mcp.js";

const notes = new Map<string, string>([["tea", "Sencha at 70°C for one minute."], ["kiln", "Bisque firing on Thursday."]]);
export function buildNotesServer() {
  const server = new McpServer({ name: "lantern-notes", version: "1.0.0" });
  server.registerTool("notes.search", { description: "Search notes by keyword", inputSchema: { q: z.string() } },
    async ({ q }) => ({ content: [{ type: "text", text: [...notes.keys()].filter((k) => k.includes(q) || notes.get(k)!.toLowerCase().includes(q.toLowerCase())).join(", ") || "(none)" }] }));
  server.registerTool("notes.read", { description: "Read one note", inputSchema: { id: z.string() } },
    async ({ id }) => ({ content: [{ type: "text", text: notes.get(id) ?? "(no such note)" }] }));
  server.registerTool("notes.add", { description: "Add a note", inputSchema: { id: z.string(), text: z.string() } },
    async ({ id, text }) => { notes.set(id, text); return { content: [{ type: "text", text: "added " + id }] }; });
  return server;
}

export const createNotesDoor = () => createDoor({ name: "notes", displayName: "Lantern Notes", category: "x-tools",
    purposes: [{ code: "inquiry", statement: "Reading and searching notes." }, { code: "x-editing", statement: "Adding notes." }],
    actions: [{ action: "notes.search", purposes: ["inquiry"], level: "discover", limits: { max_operations: 20 } },
              { action: "notes.read", purposes: ["inquiry"], level: "discover" },
              { action: "notes.add", purposes: ["x-editing"], level: "act_on_behalf", data_asks: [] }] });

export function startGatedServer(port = 0): Promise<{ server: http.Server; base: string; door: ReturnType<typeof createDoor> }> {
  // ---- the gate: a Shōkai door in front of the MCP server -------------------------------------------------------------
  const door = createNotesDoor();
  const server = http.createServer(shokaiGate(door, statelessMcp(buildNotesServer)));
  // ----------------------------------------------------------------------------------------------------------------------
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => {
    const base = `http://127.0.0.1:${(server.address() as any).port}`; door.setBaseUrl(base + "/shokai"); resolve({ server, base, door });
  }));
}

if (process.argv[1]?.endsWith("server.js")) {
  const { base } = await startGatedServer(Number(process.env.PORT ?? 3000));
  console.log(`Lantern Notes (MCP) behind a Shōkai door:\n  door listing  ${base}/shokai/places\n  MCP endpoint  ${base}/mcp`);
}
