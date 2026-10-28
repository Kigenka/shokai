// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.3.0-rc4 (§7.2, C194): the MCP gate releases an act the MCP server did not carry out, so a failed call doesn't use up the
// owner's allowance; a tool error (isError) is released by default and kept with releaseOn "rpc-error"; SSE responses are never inspected (fail safe).
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createDoor, createRepresentative, findPlace, readBody } from "../src/index.js";
import { ACT_HEADER, shokaiGate, type GateOptions } from "../src/mcp.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
const USD = (value: string) => ({ value, currency: "USD" });

// A stand-in MCP server: order.place answers by the "outcome" argument: ok, rpc_error, tool_error, http_500, or sse.
const mcp = async (_req: http.IncomingMessage, res: http.ServerResponse, body: any) => {
  const m = body; const outcome = m?.params?.arguments?.outcome;
  if (outcome === "http_500") { res.writeHead(500, { "content-type": "application/json" }); res.end("{}"); return; }
  if (outcome === "sse") { res.writeHead(200, { "content-type": "text/event-stream" }); res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "failed" } })}\n\n`); return; }
  const reply = outcome === "rpc_error" ? { jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "the till is closed" } }
    : outcome === "tool_error" ? { jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: "out of stock" }] } }
    : { jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: "ordered" }] } };
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(reply));
};

async function shop(opts: GateOptions = {}) {
  const door = createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store", purposes: [{ code: "purchase", statement: "Ordering tea." }],
    actions: [{ action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }], spendingActions: ["order.place"] });
  const server = http.createServer(shokaiGate(door, mcp, opts)); await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; door.setBaseUrl(base + "/shokai");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["order.place"] });
  const v = await aya.visit(await findPlace(base + "/shokai", "kettle"), { purpose: "purchase", actions: ["order.place"], limits: { max_amount: USD("10.00") } });
  let id = 0;
  const order = async (outcome: string) => { const args = { tea: "sencha", amount: USD("6.00"), outcome };
    const r = await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", [ACT_HEADER]: b64(v.signAct("order.place", args)) },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "order.place", arguments: args } }) });
    const text = await r.text(); try { return JSON.parse(text); } catch { return { raw: text }; } };
  return { server, v, order };
}
const refused = (r: any) => r?.error?.data?.shokai?.refused_by === "door";

async function main() {
  console.log("MCP gate: releasing acts the server did not carry out (§7.2, C194)");
  let s = await shop();
  check(s.v.seated, "seated with a 10.00 USD mandate");
  check(!!(await s.order("rpc_error")).error && !refused(await s.order("ok")), "a 6.00 USD call answered with a JSON-RPC error is released: the next 6.00 USD call goes through");
  check(refused(await s.order("ok")), "… and then 12.00 USD would pass the limit: refused by the door");
  s.server.close();

  s = await shop();
  await s.order("http_500");
  check(!refused(await s.order("ok")), "a call the server answered 500 with no result is released");
  s.server.close();

  s = await shop();
  await s.order("tool_error");
  check(!refused(await s.order("ok")), "by default a tool result with isError (the service refused the act, C187) is released");
  s.server.close();

  s = await shop({ releaseOn: "rpc-error" });
  await s.order("tool_error");
  check(refused(await s.order("ok")), "with releaseOn: \"rpc-error\" (tools that may act in part) a tool error stays counted");
  s.server.close();

  s = await shop();
  await s.order("sse");
  check(refused(await s.order("ok")), "an SSE response is not inspected: the act stays counted (fail safe)");
  s.server.close();

  s = await shop({ releaseOn: "never" });
  await s.order("rpc_error");
  check(refused(await s.order("ok")), "with releaseOn: \"never\" every admitted act stays counted");
  s.server.close();
  void readBody;
  console.log(`${pass} gate release checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
