// SPDX-License-Identifier: Apache-2.0
// Property-based fuzz (seeded, dependency-free, fast-check style) of the reference host's message handling.
// Properties: (1) handle() never throws on any input, well-formed or not; (2) a malformed, unsigned or
// tampered message never produces a grant or a seat; (3) random message sequences never grant without a
// valid ritual. Fictional place (Fernwood Goods), fresh in-memory keys, no network.
//   node tools/fuzz/fuzz.mjs [runs=2000] [seed]
import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const ENG = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "reference", "engawa", "dist");
const PL = await import(join(ENG, "src/places.js")), K = await import(join(ENG, "test/kit.js")), C = await import(join(ENG, "src/crypto.js"));
const RUNS = Number(process.argv[2] ?? 2000); let seed = Number(process.argv[3] ?? 0x5eed) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TYPES = ["greeting", "card_presentation", "card_receipt", "introduction", "invitation_request", "act", "farewell", "card_revocation", "gathering_message", "bogus", "", null];
const junk = (d = 0) => { const k = rnd(); if (d > 3 || k < 0.15) return pick([null, true, 0, -1, 1e308, NaN, "", "x".repeat(Math.floor(rnd() * 300)), "\u202e", "__proto__", "sha-256:", "did:key:z6Mk"]);
  if (k < 0.4) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1));
  const o = {}; for (let i = 0; i < Math.floor(rnd() * 5); i++) o[pick(["payload", "signatures", "type", "from", "to", "card", "mandate", "seat", "amount", "protocol", "constructor", "__proto__", "x"])] = junk(d + 1); return o; };
let fails = 0, cases = 0; const bad = (why, w) => { if (fails++ < 5) console.error("FAIL", why, JSON.stringify(w).slice(0, 200)); };
const granted = (out) => out.some((o) => { const p = o?.message?.payload ?? o?.message; return p?.decision === "grant" || p?.type === "seat_grant" || !!p?.seat; });
const h = PL.makeHost(PL.fernwood, PL.newKeys(), new Map(), K.clockAt(K.NOW).now);
const v = K.visitor("Kiran Vale", "person", ["store.browse_catalog"]);
for (let i = 0; i < RUNS; i++) {
  const mode = rnd(); let wire;
  if (mode < 0.4) wire = junk();                                               // structural junk
  else { const s = new K.Session(h, v); const m = s.msg(pick(TYPES), { nonce: junk(), card: junk(), request: junk() });
    if (mode < 0.7) wire = { payload: m, payload_digest: K.digestOf(m), signatures: [] };   // unsigned
    else { wire = C.makeSigned(m, v.rep, K.NOW); const f = pick(["type", "from", "to", "sent_at"]); wire.payload = { ...wire.payload, [f]: junk() }; } } // tampered after signing
  cases++; let out;
  try { out = h.handle(wire) ?? []; } catch (e) { bad("threw: " + e.message, wire); continue; }
  if (!Array.isArray(out)) { bad("non-array reply", wire); continue; }
  if (granted(out)) bad("grant on malformed/unsigned/tampered input", wire);
}
// random sequences of valid-shaped but out-of-order ritual steps: never a grant without a mandate request
for (let i = 0; i < Math.floor(RUNS / 10); i++) { const s = new K.Session(h, K.visitor("Noor Halloran", "person", ["store.browse_catalog"])); cases++;
  try { for (let j = 0; j < 6; j++) { const st = pick(["greet", "present", "receipt", "introduce"]); const out = st === "introduce" ? s.introduce(null) : s[st]();
    if (s.last.some((x) => x?.decision === "grant")) bad("grant without a request (sequence)", st); } } catch (e) { bad("sequence threw: " + e.message, i); } }
console.log(`fuzz: ${cases} cases, ${fails} failed (seed ${process.argv[3] ?? "0x5eed"})`); process.exitCode = fails ? 1 : 0;
