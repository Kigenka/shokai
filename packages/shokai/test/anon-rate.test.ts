// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, red team 4b (2026-11-04, provisional, C278): anonymous arrivals are rate-limited per client address and in total
// (SPEC §11.1); past a cap the door answers 429 with retry-after and an empty body; verified ritual traffic isn't counted. Fictional people.
import { createDoor, createRepresentative, type Door, type DoorOptions } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "taste-blend", displayName: "The Taste Blend table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });

const call = async (d: Door, method: string, path: string, body: string, addr?: string) => {
  const r = await d.respond(method, path, async () => body, addr === undefined ? {} : { clientAddress: addr });
  if (!r) throw new Error("not the door's path: " + path);
  return r;
};
const paths = (d: Door) => {
  const place: any = d.listing().places[0];
  const entry = new URL(place.entry).pathname, lobby = new URL(place.lobby).pathname;
  const base = entry.replace(/\/places\/[^/]+\/entry$/, "");
  return { entry, lobby, listing: base + "/places", hostCard: entry + "/host-card.json" };
};

async function main() {
  console.log("SDK anonymous rate limits (C278)");
  const A = "203.0.113.7", B = "198.51.100.9";
  const door = createDoor(opts({ anonRatePerAddr: 3, anonRateTotal: 100 }));
  const p = paths(door);

  const first: number[] = [];
  for (let i = 0; i < 3; i++) first.push((await call(door, "POST", p.lobby, "hello, what's on the table?", A)).status);
  check(first.every((s) => s === 200), "lobby prose from one address is answered up to the per-address cap");
  const over = await call(door, "POST", p.lobby, "hello again", A);
  const env = JSON.parse(over.body);
  check(over.status === 429 && over.headers["retry-after"] === "60", "past the per-address cap: 429 with retry-after 60");
  check(Array.isArray(env.messages) && env.messages.length === 0 && typeof env.protocol === "string", "the 429 carries an empty ReplyEnvelope (no finding, no lobby)");
  const unsigned = await call(door, "POST", p.entry, "plain prose at the entry", A);
  check(unsigned.status === 429, "an unsigned body at the entry counts as unverified too");
  const gl = await call(door, "GET", p.listing, "", A);
  check(gl.status === 429 && gl.body === "{}" && gl.headers["retry-after"] === "60", "a listing read from the same address past the cap: 429 with empty JSON");
  const gh = await call(door, "GET", p.hostCard, "", A);
  check(gh.status === 429, "a host card read from the same address past the cap: 429");

  const other = await call(door, "GET", p.listing, "", B);
  check(other.status === 200 && Array.isArray(JSON.parse(other.body).places), "a different address still gets through");
  const otherLobby = await call(door, "POST", p.lobby, "hi", B);
  check(otherLobby.status === 200, "a different address can still reach the lobby");

  // A seated (verified) visit is unaffected, and a signed ritual message from the exhausted address isn't counted.
  const mio = createRepresentative({ ownerName: "Mio", purposes: ["inquiry"], actions: ["concierge.talk"] });
  const v: any = await mio.visit(door, { purpose: "inquiry", actions: ["concierge.talk"] });
  check(!!v.seated, "a verified visit is seated while one address is over its cap");
  const signed = (v.transcript as any[]).find((m) => m.dir === "out" && Array.isArray(m.message?.signatures) && m.message.signatures.length > 0);
  const replay = signed ? await call(door, "POST", p.entry, JSON.stringify(signed.message), A) : undefined;
  check(!!replay && replay.status !== 429, "a sender with a live seat is not refused merely because its address is exhausted");

  // The total cap.
  const tight = createDoor(opts({ name: "tight", anonRatePerAddr: 50, anonRateTotal: 5 }));
  const tp = paths(tight);
  const ok: number[] = [];
  for (let i = 1; i <= 5; i++) ok.push((await call(tight, "POST", tp.entry, "{}", `192.0.2.${i}`)).status);
  const sixth = await call(tight, "POST", tp.entry, "{}", "192.0.2.99");
  check(ok.every((s) => s === 200) && sixth.status === 429 && sixth.headers["retry-after"] === "60", "past the total cap even a new address gets 429 for lobby traffic");
  // Review 6 R6-02: the static reads every visitor makes first are never totalled, so the flood above locks no newcomer out.
  const statics = [await call(tight, "GET", tp.listing, "", "192.0.2.100")];
  check(statics.every((r) => r.status === 200), "R6-02 past the total cap a new address still reads the listing (static reads count per address only)");

  // Defaults: 60 a minute per address.
  const dflt = createDoor(opts({ name: "dflt" }));
  const dp = paths(dflt);
  let allOk = true;
  for (let i = 0; i < 60; i++) if ((await call(dflt, "GET", dp.listing, "", A)).status !== 200) allOk = false;
  const sixtyFirst = await call(dflt, "GET", dp.listing, "", A);
  check(allOk && sixtyFirst.status === 429, "default: 60 reads a minute per address, the 61st is 429");

  const bounded = createDoor(opts({ name: "bounded-static" })), bp = paths(bounded);
  for (let i = 0; i < 4096; i++) await call(bounded, "GET", bp.listing, "", `192.0.${Math.floor(i / 256)}.${i % 256}`);
  const excess = await call(bounded, "GET", bp.listing, "", "203.0.113.100");
  check(excess.status === 429 && (bounded as any).anonRateState.perAddr.size === 4096, "Muse: distinct-address static GET flood is bounded to 4096 entries per window");

  console.log(`anon rate: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
