// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, red-team round 3 fixes (2026-11-11, for 0.5.1): a binding `never` from the SDK door states when it lifts (at most 180
// days) and an appeal path (C288, SPEC-DETAIL §9.3; V05-F7-04-sdk); session tokens and pasted sessions in an act are refused (C210;
// V05-F10-04). In process, fictional people (Dana Moor, Vex Arlo), fresh keys only, nothing sent anywhere.
import { createDoor, createRepresentative, sign, possessionPayload, randomId, type DoorOptions } from "../src/index.js";
import { CREDENTIAL_MEMBERS, forbiddenMembers } from "../src/core/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "tea-room", displayName: "The Tea Room", category: "store",
  purposes: [{ code: "inquiry", statement: "Questions about tea." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });
const iso = (t: number) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const DAY = 86400e3;

/** The victim's card presented under the attacker's own representative key (the stolen-card path). */
async function stolenCard(o: Partial<DoorOptions> = {}) {
  const door = createDoor(opts(o)); await (door as any).ready;
  const victim = createRepresentative({ ownerName: "Dana Moor", purposes: ["inquiry"], actions: ["concierge.talk"] });
  const att = createRepresentative({ ownerName: "Vex Arlo", purposes: ["inquiry"], actions: ["concierge.talk"] });
  const vcard = (victim as any).card; const akey = (att as any).key; const aid = (att as any).card.payload.representative_id;
  const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
  const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: "shokai/0.5", encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: aid, to: door.repId, type, ...body } as any, akey, at());
  const post = async (m: unknown) => ((await door.post(m)).envelope.messages ?? []).map((x: any) => x?.payload ?? x);
  const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }));
  const hostNonce = g.find((x: any) => x.type === "greeting")?.nonce;
  const proof = sign(possessionPayload(enc, hostNonce, door.repId), akey, at()).signatures[0];
  const out = await post(msg("card_presentation", { card: vcard, possession_proof: { ...proof, key_id: vcard.payload.representative_key.key_id, signer: vcard.payload.representative_id, audience: door.repId } }));
  return { door, ir: out.find((x: any) => x.type === "invitation_response"), aid, vid: vcard.payload.representative_id, vprincipal: vcard.payload.principal.principal_id };
}

async function main() {
  console.log("SDK red-team round 3 fixes (C288, C210)");
  const a = await stolenCard();
  const h = (a.door as any).host;
  check(a.ir?.decision === "deny" && a.ir?.disposition === "never" && a.ir?.retry?.kind === "never" && !a.ir?.reason_code, "stolen card at the SDK door: deny / never, no reason code");
  const until = Date.parse(a.ir?.retry?.until ?? "");
  check(Number.isFinite(until) && until > Date.now() && until - Date.now() <= 180 * DAY + 60e3, `retry.until states when it lifts, within 180 days (${a.ir?.retry?.until})`);
  check(a.ir?.retry?.appeal?.url === a.door.inbox && a.ir?.retry?.appeal?.place === h.cfg.principal_id, "the appeal path names the place and, with no appealUrl set, its inbox address");
  check(h.isNever(a.aid) && !h.isNever(a.vid) && !h.isNever(a.vprincipal), "the presenter is bound; the card's owner and representative are not");
  const b = await stolenCard({ appealUrl: "https://tea-room.example/appeals" });
  check(b.ir?.retry?.appeal?.url === "https://tea-room.example/appeals", "an operator's appealUrl is the one the reply names");
  let threw = ""; try { createDoor(opts({ name: "bad-appeal", appealUrl: "not a url" })); } catch (e: any) { threw = String(e?.message ?? e); }
  check(!!threw, "a malformed appealUrl stops the door from starting");

  // C210: session spellings by name, and by shape.
  for (const n of ["session_cookie", "session_token", "session_key", "set_cookie", "auth_token"]) check(CREDENTIAL_MEMBERS.includes(n), `C210 list names ${n}`);
  check(forbiddenMembers({ session: { id: "s-FAKE", cookie: "sid=FAKE" } }).length > 0, "a pasted session object carrying a cookie is caught");
  check(forbiddenMembers({ cookie: "sid=FAKE" }).length > 0 && forbiddenMembers({ Cookie: { sid: "FAKE" } }).length > 0, "a cookie header or cookie jar is caught");
  check(forbiddenMembers({ cookie: "oatmeal", session: { date: "2026-11-20", time: "09:00" }, session_id: "class-7" }).length === 0, "ordinary words are not: a cookie flavour, a booked class session, a session id");
  console.log(`redteam-round3: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
