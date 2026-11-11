#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// JSON Schema for the Shōkai wire types, generated from protocol-shapes.ts (the TypeScript is the source of truth, as in MCP).
//   node tools/schema/schema.mjs          write schema/v<version>/schema.json (version from SPEC.md's header)
//   node tools/schema/schema.mjs --check  exit 1 if the file is stale, if any golden-trace message fails it, or if a broken message passes
// Needs `npm --prefix tools/schema ci` (part of `npm run setup`).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";
import addFormats from "ajv-formats";

let EXTENSIBLE = [];
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const V = (readFileSync(join(root, "SPEC.md"), "utf8").match(/\*\*Specification v(\d+\.\d+\.\d+(?:-rc\d+)?) \(core\)\.\*\*/)?.[1])
  ?? (readFileSync(join(root, "docs/SPEC-DETAIL.md"), "utf8").match(/\*\*Specification v(\d+\.\d+\.\d+(?:-rc\d+)?) \(core\)\.\*\*/)?.[1]);
if (!V) { console.error("schema: no version in SPEC.md or docs/SPEC-DETAIL.md header"); process.exit(2); }
const out = join(root, "schema", "v" + V, "schema.json");

const generated = createGenerator({ path: join(root, "protocol-shapes.ts"), type: "*", expose: "export", jsDoc: "extended", skipTypeCheck: true }).createSchema("*");
// Extensible objects (SPEC Conventions, §0.1: unknown members are ignored unless named in `crit`; `x-` members are always allowed,
// even under closed templates, §3.3 C242) take `x-` members. Every message payload, card, mandate, allowance and vouch is one.
// Everything else (signatures, the Signed envelope, Money, proofs, digests) stays closed: no member it doesn't define.
{
  const defs = generated.definitions ?? {}; const open = new Set(); const seen = new Set();
  const refName = (r) => decodeURIComponent(String(r).replace("#/definitions/", ""));
  const expand = (name) => { if (seen.has(name)) return; seen.add(name); const d = defs[name]; if (!d) return;
    for (const alt of d.anyOf ?? d.oneOf ?? []) if (alt.$ref) expand(refName(alt.$ref));
    if (d.type === "object" && d.properties) open.add(name); };
  expand("ShokaiMessage");
  for (const n of ["RepresentativeCard", "Mandate", "Allowance", "Vouch"]) if (defs[n]?.type === "object") open.add(n);
  // Pre-release review (round 2): one extensibility policy, applied to nested objects too. Every object an extensible artifact
  // contains (its principal, scope, limits, …) takes x- members, by $ref or inline; the security-sensitive structures stay
  // closed, wherever they appear: signatures, the Signed envelope, Money, possession/claim proofs and digests.
  const CLOSED = /^(Signature|Signed|SignedCard|Money|Amount|.*Proof|.*Digest|WireMessage)(<.*>)?$|Signature$|^Signed</;
  const visited = new Set();
  const walk = (node, inline) => { if (!node || typeof node !== "object") return;
    if (node.$ref) { const n = refName(node.$ref); if (!CLOSED.test(n) && defs[n] && !visited.has(n)) { visited.add(n); if (defs[n].type === "object" && defs[n].properties) open.add(n); walk(defs[n], false); } return; }
    if (inline && node.type === "object" && node.properties && node.additionalProperties === false) node.patternProperties = { "^x-": {} };
    for (const v of Object.values(node.properties ?? {})) walk(v, true);
    for (const k of ["items", "additionalProperties"]) if (node[k] && typeof node[k] === "object") walk(node[k], true);
    for (const k of ["anyOf", "oneOf", "allOf"]) for (const v of node[k] ?? []) walk(v, true); };
  for (const n of [...open]) { visited.add(n); walk(defs[n], false); }
  for (const n of open) { const d = defs[n]; if (d.additionalProperties === false && !CLOSED.test(n)) d.patternProperties = { "^x-": {} }; }
  EXTENSIBLE = [...open].sort();
}
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://github.com/Kigenka/shokai/blob/v${V}/schema/v${V}/schema.json`,
  title: `Shōkai wire types, specification v${V}`,
  description: "GENERATED from protocol-shapes.ts by tools/schema/schema.mjs; do not edit. The TypeScript types are the source of truth; docs/SPEC-DETAIL.md (the normative text) wins where they differ. Start from the definitions WireMessage (a signed envelope), ShokaiMessage (a payload) or DoorPointer.",
  definitions: Object.fromEntries(Object.entries(generated.definitions ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
};
const body = JSON.stringify(schema, null, 2) + "\n";
const check = process.argv.includes("--check");
if (!check) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, body); console.log(`schema: wrote ${out.slice(root.length + 1)} (${Object.keys(schema.definitions).length} definitions)`); process.exit(0); }

let fail = 0;
if (!existsSync(out) || readFileSync(out, "utf8") !== body) { console.error(`schema: ${out.slice(root.length + 1)} is stale; run node tools/schema/schema.mjs`); fail++; }
const ajv = new Ajv({ strict: false, allErrors: true }); addFormats(ajv); ajv.addSchema(schema, "s");
const T = (t) => { const f = ajv.getSchema("s#/definitions/" + encodeURIComponent(t)); if (!f) throw new Error("schema: no definition " + t); return f; };
const message = [T("ShokaiMessage"), T("WireMessage"), T("DoorPointer")];
const isMessage = (m) => message.some((f) => f(m));
// Every message in the golden traces that carries no {"$fixture"}/{"$ref"} placeholder must validate.
const md = readFileSync(join(root, "conformance/golden-traces.md"), "utf8");
const placeholder = (x) => /"\$(fixture|ref)"/.test(JSON.stringify(x));
let checked = 0, skipped = 0, inFence = false, buf = [], heading = "", sample = null;
for (const line of md.split("\n")) {
  if (!inFence && /^#{2,3} /.test(line)) heading = line;
  if (/^```json/.test(line)) { inFence = true; buf = []; continue; }
  if (inFence && /^```/.test(line)) {
    inFence = false; let v; try { v = JSON.parse(buf.join("\n")); } catch { continue; }
    if (/^### F\d+/.test(heading)) continue; // fixtures: typed by trace-typecheck
    const items = Array.isArray(v) ? v : v && (v.type || "seq" in v) ? [v] : [];
    for (const m of items) {
      if (placeholder(m)) { skipped++; continue; }
      checked++;
      const ok = "seq" in m ? T("RevocationLogEntry")(m) : isMessage(m);
      if (!ok) { fail++; console.error(`schema: a message in "${heading}" fails (${m.type ?? m.payload?.type})`); }
      else if (!sample && m.payload && m.signatures) sample = m;
    }
    continue;
  }
  if (inFence) buf.push(line);
}
// Every standalone JSON golden trace (conformance/golden-*.json): every signed object in it must validate as what it is.
const kindOf = (m) => m.payload?.type ? "WireMessage" : m.payload?.mandate_id ? "SignedMandate" : m.payload?.card_id ? "SignedCard"
  : m.payload?.allowance_id ? "SignedAllowance" : m.payload?.vouch_id ? "SignedVouch" : null;
let jsonChecked = 0, cardSample = null, nestedOk = false;
for (const fn of readdirSync(join(root, "conformance")).filter((f) => /^golden.*\.json$/.test(f)).sort()) {
  const walk = (x, path) => {
    if (!x || typeof x !== "object") return;
    if (!Array.isArray(x) && x.payload && x.signatures) {
      if (placeholder(x)) { skipped++; return; }
      const k = kindOf(x); if (!k) { fail++; console.error(`schema: ${fn}${path}: a signed object of no known kind`); return; }
      jsonChecked++; const f = T(k);
      if (!f(x)) { fail++; console.error(`schema: ${fn}${path} fails ${k} (${x.payload.type ?? ""}): ${ajv.errorsText(f.errors?.slice(0, 3))}`); }
      else { if (!sample && x.payload?.type === "greeting") sample = x; if (!cardSample && x.payload?.type === "card_presentation") cardSample = x; }
      return;
    }
    for (const [key, v] of Object.entries(x)) walk(v, `${path}/${key}`);
  };
  walk(JSON.parse(readFileSync(join(root, "conformance", fn), "utf8")), "");
}
if (!cardSample) { fail++; console.error("schema: no card_presentation in the JSON golden traces for the nested x- control"); }
if (!jsonChecked) { fail++; console.error("schema: no signed objects found in conformance/golden-*.json"); }
// Conventions: a noncritical x- member on an extensible message validates; on a closed object it doesn't.
if (sample) {
  const x = structuredClone(sample); x.payload["x-review"] = 1;
  if (!isMessage(x)) { fail++; console.error("schema: a noncritical x- member on a message must validate (Conventions, crit rules)"); }
  // a nested object of an extensible artifact (the card's principal) takes x- members too (pre-release review, round 2)
  const cardMsg = cardSample;
  if (cardMsg) { const z = structuredClone(cardMsg); z.payload.card.payload.principal["x-review"] = 1;
    if (!isMessage(z)) { fail++; console.error("schema: a noncritical x- member on a card's principal must validate (nested extensibility)"); } else nestedOk = true;
    const zs = structuredClone(cardMsg); zs.payload.card.signatures[0]["x-review"] = 1;
    if (isMessage(zs)) { fail++; console.error("schema: a nested signature took an unknown member"); } }
  const y = structuredClone(sample); y.signatures[0]["x-review"] = 1;
  if (isMessage(y)) { fail++; console.error("schema: a closed object (a signature) took an unknown member"); }
}
// Controls: broken messages must fail.
const controls = [];
if (sample) {
  const c = structuredClone(sample); delete c.signatures; controls.push(["an envelope with no signatures", c]);
  const d = structuredClone(sample); d.payload.protocol = "shokai/0.2"; controls.push(["another wire tag", d]);
  const e = structuredClone(sample); e.payload.type = "no_such_type"; controls.push(["an unknown message type", e]);
}
for (const [what, m] of controls) if (isMessage(m)) { fail++; console.error(`schema: control passed but must fail: ${what}`); }
if (fail) process.exit(1);
console.log(`schema: schema/v${V}/schema.json is current; ${checked} golden-trace (Markdown) + ${jsonChecked} standalone JSON golden messages validate; ${EXTENSIBLE.length} extensible definitions take x- members (${skipped} with fixture placeholders skipped); ${controls.length} broken controls fail ✓`);
