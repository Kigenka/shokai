#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// D18: split suite results into core and extensions using conformance/homes.json. Usage: node scripts/suite-split.mjs <outdir>
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] ?? "/tmp/shokai-suites";
const H = JSON.parse(readFileSync(join(root, "conformance/homes.json"), "utf8"));
const rules = H.suites.keyword_rules.map(([h, re]) => [h, new RegExp(re, "i")]);
const byRule = (s) => { for (const [h, re] of rules) if (re.test(s)) return h; return null; };
const resolve = (home, text) => (home.endsWith("*") ? byRule(text) ?? home.slice(0, -1) : home);
const tally = {}; const moved = []; const skipped = {};   // skipped checks are listed on their own, never counted as passes
const add = (suite, home, ok, text) => { const t = ((tally[suite] ??= {})[home] ??= { pass: 0, fail: 0 }); ok ? t.pass++ : t.fail++; if (home !== "core" && text) moved.push(`${suite} → ${home}: ${text.slice(0, 110)}`); };
const lines = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8").split("\n") : []);
const eng = lines("engawa.txt");
// vectors: lines between the vectors header and "vectors pass"
let sec = "";
for (const l of eng) {
  if (/^Test vectors/.test(l)) sec = "vectors"; else if (/^Golden trace replay/.test(l)) sec = "golden"; else if (/^Scenario results/.test(l)) sec = "";
  const m = l.match(/^  (PASS\*?|FAIL|SKIP)\s+(.*)$/); if (!m || !sec) continue;
  if (m[1] === "SKIP") { skipped[sec] = (skipped[sec] ?? 0) + 1; continue; }
  const ok = m[1] !== "FAIL";
  if (sec === "vectors") { add("vectors", resolve("core*", m[2]), ok, m[2]); continue; }
  const id = m[2].split(/\s+/)[0]; add("golden", H.suites.groups.golden[id] ?? "core", ok, m[2]);
}
// per-check logs: scenarios, v028, v029, v0210, v030
for (const l of lines("checks.jsonl")) { if (!l) continue; const c = JSON.parse(l); const g = H.suites.groups[c.suite];
  const key = c.group.split(/\s+/)[0]; const home = g[key] ?? g.default ?? "core"; add(c.suite, resolve(home, c.what), c.ok, `${key}: ${c.what}`); }
// reference conformance: by check id
for (const l of lines("reference.txt")) { const m = l.match(/^(PASS|FAIL)\s+(C\d+)\s+(.*)$/); if (!m) continue; const h = H.checks[m[2]] ?? "core"; add("reference", h === "informative" ? "core (informative rule)" : h, m[1] === "PASS", `${m[2]} ${m[3]}`); }
// HTTP suites
for (const f of ["http-e2e", "http-press", "http-msgid"]) for (const l of lines(f + ".txt")) { const m = l.match(/^  (PASS|FAIL)\s+(.*)$/); if (!m) continue;
  const ids = [...m[2].matchAll(/\bC(\d+)\b/g)].map((x) => H.checks["C" + x[1]]).filter((h) => h && h !== "core" && h !== "informative");
  add(f === "http-e2e" ? "e2e" : f, ids[0] ?? resolve("core*", m[2]), m[1] === "PASS", m[2]); }
// enforcement suite (tools/enforce): every check of every attack case; a known gap is listed as skipped, never as a pass
if (existsSync(join(dir, "enforce.json"))) for (const c of JSON.parse(readFileSync(join(dir, "enforce.json"), "utf8")).cases ?? [])
  for (const x of c.checks ?? []) { if (!x.ok && x.known) { skipped["enforce (known gap)"] = (skipped["enforce (known gap)"] ?? 0) + 1; continue; } add("enforce", "core", x.ok, `${c.id}: ${x.what}`); }
// print
const homes = new Set(); for (const s of Object.values(tally)) for (const h of Object.keys(s)) homes.add(h);
const order = ["core", ...[...homes].filter((h) => h !== "core").sort()];
let fails = 0; const tot = {};
console.log("Suite results by home (pass/total):");
for (const [suite, hs] of Object.entries(tally)) {
  const parts = order.filter((h) => hs[h]).map((h) => { const t = hs[h]; fails += t.fail; (tot[h] ??= { pass: 0, fail: 0 }).pass += t.pass; tot[h].fail += t.fail; return `${h} ${t.pass}/${t.pass + t.fail}`; });
  const all = Object.values(hs).reduce((a, t) => a + t.pass + t.fail, 0), ok = Object.values(hs).reduce((a, t) => a + t.pass, 0);
  console.log(`  ${suite.padEnd(11)} ${String(ok).padStart(4)}/${String(all).padEnd(4)}  ${parts.join(", ")}`);
}
console.log("  totals:     " + order.filter((h) => tot[h]).map((h) => `${h} ${tot[h].pass}/${tot[h].pass + tot[h].fail}`).join(", "));
const sk = Object.entries(skipped); if (sk.length) console.log("  skipped or known gaps (not counted above): " + sk.map(([s, n]) => `${s} ${n}`).join(", "));
console.log("  The totals above are in-process suite homes only. Official HTTP runner rows (including C300/C301) are not added into those totals.");
// Official HTTP conformance runner (blackbox-v050.txt): reported separately, never mixed into the in-process totals.
const bb = lines("blackbox-v050.txt");
if (bb.some((l) => l.length)) {
  const row = { pass: 0, fail: 0, skip: 0, na: 0, warn: 0 };
  for (const l of bb) {
    const m = l.match(/^  (PASS|FAIL|SKIP|N\/A|WARN)\s+\S+/);
    if (!m) continue;
    const st = m[1] === "N/A" ? "na" : m[1].toLowerCase();
    if (row[st] !== undefined) row[st]++;
  }
  console.log("  Official HTTP conformance runner (black-box fernwood; not in the in-process totals): "
    + `${row.pass} pass, ${row.fail} fail, ${row.warn} warn, ${row.skip} skip, ${row.na} N/A result rows.`);
  const pick = (id) => {
    const hit = [...bb].reverse().find((l) => new RegExp(String.raw`\b${id}\b`).test(l) && /^\s+(PASS|FAIL|SKIP|N\/A|WARN)\s/.test(l));
    return hit ? hit.trim().replace(/\s+/g, " ").slice(0, 180) : `${id} not present`;
  };
  console.log("  C300 official HTTP row: " + pick("C300"));
  console.log("  C301 official HTTP row: " + pick("C301"));
  const claims = bb.filter((l) => /^\s+(HOLDS|FAILS) /.test(l));
  if (claims.length) {
    console.log("  HTTP runner claims (unique check ids, not rows):");
    for (const c of claims) console.log("    " + c.trim());
  }
}
if (process.argv.includes("--moved")) { console.log("\nRe-homed checks:"); for (const m of moved) console.log("  " + m); }
process.exit(fails ? 1 : 0);
