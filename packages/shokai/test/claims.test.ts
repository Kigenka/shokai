// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Review 4 R4-03 (SPEC §0.1, C290): a class or preset claim is measured per class, and can fail: a failed or skipped check,
// no check of the class run, an N/A on a basis the claim doesn't allow. A vectors-only run supports no claim.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateClaim, parseClaim, loadClasses, classesOf, formatClaim, loadEvidence, parseEvidenceEntry } from "../src/conformance/claims.js";
import { formatReport, type Report, type Result } from "../src/conformance/runner.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const R = (id: string, ref: string, status: Result["status"], na_basis?: Result["na_basis"], level: Result["level"] = "v050"): Result => ({ id, level, title: id, ref, status, ...(na_basis ? { na_basis } : {}) });
const rep = (results: Result[]): Report => ({ target: "http://127.0.0.1:1", spec: "0.5.0", protocol: "shokai/0.5", started_at: "2026-11-04T00:00:00Z", results, summary: {} });
const cl = loadClasses();
console.log("Conformance claims (R4-03)");
check(JSON.stringify(parseClaim("Shōkai 0.5.0; Core Door; ext-spending; provisional: ext-host-budget", cl).classes) === '["core-door","ext-spending","ext-host-budget"]', "a claim string names its classes (version and provisional label read)");
check(JSON.stringify(parseClaim("shop", cl).classes) === '["core-door","ext-spending","ext-institutions","ext-host-guards"]', "a preset expands to its base and extensions");
check(!classesOf("C175", cl).includes("core-door-browse") && classesOf("C175", cl).includes("core-door") && classesOf("C292", cl).includes("core-door-browse"), "the browse profile drops the checks Appendix F excludes for it");
const good = [R("door.root", "§3.1", "pass", undefined, "core"), R("v050.hold", "§7.3, C230", "pass")];
check(evaluateClaim(rep(good), "Core Door; ext-spending", cl).ok, "every claimed class ran and passed: the claim holds");
check(!evaluateClaim(rep([...good, R("v050.x", "§3.4, C239", "skip")]), "Core Door; ext-spending", cl).ok, "a skipped core check fails the Core Door claim (skipped never passes)");
check(!evaluateClaim(rep([R("door.root", "§3.1", "pass", undefined, "core")]), "Core Door; ext-spending", cl).ok, "a claimed class none of whose checks ran fails");
check(!evaluateClaim(rep([...good, R("v050.y", "§2.3, C236", "fail")]), "Core Door", cl).ok, "a failed check fails its class");
const siteNa = [...good, R("v050.site_binding", "§3.1.1, C257", "na", "class")];
check(evaluateClaim(rep(siteNa), "Core Door", cl).ok, "N/A by class holds when the claim doesn't name the class (site binding not offered)");
check(!evaluateClaim(rep([...siteNa, R("v050.site_ok", "§3.1.1, C264", "pass")]), "Core Door; ext-site-binding", cl).ok, "N/A by class inside a claimed class counts as a skip: the claim fails");
const evDir = mkdtempSync(join(tmpdir(), "shokai-evidence-"));
writeFileSync(join(evDir, "pass.test.js"), "process.exit(0);\n");
writeFileSync(join(evDir, "fail.test.js"), "process.exit(1);\n");
const own = { implementation: "a test door", cwd: evDir, checks: { "v050.counter": { command: "node", test: "pass.test.js" } } };
const ownFail = { implementation: "a test door", cwd: evDir, checks: { "v050.counter": { command: "node", test: "fail.test.js" } } };
const ownString = { implementation: "a test door", cwd: evDir, checks: { "v050.counter": "its own counter test" } };
const ownMissing = { implementation: "a test door", cwd: evDir, checks: { "v050.counter": { command: "node", test: "no-such.test.js" } } };
check(evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl, own).ok, "N/A in-process holds when the claimant's own evidence names a runnable test that exits 0 (C240)");
check(!evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl).ok, "fix check: classes.json evidence (the reference's tests) doesn't count for a claimant that names none of its own");
check(!evaluateClaim(rep([...good, R("v050.nope", "§3.4, C239", "na", "in-process")]), "Core Door", cl, own).ok, "N/A in-process the claimant's evidence doesn't name counts as a skip");
check(!evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl, ownString).ok, "a bare string in evidence.checks is invalid and stays skipped");
check(!evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl, ownMissing).ok, "a named test file that is missing stays skipped");
const failedEv = evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl, ownFail);
check(!failedEv.ok && failedEv.classes[0].fail >= 1 && failedEv.classes[0].skip === 0, "a runnable evidence test that exits nonzero fails the check (not a skip)");
check(!parseEvidenceEntry("just a string") && !parseEvidenceEntry({ command: "/bin/node", test: "pass.test.js" }), "evidence entries must be {command, test} with a PATH program name, not a path");
const passedEv = evaluateClaim(rep([...good, R("v050.counter", "A.1, C240", "na", "in-process")]), "Core Door", cl, own);
const formatted = formatClaim("Core Door", passedEv);
check(/implementer-provided test, run by the runner/.test(formatted) && /not an independent verification/.test(formatted), "claim text calls it an implementer-provided test, run by the runner, not an independent verification");
writeFileSync(join(evDir, "conformance-evidence.json"), JSON.stringify({ implementation: "a test door", checks: { "C240": { command: "node", test: "pass.test.js" } } }));
const loaded = loadEvidence(join(evDir, "conformance-evidence.json"));
check(loaded.cwd === evDir && !!parseEvidenceEntry(loaded.checks["C240"]), "loadEvidence defaults cwd to the evidence file's directory");
check(!evaluateClaim(rep(good), "Core Door; ext-unheard-of", cl).ok, "an unknown class in the claim fails it");
check(!evaluateClaim(rep(good), "browse", cl).ok === false && evaluateClaim(rep([R("door.root", "§3.1", "pass", undefined, "core"), R("v050.spend", "§7.2, C174", "skip")]), "browse", cl).ok, "a browse claim isn't failed by a check Appendix F excludes from the profile (C174)");
check(evaluateClaim(rep([R("door.root", "§3.1", "pass", undefined, "core"), R("seat.max_amount", "§5.1, C73, C175", "na", "precondition", "core"), R("v050.res", "§7.4, C260", "pass")]), "booking", cl).ok, "a booking door with no spending action: the spending-only core checks are N/A by precondition, and the claim holds");
check(!evaluateClaim(rep([...good, R("v050.z", "§3.4, C239", "na", "precondition")]), "Core Door", cl).ok, "N/A by precondition with none declared in classes.json counts as a skip");
const selfTest: Report = { target: "(vectors only)", spec: "0.5.0", protocol: "shokai/0.5", started_at: "x", results: [R("vec.x", "A.2", "pass", undefined, "vectors")], summary: { vectors: { pass: 1, fail: 0, warn: 0, skip: 0, na: 0 } } };
check(/Vectors only: no door was tested/.test(formatReport(selfTest)) && !/no core checks ran/.test(formatReport(selfTest)), "a vectors-only run says so and makes no class claim");
// Gemini round-2: a claimed class whose only results are in-process + claimant evidence must HOLD (ran includes evidence-backed in-process).
const onlyIp = [R("v050.counter", "A.1, C240", "na", "in-process")];
check(evaluateClaim(rep(onlyIp), "Core Door", cl, own).ok, "a class of only in-process+evidence HOLDS (evidence-backed checks count as having run)");
check(!evaluateClaim(rep(onlyIp), "Core Door", cl).ok, "… and without the claimant's evidence the same class does not hold");

// R4-01 / R4-02: unique check ids, not result rows. Three HTTP/in-process rows that all cite C250 (the only ext-host-guards check) are 1 of 1, never "3 of 1".
const c250own = { implementation: "a test door", cwd: evDir, checks: { "v050.classifier_before_request": { command: "node", test: "pass.test.js" }, "C250": { command: "node", test: "pass.test.js" } } };
const threeRows = [
  R("v050.classifiers", "§3.3, C250", "pass"),
  R("v050.model_providers", "§6.10, C250", "pass"),
  R("v050.classifier_before_request", "§12.4, C250", "na", "in-process"),
];
const guards = evaluateClaim(rep(threeRows), "ext-host-guards", cl, c250own);
const g = guards.classes[0];
check(guards.ok && g.ran === 1 && g.size === 1 && g.cited === 1 && g.pass === 1 && g.fail === 0 && g.rows.total === 3 && g.rows.pass === 3, "three result rows citing one class check count as 1 of 1 measured, not 3 of 1");
check(g.ran <= g.size && g.ran <= g.cited && g.cited <= g.size && g.ran + g.skip + g.na + g.unmeasured === g.size, "ran ≤ cited ≤ size, and ran + skip + N/A + unmeasured = size");
const guardsText = formatClaim("ext-host-guards", guards);
check(/measured 1 of 1/.test(guardsText) && !/3 of 1/.test(guardsText) && /unique check ids/.test(guardsText) && /Black-box HTTP results cite 1 of/.test(guardsText) && /This run cited 1 of 1 in total/.test(guardsText) && /size minus total cited/.test(guardsText), "claim text reports 1 of 1 measured (unique ids), never 3 of 1, separates HTTP citations from total cited, and does not call size-minus-HTTP-cites 'the other'");
// R4-05: SKIP rows whose checks belong to another class are not this claim's skips.
const corePlusHoldSkip = evaluateClaim(rep([...good, R("v050.hold_over_limit", "§7.3, C230", "skip")]), "Core Door", cl);
check(corePlusHoldSkip.ok && corePlusHoldSkip.classes[0].skip === 0 && corePlusHoldSkip.otherSkips.some((s) => s.id === "v050.hold_over_limit"), "a skip in ext-spending is not a Core Door skip and does not fail Core Door");
check(/not this claim's skips/.test(formatClaim("Core Door", corePlusHoldSkip)) && /v050.hold_over_limit/.test(formatClaim("Core Door", corePlusHoldSkip)), "claim text explains SKIP rows that belong to another class");
try { rmSync(evDir, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
