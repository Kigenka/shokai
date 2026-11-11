// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, §6.12 (provisional, from P33): context requests. A door declares in its signed house config whether the Shōkai visitor
// card is enough, or it admits and then requests context, or it requests context before entry; it may request only declared
// fields; the visitor's owner answers or declines field by field and signs. In process, real Ed25519 keys made for the test, no
// model, no network; fictional places and people (the Taste Blend table, Mio).
import { createPublicKey } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createDoor, createRepresentative, findPlace, signContextResponse, generateRepresentativeKey, contextRequirementsProblems, contextRequestFor, contextRequestProblems, contextResponseProblems, contextResponseDigest, contextAdmission,
  MAX_CONTEXT_VALUE_CHARS, digestOf, type DoorOptions } from "../src/index.js";
import { newEd25519, signEd, verifySig } from "../src/core/crypto.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const NEED: S.ContextRequirements = { mode: "before_entry", retention_days: 0, fields: [
  { name: "adult_confirmed", what: "That you are 18 or older", why: "The open table is for adults only.", required: true },
  { name: "favorite_food", what: "A food you love", why: "To pair tastes at the table." }] };
const table = (cr: unknown): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "taste-blend", displayName: "The Taste Blend table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
  testProfile: true, policy: { context_requirements: cr } as any });
const start = (cr: unknown) => { try { createDoor(table(cr)); return "started"; } catch (e) { return `${(e as any).code}:${((e as any).problems ?? []).join(",")}`; } };

const optionalOf = (c: S.ContextRequest) => c.fields.filter((f) => !f.required).map((f) => f.name);
async function main() {
  console.log("SDK context requests (§6.12, provisional)");
  check(start(NEED) === "started" && start({ mode: "card_enough" }) === "started", "a door starts with valid context requirements (before entry; card enough)");
  for (const [what, cr] of [["fields with card enough", { mode: "card_enough", fields: NEED.fields }], ["no fields to request", { mode: "admit_then_request" }],
    ["a field with no reason", { mode: "before_entry", fields: [{ name: "home_city", what: "Your city" }] }], ["retention of a year", { ...NEED, retention_days: 365 }]] as const) {
    const r = start(cr); check(r.startsWith("SHOKAI_HOUSE_CONFIG_INVALID:") && r.includes("context_requirements"), `refused to start: ${what} (${r})`);
  }
  check(contextRequirementsProblems({ mode: "before_entry", fields: [{ name: "Home Address", what: "x", why: "y" }] }).includes("context_requirements:field"), "a field name must be a short id");
  const req = contextRequestFor("taste-blend", NEED, ["adult_confirmed", "favorite_food"], { request_id: "cr-7", expires_at: "2026-11-04T00:00:00Z" })!;
  check(contextRequestProblems(req, NEED, "taste-blend").length === 0, "the table's request carries only its declared fields, verbatim");
  check(contextRequestFor("taste-blend", NEED, ["where_you_live"], { request_id: "cr-8", expires_at: "2026-11-04T00:00:00Z" }) === null, "it can't request where you live: that field isn't declared");
  check(contextRequestProblems({ ...req, place: "elsewhere" }, NEED, "taste-blend").includes("place"), "a request naming another place is spotted");
  // Mio's owner key (a test key) signs her answer.
  const mio = newEd25519(); const pub = createPublicKey(mio.priv); const verify = (sig: S.Signature, d: S.Digest) => verifySig(sig, d, { alg: "Ed25519", key: pub } as any);
  const sign = (answers: { name: string; value: string }[], declined: string[]) => {
    const body = { type: "context_response" as const, request_id: req.request_id, request_digest: digestOf(req), place: "taste-blend", answers, declined };
    return { ...body, owner_sig: signEd(mio, contextResponseDigest(body), "2026-11-03T20:00:00Z") } as S.ContextResponse; };
  const yes = sign([{ name: "adult_confirmed", value: "Yes, I'm 18 or older." }, { name: "favorite_food", value: "Chili crisp on everything" }], []);
  check(contextResponseProblems(yes, req, { ownerId: mio.id, verify }).length === 0 && contextAdmission(NEED, req, yes).admit, "Mio answers both and signs: seated");
  const optOut = sign([{ name: "adult_confirmed", value: "Yes" }], ["favorite_food"]);
  check(contextResponseProblems(optOut, req, { ownerId: mio.id, verify }).length === 0 && contextAdmission(NEED, req, optOut).admit, "declining an optional field is fine: still seated");
  const no = contextAdmission(NEED, req, sign([], ["adult_confirmed", "favorite_food"]));
  check(!no.admit && no.reason_code === "POLICY_DENY", "declining the required 18+ confirmation: not seated, and she may reconsider");
  check(contextResponseProblems(sign([{ name: "adult_confirmed", value: "x".repeat(MAX_CONTEXT_VALUE_CHARS + 1) }], ["favorite_food"]), req, { ownerId: mio.id, verify }).includes("value:adult_confirmed"), "an answer over 500 characters is refused, not cut");
  check(contextResponseProblems({ ...yes, owner_sig: { ...yes.owner_sig, signer: newEd25519().id } }, req, { ownerId: mio.id, verify }).includes("signer"), "only the visitor's owner can sign the answer");
  const first = contextAdmission(NEED, undefined);
  check(!first.admit && first.reason_code === "CREDENTIAL_REQUIRED" && first.send_request, "no answer yet: not_now / CREDENTIAL_REQUIRED, with the request to take home");

  // ---- Over HTTP (the door's own handler on 127.0.0.1): the request rides on the answer, the owner's signed response on the retry. ----
  console.log("SDK context requests over HTTP (§6.12 wiring)");
  const servers: Server[] = [];
  const serve = async (cr: unknown, extraActions = false) => {
    const door = createDoor({ ...table(cr), ...(extraActions ? { actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }, { action: "blend.answer", purposes: ["inquiry"], level: "act_on_behalf", data_asks: [] }] } : {}) } as DoorOptions);
    const srv = createServer(async (rq, rs) => { if (!(await door.handleHttp(rq, rs))) { rs.writeHead(404); rs.end(); } }); servers.push(srv);
    const port = await new Promise<number>((r) => srv.listen(0, "127.0.0.1", () => r((srv.address() as any).port))); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
    return { door, base: `http://127.0.0.1:${port}/shokai` }; };
  const reasonOf = (v: any) => v.response?.reason_code; const ask = { purpose: "inquiry" as S.PurposeCode, actions: ["concierge.talk"], mandate: { fresh: true } };
  const mioRep = createRepresentative({ ownerName: "Mio", purposes: ["inquiry"], actions: ["concierge.talk", "blend.answer"] });
  try {
    const { door, base } = await serve(NEED); const place = await findPlace(base, "taste-blend");
    const v1 = await mioRep.visit(place, ask);
    const cq = v1.contextRequest;
    check(!v1.seated && v1.response?.disposition === "not_now" && reasonOf(v1) === "CREDENTIAL_REQUIRED" && JSON.stringify(v1.response?.retry) === JSON.stringify({ kind: "with_credential", credentials: ["context_response"] }),
      `before entry, no answer yet: not_now / CREDENTIAL_REQUIRED, retry with a context response (${reasonOf(v1)})`);
    check(!!cq && contextRequestProblems(cq, NEED, "taste-blend").length === 0 && cq.fields.map((f) => f.name).join(",") === "adult_confirmed,favorite_food", "the request came back on the answer: only the declared fields, verbatim");
    check(/asked for a little more about you/.test(v1.report().outcome_rendered.text) && v1.report().outcome_rendered.text.includes("That you are 18 or older") && v1.report().outcome_rendered.text.includes("I didn't answer anything"), "Mio's report quotes each field's what and why, and says nothing was answered");
    const good = signContextResponse(mioRep.owner, cq!, { answers: [{ name: "adult_confirmed", value: "Yes, I'm 18 or older." }], declined: ["favorite_food"] });
    const v2 = await mioRep.visit(place, { ...ask, contextResponse: good });
    check(v2.seated, `Mio signs (18+ yes, favorite food declined) and her representative retries: seated (${v2.decision} ${reasonOf(v2) ?? ""})`);
    const kept = v2.seat ? door.host.contextAnswers(v2.seat.seat_id) : null;
    check(!!kept && kept.answers.length === 1 && kept.answers[0].value === "Yes, I'm 18 or older." && kept.declined.join() === "favorite_food", "the door keeps exactly what she answered, for this seat");
    const v3 = await mioRep.visit(place, { ...ask, contextResponse: good });
    check(!v3.seated && reasonOf(v3) === "CREDENTIAL_REQUIRED" && v3.contextRequest?.request_id !== cq!.request_id, "the same signed answer sent again: not relied on twice (a fresh request instead)");
    if (v2.seat) door.endSeat(v2.seat.seat_id);
    check(!!v2.seat && door.host.contextAnswers(v2.seat.seat_id) === null, "retention 0 days: the answers go when the seat ends");
    // Signed by the wrong key, by another owner, or altered after signing: treated as no answer.
    const v4 = await mioRep.visit(place, ask); const cq4 = v4.contextRequest!;
    const byRep = signContextResponse(mioRep.key, cq4, { answers: [{ name: "adult_confirmed", value: "Yes" }], declined: optionalOf(cq4) });
    check(!(await mioRep.visit(place, { ...ask, contextResponse: byRep })).seated, "an answer signed by the representative's own key, not the owner's: not seated");
    const altered = { ...signContextResponse(mioRep.owner, cq4, { answers: [{ name: "adult_confirmed", value: "No" }], declined: optionalOf(cq4) }) };
    altered.answers = [{ name: "adult_confirmed", value: "Yes" }];
    check(!(await mioRep.visit(place, { ...ask, contextResponse: altered })).seated, "an answer changed after the owner signed it: not seated");
    const mallory = createRepresentative({ ownerName: "Mallory", purposes: ["inquiry"], actions: ["concierge.talk"] });
    const stolen = signContextResponse(mioRep.owner, cq4, { answers: [{ name: "adult_confirmed", value: "Yes" }], declined: optionalOf(cq4) });
    check(!(await mallory.visit(place, { ...ask, contextResponse: stolen })).seated, "Mio's signed answer shown by another owner's representative: not seated");
    const extra = signContextResponse(mioRep.owner, cq4, { answers: [{ name: "adult_confirmed", value: "Yes" }, { name: "home_city", value: "Osaka" }], declined: optionalOf(cq4) });
    check(!(await mioRep.visit(place, { ...ask, contextResponse: extra })).seated, "an answer carrying a field the place never asked for: not seated");
    // Declining the required field: POLICY_DENY with the same request, so she may reconsider; then yes.
    const v5 = await mioRep.visit(place, ask); const cq5 = v5.contextRequest!;
    check(!cq5.fields.some((f) => f.name === "favorite_food") && cq5.fields.some((f) => f.name === "adult_confirmed"), "a field she declined in an earlier visit isn't asked again within 30 days; the required one still is (C267)");
    const no = signContextResponse(mioRep.owner, cq5, { answers: [], declined: cq5.fields.map((f) => f.name) });
    const v6 = await mioRep.visit(place, { ...ask, contextResponse: no });
    check(!v6.seated && v6.response?.disposition === "not_now" && reasonOf(v6) === "POLICY_DENY" && v6.contextRequest?.request_id === cq5.request_id, "declining the required 18+: not_now / POLICY_DENY, the same request returned so she may reconsider");
    const recon = signContextResponse(mioRep.owner, cq5, { answers: [{ name: "adult_confirmed", value: "Yes" }], declined: optionalOf(cq5) });
    check((await mioRep.visit(place, { ...ask, contextResponse: recon })).seated, "she reconsiders and signs yes: seated");
    const rec = door.host.records.get([...door.host.records.keys()].find((k) => k.includes(mioRep.owner.id.slice(-12))) ?? "");
    check(!rec || !(rec.misconduct ?? []).length, "nothing she declined was ever recorded as misconduct");
    // Admit, then request: seated at once, the request rides on the grant; her answer rides on her next act.
    const later: S.ContextRequirements = { mode: "admit_then_request", fields: [{ name: "favorite_opening", what: "Your favorite anime opening", why: "For a second round at the table." }] };
    const s2 = await serve(later, true); const place2 = await findPlace(s2.base, "taste-blend");
    const w1 = await mioRep.visit(place2, { purpose: "inquiry", actions: ["concierge.talk", "blend.answer"], mandate: { fresh: true } });
    check(w1.seated && !!w1.contextRequest && w1.contextRequest.fields[0].name === "favorite_opening", "admit then request: seated, with the request on the grant");
    const ans = signContextResponse(mioRep.owner, w1.contextRequest!, { answers: [{ name: "favorite_opening", value: "Cruel Angel's Thesis" }], declined: [] });
    const forged = signContextResponse(mallory.owner, w1.contextRequest!, { answers: [{ name: "favorite_opening", value: "x" }], declined: [] });
    await w1.act("blend.answer", {}, { contextResponse: forged });
    check(s2.door.host.contextAnswers(w1.seat!.seat_id) === null, "an answer signed by someone else, on an act: ignored");
    const tools0 = JSON.stringify(w1.seat!.tool_allowlist);
    await w1.act("blend.answer", {}, { contextResponse: ans });
    check(s2.door.host.contextAnswers(w1.seat!.seat_id)?.answers[0]?.value === "Cruel Angel's Thesis", "her signed answer on an act is kept for the seat");
    check(JSON.stringify(w1.seat!.tool_allowlist) === tools0, "answering widens nothing");
    // Card enough: never a request.
    const s3 = await serve({ mode: "card_enough" }); const w3 = await mioRep.visit(await findPlace(s3.base, "taste-blend"), ask);
    check(w3.seated && !w3.contextRequest, "card enough: seated, and no request ever");
  } finally { for (const s of servers) s.close(); }
  console.log(`context requests: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
