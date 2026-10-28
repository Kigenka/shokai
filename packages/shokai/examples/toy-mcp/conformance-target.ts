// `npx shokai-conformance dist/examples/toy-mcp/conformance-target.js`: the gated toy MCP server as a conformance target.
import { createNotesDoor, buildNotesServer } from "./server.js";
import { shokaiGate, statelessMcp } from "../../src/mcp.js";
export const door = createNotesDoor();
export const handler = shokaiGate(door, statelessMcp(buildNotesServer));
