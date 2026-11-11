// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Review 4 R4-03 (SPEC §0.1, C290): class and preset claims, measured per class. A claim names classes (or a preset); each
// black-box result belongs to the classes of the checks its ref cites (a core result citing none belongs to Core Door).
// A claimed class FAILS when one of its results failed, when one was skipped (skipped never passes), or when none of its
// checks ran. A result is not applicable (N/A) only on a declared basis that this claim allows:
//   class        the check belongs to a class this claim doesn't name (an N/A of that kind inside a claimed class is a skip);
//   role         the check is a visitor's duty, and this is a door;
//   informative  the check has no test (classes.json `informative`);
//   in-process   the check can't be observed over HTTP; the claimant's own evidence file (--evidence) names the in-process test of
//                its implementation that runs it (fix check: the reference's tests are evidence for the reference only);
//   precondition the claimant's signed listing and config make the check's precondition false (classes.json `applicability`).
// Checks of a claimed class that no black-box result cites are listed as covered in process (classes.json `tests`), never as passed.
import { readFileSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import type { Report, Result } from "./runner.js";

type Classes = { checks: Record<string, { class: string; role: string; status: string }>; profiles: Record<string, any>; presets: Record<string, { base: string; extensions: string[] }>;
  extensions: Record<string, { status: string }>; evidence?: Record<string, string>; applicability?: Record<string, string> };
const CANDIDATES = ["../../../spec/conformance/classes.json", "../../../../../conformance/classes.json"];
let cached: Classes | undefined;
export function loadClasses(): Classes {
  if (cached) return cached;
  for (const c of CANDIDATES) { const u = new URL(c, import.meta.url); if (existsSync(u)) return (cached = JSON.parse(readFileSync(u, "utf8")) as Classes); }
  throw new Error("conformance/classes.json not found next to the runner");
}
const NAMES: Record<string, string> = { "core door": "core-door", "core visitor": "core-visitor", "core door (browse)": "core-door-browse", "core-door-browse": "core-door-browse", "core-door": "core-door", "core-visitor": "core-visitor" };
/** "Shōkai 0.5.0; Core Door; ext-spending; provisional: ext-host-budget" or a preset name → the classes it names. */
export function parseClaim(claim: string, cl: Classes): { classes: string[]; unknown: string[] } {
  const out: string[] = [], unknown: string[] = [];
  for (let t of claim.split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
    t = t.replace(/^provisional:\s*/i, "").replace(/^preset\s+/i, "").trim(); const k = t.toLowerCase();
    if (/^sh[oō]kai\s+\d/.test(k)) continue;
    if (NAMES[k]) out.push(NAMES[k]);
    else if (cl.presets[k]) out.push(cl.presets[k].base, ...cl.presets[k].extensions);
    else if (cl.extensions[k] || Object.values(cl.checks).some((c) => c.class === k)) out.push(k);
    else unknown.push(t);
  }
  return { classes: [...new Set(out)], unknown };
}
const tags = (r: Result) => [...new Set((r.ref.match(/C\d+/g) ?? []))];
/** The claimable classes a check belongs to (core checks: Core Door and/or Core Visitor by role; the browse profile too, unless excluded). */
export function classesOf(c: string, cl: Classes): string[] {
  const k = cl.checks[c]; if (!k) return [];
  if (k.class !== "core") return [k.class];
  const out: string[] = [];
  if (k.role === "door" || k.role === "both") { out.push("core-door"); if (!(cl.profiles["core-door-browse"]?.excludes ?? []).includes(c)) out.push("core-door-browse"); }
  if (k.role === "visitor" || k.role === "both") out.push("core-visitor");
  return out;
}
export type RowCounts = { pass: number; fail: number; warn: number; skip: number; na: number; total: number };
export type ClassVerdict = {
  cls: string;
  /** Unique check ids in this class with that outcome (fail beats skip beats warn beats pass beats N/A). */
  pass: number; fail: number; warn: number; skip: number; na: number;
  inProcess: string[];
  /** Unique check ids this run measured (pass + fail + warn). Always ≤ size, and ≤ cited. */
  ran: number;
  /** Unique check ids that belong to the class in classes.json. */
  size: number;
  /** Unique class check ids cited by any result in this class (HTTP or in-process). */
  cited: number;
  /** Unique class check ids cited by black-box HTTP results (not in-process-only rows). */
  citedHttp: number;
  /** Unique measured check ids whose only measured outcome was an implementer-provided in-process test. */
  measuredInProcessOnly: number;
  /** size − cited: class checks this run never mentioned. */
  unmeasured: number;
  /** Raw runner rows assigned to this class (may exceed unique check counts when several rows cite one id). */
  rows: RowCounts;
  /** Result rows assigned to this class that cite no class check id. */
  untagged: RowCounts;
  ok: boolean; why: string[];
};
/** A runnable in-process evidence entry: a command plus a test file inside the implementation directory. */
export type EvidenceRun = { command: string; test: string };
/** The claimant's own in-process evidence. `cwd` defaults to the directory that holds the evidence file. */
export type Evidence = { implementation?: string; cwd?: string; timeout_ms?: number; checks: Record<string, unknown> };

const DEFAULT_EVIDENCE_TIMEOUT_MS = 30_000;
const MAX_EVIDENCE_TIMEOUT_MS = 120_000;
const evidenceRunCache = new Map<string, { status: "pass" | "fail" | "skip"; detail: string }>();

export function parseEvidenceEntry(v: unknown): EvidenceRun | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as { command?: unknown; test?: unknown };
  const command = typeof o.command === "string" ? o.command.trim() : "";
  const test = typeof o.test === "string" ? o.test.trim() : "";
  if (!command || !test) return undefined;
  // A program name only (looked up on PATH). Paths are not allowed: the test file is the path, relative to cwd.
  if (/[\\/]/.test(command) || command.includes("\0")) return undefined;
  return { command, test };
}

/** Resolve `test` to a regular file inside `cwd`. Rejects absolute paths and `..` segments. */
export function resolveEvidenceTestFile(cwd: string, test: string): string | undefined {
  if (!cwd || !test || test.includes("\0")) return undefined;
  const rel = test.replace(/\\/g, "/");
  if (rel.startsWith("/") || rel.split("/").some((p) => p === "" || p === "." || p === "..")) return undefined;
  const root = resolve(cwd);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root.endsWith("/") ? root : root + "/")) return undefined;
  if (!existsSync(full) || !statSync(full).isFile()) return undefined;
  return full;
}

export function runEvidenceTest(cwd: string, entry: EvidenceRun, timeoutMs = DEFAULT_EVIDENCE_TIMEOUT_MS): { status: "pass" | "fail" | "skip"; detail: string } {
  const timeout = Math.min(Math.max(1, timeoutMs), MAX_EVIDENCE_TIMEOUT_MS);
  const key = `${resolve(cwd)}\0${entry.command}\0${entry.test}\0${timeout}`;
  const hit = evidenceRunCache.get(key);
  if (hit) return hit;
  const file = resolveEvidenceTestFile(cwd, entry.test);
  if (!file) {
    const miss = { status: "skip" as const, detail: `${entry.command} ${entry.test}: missing or invalid test file inside the implementation directory` };
    evidenceRunCache.set(key, miss);
    return miss;
  }
  const result = spawnSync(entry.command, [entry.test], { cwd, timeout, encoding: "utf8", windowsHide: true });
  let out: { status: "pass" | "fail" | "skip"; detail: string };
  const label = `${entry.command} ${entry.test}`;
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === "ETIMEDOUT" || /TIMEDOUT/i.test(err.message)) {
      out = { status: "fail", detail: `implementer-provided test, run by the runner: ${label} timed out after ${timeout}ms` };
    } else if (err.code === "ENOENT") {
      out = { status: "skip", detail: `implementer-provided test, run by the runner: ${label} could not be started` };
    } else {
      out = { status: "fail", detail: `implementer-provided test, run by the runner: ${label} failed to run (${err.message})` };
    }
  } else if (result.status === 0) {
    out = { status: "pass", detail: `implementer-provided test, run by the runner: ${label}` };
  } else {
    out = { status: "fail", detail: `implementer-provided test, run by the runner: ${label} exited ${result.status}` };
  }
  evidenceRunCache.set(key, out);
  return out;
}

export function loadEvidence(path: string): Evidence {
  const abs = resolve(path);
  const e = JSON.parse(readFileSync(abs, "utf8"));
  if (!e || typeof e.checks !== "object" || Array.isArray(e.checks)) throw new Error(`${path}: no "checks" object`);
  const base = dirname(abs);
  const cwd = e.cwd ? resolve(base, String(e.cwd)) : base;
  const timeout_ms = typeof e.timeout_ms === "number" && Number.isFinite(e.timeout_ms) ? e.timeout_ms : DEFAULT_EVIDENCE_TIMEOUT_MS;
  return { implementation: e.implementation, cwd, timeout_ms, checks: e.checks };
}

function inProcessOutcome(x: Result, evidence?: Evidence): { status: "pass" | "fail" | "skip"; detail: string } {
  if (!evidence?.checks) return { status: "skip", detail: `${x.id}: runs only in process, and the claimant's evidence (--evidence) names no test of its own for it` };
  const keys = [x.id, ...tags(x)];
  const seen = new Set<string>();
  const raws: { key: string; value: unknown }[] = [];
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(evidence.checks, k) || seen.has(k)) continue;
    seen.add(k);
    raws.push({ key: k, value: evidence.checks[k] });
  }
  if (!raws.length) return { status: "skip", detail: `${x.id}: runs only in process, and the claimant's evidence (--evidence) names no test of its own for it` };
  const parsed = raws.map((r) => ({ key: r.key, entry: parseEvidenceEntry(r.value) }));
  if (parsed.every((p) => !p.entry)) {
    return { status: "skip", detail: `${x.id}: evidence entry is not a runnable test (need { "command", "test" } naming a file inside the implementation directory)` };
  }
  const cwd = evidence.cwd;
  if (!cwd) return { status: "skip", detail: `${x.id}: evidence names a test but no implementation directory (cwd) was given` };
  const timeout = evidence.timeout_ms ?? DEFAULT_EVIDENCE_TIMEOUT_MS;
  const runs = parsed.filter((p) => p.entry).map((p) => runEvidenceTest(cwd, p.entry!, timeout));
  if (runs.some((r) => r.status === "skip")) return { status: "skip", detail: `${x.id}: ${runs.find((r) => r.status === "skip")!.detail}` };
  if (runs.some((r) => r.status === "fail")) return { status: "fail", detail: `${x.id}: ${runs.find((r) => r.status === "fail")!.detail}` };
  return { status: "pass", detail: `${x.id} (${runs[0].detail})` };
}

export type OtherSkip = { id: string; classes: string[] };
export function evaluateClaim(r: Report, claim: string, cl: Classes = loadClasses(), evidence?: Evidence): { ok: boolean; unknown: string[]; classes: ClassVerdict[]; otherSkips: OtherSkip[] } {
  evidenceRunCache.clear();
  const { classes, unknown } = parseClaim(claim, cl);
  const resultClasses = (x: Result) => { const cs = tags(x).flatMap((c) => classesOf(c, cl)); return cs.length ? cs : ["core", "mcp", "v050"].includes(x.level) ? ["core-door", "core-door-browse"] : []; };
  const emptyRows = (): RowCounts => ({ pass: 0, fail: 0, warn: 0, skip: 0, na: 0, total: 0 });
  type St = "pass" | "fail" | "warn" | "skip" | "na";
  const mergeRank: Record<St, number> = { fail: 0, skip: 1, warn: 2, pass: 3, na: 4 };
  const merge = (xs: St[]): St => xs.reduce((a, b) => (mergeRank[a] < mergeRank[b] ? a : b));
  const verdicts = classes.map((cls): ClassVerdict => {
    const rs = r.results.filter((x) => x.level !== "vectors" && resultClasses(x).includes(cls));
    const members = Object.keys(cl.checks).filter((c) => classesOf(c, cl).includes(cls));
    const memberSet = new Set(members);
    const v: ClassVerdict = {
      cls, pass: 0, fail: 0, warn: 0, skip: 0, na: 0, inProcess: [],
      ran: 0, size: members.length, cited: 0, citedHttp: 0, measuredInProcessOnly: 0, unmeasured: members.length,
      rows: emptyRows(), untagged: emptyRows(), ok: true, why: [],
    };
    const perCheck = new Map<string, St[]>();
    const httpCited = new Set<string>();
    const inProcessOnlyMeasured = new Set<string>();
    const allCited = new Set<string>();
    const httpMeasured = new Set<string>();
    const resolve = (x: Result): St => {
      if (x.status !== "na") return x.status;
      const basis = x.na_basis ?? "";
      // An N/A on basis `class` is valid only when none of the check's own classes is claimed here.
      if (basis === "class" && tags(x).some((c) => classesOf(c, cl).some((k) => classes.includes(k)))) {
        v.why.push(`${x.id}: N/A by class, but this claim names its class`);
        return "skip";
      }
      if (basis === "precondition") {
        const mine = tags(x).filter((c) => classesOf(c, cl).includes(cls));
        if (!mine.length || !mine.every((c) => cl.applicability?.[c])) {
          v.why.push(`${x.id}: N/A by precondition, but classes.json declares none for it`);
          return "skip";
        }
      }
      if (basis === "in-process") {
        const ev = inProcessOutcome(x, evidence);
        if (ev.status === "skip") { v.why.push(ev.detail); return "skip"; }
        if (ev.status === "fail") { v.why.push(ev.detail); v.inProcess.push(ev.detail); return "fail"; }
        v.inProcess.push(ev.detail);
        return "pass";
      }
      return "na";
    };
    for (const x of rs) {
      const st = resolve(x);
      const ids = [...new Set(tags(x).filter((c) => memberSet.has(c)))];
      v.rows[st]++;
      v.rows.total++;
      const isInProcess = x.status === "na" && x.na_basis === "in-process";
      if (!ids.length) {
        v.untagged[st]++;
        v.untagged.total++;
        continue;
      }
      for (const c of ids) {
        allCited.add(c);
        const list = perCheck.get(c) ?? [];
        list.push(st);
        perCheck.set(c, list);
        if (!isInProcess) httpCited.add(c);
        if (!isInProcess && (st === "pass" || st === "fail" || st === "warn")) httpMeasured.add(c);
        if (isInProcess && (st === "pass" || st === "fail" || st === "warn")) inProcessOnlyMeasured.add(c);
      }
    }
    for (const c of members) {
      const xs = perCheck.get(c);
      if (!xs) continue;
      v[merge(xs)]++;
    }
    v.cited = members.filter((c) => allCited.has(c)).length;
    v.citedHttp = members.filter((c) => httpCited.has(c)).length;
    v.ran = v.pass + v.fail + v.warn;
    // Measured only in process: had an in-process measured outcome and no HTTP measured outcome.
    v.measuredInProcessOnly = members.filter((c) => inProcessOnlyMeasured.has(c) && !httpMeasured.has(c)).length;
    v.unmeasured = v.size - v.cited;
    if (v.fail) v.why.push(`${v.fail} failed`);
    if (v.skip) v.why.push(`${v.skip} skipped (a skipped check never passes)`);
    const untaggedRan = v.untagged.pass + v.untagged.fail + v.untagged.warn;
    if (!v.ran && !untaggedRan) v.why.push("no check of this class ran");
    v.ok = !v.fail && !v.skip && !v.untagged.fail && !v.untagged.skip && (v.ran > 0 || untaggedRan > 0);
    return v;
  });
  const claimed = new Set(classes);
  const otherSkips: OtherSkip[] = [];
  for (const x of r.results) {
    if (x.level === "vectors" || x.status !== "skip") continue;
    const cs = resultClasses(x);
    if (!cs.some((c) => claimed.has(c))) otherSkips.push({ id: x.id, classes: [...new Set(cs)] });
  }
  return { ok: !unknown.length && verdicts.length > 0 && verdicts.every((v) => v.ok), unknown, classes: verdicts, otherSkips };
}
export function formatClaim(claim: string, e: ReturnType<typeof evaluateClaim>): string {
  const lines = [`Claim: ${claim}`];
  for (const u of e.unknown) lines.push(`  unknown class or preset: ${u}`);
  for (const v of e.classes) {
    const ut = v.untagged.total
      ? `; plus ${v.untagged.total} untagged result row(s) with no check id in this class (${v.untagged.pass} pass, ${v.untagged.fail} fail, ${v.untagged.warn} warn, ${v.untagged.skip} skip, ${v.untagged.na} N/A)`
      : "";
    lines.push(`  ${v.ok ? "HOLDS" : "FAILS"} ${v.cls}: this run measured ${v.ran} of ${v.size} checks in the class (${v.pass} pass, ${v.fail} fail, ${v.warn} warn); ${v.skip} of the class's checks were skipped, ${v.na} were N/A. ${v.unmeasured} of ${v.size} were not measured in this run (not cited, not URL-reachable, or self-asserted; SPEC §0.1)${ut}${v.why.length ? "; " + v.why.join("; ") : ""}`);
    lines.push(`        The runner produced ${v.rows.total} result row(s) for this class (${v.rows.pass} pass, ${v.rows.fail} fail, ${v.rows.warn} warn, ${v.rows.skip} skip, ${v.rows.na} N/A). Counts above are unique check ids, not rows; several rows may cite one check.`);
    const httpMeasured = v.ran - v.measuredInProcessOnly;
    lines.push(`        Black-box HTTP results cite ${v.citedHttp} of the class's ${v.size} checks. This run cited ${v.cited} of ${v.size} in total (HTTP citations plus any in-process or N/A citations of the same class). This run measured ${v.ran} checks in total: ${httpMeasured} observed over HTTP and ${v.measuredInProcessOnly} measured only by implementer-provided in-process tests run by the runner (not an independent verification; SPEC §0.1 / C290). HOLDS/FAILS applies only to the ${v.ran} this run measured. The other ${v.unmeasured} of ${v.size} (the class size minus total cited, not minus HTTP cites alone) were not measured here.`);
    if (v.inProcess.length) lines.push(`        not observable over HTTP; implementer-provided test, run by the runner (not an independent verification; SPEC §0.1 / C290): ${v.inProcess.join("; ")}`);
  }
  if (e.otherSkips.length) {
    const names = e.otherSkips.map((s) => `${s.id}${s.classes.length ? " (" + s.classes.join(", ") + ")" : ""}`).join(", ");
    lines.push(`  The runner also printed ${e.otherSkips.length} SKIP row(s) whose checks are not in a claimed class: ${names}. Those are not this claim's skips; they do not make a claimed class fail.`);
  }
  lines.push(e.ok ? "Claim: every claimed class holds for every check this run measured (no fail, no skip); unmeasured checks are self-asserted." : "Claim: NOT ESTABLISHED.");
  return lines.join("\n");
}
