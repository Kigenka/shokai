// C46 regression over HTTP on ONE running server: three sequential askers (distinct principals), each with its own decliner,
// 3 presses each; poll right after press 3 → exactly one minor manipulation notice held for that asker's rep. Run: node dist/test/http-press.js [port]
import type * as S from "../src/shapes.js";
import { makeSigned, randomId, type PasskeyOwner } from "../src/crypto.js";
import { possessionPayload } from "../src/verify.js";
import { visitor, mandate, inboxPoll, ownerConsent, type Visitor } from "./kit.js";

const BASE = `http://127.0.0.1:${process.argv[2] ?? 8787}`;
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const plus = (s: number) => new Date(Date.now() + s * 1000).toISOString().replace(/\.\d+Z$/, "Z");
let ok = 0, bad = 0; const check = (c: boolean, w: string) => { c ? ok++ : bad++; console.log(`  ${c ? "PASS" : "FAIL"}  ${w}`); };
const post = async (p: string, b: string) => { const r = await fetch(BASE + p, { method: "POST", body: b }); return r.json() as Promise<any>; };
const pl = (env: any) => ((env?.messages ?? []) as any[]).map((m) => m.payload ?? m);
const path = (u: string) => new URL(u).pathname;
const listing = await (await fetch(BASE + "/places")).json() as any;
const eng = listing.places.find((p: any) => p.name === "engawa");
const proposal = (actions: string[]) => ({ request: { actions }, value_to_counterparty: { text: "Hi!", locale: "en-US" }, etiquette_register: "first_meeting" });
function ritual(v: Visitor) {
  const enc = randomId("enc"); let n = 0; const E = path(eng.entry);
  const msg = (type: string, body: object) => JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: `${enc}-${++n}`, sent_at: now(), from: v.rep.id, to: eng.representative_id, type, ...body }, v.rep, now()));
  return { send: (t: string, b: object) => post(E, msg(t, b)),
    async open() { const g = await post(E, msg("greeting", { locales: ["en-US"], nonce: randomId("n") })); const hn = pl(g).find((p) => p.type === "greeting").nonce;
      await post(E, msg("card_presentation", { card: v.card, possession_proof: makeSigned(possessionPayload(enc, hn), v.rep, now()).signatures[0] })); return post(E, msg("introduction", { vouch: null })); } };
}
const poll = async (v: Visitor) => pl(await post(path(eng.inbox), JSON.stringify(inboxPoll(v.rep, eng.representative_id, now()))));
async function seat(v: Visitor): Promise<string> {
  const a = ritual(v); await a.open();
  await a.send("invitation_request", { card_digest: v.card.payload_digest, mandate: mandate(v, "invitation", ["gathering.request_invitation"], {}, { valid_from: plus(-3600), expires_at: plus(86400) }), proposal: proposal(["gathering.request_invitation"]) });
  const gi = (await poll(v)).filter((p) => p.type === "gathering_invitation").at(-1);
  const b = ritual(v); await b.open();
  const consent = ownerConsent(v.owner as PasskeyOwner, v.rep.id, "accept_house_rules", { kind: "gathering", id: gi.gathering.payload.gathering_id, digest: gi.gathering.payload_digest }, { issued_at: now(), expires_at: plus(86400) });
  const r = pl(await b.send("invitation_request", { card_digest: v.card.payload_digest, mandate: mandate(v, "gathering", ["gathering.attend"], {}, { valid_from: plus(-3600), expires_at: plus(86400) }), owner_consents: [consent], proposal: proposal(["gathering.attend"]) })).find((p) => p.type === "invitation_response");
  if (r?.decision !== "grant") throw new Error("not seated: " + JSON.stringify(r));
  return gi.gathering.payload.gathering_id;
}
// Room msg_ids restart per run (v101…, v301…) as the visitor's cross-test does: ids are per sender, so a reused id must not resolve to an earlier asker.
let qn = 100, dn = 300;
const room = (v: Visitor, gid: string, type: string, body: object) => { const id = `${gid}-v${type === "privacy_decline" ? ++dn : ++qn}`; return { id, raw: JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: gid, msg_id: id, sent_at: now(), from: v.rep.id, to: gid, type, gathering_id: gid, ...body }, v.rep, now())) }; };
const ask = async (v: Visitor, gid: string, topic: string, text: string) => { const m = room(v, gid, "gathering_message", { kind: "question", topic, text: { text, locale: "en-US" }, attribution: "chatham_house" }); await post(path(eng.entry), m.raw); return m.id; };
const decline = async (v: Visitor, gid: string, q: string, topic: string) => { await post(path(eng.entry), room(v, gid, "privacy_decline", { in_reply_to: q, topic, courtesy: { locale: "en-US", register: "first_meeting", text: "That's private." }, penalized: false }).raw); };

for (const [i, topic] of [[1, "wellbeing"], [2, "family"], [3, "wellbeing"]] as const) {
  const asker = visitor(`Asker ${i} ${randomId("a")}`, "person", { purposes: ["invitation", "gathering"], actions: ["gathering.request_invitation", "gathering.attend"] });
  const decl = visitor(`Decliner ${i} ${randomId("d")}`, "person", { purposes: ["invitation", "gathering"], actions: ["gathering.request_invitation", "gathering.attend"] });
  qn = 100; dn = 300;
  const gid = await seat(asker); await seat(decl); await poll(asker);
  const q0 = await ask(asker, gid, topic, "How are things at home?"); await decline(decl, gid, q0, topic);
  for (let p = 1; p <= 3; p++) { const q = await ask(asker, gid, topic, `Press ${p}: really?`); await decline(decl, gid, q, topic);
    const notes = (await poll(asker)).filter((x) => x.type === "misconduct_notice");
    if (p < 3) check(notes.length === 0, `run ${i} (${topic}): press ${p} → no notice`);
    else check(notes.length === 1 && notes[0].notice.payload.findings[0].code === "manipulation" && notes[0].notice.payload.subject.principal_id === asker.owner.id, `run ${i} (${topic}): press 3 → exactly one minor manipulation notice for THIS asker`); }
}
console.log(`\n${ok} pass, ${bad} fail`); process.exitCode = bad ? 1 : 0;
