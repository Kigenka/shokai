// MCP gate tests: the official MCP SDK server behind a Shōkai door; raw JSON-RPC so each attack is explicit.
import { createRepresentative, findPlace, sign } from "../src/index.js";
import { ACT_HEADER, SEAT_HEADER, SHOKAI_NOT_SEATED, ShokaiGate } from "../src/mcp.js";
import { startGatedServer } from "../examples/toy-mcp/server.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");

async function main() {
  console.log("MCP gate (@kigenka/shokai/mcp, @modelcontextprotocol/sdk 1.32.2)");
  const { server, base, door } = await startGatedServer();
  let id = 0;
  const rpc = async (method: string, params: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
    return r.json() as Promise<any>;
  };
  const call = (name: string, args: unknown, headers: Record<string, string> = {}) => rpc("tools/call", { name, arguments: args }, headers);

  const r0 = await call("notes.read", { id: "tea" });
  check(r0.error?.code === SHOKAI_NOT_SEATED && r0.error.data?.shokai?.disposition === "not_now" && r0.error.data.shokai.door.endsWith("/shokai/places"), "no seat: not_now with the door's address, never a bare refusal");
  const all = await rpc("tools/list", {});
  check(all.result?.tools?.length === 3, "tools/list without a seat lists every tool (discovery stays open)");

  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["inquiry"], actions: ["notes.search", "notes.read"] });
  const v = await aya.visit(await findPlace(base + "/shokai", "notes"), { purpose: "inquiry", actions: ["notes.search", "notes.read"] });
  check(v.decision === "grant", "seated at the door over HTTP");
  const seat = { [SEAT_HEADER]: v.seat!.seat_id };
  const listed = await rpc("tools/list", {}, seat);
  check(JSON.stringify(listed.result?.tools?.map((t: any) => t.name).sort()) === JSON.stringify(["notes.read", "notes.search"]), "tools/list naming the seat is filtered to the seat's tools");

  const act = v.signAct("notes.read", { id: "tea" });
  const ok = await call("notes.read", { id: "tea" }, { [ACT_HEADER]: b64(act) });
  check(ok.result?.content?.[0]?.text?.includes("Sencha"), "a signed act for a tool in the seat reaches the MCP server");
  const replay = await call("notes.read", { id: "tea" }, { [ACT_HEADER]: b64(act) });
  check(replay.error?.code === SHOKAI_NOT_SEATED && /single use/.test(replay.error.message), "replaying the same act is refused (single use)");
  const swapped = await call("notes.read", { id: "kiln" }, { [ACT_HEADER]: b64(v.signAct("notes.read", { id: "tea" })) });
  check(swapped.error?.code === SHOKAI_NOT_SEATED && /arguments/.test(swapped.error.message), "changed arguments under a signed act are refused");
  const other = await call("notes.search", { q: "tea" }, { [ACT_HEADER]: b64(v.signAct("notes.read", { id: "tea" })) });
  check(other.error?.code === SHOKAI_NOT_SEATED && /another tool/.test(other.error.message), "an act for another tool is refused");
  const outside = await call("notes.add", { id: "x", text: "y" }, { [ACT_HEADER]: b64(v.signAct("notes.add", { id: "x", text: "y" })) });
  check(outside.error?.data?.shokai?.act_decision?.reason_code === "SEAT_SCOPE_EXCEEDED", "a tool outside the seat is refused by the door (SEAT_SCOPE_EXCEEDED)");
  const forged = v.signAct("notes.read", { id: "tea" }); (forged.payload as any).seat_id = v.seat!.seat_id; (forged as any).payload.msg_id += "-x";
  const tampered = await call("notes.read", { id: "tea" }, { [ACT_HEADER]: b64(forged) });
  check(!!tampered.error, "an act altered after signing is refused (digest/signature)");
  const mallory = createRepresentative({ ownerName: "Mallory Quist", purposes: ["inquiry"], actions: ["notes.read"] });
  const stolen = sign({ ...v.signAct("notes.read", { id: "tea" }).payload, from: mallory.id, msg_id: "m-1" }, mallory.key);
  const steal = await call("notes.read", { id: "tea" }, { [ACT_HEADER]: b64(stolen) });
  check(!!steal.error, "another representative can't use Aya's seat");
  const stale = sign({ ...v.signAct("notes.read", { id: "tea" }).payload, msg_id: "old-1", sent_at: "2026-01-01T00:00:00Z" }, aya.key);
  const st = await call("notes.read", { id: "tea" }, { [ACT_HEADER]: b64(stale) });
  check(/stale/.test(st.error?.message ?? ""), "a stale act is refused");
  check(new ShokaiGate(door).check({ jsonrpc: "2.0", id: 1, method: "resources/read", params: {} }, {}).allow === false, "other methods that touch data need a seat (adapter interface)");
  const bad = await fetch(base + "/elsewhere"); check(bad.status === 404 && (await bad.json()).type === "door_pointer", "unknown paths answer with the door pointer");
  server.close();
  console.log(`${pass} MCP gate checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
