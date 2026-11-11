// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (Fable review, §11.1/§3.4): a flood of bodies shaped like signed envelopes but carrying forged signatures is
// anonymous traffic: it meets the 429 limit, and the door's encounters, log and fetch cache stay bounded. Fictional people.
import { createDoor, generateRepresentativeKey, sign, randomId, DEFAULT_MAX_ENCOUNTERS, type DoorOptions } from "../src/index.js";
import { MAX_LOG } from "../src/core/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "taste-blend", displayName: "The Taste Blend table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });

async function main() {
  console.log("SDK forged-signature flood (Fable review)");
  const door = createDoor(opts());
  const entry = new URL((door.listing().places[0] as any).entry).pathname;
  const forged = (i: number) => JSON.stringify({ protocol: "shokai/0.5", payload: { type: "greeting", msg_id: "m" + i, nonce: "n" + i, from: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", sent_at: new Date().toISOString(), card: { payload: { revocation_url: "https://revocations.example/" + i } } },
    signatures: [{ kid: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", alg: "EdDSA", sig: "AAAA" + i }] });
  const counts = new Map<number, number>();
  for (let i = 0; i < 5000; i++) {
    const r = await door.respond("POST", entry, async () => forged(i), { clientAddress: `198.51.100.${i % 50}` });
    counts.set(r!.status, (counts.get(r!.status) ?? 0) + 1);
  }
  const n429 = counts.get(429) ?? 0;
  check(n429 >= 4000, `5,000 forged-signature posts are anonymous: ${n429} answered 429`);
  const live = (door.host as any).encounters.size as number;
  check(live <= 600, `encounters stay bounded by the anonymous limit (${live} live)`);
  check((door as any).fetched.size <= 600, `the door's fetch cache stays bounded (${(door as any).fetched.size})`);
  // Outside the test profile nothing is fetched or recorded for an unverified signer.
  const prod = createDoor(opts({ name: "prod", testProfile: false, baseUrl: "https://door.kigenka.invalid.shop/shokai" }));
  const pe = new URL((prod.listing().places[0] as any).entry).pathname;
  for (let i = 0; i < 50; i++) await prod.respond("POST", pe, async () => forged(i), { clientAddress: "203.0.113.9" });
  check((prod as any).fetched.size === 0, "outside the test profile nothing is recorded for unverified signers");
  check(door.host.log.length <= MAX_LOG, "the host log is capped");
  check((door.host as any).opts.maxEncounters === DEFAULT_MAX_ENCOUNTERS, "createDoor sets a default encounter cap");

  // Gemini round-2: a body with exactly `"signatures": [{}]` (shape-only) is still anonymous via door.respond.
  const gemini = createDoor(opts({ name: "gemini-dummy", anonRatePerAddr: 3, anonRateTotal: 100 }));
  const ge = new URL((gemini.listing().places[0] as any).entry).pathname;
  const dummy = JSON.stringify({ protocol: "shokai/0.5", payload: { type: "greeting", msg_id: "m", nonce: "n", from: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", sent_at: new Date().toISOString() }, signatures: [{}] });
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push((await gemini.respond("POST", ge, async () => dummy, { clientAddress: "203.0.113.50" }))!.status);
  check(statuses.slice(0, 3).every((s) => s !== 429) && statuses.slice(3).every((s) => s === 429),
    `Gemini dummy signatures:[{}] is anonymous: first 3 ok-ish, then 429 (got ${statuses.join(",")})`);

  // Muse H1: key generation is free; an unbound signature is not an address-limit exemption.
  const fresh = createDoor(opts({ name: "muse-fresh", anonRatePerAddr: 2, anonRateTotal: 100 }));
  const fe = new URL(fresh.entry).pathname, addr = "203.0.113.71";
  const key = generateRepresentativeKey();
  const greet = () => sign({ protocol: "shokai/0.5", type: "greeting", encounter_id: randomId("muse"), msg_id: randomId("msg"), nonce: randomId("nonce"),
    sent_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), from: key.id, locales: ["en-US"] } as any, key);
  for (let i = 0; i < 2; i++) await fresh.respond("POST", fe, async () => "{}", { clientAddress: addr });
  const beforeBlocked = fresh.host.encounters.size;
  const blocked = await fresh.respond("POST", fe, async () => JSON.stringify(greet()), { clientAddress: addr });
  check(blocked?.status === 429 && fresh.host.encounters.size === beforeBlocked, "Muse H1: a fresh self-signed greeting after address exhaustion is 429, no encounter minted");
  const bound = createDoor(opts({ name: "muse-bound", anonRatePerAddr: 2, anonRateTotal: 100 }));
  const be = new URL(bound.entry).pathname, firstGreeting = greet();
  const firstBound = await bound.respond("POST", be, async () => JSON.stringify(firstGreeting), { clientAddress: addr });
  check(firstBound?.status === 200 && bound.host.encounters.has(firstGreeting.payload.encounter_id), "Muse H1 control: real signed greeting creates a live encounter");
  await bound.respond("POST", be, async () => "{}", { clientAddress: addr });
  const repeated = await bound.respond("POST", be, async () => JSON.stringify(firstGreeting), { clientAddress: addr });
  check(repeated?.status === 200, "Muse H1: the bound sender still reaches its live encounter after other traffic exhausts the address");
  const duplicate = JSON.stringify(firstGreeting).replace('"payload":', '"payload":{},"payload":');
  const invalid = await bound.respond("POST", be, async () => duplicate, { clientAddress: addr });
  check(invalid?.status === 429, "Muse strict gate: duplicate-member signed body cannot use the bound sender exemption");

  const poll = sign({ protocol: "shokai/0.5", type: "inbox_poll", from: key.id, msg_id: randomId("poll"), sent_at: new Date().toISOString().replace(/\.\d+Z$/, "Z") } as any, key);
  const encodedPoll = await bound.respond("POST", new URL(bound.inbox).pathname, async () => JSON.stringify(JSON.stringify(poll)));
  check(encodedPoll?.status === 403, "Muse strict gate: a JSON string containing a signed inbox poll is not parsed a second time");

  console.log(`flood: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
