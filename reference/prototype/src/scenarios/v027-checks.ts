/**
 * V7: the v0.2.7 checks (S4 part 1). SPEC §2.2 "Message ids": a msg_id is unique per sender only, and receivers key replay
 * detection, de-duplication and in_reply_to resolution on (from, msg_id). Here two visitors deliberately reuse the same
 * msg_ids at one place, two pollers reuse one poll id, and two askers in a room reuse one question id (the root cause of the
 * round-5 C46 host bug, host-final2-001). All names are fictional; everything is local and in-process.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative, type Wire } from "../representative.js";
import { Door, type HttpResponse } from "../door.js";
import { ed25519FromLabel, signed } from "../crypto.js";
import { resolveReply, resolveRoomReply, type Header } from "../msgkey.js";
import type { InvitationResponse, PlaceListing, ReplyEnvelope } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "V7: Message ids are per sender (v0.2.7)",
    "Two visitors happen to number their messages the same way. The store keeps them apart, because it always asks 'who sent it' as well as 'which number'.",
    [["Aya's representative", "A visitor"], ["Kiran's representative", "A second visitor (fictional Kiran Vale)"], ["Mika's representative", "A third guest (fictional)"], ["Fernwood Goods", "A fictional online store"]],
  );
  const w = makeWorld(rec);
  const fern = w.hosts.fernwoodRep;
  const y = w.ayaRep;
  const now = () => w.clock.now();
  const kv = new Representative({ name: "Kiran's representative", repKey: ed25519FromLabel("rep:kiran-visitor-v7"), principal: { principal_id: w.owners.kiran.id, kind: "person", display_name: "Kiran Vale" }, principalKey: w.owners.kiran.key, locales: ["en-US"], ownerLocale: "en-US", phrases: w.VIS_EN, ...w.shared });
  w.issueCard(kv, w.owners.kiran, { role: "Personal representative of Kiran Vale", purposes: ["visitation"], actions: ["store.browse_catalog"] });
  w.issueMandate(y, w.owners.aya, "m-v7-y", "visitation", "Look around", ["store.browse_catalog"]);
  w.issueMandate(kv, w.owners.kiran, "m-v7-k", "visitation", "Look around", ["store.browse_catalog"]);

  const BASE = "http://127.0.0.1:8080";
  const door = new Door(BASE, [fern], now);
  const listing = door.http({ method: "GET", path: `${BASE}/places` }).body as PlaceListing;
  const entry = listing.places[0];
  const msgs = (r: HttpResponse) => ((r.body as ReplyEnvelope).messages ?? []) as unknown as Wire[];
  const post = (wire: Wire) => door.http({ method: "POST", path: entry.entry, contentType: "application/json", body: wire });
  const viaDoor = (v: Representative, first: Wire): Wire[] => {
    const q: Wire[] = [first]; const seen: Wire[] = []; let guard = 0;
    while (q.length && guard++ < 40) { const r = post(q.shift()!); for (const o of msgs(r)) { seen.push(o); q.push(...v.receive(o)); } }
    return seen;
  };
  /** Re-sign a visitor's own message under a chosen msg_id (both visitors use the same ids on purpose). */
  const force = (r: Representative, wire: Wire, id: string): Wire => r.sign({ ...(wire.payload as object), msg_id: id } as never);
  const sent: Header[] = [];
  const send = (r: Representative, wire: Wire): Wire[] => { sent.push(wire.payload as Header); return viaDoor(r, wire); };

  // ---------------------------------------------------------------- 1. one place, two senders, the same msg_ids
  rec.h2("Two visitors, the same message numbers");
  const gy = force(y, y.greet("v7-a", fern), "same-1"), gk = force(kv, kv.greet("v7-b", fern), "same-1");
  const greetY = send(y, gy), greetK = send(kv, gk);
  const cy = force(y, y.presentCard("v7-a"), "same-2"), ck = force(kv, kv.presentCard("v7-b"), "same-2");
  send(y, cy);
  const cardK = send(kv, ck);
  const iy = force(y, y.introduce("v7-a", null), "same-3"), ik = force(kv, kv.introduce("v7-b", null), "same-3");
  send(y, iy); send(kv, ik);
  const ry = force(y, y.request("v7-a", { mandate_id: "m-v7-y", actions: ["store.browse_catalog"], pitch: "Just looking." }), "same-4");
  const rk = force(kv, kv.request("v7-b", { mandate_id: "m-v7-k", actions: ["store.browse_catalog"], pitch: "Just looking." }), "same-4");
  const respY = send(y, ry).find((m) => m.payload.type === "invitation_response")?.payload as (InvitationResponse & { to: string; from: string }) | undefined;
  const decisionsBefore = fern.decisions.length;
  const respK = send(kv, rk).find((m) => m.payload.type === "invitation_response")?.payload as (InvitationResponse & { to: string; from: string }) | undefined;
  const decisionsAfterK = fern.decisions.length;
  // an exact redelivery of Kiran's request (same sender, same id, same content) is not processed again
  const redelivered = msgs(post(rk));
  const decisionsAfterRedelivery = fern.decisions.length;
  // the same sender reusing an id for different content is not processed either
  const reusedByK = msgs(post(force(kv, kv.request("v7-b", { mandate_id: "m-v7-k", actions: ["store.browse_catalog"], pitch: "Different words." }), "same-4")));
  const decisionsAfterReuse = fern.decisions.length;

  // ---------------------------------------------------------------- 2. polls: replay is per poller
  rec.h2("Polls: the same poll id from two pollers");
  const pollWith = (v: Representative, id: string) => door.http({ method: "POST", path: entry.inbox, body: v.sign({ protocol: "shokai/0.3", encounter_id: `poll-${v.did.slice(-6)}`, msg_id: id, sent_at: now(), from: v.did, to: fern.did, type: "inbox_poll" } as never) });
  const pollY1 = pollWith(y, "v7-poll-shared").status, pollK1 = pollWith(kv, "v7-poll-shared").status, pollY2 = pollWith(y, "v7-poll-shared").status;

  // ---------------------------------------------------------------- 3. in_reply_to: the reply's `to` names whose msg_id it is
  const byIdOnly = sent.find((m) => m.msg_id === respK?.in_reply_to);
  const resolvedK = respK ? resolveReply(sent, respK) : undefined;
  const resolvedY = respY ? resolveReply(sent, respY) : undefined;

  // ---------------------------------------------------------------- 4. a room: two askers reuse one question id
  rec.h2("A room: two askers, one question number");
  const G = "g-v7-room";
  const mk = new Representative({ name: "Mika's representative", repKey: ed25519FromLabel("rep:mika-v7"), principal: { principal_id: w.owners.mika.id, kind: "person", display_name: "Mika" }, principalKey: w.owners.mika.key, locales: ["en-US"], ownerLocale: "en-US", phrases: w.VIS_EN, ...w.shared });
  const room: Header[] = [];
  const say = (r: Representative, id: string, body: Record<string, unknown>) => { w.clock.advance(1); const p = { protocol: "shokai/0.3", encounter_id: G, msg_id: id, sent_at: now(), from: r.did, to: G, gathering_id: G, ...body }; signed(p as never, [r.repKey], now()); room.push(p as Header); return p as Header; };
  const q1 = say(y, "q-1", { type: "gathering_message", kind: "question", topic: "wellbeing" });
  const d1 = say(kv, "k-1", { type: "privacy_decline", in_reply_to: "q-1", topic: "wellbeing" });
  const a1 = resolveRoomReply(room, d1);
  const q2 = say(mk, "q-1", { type: "gathering_message", kind: "question", topic: "wellbeing" });
  const d2 = say(kv, "k-2", { type: "privacy_decline", in_reply_to: "q-1", topic: "wellbeing" });
  const a2 = resolveRoomReply(room, d2);
  const firstEverQ1 = room.find((m) => m.msg_id === "q-1");
  // a replier never resolves to its own item, even when it reused the id itself
  const selfQ = say(kv, "q-1", { type: "gathering_message", kind: "question", topic: "work" });
  const d3 = say(kv, "k-3", { type: "privacy_decline", in_reply_to: "q-1", topic: "wellbeing" });
  const a3 = resolveRoomReply(room, d3);

  return {
    id: "V7", slug: "v0.2.7-msg-id-checks", title: rec.title, rec, world: w, reports: [],
    data: {
      yDid: y.did, kDid: kv.did, mDid: mk.did,
      bothBound: fern.getEnc("v7-a").counterpart === y.did && fern.getEnc("v7-b").counterpart === kv.did,
      greetY: greetY.length, greetK: greetK.length, cardK: cardK.length, respY, respK,
      kProcessed: decisionsAfterK === decisionsBefore + 1, redelivered: redelivered.length, redeliveryNoDecision: decisionsAfterRedelivery === decisionsAfterK,
      reusedByK: reusedByK.length, reuseNoDecision: decisionsAfterReuse === decisionsAfterK,
      pollY1, pollK1, pollY2,
      byIdOnlyFrom: byIdOnly?.from, resolvedKFrom: resolvedK?.from, resolvedYFrom: resolvedY?.from,
      a1From: a1?.from, a2From: a2?.from, a3From: a3?.from, firstEverQ1From: firstEverQ1?.from, q1, q2, selfQ,
    },
  };
}
import type { ScenarioResult } from "./common.js";
