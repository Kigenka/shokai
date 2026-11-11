// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The online-university example in one process with the 0.5 SDK (no network, keys made for this run; owner keys are Ed25519
// stand-ins for passkeys). Sorawick Online University, its people and Fernhill Press are fictional.
// 1. An anonymous visitor at the campus door gets the leaflet. 2. A prospective student's visiting representative reads the
// window, introduces itself and gets a narrow pass (look, ask, apply; nothing of a student's). 3. An admitted student (Ines, who
// brought her own representative) enrolls with the offer of admission (the campus's own signed invitation) and then at Dr. Ellery's course door, kept by Ellery's own
// representative: materials, submission, her own grades, office hours; another student's records are refused. 4. A classmate
// (Tomas, whose representative was made at enrollment and signed by Tomas) joins Ines's study room with a classmate's vouch.
// 5. Dr. Ellery's same agent goes out, as her visiting representative, to a publisher. 6. Weekly coursework: Ines's representative
// keeps the door of her course folder, and Dr. Ellery's representative is granted a pass for that folder only. Both report.
// Usage: (cd packages/shokai && npm run build) && node examples/traces/university.mjs   (writes university.trace.json;
// with --check it only runs the checks, as `npm test` in packages/shokai does)
import { createDoor, createRepresentative, generateRepresentativeKey, generatePrincipalKey, signVouch } from "../../packages/shokai/dist/src/index.js";
import { recorder } from "./lib.mjs";

const { check, flow, done, out } = recorder();

const university = generatePrincipalKey();
const COURSE = ["course.materials.read", "assignment.submit", "grades.view_own", "office_hours.book"];
const campus = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "sorawick-campus", displayName: "Sorawick Online University (fictional)", category: "education",
  about: "An online university. Look around freely; enrollment needs a representative card the student signs.",
  keys: { rep: generateRepresentativeKey(), principal: university },
  purposes: [{ code: "inquiry", statement: "Look around the campus, ask about programs, and apply." },
             { code: "account_servicing", statement: "Enroll with an offer of admission, or keep an existing enrollment." }],
  actions: [{ action: "campus.look", purposes: ["inquiry", "account_servicing"], level: "discover", data_asks: [] },
            { action: "programs.ask", purposes: ["inquiry", "account_servicing"], level: "advise", data_asks: [] },
            { action: "application.submit", purposes: ["inquiry"], level: "act_on_behalf", data_asks: ["name", "email"] },
            { action: "enrolment.confirm", purposes: ["account_servicing"], level: "act_on_behalf", data_asks: ["name", "email", "date_of_birth"] }],
  policy: { account_actions: ["enrolment.confirm"], account_creation: "introduction_or_invitation" } });
const offline = (door, url) => { door.fetched.set(url, { ok: true, at: new Date().toISOString(), body: [] }); door.prefetch = async () => {}; };
const ADMISSIONS_LOG = "https://sorawick.example/shokai/revocations"; offline(campus, ADMISSIONS_LOG);

const lobby = await campus.post({ type: "greeting" });
const lobbyTypes = (lobby.envelope?.messages ?? []).map((m) => m.payload?.type);
check(lobbyTypes.includes("lobby_briefing"), "an anonymous visitor at the campus door gets the leaflet, not silence");
out.steps.push({ who: "an anonymous visitor (no card)", at: "campus door", got: lobbyTypes });

const LIO = ["campus.look", "programs.ask", "application.submit"];
const lio = createRepresentative({ ownerName: "Lio Varga", owner: generatePrincipalKey(), purposes: ["inquiry"], actions: LIO });
const vl = await lio.visit(campus, { purpose: "inquiry", actions: LIO, why: "Lio is thinking about applying" });
check(vl.seated && vl.placeCheck.ok, "the prospective student's visiting representative checked the campus card and was granted a pass");
check(vl.seat.tool_allowlist.every((t) => LIO.includes(t)), "its pass is narrow: look, ask and apply; nothing of a student's");
vl.checkSeatLocally = false;
const lioTry = await vl.act("course.materials.read");
check(lioTry?.type === "act_decision" && lioTry.decision === "deny", "not yet a student: the host representative refuses course materials outside the pass");
check((await vl.act("application.submit", { programme: "data-science" }))?.type === "act_result", "Lio's representative applies within its pass (the listing said it would ask for a name and an email)");
await vl.farewell();
out.steps.push({ who: "Lio's visiting representative (prospective)", at: "campus door", tools: vl.seat.tool_allowlist, refused: "course.materials.read" });

const inesOwner = generatePrincipalKey(); const inesKey = generateRepresentativeKey();
const ines = createRepresentative({ ownerName: "Ines Marlow", owner: inesOwner, key: inesKey, purposes: ["account_servicing", "data_access", "collaboration"],
  actions: ["campus.look", "enrolment.confirm", ...COURSE, "room.look", "room.post"] });
const offer = signVouch(university, "Sorawick Online University", { rep: ines.id, card: ines.card }, { purposes: ["account_servicing"], revocationLog: ADMISSIONS_LOG, relationship: "offer_of_admission" });
const noOffer = await createRepresentative({ ownerName: "Ines Marlow", owner: inesOwner, purposes: ["account_servicing"], actions: ["enrolment.confirm"] })
  .visit(campus, { purpose: "account_servicing", actions: ["enrolment.confirm"], why: "enroll" });
check(!noOffer.seated && !!noOffer.response?.reason_code, "without an offer of admission, enrollment isn't granted a pass: an explained answer with a reason");
out.enrol_without_offer = { decision: noOffer.decision, disposition: noOffer.response?.disposition, reason_code: noOffer.response?.reason_code };
const vi = await ines.visit(campus, { purpose: "account_servicing", actions: ["campus.look", "enrolment.confirm"], vouch: offer, why: "enroll in the data science program" });
check(vi.seated, "with the offer (the university's own signed invitation), Ines's visiting representative is granted a pass for enrollment");
check((await vi.act("enrolment.confirm", { programme: "data-science" }))?.type === "act_result", "enrollment is confirmed within the pass");
await vi.farewell();
out.steps.push({ who: "Ines's visiting representative", at: "campus door", tools: vi.seat.tool_allowlist });

const ellery = generatePrincipalKey(); const elleryKey = generateRepresentativeKey();
const course = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "ds-210", displayName: "DS 210: Data and Society (Dr. Ellery)", category: "education",
  about: "A course at Sorawick Online University. Students' records are seen only by the student and the course staff.",
  keys: { rep: elleryKey, principal: ellery },
  purposes: [{ code: "data_access", statement: "Attend the course: materials, submissions, your own grades, office hours." }],
  actions: [{ action: "course.materials.read", purposes: ["data_access"], level: "discover", data_asks: [] },
            { action: "assignment.submit", purposes: ["data_access"], level: "act_on_behalf", data_asks: [] },
            { action: "grades.view_own", purposes: ["data_access"], level: "discover", data_asks: [] },
            { action: "office_hours.book", purposes: ["data_access"], level: "act_on_behalf", data_asks: [] }] });
const vc = await ines.visit(course, { purpose: "data_access", actions: COURSE, why: "attend DS 210" });
check(vc.seated && vc.placeCheck.ok, "Ines's visiting representative checked the course card (signed by Dr. Ellery's key) and was granted a pass");
check(COURSE.every((t) => vc.seat.tool_allowlist.includes(t)) && vc.seat.tool_allowlist.length === COURSE.length, "the course pass is exactly: materials, submission, own grades, office hours");
for (const [t, a] of [["course.materials.read", { week: 3 }], ["assignment.submit", { assignment: "a2" }], ["grades.view_own", {}], ["office_hours.book", { slot: "Thu 10:00" }]])
  check((await vc.act(t, a))?.type === "act_result", `${t} within the pass`);
vc.checkSeatLocally = false;
const peek = await vc.act("grades.view_all");
check(peek?.type === "act_decision" && peek.decision === "deny", "another student's records: refused by the course's host representative, with a reason");
await vc.farewell();
const report = vc.report();
check(report.outcome.decision === "grant" && !!report.outcome_rendered?.text, "Ines's representative writes its report home, rendered from machine fields");
out.report_home = report.outcome_rendered.text.replace(/key …\S+/, "key …(this run's key)");
const rec = course.host.records.get([...course.host.records.keys()].find((k) => !k.startsWith("lobby:")));
check(!!rec, "the course's host representative keeps its record of the visit (SPEC §9.1)");
out.steps.push({ who: "Ines's visiting representative", at: "course door (Dr. Ellery's host representative)", tools: vc.seat.tool_allowlist, refused: "grades.view_all", host_record: !!rec });

const wen = generatePrincipalKey();
const room = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "ds-210-study-room", displayName: "Ines's DS 210 study room", category: "gathering",
  keys: { rep: inesKey, principal: inesOwner },
  purposes: [{ code: "collaboration", statement: "Study together: notes and questions." }],
  actions: [{ action: "room.look", purposes: ["collaboration"], level: "discover", data_asks: [] },
            { action: "room.post", purposes: ["collaboration"], level: "act_on_behalf", data_asks: [] }],
  trustedIntroducers: [wen.id], requireVouchFor: ["collaboration"] });
const tomas = createRepresentative({ ownerName: "Tomas Reyna", owner: generatePrincipalKey(), purposes: ["collaboration"], actions: ["room.look", "room.post"] });
const cold = await tomas.visit(room, { purpose: "collaboration", actions: ["room.look", "room.post"], why: "join the study group" });
check(!cold.seated, "without an introduction, the study room doesn't grant Tomas's representative a pass (its rule, said in its listing)");
const LOG = "https://wen.example/shokai/revocations"; offline(room, LOG);
const v = signVouch(wen, "Wen Halsey", { rep: tomas.id, card: tomas.card }, { purposes: ["collaboration"], revocationLog: LOG });
const warm = await tomas.visit(room, { purpose: "collaboration", actions: ["room.look", "room.post"], vouch: v, why: "join the study group; Wen introduced me" });
check(warm.seated, "with Wen's signed vouch (a warm introduction), Tomas's representative is granted a pass in the study room");
check((await warm.act("room.post", { text: "Notes for week 3" }))?.type === "act_result", "Tomas's representative posts within its pass");
out.steps.push({ who: "Tomas's visiting representative", at: "Ines's study room", without_vouch: cold.decision, with_vouch: warm.decision });

const press = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "fernhill-press", displayName: "Fernhill Press (fictional)", category: "store",
  purposes: [{ code: "inquiry", statement: "Ask about readings and permissions for teaching." }],
  actions: [{ action: "catalog.look", purposes: ["inquiry"], level: "discover", data_asks: [] },
            { action: "permission.request", purposes: ["inquiry"], level: "advise", data_asks: [] }] });
const elleryOut = createRepresentative({ ownerName: "Hana Ellery", owner: ellery, key: elleryKey, purposes: ["inquiry"], actions: ["catalog.look", "permission.request"] });
const ve = await elleryOut.visit(press, { purpose: "inquiry", actions: ["catalog.look", "permission.request"], why: "a reading pack for DS 210" });
check(ve.seated, "Dr. Ellery's visiting representative is granted a pass at the publisher");
check(elleryOut.id === course.repId, "the same agent keeps the course door and goes out for Dr. Ellery (two cards, one key)");
await ve.act("permission.request", { item: "chapter 4", use: "DS 210 reading pack" });
out.steps.push({ who: "Dr. Ellery's visiting representative", at: "Fernhill Press", granted: ve.seated });

const work = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "ines-ds-210-coursework", displayName: "Ines's DS 210 coursework", category: "education",
  about: "Ines's coursework for DS 210. Opened by Ines for the course staff; she can close it at any time.",
  keys: { rep: inesKey, principal: inesOwner },
  purposes: [{ code: "data_access", statement: "Collect this week's DS 210 exercises, read only." }],
  actions: [{ action: "folder.ds_210.read", purposes: ["data_access"], level: "discover", data_asks: [] }] });
const collector = createRepresentative({ ownerName: "Hana Ellery", owner: ellery, key: elleryKey, purposes: ["data_access"], actions: ["folder.ds_210.read"] });
const vw = await collector.visit(work, { purpose: "data_access", actions: ["folder.ds_210.read"], why: "I've come to collect this week's exercises for DS 210" });
check(vw.seated && vw.seat.tool_allowlist.length === 1 && vw.seat.tool_allowlist[0] === "folder.ds_210.read", "Dr. Ellery's representative is granted a pass at Ines's coursework door for the DS 210 folder only, read only");
check((await vw.act("folder.ds_210.read", { week: 3 }))?.type === "act_result", "it collects week 3's exercises");
vw.checkSeatLocally = false;
const other = await vw.act("folder.personal.read");
check(other?.type === "act_decision" && other.decision === "deny", "the rest of Ines's folders: refused by Ines's host representative");
out.steps.push({ who: "Dr. Ellery's visiting representative", at: "Ines's coursework door (Ines's host representative)", tools: vw.seat.tool_allowlist, refused: "folder.personal.read" });

if (!process.argv.includes("--check")) {
  done(new URL("./university.trace.json", import.meta.url), { trace: { lio_campus: flow(vl), ines_campus: flow(vi), ines_course: flow(vc), tomas_room_with_vouch: flow(warm) } });
} else {
  out.ok = out.checks.every((c) => c.ok);
  console.log(`${out.checks.filter((c) => c.ok).length}/${out.checks.length} checks passed`);
}
