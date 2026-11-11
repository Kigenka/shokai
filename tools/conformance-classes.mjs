#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * conformance-classes: assigns every conformance check to exactly one class (Core Door / Core Visitor, or a named extension),
 * labels the test files and test vectors with the classes they exercise, and writes docs/SPEC-DETAIL.md Appendix F (SPEC §0.1).
 *   node tools/conformance-classes.mjs          write conformance/classes.json (generated parts) and docs/SPEC-DETAIL.md Appendix F
 *   node tools/conformance-classes.mjs --check  exit 1 if either is stale (trace-lint R8 runs the same computation)
 * The hand-edited inputs are conformance/classes.json "sections", "extensions", "documents", "overrides" and "roles".
 * R3-02: classes.json is the ONE source of truth for where a check belongs. conformance/homes.json "checks" is GENERATED from it
 * (home = the document the check's rule lives in: an extension document's name for its class, "informative", else "core" = docs/SPEC-DETAIL.md,
 * which also holds the SPEC-resident extension classes). --check fails on any drift in either file.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Normative core text (full detail). Short SPEC.md is the human front door. */
const CORE_SPEC = "docs/SPEC-DETAIL.md";
const rd = (p) => readFileSync(join(root, p), "utf8");
export const KW = /\b(MUST(?: NOT)?|SHOULD(?: NOT)?|SHALL(?: NOT)?|REQUIRED)\b/;

/** The section key of a SPEC.md heading line, or null. */
export function sectionKey(line) {
  const h = /^(#{2,4})\s+(.*)$/.exec(line); if (!h) return null;
  const t = h[2];
  let m;
  if ((m = /^§(\d+)\b/.exec(t))) return "§" + m[1];
  if ((m = /^(\d+(?:\.\d+)+)\b/.exec(t))) return m[1];
  if ((m = /^Appendix ([A-Z])\b/.exec(t))) return "Appendix " + m[1];
  if ((m = /^([A-Z]\.\d+)\b/.exec(t))) return m[1];
  return t.replace(/\s*\(.*$/, "").trim();
}

const RANK = { stable: 0, provisional: 1, experimental: 2 };
export function presetStatus(pr, cfg) {
  let st = "stable";
  for (const x of pr.extensions) { const s = cfg.extensions[x]?.status ?? cfg.documents[x.replace(/^ext-/, "")] ?? "stable"; if ((RANK[s] ?? 0) > RANK[st]) st = s; }
  return st;
}

export function compute() {
  const cfg = JSON.parse(rd("conformance/classes.json"));
  const traces = rd("conformance/golden-traces.md");
  const spec = rd(CORE_SPEC);
  const secClass = new Map();
  for (const s of cfg.core_sections) secClass.set(s, "core");
  for (const [x, e] of Object.entries(cfg.extensions)) for (const s of e.sections) secClass.set(s, x);
  const informative = new Set(cfg.informative_sections);
  const problems = [];
  // checklist
  const checkText = new Map([...traces.matchAll(/^- \[ \] (C\d+)\b(.*)$/gm)].map((m) => [m[1], m[2]]));
  // normative citations per section in SPEC.md
  const cites = new Map(); const duty = new Map(); let sec = null, inFence = false, inMap = false;
  spec.split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    if (/BEGIN check-map/.test(line)) inMap = true;
    if (/END check-map/.test(line)) { inMap = false; return; }
    if (inMap) return;
    const k = sectionKey(line); if (k) { sec = k; if (!secClass.has(k) && !informative.has(k)) problems.push(`${CORE_SPEC}:${i + 1} section "${k}" has no class and is not listed as informative`); return; }
    if (!KW.test(line) || /lint:ignore/.test(line)) return;
    if (sec && informative.has(sec)) return;
    if (!sec || !secClass.has(sec)) { problems.push(`${CORE_SPEC}:${i + 1} normative line outside any classed section`); return; }
    const body = line.replace(/^\s*-\s*(\*\*[^*]*\*\*\s*)?/, "");
    const subj = /^(An? |The )(place|door|host representative|host)\b[^.]*\bMUST\b/.test(body) ? "door" : /^(An? |The )(visiting )?representative\b[^.]*\bMUST\b/.test(body) ? "visitor" : null;
    // Review 7 R7-01: also every "<party> MUST" anywhere in the line (the subject directly before MUST), so a bullet binding both
    // parties (a door MUST verify; a visiting representative MUST check) records both duties.
    const subjs = new Set(subj ? [subj] : []);
    for (const x of body.matchAll(/\b(?:an?|the) (visiting representative|host representative|place|door)(?: also)? MUST\b/gi)) subjs.add(/^visiting/i.test(x[1]) ? "visitor" : "door");
    for (const m of line.matchAll(/\b(C\d+)\b/g)) { const c = cites.get(m[1]) ?? new Map(); c.set(sec, (c.get(sec) ?? 0) + 1); cites.set(m[1], c);
      if (subjs.size) { const d = duty.get(m[1]) ?? new Set(); for (const y of subjs) d.add(y); duty.set(m[1], d); } }
  });
  const checks = {};
  const statusOf = (cls) => cls === "core" ? "stable" : cls === "informative" ? "informative" : cfg.extensions[cls]?.status ?? cfg.documents[cls.replace(/^ext-/, "")] ?? "stable";
  for (const [id, text] of checkText) {
    let cls;
    if (cfg.overrides[id]) cls = cfg.overrides[id];
    else {
      const c = cites.get(id);
      if (c) { let best = null, n = -1; for (const [s, k] of c) if (k > n) { best = s; n = k; } cls = secClass.get(best); }
      else cls = "core";
    }
    const docClass = cls.startsWith("ext-") && Object.prototype.hasOwnProperty.call(cfg.documents, cls.slice(4));
    const home = cls === "informative" ? "informative" : docClass ? cls.slice(4) : "core";
    let role = cfg.roles[id];
    // Review 7 R7-01: a check whose citing MUSTs bind both parties is a both-role check (Core Door and Core Visitor alike).
    if (!role && duty.get(id)?.size === 2) role = "both";
    if (!role) {
      const visitor = /\b(visiting representative|visitor)\b[^.;]*\b(MUST|SHOULD|reads?|checks?|brings?|sends?)\b/i.test(text);
      const door = /\b(place|door|host|gate|verifier|introducer|runner|SDK)\b/i.test(text);
      role = visitor && !door ? "visitor" : door && !visitor ? "door" : "both";
    }
    checks[id] = { class: cls, role, status: statusOf(cls) };
    // R8 (RR-02): a check's class must be the class of a section whose normative text cites it,
    // and its role must not contradict who the citing MUSTs bind (a place's duty is never role visitor, a representative's never role door).
    const c = cites.get(id);
    if (c && home === "core" && ![...c.keys()].some((s) => secClass.get(s) === cls)) problems.push(`${id}: class ${cls} but no section of that class cites it (cited in ${[...c.keys()].join(", ")})`);
    const d = duty.get(id);
    if (d && d.size === 2 && role !== "both") problems.push(`${id}: role ${role} but its citing MUSTs bind both the place and the visiting representative (R7-01)`);
    if (d && d.size === 1 && ((role === "visitor" && d.has("door")) || (role === "door" && d.has("visitor")))) problems.push(`${id}: role ${role} but its citing MUSTs bind only the ${[...d][0] === "door" ? "place" : "representative"}`);
  }
  // R8 (RR-10, R3-02): homes.json "checks" is generated from the classes above; no check marked informative that SPEC.md cites as normative.
  const homeChecks = {};
  for (const [id, c] of Object.entries(checks)) {
    homeChecks[id] = c.class === "informative" ? "informative" : c.class.startsWith("ext-") && Object.prototype.hasOwnProperty.call(cfg.documents, c.class.slice(4)) ? c.class.slice(4) : "core";
    if (c.class === "informative" && cites.has(id)) problems.push(`${id} is informative but SPEC.md cites it in normative text`);
  }
  // R8 (R3-02): a check is tagged only in sections of one status. A check cited by normative lines in a stable section and in a
  // provisional (or experimental) one would bind a stable claimant to provisional rules, or leave those rules untested.
  for (const [id, c] of cites) {
    const st = new Set([...c.keys()].map((s) => secClass.get(s)).filter(Boolean).map(statusOf));
    if (st.size > 1) problems.push(`${id} is cited in sections of different statuses (${[...c.keys()].map((s) => s + "=" + statusOf(secClass.get(s) ?? "core")).join(", ")})`);
  }
  // R8 (R3-12): a preset's status is the lowest status among the classes it bundles (stable > provisional > experimental), so a
  // stable preset never requires a provisional extension. A preset that states a `status` must state exactly that one.
  for (const [pn, pr] of Object.entries(cfg.presets ?? {})) { const st = presetStatus(pr, cfg); if (pr.status && pr.status !== st) problems.push(`preset ${pn} says ${pr.status} but bundles a ${st} class`); }
  // R8 (RR-14): a profile's excluded checks must be checks of its base class.
  for (const [pn, pr] of Object.entries(cfg.profiles ?? {})) {
    if (pn === "_note") continue;
    for (const id of pr.excludes ?? []) { const c = checks[id]; if (!c || c.class !== "core" || (pr.base === "core-door" ? c.role === "visitor" : c.role === "door")) problems.push(`profile ${pn} excludes ${id}, which is not a ${pr.base} check`); }
  }
  // R8 (RR-14): each preset names a known base and known extension classes; checked again below, once tests are labelled.
  const knownExt = new Set([...Object.keys(cfg.extensions), ...Object.keys(cfg.documents).filter((d) => d !== "_note").map((d) => "ext-" + d)]);
  for (const [pn, pr] of Object.entries(cfg.presets ?? {})) {
    if (!["core-door", ...Object.keys(cfg.profiles ?? {})].includes(pr.base) || pr.base === "_note") problems.push(`preset ${pn}: unknown base ${pr.base}`);
    for (const x of pr.extensions) if (!knownExt.has(x)) problems.push(`preset ${pn}: unknown extension class ${x}`);
  }
  // test labels: the classes each test file exercises, from the checks it names
  const testDirs = ["packages/shokai/test", "reference/engawa/test", "reference/prototype/test"];
  const tests = {};
  for (const d of testDirs) {
    if (!existsSync(join(root, d))) continue;
    for (const f of readdirSync(join(root, d)).sort()) {
      if (!/\.(ts|mjs|js)$/.test(f)) continue;
      const body = readFileSync(join(root, d, f), "utf8");
      const cls = new Set(); for (const m of body.matchAll(/\bC(\d+)\b/g)) { const c = checks["C" + m[1]]; if (c && c.class !== "informative") cls.add(c.class === "core" ? `core-${c.role === "visitor" ? "visitor" : "door"}` : c.class); }
      if (cls.size) tests[`${d}/${f}`] = [...cls].sort();
    }
  }
  // R8 (RR-14): every class a preset claims is exercised by at least one labelled test file, so the suites test the claim.
  const covered = new Set(Object.values(tests).flat());
  for (const [pn, pr] of Object.entries(cfg.presets ?? {})) for (const x of ["core-door", ...pr.extensions]) if (!covered.has(x)) problems.push(`preset ${pn}: no test file exercises ${x}`);
  // vector labels
  const tv = JSON.parse(rd("conformance/test-vectors.json"));
  const vecDefault = { jcs_digest: "core-door", ed25519: "core-door", possession_proof: "core-door", did_jwk: "core-door", timestamps: "core-door", money: "core-door", rfc4647_lookup: "core-door",
    passkey: "core-door", passkey_profile: "core-door", budget_periods: "ext-spending", allowance_status: "ext-revocation-status", inbound_door: "ext-inbound-door", possession_proof_v05: "core-door", representative_key_encoding: "core-door", ijson_c284: "core-door", must_understand: "core-door" };
  const vectors = {};
  for (const k of Object.keys(tv)) {
    if (k === "note" || k === "key_derivation") continue;
    if (k === "v050") { for (const v of Object.keys(tv.v050)) { if (v === "note") continue; const c = checks[(/^(C\d+)/.exec(v) ?? [])[1]]; vectors[`v050.${v}`] = c ? (c.class === "core" ? `core-${c.role === "visitor" ? "visitor" : "door"}` : c.class) : "core-door"; } continue; }
    if (!vecDefault[k]) problems.push(`test vector group "${k}" has no class label`); else vectors[k] = vecDefault[k];
  }
  return { cfg, checks, tests, vectors, problems, homeChecks };
}

export function checkSummary(checks) {
  const ids = Object.keys(checks).map((id) => +id.slice(1));
  return `Check range: C${Math.min(...ids)}…C${Math.max(...ids)}; ${ids.length} distinct checks (gaps retained).`;
}
export function summaryProblems(checks) {
  const want = `<!-- check-summary -->${checkSummary(checks)}<!-- /check-summary -->`;
  return ["SPEC.md", CORE_SPEC].filter((p) => !rd(p).includes(want)).map((p) => `${p}: check range/count summary is stale (run node tools/conformance-classes.mjs)`);
}
const syncSummary = (text, checks) => text.replace(/<!-- check-summary -->.*?<!-- \/check-summary -->/g,
  `<!-- check-summary -->${checkSummary(checks)}<!-- /check-summary -->`);

export function appendixF(checks, cfg) {
  const groups = new Map();
  for (const [id, c] of Object.entries(checks)) {
    const key = c.class === "core" ? (c.role === "visitor" ? "Core Visitor only" : c.role === "door" ? "Core Door only" : "Core Door and Core Visitor") : c.class;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(id);
  }
  const order = ["Core Door and Core Visitor", "Core Door only", "Core Visitor only", ...Object.keys(cfg.extensions), ...Object.keys(cfg.documents).filter((d) => d !== "_note").map((d) => "ext-" + d), "informative"];
  const lines = ["<!-- BEGIN check-map (GENERATED by tools/conformance-classes.mjs from conformance/classes.json; do not edit) -->", "", "| Class | Status | Checks |", "|---|---|---|"];
  for (const k of order) {
    const ids = groups.get(k); if (!ids) continue;
    const st = k.startsWith("Core") ? "stable" : checks[ids[0]].status;
    lines.push(`| ${k.startsWith("Core") ? k : "`" + k + "`"} | ${st} | ${ids.sort((a, b) => +a.slice(1) - +b.slice(1)).join(", ")} |`);
  }
  const n = Object.keys(checks).length;
  for (const [pn, pr] of Object.entries(cfg.profiles ?? {})) if (pn !== "_note") lines.push(`| profile \`${pn}\` | stable | ${pr.base} without ${pr.excludes.join(", ")} |`);
  for (const [pn, pr] of Object.entries(cfg.presets ?? {})) lines.push(`| preset \`${pn}\` | ${presetStatus(pr, cfg)} | ${pr.base}${pr.extensions.length ? " + " + pr.extensions.join(", ") : ""} |`);
  lines.push("", `${checkSummary(checks)} Each check is in exactly one class (\`informative\`: tested by the reference, never part of a claim).`, "", "<!-- END check-map -->");
  return lines.join("\n");
}

function render(cur, gen) {
  const out = { ...cur }; out.checks = gen.checks; out.tests = gen.tests; out.vectors = gen.vectors;
  return JSON.stringify(out, null, 2) + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  const gen = compute();
  const cur = JSON.parse(rd("conformance/classes.json"));
  const json = render(cur, gen);
  const spec = rd(CORE_SPEC);
  const map = appendixF(gen.checks, gen.cfg);
  const re = /<!-- BEGIN check-map[\s\S]*?<!-- END check-map -->/;
  if (!re.test(spec)) { console.error(`conformance-classes: ${CORE_SPEC} has no check-map markers (Appendix F)`); process.exit(1); }
  const spec2 = syncSummary(spec.replace(re, map), gen.checks);
  const front = rd("SPEC.md"), front2 = syncSummary(front, gen.checks);
  const homesCur = rd("conformance/homes.json"); const homesObj = JSON.parse(homesCur);
  const homes2 = JSON.stringify({ ...homesObj, checks: Object.fromEntries(Object.keys(gen.homeChecks).sort((a, b) => +a.slice(1) - +b.slice(1)).map((k) => [k, gen.homeChecks[k]])) }, null, 2) + "\n";
  for (const p of gen.problems) console.error("  - " + p);
  if (check) {
    let stale = 0;
    for (const p of summaryProblems(gen.checks)) { console.error(p); stale++; }
    if (json !== rd("conformance/classes.json")) { console.error("conformance-classes: conformance/classes.json is stale"); stale++; }
    if (spec2 !== spec) { console.error(`conformance-classes: ${CORE_SPEC} Appendix F is stale`); stale++; }
    if (homes2 !== homesCur) { console.error("conformance-classes: conformance/homes.json is stale (its checks are generated from classes.json)"); stale++; }
    if (stale || gen.problems.length) process.exit(1);
    console.log(`conformance-classes: ${Object.keys(gen.checks).length} checks classed, ${Object.keys(gen.tests).length} test files and ${Object.keys(gen.vectors).length} vector groups labelled ✓`);
  } else {
    writeFileSync(join(root, "conformance/classes.json"), json); writeFileSync(join(root, CORE_SPEC), spec2); writeFileSync(join(root, "SPEC.md"), front2); writeFileSync(join(root, "conformance/homes.json"), homes2);
    console.log(`conformance-classes: wrote conformance/classes.json and ${CORE_SPEC} Appendix F (${Object.keys(gen.checks).length} checks)`);
    if (gen.problems.length) process.exit(1);
  }
}
