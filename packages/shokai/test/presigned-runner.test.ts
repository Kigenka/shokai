// Pre-signed passkey material for the official HTTP runner: a card and mandates the owner already
// signed, presented as-is. Checks that need a fresh owner signature the runner cannot produce SKIP
// with a reason; they are never faked with a development stand-in.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { runConformance, loadPresigned, PRESIGNED_NO_OWNER_SIGN } from "../src/conformance/runner.js";
import { refuseOwnerSign, createPresignedRep } from "../src/conformance/presigned.js";
import { createRepresentative, exportRepresentativeKey, sign, signCardRevocation, memoryStore } from "../src/index.js";
import { createNotesDoor } from "../examples/toy-mcp/server.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const listen = (h: http.RequestListener) => new Promise<{ s: http.Server; port: number }>((r) => { const s = http.createServer(h); s.listen(0, "127.0.0.1", () => r({ s, port: (s.address() as any).port })); });

console.log("Pre-signed official runner");

const dir = join(tmpdir(), "shokai-presigned-runner-" + Date.now());
mkdirSync(dir, { recursive: true, mode: 0o700 });

const ownerName = "Pip Calder (fictional fixture owner)";
const r0 = createRepresentative({ ownerName, purposes: ["inquiry", "x-editing"], actions: ["notes.search", "notes.read", "notes.add"] });
check(r0.isDevelopmentOwner === true, "the fixture owner used to sign test material is a development stand-in (loopback only)");
writeFileSync(join(dir, "visitor.key"), exportRepresentativeKey(r0.key) + "\n", { mode: 0o600 });
writeFileSync(join(dir, "visitor-card.json"), JSON.stringify(r0.card, null, 2) + "\n");

const browse = r0.mandate({ purpose: "inquiry", actions: ["notes.search"] });
const ops1 = r0.mandate({ purpose: "inquiry", actions: ["notes.search"], limits: { max_operations: 1 }, validSeconds: 600 });
const c300 = sign({ ...browse.payload, mandate_id: "mand-c300-fixture", min_protocol: "0.5", crit: [...((browse.payload as any).crit ?? []), "min_protocol"] }, r0.owner, browse.payload.valid_from);
const c301 = sign({ ...browse.payload, mandate_id: "mand-c301-fixture", min_protocol: "shokai/0.6", crit: [...((browse.payload as any).crit ?? []), "min_protocol"] }, r0.owner, browse.payload.valid_from);
writeFileSync(join(dir, "mandate-browse.json"), JSON.stringify(browse, null, 2) + "\n");
writeFileSync(join(dir, "mandate-ops1.json"), JSON.stringify(ops1, null, 2) + "\n");
writeFileSync(join(dir, "mandate-c300.json"), JSON.stringify(c300, null, 2) + "\n");
writeFileSync(join(dir, "mandate-c301.json"), JSON.stringify(c301, null, 2) + "\n");

const loaded = loadPresigned({ fixturesDir: dir });
check(loaded.card.payload_digest === r0.card.payload_digest, "loadPresigned reads the signed visitor card from a fixture dir");
check(loaded.key.id === r0.id, "loadPresigned reads the representative key (not printed)");
check(!!loaded.mandates.browse && !!loaded.mandates.ops1 && !!loaded.mandates.c300 && !!loaded.mandates.c301, "loadPresigned maps mandate-<role>.json files");
check((loaded.mandates.c300!.payload as { min_protocol?: string }).min_protocol === "0.5" && (loaded.mandates.c301!.payload as { min_protocol?: string }).min_protocol === "shokai/0.6", "c300/c301 mandates keep the signed min_protocol values");

const presignedRep = createPresignedRep(loaded, { purposes: ["inquiry"], actions: ["notes.search"] });
check(presignedRep.isDevelopmentOwner === false, "createPresignedRep is not a development owner");
check(presignedRep.card.payload_digest === r0.card.payload_digest, "createPresignedRep presents the pre-signed card");
let threw = false;
try { presignedRep.mandate({ purpose: "inquiry", actions: ["notes.search"] }); } catch (e: any) { threw = e?.code === "SHOKAI_PRESIGNED_NO_OWNER_SIGN" && String(e.message).includes(PRESIGNED_NO_OWNER_SIGN); }
check(threw, "calling mandate() on a pre-signed representative throws; it never signs with a development stand-in");
let stubThrew = false;
try { (refuseOwnerSign("did:example:x") as any).priv; } catch (e: any) { stubThrew = e?.code === "SHOKAI_PRESIGNED_NO_OWNER_SIGN"; }
check(stubThrew, "refuseOwnerSign throws if anything tries to use the owner as a signer");

let loadThrew = false;
try { loadPresigned({ cardPath: join(dir, "visitor-card.json"), keyPath: join(dir, "visitor.key"), mandates: [{ role: "c300", path: join(dir, "mandate-browse.json") }] }); } catch (e: any) { loadThrew = /min_protocol/.test(String(e.message)); }
check(loadThrew, "loadPresigned refuses a c300 file whose min_protocol is not the literal string \"0.5\" (it will not rewrite it)");

let roleThrew = false;
try { loadPresigned({ fixturesDir: dir, mandates: [{ role: "not-a-role", path: join(dir, "mandate-browse.json") }] }); } catch (e: any) { roleThrew = /unknown mandate role/.test(String(e.message)); }
check(roleThrew, "loadPresigned refuses an unknown mandate role");

const door = createNotesDoor({ store: memoryStore() });
const srv = await listen(async (req, res) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
door.setBaseUrl(`http://127.0.0.1:${srv.port}/shokai`);
const base = `http://127.0.0.1:${srv.port}/shokai`;

const full = await runConformance(base, { presigned: loaded });
const st = (id: string) => full.results.find((x) => x.id === id);
const skipOwner = ["mandate.cross", "card.revoked", "card.revoked_seat", "neg.probing", "v050.one_card", "v050.deletion_held", "v050.deletion_receipt", "v050.deletion_ledgers", "v050.hold_over_limit", "v050.hold_decline", "v050.hold_release"];
for (const id of skipOwner) {
  const r = st(id);
  check(r?.status === "skip" && /pre-signed|will not mint/.test(r.detail ?? ""), `${id} SKIPs with a clear pre-signed reason (${r?.status}: ${(r?.detail ?? "").slice(0, 80)})`);
}
check(st("ritual.grant")?.status === "pass", `ritual.grant PASSes with the pre-signed browse mandate (${st("ritual.grant")?.status})`);
check(st("ritual.place_id")?.status === "pass", "ritual.place_id PASSes presenting the pre-signed card");
check(st("seat.mandate_across")?.status === "pass", `seat.mandate_across PASSes with the pre-signed ops1 mandate (${st("seat.mandate_across")?.status})`);
check(st("request.incomplete")?.status === "pass", "request.incomplete PASSes with the pre-signed card and no mandate");
check(st("v050.min_protocol_malformed")?.status === "pass", `C300 is measured with the well-signed pre-signed c300 mandate, not a mutated signature (${st("v050.min_protocol_malformed")?.status}: ${st("v050.min_protocol_malformed")?.detail ?? ""})`);
check(st("v050.min_protocol_above_tag")?.status === "pass", `C301 is measured with the well-signed pre-signed c301 mandate (${st("v050.min_protocol_above_tag")?.status}: ${st("v050.min_protocol_above_tag")?.detail ?? ""})`);
check(verdictPass(full), `a conformant loopback door still has a passing core verdict under pre-signed material (fails: ${failsOf(full)})`);
check(!full.results.some((x) => x.status === "pass" && /development stand-in/.test(x.detail ?? "")), "no check is marked pass by minting a development stand-in while pre-signed material is in use");

const noC300 = loadPresigned({ cardPath: join(dir, "visitor-card.json"), keyPath: join(dir, "visitor.key"), mandates: [
  { role: "browse", path: join(dir, "mandate-browse.json") },
  { role: "ops1", path: join(dir, "mandate-ops1.json") },
] });
const partial = await runConformance(base, { presigned: noC300 });
check(partial.results.find((x) => x.id === "v050.min_protocol_malformed")?.status === "skip"
  && /c300/.test(partial.results.find((x) => x.id === "v050.min_protocol_malformed")?.detail ?? ""),
  "C300 SKIPs with a clear reason when no c300 mandate was provided (it is not faked)");
check(partial.results.find((x) => x.id === "v050.min_protocol_above_tag")?.status === "skip"
  && /c301/.test(partial.results.find((x) => x.id === "v050.min_protocol_above_tag")?.detail ?? ""),
  "C301 SKIPs with a clear reason when no c301 mandate was provided (it is not faked)");

const def = await runConformance(base);
check(def.results.find((x) => x.id === "ritual.grant")?.status === "pass" && def.results.find((x) => x.id === "mandate.cross")?.status === "pass",
  "without --card/--mandate the runner still mints a development owner as before");

// Probe files: the same four Core Door HTTP rows, measured with owner-signed material (never faked).
const rRev = createRepresentative({ ownerName, key: r0.key, owner: r0.owner, purposes: ["inquiry"], actions: ["notes.search"] });
const rSeat = createRepresentative({ ownerName, key: r0.key, owner: r0.owner, purposes: ["inquiry"], actions: ["notes.search"] });
const rProbe = createRepresentative({ ownerName, key: r0.key, owner: r0.owner, purposes: ["inquiry"], actions: ["x-conformance.other"] });
const seatMand = rSeat.mandate({ purpose: "inquiry", actions: ["notes.search"] });
const probeMand = rProbe.mandate({ purpose: "inquiry", actions: ["x-conformance.other"], limits: { max_operations: 1 }, validSeconds: 600 });
const crossCard = sign({ ...browse.payload, mandate_id: "mand-cross-card", card_id: "card-another-id" }, r0.owner, browse.payload.valid_from);
const crossPlace = sign({ ...browse.payload, mandate_id: "mand-cross-place", counterparties: ["did:web:another-place.example"] }, r0.owner, browse.payload.valid_from);
writeFileSync(join(dir, "mandate-cross_card.json"), JSON.stringify(crossCard, null, 2) + "\n");
writeFileSync(join(dir, "mandate-cross_place.json"), JSON.stringify(crossPlace, null, 2) + "\n");
const revMand = rRev.mandate({ purpose: "inquiry", actions: ["notes.search"] });
writeFileSync(join(dir, "card-revoked.json"), JSON.stringify(rRev.card, null, 2) + "\n");
writeFileSync(join(dir, "mandate-revoked.json"), JSON.stringify(revMand, null, 2) + "\n");
writeFileSync(join(dir, "revocation-revoked.json"), JSON.stringify(signCardRevocation(r0.owner, rRev.card, { reason: "superseded" }), null, 2) + "\n");
writeFileSync(join(dir, "card-revoked_seat.json"), JSON.stringify(rSeat.card, null, 2) + "\n");
writeFileSync(join(dir, "mandate-revoked_seat.json"), JSON.stringify(seatMand, null, 2) + "\n");
writeFileSync(join(dir, "revocation-revoked_seat.json"), JSON.stringify(signCardRevocation(r0.owner, rSeat.card, { reason: "superseded" }), null, 2) + "\n");
writeFileSync(join(dir, "card-probing.json"), JSON.stringify(rProbe.card, null, 2) + "\n");
writeFileSync(join(dir, "mandate-probing.json"), JSON.stringify(probeMand, null, 2) + "\n");

const withProbes = loadPresigned({ fixturesDir: dir });
check(!!withProbes.probes.cross_card && !!withProbes.probes.cross_place && !!withProbes.probes.revoked && !!withProbes.probes.revoked_seat && !!withProbes.probes.probing, "loadPresigned reads probe cards, mandates and revocations from the fixture dir");
check(withProbes.probes.cross_card!.payload.card_id !== withProbes.card.payload.card_id, "the cross_card probe names a different card_id than the primary visitor card");
check(withProbes.probes.revoked!.card.payload.card_id !== withProbes.card.payload.card_id, "the revoked probe uses a throwaway card, not the primary sitting card");

const door2 = createNotesDoor({ store: memoryStore() });
const srv2 = await listen(async (req, res) => { if (!(await door2.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
door2.setBaseUrl(`http://127.0.0.1:${srv2.port}/shokai`);
const base2 = `http://127.0.0.1:${srv2.port}/shokai`;
const probed = await runConformance(base2, { presigned: withProbes });
const pst = (id: string) => probed.results.find((x) => x.id === id);
for (const id of ["mandate.cross", "card.revoked", "card.revoked_seat", "neg.probing"]) {
  const r = pst(id);
  check(r?.status === "pass", `${id} PASSes with pre-signed probe material (${r?.status}: ${(r?.detail ?? "").slice(0, 120)})`);
}
check(pst("v050.templates")?.status === "na", `v050.templates is N/A when the place's templates are not closed (${pst("v050.templates")?.status}: ${pst("v050.templates")?.detail ?? ""})`);

const idx = (id: string) => probed.results.findIndex((x) => x.id === id);
check(idx("neg.probing") > idx("v050.revocation_verified") && idx("neg.probing") > idx("v050.idempotent") && idx("neg.probing") > (idx("v050.min_protocol_malformed") === -1 ? 0 : idx("v050.min_protocol_malformed")),
  "neg.probing runs after v050 checks that need the same principal (it bindNever's that principal for 180 days)");
check(/same principal as the sitting card/.test(pst("neg.probing")?.detail ?? ""), "neg.probing's detail says a pre-signed probe card shares the sitting principal");
for (const id of ["v050.host_card_served", "v050.summary", "v050.idempotent", "v050.revocation_verified"]) {
  const r = pst(id);
  check(r?.status === "pass", `${id} still PASSes on a fresh door when probing is run last (${r?.status}: ${(r?.detail ?? "").slice(0, 120)})`);
}

// After probing, that principal is bound. A second run must still emit C237/C239 rows when those visits aren't seated.
const probedAgain = await runConformance(base2, { presigned: withProbes });
const pst2 = (id: string) => probedAgain.results.find((x) => x.id === id);
check(pst2("v050.one_card")?.status === "skip", `v050.one_card is still reported (skip) when the later visit isn't seated (${pst2("v050.one_card")?.status ?? "MISSING"})`);
check(pst2("v050.size")?.status === "skip", `v050.size is still reported (skip) when the later visit isn't seated (${pst2("v050.size")?.status ?? "MISSING"})`);
check(pst2("v050.instrument")?.status === "skip", "v050.instrument skips not seated on a principal already bound by probing");

srv.s.close();
srv2.s.close();
rmSync(dir, { recursive: true, force: true });

function verdictPass(r: typeof full) {
  return r.results.filter((x) => x.status === "fail" && (x.level === "core" || x.level === "mcp" || x.level === "v050")).length === 0;
}
function failsOf(r: typeof full) {
  return r.results.filter((x) => x.status === "fail").map((x) => x.id).join(", ") || "none";
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
