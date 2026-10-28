// v0.2.7 (§2.2, C145–C147) over HTTP on a running server: msg_id is unique per sender only. Two visitors use the SAME msg_ids
// at fernwood; both are seated and each answer goes to its own sender; an exact redelivery and a same-sender id reuse are not
// handled again; two pollers may use one poll id, one poller may not. Run: node dist/test/http-msgid.js [port]
import { makeSigned, randomId } from "../src/crypto.js";
import { possessionPayload } from "../src/verify.js";
import { visitor, mandate, type Visitor } from "./kit.js";

const BASE = `http://127.0.0.1:${process.argv[2] ?? 8787}`;
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const plus = (s: number) => new Date(Date.now() + s * 1000).toISOString().replace(/\.\d+Z$/, "Z");
let ok = 0, bad = 0; const check = (c: boolean, w: string) => { c ? ok++ : bad++; console.log(`  ${c ? "PASS" : "FAIL"}  ${w}`); };
const postRaw = async (p: string, b: string) => { const r = await fetch(BASE + p, { method: "POST", body: b }); return { status: r.status, body: await r.json() as any }; };
const pl = (env: any) => ((env?.messages ?? []) as any[]).map((m) => m.payload ?? m);
const path = (u: string) => new URL(u).pathname;
const listing = await (await fetch(BASE + "/places")).json() as any;
const fern = listing.places.find((p: any) => p.name === "fernwood");
const E = path(fern.entry);
const scope = { purposes: ["visitation"], actions: ["store.browse_catalog"] } as any;
const tag = randomId("m");
const mk = (v: Visitor, enc: string, id: string, type: string, body: object) => JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: id, sent_at: now(), from: v.rep.id, to: fern.representative_id, type, ...body }, v.rep, now()));
async function visit(v: Visitor) {
  const enc = randomId("enc");
  const g = pl((await postRaw(E, mk(v, enc, `${tag}-1`, "greeting", { locales: ["en-US"], nonce: randomId("n") }))).body);
  const hn = g.find((p) => p.type === "greeting")?.nonce;
  const c = pl((await postRaw(E, mk(v, enc, `${tag}-2`, "card_presentation", { card: v.card, possession_proof: makeSigned(possessionPayload(enc, hn), v.rep, now()).signatures[0] }))).body);
  await postRaw(E, mk(v, enc, `${tag}-3`, "introduction", { vouch: null }));
  const reqRaw = mk(v, enc, `${tag}-4`, "invitation_request", { card_digest: v.card.payload_digest, mandate: mandate(v, "visitation", ["store.browse_catalog"], {}, { valid_from: plus(-3600), expires_at: plus(86400) }),
    proposal: { request: { actions: ["store.browse_catalog"] }, value_to_counterparty: { text: "Just looking.", locale: "en-US" }, etiquette_register: "first_meeting" } });
  const r = pl((await postRaw(E, reqRaw)).body).find((p) => p.type === "invitation_response");
  return { enc, c, r, reqRaw };
}
const a = visitor(`Visitor A ${randomId("a")}`, "person", scope), b = visitor(`Visitor B ${randomId("b")}`, "person", scope);
const va = await visit(a), vb = await visit(b);
check(va.c.length > 0 && vb.c.length > 0, "C145: the second visitor's card_presentation (same msg_id as the first's) is answered");
check(!!va.r && !!vb.r && va.r.to === a.rep.id && vb.r.to === b.rep.id && va.r.in_reply_to === `${tag}-4` && vb.r.in_reply_to === `${tag}-4` && va.r.decision === vb.r.decision,
  `C145: both requests decided (${va.r?.decision}/${vb.r?.decision}), each answer to its own sender, in_reply_to = the shared id`);
const redo = await postRaw(E, vb.reqRaw);
check(redo.status === 200 && pl(redo.body).length === 0, "C146: exact redelivery of B's request (same from, msg_id) → not handled again");
const reuse = await postRaw(E, mk(b, vb.enc, `${tag}-4`, "farewell", { outcome: "completed" }));
check(reuse.status === 200 && pl(reuse.body).length === 0, "C146: B reusing its own msg_id for other content → not handled");
const fresh = await postRaw(E, mk(b, vb.enc, `${tag}-5`, "farewell", { outcome: "completed" }));
const second = await postRaw(E, mk(b, vb.enc, `${tag}-6`, "farewell", { outcome: "completed" }));
check(pl(fresh.body).length === 0 && pl(second.body).some((p) => p.type === "invitation_response" && p.reason_code === "RITUAL_ORDER" && p.in_reply_to === `${tag}-6`),
  "control: B's fresh ids are handled (its first farewell closes quietly; a second farewell gets RITUAL_ORDER), so the silence above was de-duplication");
const pid = randomId("poll");
const poll = (v: Visitor) => postRaw(path(fern.inbox), JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: "inbox", msg_id: pid, sent_at: now(), from: v.rep.id, to: fern.representative_id, type: "inbox_poll" }, v.rep, now())));
const p1 = (await poll(a)).status, p2 = (await poll(b)).status, p3 = (await poll(a)).status;
check(p1 === 200 && p2 === 200 && p3 === 403, `C147: same poll msg_id from A then B → ${p1}/${p2}; A again → ${p3}`);
console.log(`\n${ok} pass, ${bad} fail`); process.exitCode = bad ? 1 : 0;
