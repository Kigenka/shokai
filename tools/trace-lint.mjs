#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * trace-lint: every normative statement in the spec must trace to a frozen scenario,
 * golden trace or conformance check, and every frozen scenario, trace and check must be
 * covered by at least one normative statement.
 *
 * v0.3-draft (D18): the specification is the core (SPEC.md) plus the extensions in extensions/*.md.
 * By default the lint reads every document named in conformance/homes.json and checks coverage over all of them.
 * Usage: node tools/trace-lint.mjs [--spec SPEC.md] [--catalog scenarios/CATALOG.md] [--traces conformance/golden-traces.md]
 *   --spec X: lint the one document X alone, with the v0.2 rules R1–R5 (no homes).
 * Exit 0 when there are zero gaps, 1 otherwise.
 *
 * Tag syntax, placed on the same line as the keyword: [SC-L0], [G3], [C41], [D2], or a comma list [SC-L0, C28].
 * Rules:
 *  R1 A line with MUST / MUST NOT / SHOULD / SHOULD NOT / SHALL / REQUIRED needs ≥1 anchor tag (SC-*, a trace id, or C*).
 *  R2 Every tag must exist: an SC id in the catalog, a trace heading in golden traces, a C item in the checklist, or D1–D12, D14–D26.
 *  R3 An anchor that is DEFERRED in the catalog cannot be the only anchor of a normative line.
 *  R4 [PROV] is retired: D5 and D7 were decided in D11 (v0.2.2), so any [PROV] tag is a gap.
 *  R5 Coverage: every non-deferred SC id, every non-deferred trace and every C item is cited by ≥1 normative line
 *     (in any document; an item homed "informative" needs only to be mentioned in some informative text or test).
 *  R6 Homes (D18): every check, scenario and trace homed in a document is cited in that document (by a tag, as R5 counts it).
 *  R7 Every check, scenario and trace has a home in conformance/homes.json, and every home names a document or
 *     "informative" / "deferred".
 * Ignored: fenced code blocks, and lines containing "lint:ignore" (e.g. the RFC 2119 conventions line).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const single = arg("--spec", null);
const catalogPath = join(root, arg("--catalog", "scenarios/CATALOG.md"));
const tracesPath = join(root, arg("--traces", "conformance/golden-traces.md"));
const homesPath = join(root, "conformance/homes.json");

const catalog = readFileSync(catalogPath, "utf8");
const traces = readFileSync(tracesPath, "utf8");
const homes = !single && existsSync(homesPath) ? JSON.parse(readFileSync(homesPath, "utf8")) : null;
const docs = single ? { [single]: single } : homes ? homes.docs : { core: "SPEC.md" };

// --- known ids ---
const sc = new Map(); // id -> deferred?
for (const m of catalog.matchAll(/^\|\s*(SC-[A-Z0-9]+)\s*\|[^\n]*$/gm)) sc.set(m[1], /DEFERRED/.test(m[0]));
const tr = new Map();
for (const m of traces.matchAll(/^#{2,3}\s+(?:Trace\s+)?((?:G|M|L|H|GA|PA|FA)\d+[ab]?)\b[^\n]*$/gm)) tr.set(m[1], false);
for (const id of ["H1", "H2"]) if (tr.has(id)) tr.set(id, true); // deferred per catalog (SC-H1/H2)
const checks = new Set([...traces.matchAll(/^- \[ \] (C\d+)\b/gm)].map((m) => m[1]));
const decisions = new Set(["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D14", "D15", "D16", "D17", "D18", "D19", "D20", "D21", "D22", "D23", "D24", "D25", "D26"]);
const isAnchor = (t) => sc.has(t) || tr.has(t) || checks.has(t);
const deferred = (t) => sc.get(t) === true || tr.get(t) === true;

// --- scan documents ---
const KW = /\b(MUST(?: NOT)?|SHOULD(?: NOT)?|SHALL(?: NOT)?|REQUIRED)\b/;
const gaps = [];
const cited = new Set();            // cited by a normative line, any document
const citedIn = {};                 // doc key -> Set of ids cited by its tags (as R5 counts)
const mentioned = new Set();        // mentioned anywhere (tags on informative lines too)
const counts = {};
for (const [key, rel] of Object.entries(docs)) {
  const spec = readFileSync(join(root, rel), "utf8");
  citedIn[key] = new Set(); let normative = 0, inFence = false;
  spec.split("\n").forEach((line, idx) => {
    const n = `${rel}:${idx + 1}`;
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence || /lint:ignore/.test(line)) return;
    const tags = [];
    for (const m of line.matchAll(/\[([A-Za-z0-9\-, ]+)\](?!\()/g)) {
      const parts = m[1].split(",").map((s) => s.trim());
      if (parts.every((p) => /^(SC-[A-Z0-9]+|[A-Z]{1,2}\d+[ab]?|PROV)$/.test(p))) tags.push(...parts);
    }
    for (const t of line.matchAll(/\b(C\d+)\b/g)) mentioned.add(t[1]);
    for (const t of tags) mentioned.add(t);
    for (const t of tags) if (t === "PROV" && !KW.test(line)) gaps.push(`${n} R4 [PROV] is retired (D5 and D7 decided in D11)`);
    for (const t of tags) if (t !== "PROV" && !isAnchor(t) && !decisions.has(t)) gaps.push(`${n} R2 unknown tag [${t}]`);
    if (!KW.test(line)) { if (tags.length) for (const t of tags) { cited.add(t); if (isAnchor(t)) citedIn[key].add(t); } return; }
    normative++;
    const anchors = tags.filter(isAnchor);
    if (!anchors.length) gaps.push(`${n} R1 untagged normative statement: ${line.trim().slice(0, 110)}`);
    else if (anchors.every(deferred)) gaps.push(`${n} R3 only deferred anchors (${anchors.join(", ")})`);
    if (tags.includes("PROV")) gaps.push(`${n} R4 [PROV] is retired (D5 and D7 decided in D11)`);
    for (const t of anchors) { cited.add(t); citedIn[key].add(t); }
  });
  counts[key] = { rel, normative };
}

// --- coverage (R5) and homes (R6, R7) ---
const homeOf = (id) => homes && (homes.checks[id] ?? homes.scenarios[id] ?? homes.traces[id]);
const informativeOk = (id) => homes && homeOf(id) === "informative" && (mentioned.has(id));
if (!single || Object.keys(docs).length === 1) {
  for (const [id, d] of sc) if (!d && !cited.has(id) && !informativeOk(id)) gaps.push(`R5 frozen scenario ${id} is not cited by any normative statement`);
  for (const [id, d] of tr) if (!d && !cited.has(id) && !informativeOk(id)) gaps.push(`R5 golden trace ${id} is not cited by any normative statement`);
  for (const id of checks) if (!cited.has(id) && !informativeOk(id)) gaps.push(`R5 conformance item ${id} is not cited by any normative statement`);
}
const byHome = {};
if (homes) {
  const all = [...sc.keys(), ...tr.keys(), ...checks];
  for (const id of all) {
    const h = homeOf(id);
    if (!h) { gaps.push(`R7 ${id} has no home in conformance/homes.json`); continue; }
    if (h !== "informative" && h !== "deferred" && !docs[h]) { gaps.push(`R7 ${id} is homed in unknown document "${h}"`); continue; }
    (byHome[h] ??= []).push(id);
    if (docs[h] && !(sc.get(id) || tr.get(id)) && !citedIn[h].has(id)) gaps.push(`R6 ${id} is homed in ${docs[h]} but nothing there cites it`);
  }
}

console.log(`trace-lint: ${Object.values(docs).join(", ")}`);
let total = 0;
for (const [k, { rel, normative }] of Object.entries(counts)) { total += normative; console.log(`  ${k.padEnd(22)} ${String(normative).padStart(4)} normative statements  (${rel})`); }
if (Object.keys(counts).length > 1) console.log(`  ${"total".padEnd(22)} ${String(total).padStart(4)} normative statements`);
console.log(`  known: ${[...sc.keys()].length} scenarios (${[...sc].filter(([, d]) => d).length} deferred), ${tr.size} traces, ${checks.size} checks`);
console.log(`  cited: ${[...cited].filter((t) => sc.has(t)).length} scenarios, ${[...cited].filter((t) => tr.has(t)).length} traces, ${[...cited].filter((t) => checks.has(t)).length} checks`);
if (homes) console.log(`  homes: ${Object.entries(byHome).map(([h, ids]) => `${h} ${ids.filter((i) => checks.has(i)).length}c/${ids.filter((i) => sc.has(i)).length}s/${ids.filter((i) => tr.has(i)).length}t`).join(", ")}`);
if (gaps.length) { console.log(`  GAPS: ${gaps.length}`); for (const g of gaps) console.log(`   - ${g}`); process.exit(1); }
console.log("  GAPS: 0 ✓");
