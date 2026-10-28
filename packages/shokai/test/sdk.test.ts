// SDK tests: a door and a representative, in process and over HTTP; signing and verification; acts within the seat; reports home.
import http from "node:http";
import { createDoor, createRepresentative, verifySigned, sign, generateRepresentativeKey, findPlace, PROTOCOL, SPEC_VERSION, type Door } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const notes = () => createDoor({ name: "notes", displayName: "Lantern Notes", category: "x-tools",
  purposes: [{ code: "inquiry", statement: "Reading and searching notes." }],
  actions: [{ action: "notes.search", purposes: ["inquiry"], level: "discover", limits: { max_operations: 3 } },
            { action: "notes.read", purposes: ["inquiry"], level: "discover" },
            { action: "notes.add", purposes: ["inquiry"], level: "act_on_behalf", data_asks: ["email"] }] });

async function main() {
  console.log("SDK (@kigenka/shokai)");
  check(PROTOCOL === "shokai/0.3" && SPEC_VERSION === "0.3.0", "wire tag shokai/0.3, spec 0.3.0");
  // signing and verification
  const k = generateRepresentativeKey(); const env = sign({ hello: "world" }, k);
  check(verifySigned(env).ok === true, "an Ed25519 envelope verifies");
  check(verifySigned({ ...env, payload: { hello: "w0rld" } }).ok === false, "a changed payload fails (digest mismatch)");
  check(verifySigned(env, { expectSigner: generateRepresentativeKey().id }).ok === false, "an unexpected signer fails");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["inquiry"], actions: ["notes.search", "notes.read"] });
  check(verifySigned(aya.card).ok === true && aya.card.payload.owner_binding?.method === "passkey_webauthn", "the card is signed by the owner's (development) passkey and carries the owner binding");

  // in process
  const door = notes();
  const listing = door.listing();
  check(listing.places[0].actions!.every((a) => Array.isArray(a.data_asks)), "the listing declares data_asks on every action (§3.1)");
  const v = await aya.visit(door, { purpose: "inquiry", actions: ["notes.search", "notes.read"] });
  check(v.decision === "grant" && !!v.seat && v.seat.tool_allowlist.includes("notes.search"), "seated for the asked actions");
  const r1 = await v.act("notes.search", { q: "tea" });
  check(r1?.type === "act_result" && r1.ok === true, "an act inside the seat succeeds");
  const r2 = await v.act("notes.add", { text: "x" });
  check(r2?.type === "act_decision" && r2.decision === "deny", "an act outside the seat is refused explicitly");
  const rep = v.report();
  check(rep.acts!.length === 2 && rep.acts!.filter((a) => a.ok).length === 1 && rep.host_said.every((h) => h.untrusted === true), "the report home lists both acts; host text is quoted as untrusted");
  // an unprepared visitor (prose) gets the lobby
  const lobby = await door.post("hi, can I use your notes?");
  check(lobby.envelope.messages.some((m: any) => (m.payload ?? m).type === "lobby_briefing"), "prose at the entry gets the lobby");
  // a mandate beyond the card: not seated
  const v2 = await aya.visit(door, { purpose: "inquiry", actions: ["notes.add"] });
  check(v2.decision !== "grant", "asking beyond the mandate scope is not seated (" + v2.decision + "/" + v2.response?.disposition + ")");

  // over HTTP
  const door2 = notes(); const srv = http.createServer(async (req, res) => { if (!(await door2.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); const port = (srv.address() as any).port; door2.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
  const place = await findPlace(`http://127.0.0.1:${port}/shokai`, "notes");
  check(place.entry.endsWith("/shokai/places/notes/entry") && place.representative_id === door2.repId, "GET /places lists the entry and the place's representative");
  const v3 = await aya.visit(place, { purpose: "inquiry", actions: ["notes.search"] });
  check(v3.decision === "grant", "over HTTP: seated");
  check((await v3.act("notes.search", { q: "a" }))?.ok === true && (await v3.act("notes.search", { q: "b" }))?.ok === true && (await v3.act("notes.search", { q: "c" }))?.ok === true, "three searches within max_operations 3");
  const over = await v3.act("notes.search", { q: "d" });
  check(over?.type === "act_decision" && over.disposition === "not_now", "the fourth is refused (not_now, the seat's limit)");
  const bad = await fetch(`http://127.0.0.1:${port}/shokai/nope`); check(bad.status === 404 && (await bad.json()).type === "door_pointer", "an unknown address gets a door_pointer, never a bare 404");
  srv.close();
  console.log(`${pass} SDK checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
