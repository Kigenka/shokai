#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// JSON Schema for the Shōkai wire types, generated from protocol-shapes.ts (the TypeScript is the source of truth, as in MCP).
//   node tools/schema/schema.mjs          write schema/v<version>/schema.json (version from SPEC.md's header)
//   node tools/schema/schema.mjs --check  exit 1 if the file is stale, if any golden-trace message fails it, or if a broken message passes
// Needs `npm --prefix tools/schema ci` (part of `npm run setup`).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const V = readFileSync(join(root, "SPEC.md"), "utf8").match(/\*\*Specification v(\d+\.\d+\.\d+(?:-rc\d+)?) \(core\)\.\*\*/)?.[1];
if (!V) { console.error("schema: no version in SPEC.md's header"); process.exit(2); }
const out = join(root, "schema", "v" + V, "schema.json");

const generated = createGenerator({ path: join(root, "protocol-shapes.ts"), type: "*", expose: "export", jsDoc: "extended", skipTypeCheck: true }).createSchema("*");
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: `https://github.com/Kigenka/shokai/blob/v${V}/schema/v${V}/schema.json`,
  title: `Shōkai wire types, specification v${V}`,
  description: "GENERATED from protocol-shapes.ts by tools/schema/schema.mjs; do not edit. The TypeScript types are the source of truth; SPEC.md is normative where they differ. Start from the definitions WireMessage (a signed envelope), ShokaiMessage (a payload) or DoorPointer.",
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
// Controls: broken messages must fail.
const controls = [];
if (sample) {
  const c = structuredClone(sample); delete c.signatures; controls.push(["an envelope with no signatures", c]);
  const d = structuredClone(sample); d.payload.protocol = "shokai/0.2"; controls.push(["another wire tag", d]);
  const e = structuredClone(sample); e.payload.type = "no_such_type"; controls.push(["an unknown message type", e]);
}
for (const [what, m] of controls) if (isMessage(m)) { fail++; console.error(`schema: control passed but must fail: ${what}`); }
if (fail) process.exit(1);
console.log(`schema: schema/v${V}/schema.json is current; ${checked} golden-trace messages validate (${skipped} with fixture placeholders skipped); ${controls.length} broken controls fail ✓`);
