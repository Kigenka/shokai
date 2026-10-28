// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Regenerates the hand-written golden traces G1–G5b, M1, L1 and H1–H2, and fixtures F1–F12, with real DIDs, digests and signatures
// made by the reference code with public test keys (test/golden-keys.ts). The prose, decisions and message shapes are unchanged;
// only placeholders are replaced. Gate-computed digests (input_digest, relationship_digest) are filled from the reference host's own
// replay (golden.ts with GOLDEN_EMIT). Run on purpose only:  node dist/test/golden-gen.js --write   (then the fill step it prints).
import fs from "node:fs";
import { digestOf, signEd, b64u } from "../src/crypto.js";
import { possessionPayload } from "../src/verify.js";
import { goldenKey, goldenSeeking } from "./golden-keys.js";

const FILE = new URL("../../../../conformance/golden-traces.md", import.meta.url);
const SCOPE = new Set(["G1", "G2a", "G2b", "G3", "G4a", "G4b", "G5a", "G5b", "M1", "L1", "H1", "H2", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"]);
const isPartyName = (s: string) => /^shokai:(rep|principal):[^#\s"]+$/.test(s);
const isPhSig = (v: unknown) => typeof v === "string" && /^sig-[a-z0-9-]+$/.test(v);
const isPhDigest = (v: unknown) => typeof v === "string" && /^sha-256:(?![A-Za-z0-9_-]{43}$)[A-Za-z0-9._-]+$/.test(v);
/** Digests of things the traces cite but don't show; each is the digest of a labelled stand-in object, so it can be recomputed. */
export const STAND_INS: Record<string, unknown> = {
  "sha-256:manifest-oct": { stand_in: "Acme Payroll's October batch manifest (not shown in the trace)" },
  "sha-256:audit-g1-acts": { stand_in: "ExampleBank's audit log of the acts in encounter g1 (not shown in the trace)" },
  // rc4 round 3: no place replays these decisions end to end (L1 is replayed at the gate level; the helper direction, H1–H2, is deferred),
  // so their input digests are of labelled stand-ins rather than a host's own.
  "sha-256:in-l1": { stand_in: "Hoshikawa Ryokan's gate input for l1-7 (L1 is replayed at the gate level, so no place computes it)" },
  "sha-256:in-h1": { stand_in: "the Reelhouse coach's gate input for h1-8 (helper direction, not replayed: D3/P3)" },
  "sha-256:in-h2": { stand_in: "the Reelhouse coach's gate input for h2-1 (helper direction, not replayed: D3/P3)" },
};
const dmap = new Map<string, string>();   // placeholder digest → real digest
for (const [k, v] of Object.entries(STAND_INS)) dmap.set(k, digestOf(v));
dmap.set("sha-256:seek-v1", goldenSeeking("paused", "v1").payload_digest);
dmap.set("sha-256:seek-v2", goldenSeeking("open", "v2").payload_digest);

function str(s: string): string {
  if (isPartyName(s)) return goldenKey(s).id;
  const m = /^(shokai:(?:rep|principal):[^#\s"]+)#k1$/.exec(s); if (m) return goldenKey(m[1]).key_id;
  if (dmap.has(s)) return dmap.get(s)!;
  return s;
}
function T(x: any): any {
  if (typeof x === "string") return str(x);
  if (Array.isArray(x)) return x.map(T);
  if (!x || typeof x !== "object") return x;
  if ("payload" in x && Array.isArray(x.signatures) && typeof x.payload_digest === "string") {
    const payload = T(x.payload); const d = digestOf(payload);
    if (isPhDigest(x.payload_digest)) dmap.set(x.payload_digest, d);
    const signatures = x.signatures.map((s: any) => isPhSig(s.value) ? signEd(goldenKey(s.signer), d, s.signed_at) : T(s));
    return { ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "payload" ? payload : k === "payload_digest" ? d : k === "signatures" ? signatures : T(v)])) };
  }
  const out: any = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === "representative_key" && v && typeof v === "object" && typeof (v as any).public_key === "string" && (v as any).public_key.startsWith("pk-")) {
      const base = String((v as any).key_id).split("#")[0]; out[k] = { ...T(v), public_key: b64u(goldenKey(base).pubRaw) }; continue;
    }
    out[k] = T(v);
  }
  // F9 (G2a's unsigned card) is the unprepared visitor's own card: its key is that visitor's, so its possession proof is checkable.
  if (typeof x.representative_id === "string" && x.representative_id === "shokai:rep:unknown/x1" && x.representative_key) {
    const k1 = goldenKey("shokai:rep:unknown/x1"); out.representative_key = { ...out.representative_key, key_id: k1.key_id, public_key: b64u(k1.pubRaw) };
  }
  return out;
}
let g1VisitorProof = "";
/** Possession proofs: each party signs {encounter_id, nonce} over the other party's greeting nonce (§2.4). */
function proofs(block: any[], orig: any[], section: string): any[] {
  const nonceOf = new Map<string, string>();
  for (const m of orig) if (m?.type === "greeting" && m.nonce) nonceOf.set(m.from, m.nonce);
  return block.map((m, i) => {
    const o = orig[i]; const p = o?.possession_proof; if (!p || !isPhSig(p.value)) return m;
    if (p.value === "sig-copied-from-g1") return { ...m, possession_proof: { ...m.possession_proof, value: g1VisitorProof } };   // G2b: the replayed value
    const nonce = nonceOf.get(o.to); if (!nonce) throw new Error(`${section} ${o.msg_id}: no counterparty nonce`);
    const sig = signEd(goldenKey(p.signer), digestOf(possessionPayload(o.encounter_id, nonce)), p.signed_at);
    const proof = { ...m.possession_proof, value: sig.value };
    if (section === "G1" && o.from === "shokai:rep:acme-payroll/ops-7") g1VisitorProof = sig.value;
    return { ...m, possession_proof: proof };
  });
}
function leftovers(x: any, where: string, acc: string[]) {
  if (typeof x === "string") { if (isPartyName(x) || /^shokai:(rep|principal):/.test(x) || isPhSig(x) || isPhDigest(x) || x.startsWith("pk-card")) acc.push(`${where}: ${x}`); return; }
  if (Array.isArray(x)) return x.forEach((y, i) => leftovers(y, `${where}[${i}]`, acc));
  if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) leftovers(v, `${where}.${k}`, acc);
}

const md = fs.readFileSync(FILE, "utf8");
const fill: Record<string, string> = process.argv.includes("--fill") ? JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--fill") + 1], "utf8")) : {};
// Two passes: fixtures first (traces cite their digests), then traces; a block's position in the file is kept.
type Blk = { start: number; end: number; section: string; json: any };
const lines = md.split("\n"); const blks: Blk[] = []; let sec = "", inb = false, s0 = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!inb && /^##+ /.test(l)) { sec = l.replace(/^#+ /, "").split(":")[0].split(" ")[0]; continue; }
  if (l.startsWith("```")) { if (!inb) { inb = true; s0 = i; } else { inb = false;
    if (lines[s0].startsWith("```json") && SCOPE.has(sec)) blks.push({ start: s0, end: i, section: sec, json: JSON.parse(lines.slice(s0 + 1, i).join("\n")) }); } }
}
const order = [...blks.filter((b) => b.section.startsWith("F")), ...blks.filter((b) => !b.section.startsWith("F"))];
const done = new Map<Blk, any>();
for (const b of order) {
  let j = T(b.json);
  if (Array.isArray(b.json)) j = proofs(j, b.json, b.section);
  done.set(b, j);
}
// Second sweep: strings that cite a digest made later in the file, the M1 log entry, and gate-computed values from --fill.
const sweep = (x: any): any => typeof x === "string" ? (fill[x] ?? dmap.get(x) ?? x.replace(/sha-256:[A-Za-z0-9._-]+/g, (d) => dmap.get(d) ?? d))
  : Array.isArray(x) ? x.map(sweep) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sweep(v)])) : x;
for (const [b, j] of done) {
  let k = sweep(j);
  if (b.section === "M1" && k && !Array.isArray(k) && "entry_hash" in k) {
    const m1 = [...done].find(([bb, jj]) => bb.section === "M1" && Array.isArray(jj))![1] as any[];
    const rev = m1.find((m) => m.type === "vouch_revocation").revocation.payload_digest as string;
    k = { ...k, revocation: { $ref: `the signed vouch_revocation above (payload_digest ${rev})` }, entry_hash: digestOf({ seq: 0, prev_hash: "genesis", revocation_digest: rev }) };
  }
  done.set(b, k);
}
const left: string[] = []; for (const [b, j] of done) leftovers(j, b.section, left);
const out = [...lines];
for (const b of [...blks].sort((a, c) => c.start - a.start)) out.splice(b.start + 1, b.end - b.start - 1, ...JSON.stringify(done.get(b), null, 2).split("\n"));
const text = out.join("\n");
console.log(`golden-gen: ${blks.length} blocks in scope; ${dmap.size} digests mapped; leftovers ${left.length}`);
for (const l of left.slice(0, 40)) console.log("  left:", l);
if (process.argv.includes("--write")) { fs.writeFileSync(FILE, text); console.log("written", FILE.pathname); }
