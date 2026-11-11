#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// npx shokai-conformance <url | module> [--ext visit-receipts,signed-listings] [--vectors] [--place <name>] [--mcp <url>] [--spend <amount>] [--json]
//   Exit status: 0 core conformant (extensions may have failed: see the report), 1 a core check failed, 2 usage,
//   3 core conformant but a requested extension failed.
//   <url>     the door's base address (where GET /places answers), e.g. http://127.0.0.1:3000/shokai
//   <module>  a JS module exporting `door` (a @kigenka/shokai Door), `handler` (a node:http listener) or `createDoor()`,
//             and optionally `implementation` (crypto functions the test vectors run against)
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runConformance, formatReport, verdict, EXTENSIONS, loadPresigned, type Level, type Implementation } from "./runner.js";
import { evaluateClaim, formatClaim, loadEvidence, loadClasses } from "./claims.js";
import { digestOf, Door } from "../index.js";
import { isTimestamp, MONEY_RE, lookupLocale, isCanonicalDidJwk, resolveDid, verifySig } from "../core/crypto.js";

const argv = process.argv.slice(2);
let endSeat: ((place: string, seatId: string) => Promise<boolean>) | undefined;
let tryConfig: ((place: string, patch: Record<string, unknown>) => Promise<string[] | null>) | undefined;
const flag = (n: string) => argv.includes("--" + n);
const opt = (n: string) => { const i = argv.findIndex((a) => a === "--" + n || a.startsWith("--" + n + "=")); if (i < 0) return undefined; const a = argv[i]; return a.includes("=") ? a.split("=")[1] : argv[i + 1]; };
const optAll = (n: string) => { const out: string[] = []; for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--" + n) { if (argv[i + 1]) out.push(argv[++i]); } else if (a.startsWith("--" + n + "=")) out.push(a.slice(n.length + 3)); } return out; };
const TAKES_ARG = ["--ext", "--place", "--mcp", "--spend", "--spend-args", "--spend-currency", "--hold-grace", "--host-console", "--claim", "--evidence", "--card", "--key", "--mandate", "--visitor-fixtures"];
const target = flag("self-test") ? "" : argv.find((a, i) => !a.startsWith("--") && !TAKES_ARG.includes(argv[i - 1] ?? ""));
if ((target === undefined && !flag("self-test")) || flag("help")) {
  console.log([
    "usage: shokai-conformance <url | module> [--ext visit-receipts,signed-listings | --ext all] [--vectors] [--place <name>] [--mcp <url>] [--spend <amount> [--spend-args <json>] [--spend-currency <ISO 4217>]] [--card <file> --key <file> [--mandate <role>=<file> ...] | --visitor-fixtures <dir>] [--json]",
    "       shokai-conformance --self-test   (the vectors against this SDK's own crypto)",
    "",
    "  <url>      the door's base address (where GET /places answers)",
    "  <module>   a JS module exporting `door`, `createDoor()` or `handler` (a node:http listener), and optionally `implementation`",
    "  --mcp <url> test the MCP binding (§11.3) at this endpoint even if the listing doesn't advertise one (links rel mcp-server)",
    "  --spend <amount>  also check that money totals hold: a conformant door then admits exactly ONE act of that amount",
    "             (use a place with mock money). --spend-args gives the other arguments one order needs, as JSON.",
    "             Without it, the always-on cap check (seat.max_amount) moves no money at a conformant door.",
    "             For a v0.5.0 place it also releases one over-limit purchase of twice that amount with a one-purchase raise (C230).",
    "  --hold-grace <s>  the place's hold_grace_s (0–5), when you know it: C231 then checks just inside and just outside it",
    "  --host-console <dir>  the reference host's off-wire console directory (its state/console), on this machine: the runner asks the",
    "             host there to end one seat (C234's closing farewell) and whether it would start with invalid house configs (C236).",
    "             With a module exporting `door`, door.endSeat is used for C234.",
    "  --vectors  run the test vectors (Appendix A.2). Against your own crypto, export `implementation` from the module:",
    "               digest(payload) -> \"sha-256:...\"            verify(signature, digest, did, rpId?) -> boolean",
    "               isTimestamp(s) -> boolean                  isMoney(s) -> boolean   (each called with one argument)",
    "               lookupLocale(ranges, available, default) -> {locale, match: \"exact\" | \"fallback\" | \"none\"}",
    "               isCanonicalDidJwk(did) -> boolean          (a missing function makes its vector skip)",
    "",
    "  --claim <claim>  measure a conformance claim per class (SPEC §0.1, C290), e.g. \"Core Door; ext-spending\" or a preset (browse, shop,",
    "             booking, members). A class fails when a check of it failed or was skipped, or when none of its checks ran; N/A needs a declared",
    "             basis (class not claimed, visitor role, informative, a precondition classes.json declares, or in process: --evidence below).",
    "  --evidence <file>  the claimant's own in-process evidence, JSON {\"implementation\", \"cwd\"? , \"checks\": {\"<check id or Cnnn>\": {\"command\", \"test\"}}}.",
    "             WARNING: the runner executes `command test` as a child process in the implementation directory (a PATH program plus a file inside",
    "             that directory, with a timeout). That is implementer-supplied code. Use it only in an environment you trust, and only with",
    "             --accept-evidence-exec (or SHOKAI_ACCEPT_EVIDENCE_EXEC=1). A pass is exit 0 of that command — not an independent verification",
    "             (SPEC §0.1 / C290). A missing, invalid or unrun entry stays skipped; a failing run fails the check. Exit 4 when the claim isn't established.",
    "  --accept-evidence-exec  required with --evidence: you accept that the runner will run the commands named in the evidence file on this machine.",
    "  --card <file> --key <file>  present a visitor card the owner already signed, plus the representative's private key (never printed).",
    "             The runner does not mint a development stand-in owner. Use with --mandate and/or --visitor-fixtures.",
    "  --mandate <role>=<file>  a mandate the owner already signed, repeatable. Roles: browse, purchase, c300, c301, ops1, cap001, under_two, overcap.",
    "             c300 must carry min_protocol the literal string \"0.5\"; c301 must carry min_protocol shokai/0.6. The runner presents them as-is.",
    "  --visitor-fixtures <dir>  a directory with visitor-card.json, visitor.key, optional manifest.json, mandate-<role>.json files, and optional probe files (mandate-cross_card/cross_place, card-revoked plus revocation-revoked, card-revoked_seat plus mandate and revocation, card-probing plus mandate, card-off_template).",
    "             Checks that need a fresh owner signature the runner cannot produce (a card revocation, a re-signed mutated mandate, a live",
    "             hold raise or decline, a deletion request, a second visitor card, a probing card) are reported SKIP with the reason. They are",
    "             never faked with a development stand-in. This is how a public door that refuses reserved rp_id development cards can be measured.",
    "  The verdict is the core's (the MCP binding included where the place serves MCP). Extension results are reported on their own.",
    "  Exit status: 0 core conformant, 1 a core check failed, 2 usage, 3 core conformant but a requested extension failed,",
    "             4 a --claim isn't established, 5 a requested test vector failed (--vectors or --self-test; the door's verdict is reported apart).",
  ].join("\n"));
  process.exit(flag("help") ? 0 : 2);
}
const levels: Level[] = []; const ext = opt("ext");
if (ext) for (const e of ext === "all" ? EXTENSIONS : ext.split(",")) { if (!EXTENSIONS.includes(e as Level)) { console.error(`unknown extension level ${e} (known: ${EXTENSIONS.join(", ")})`); process.exit(2); } levels.push(e as Level); }
if (flag("vectors")) levels.push("vectors");

const SELF: Implementation = { digest: digestOf, verify: (sig, d, did, rp) => { const k = resolveDid(did); return !!k && verifySig(sig, d, k, rp); }, isTimestamp, isMoney: (s) => MONEY_RE.test(s), lookupLocale, isCanonicalDidJwk };
let base = target ?? ""; let impl: Implementation | undefined; let server: http.Server | undefined;
if (target && !/^https?:\/\//.test(target)) {
  const mod = await import(pathToFileURL(resolve(target)).href);
  impl = mod.implementation; const door: Door | undefined = mod.door ?? (typeof mod.createDoor === "function" ? await mod.createDoor() : undefined);
  if (door) endSeat = async (_place, seatId) => door.endSeat(seatId);
  const handler = mod.handler ?? (door ? async (req: http.IncomingMessage, res: http.ServerResponse) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } } : undefined);
  if (!handler) { console.error("the module exports neither `door`, `createDoor` nor `handler`"); process.exit(2); }
  server = http.createServer(handler); await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port; base = `http://127.0.0.1:${port}` + (door ? new URL(door.base).pathname : (mod.basePath ?? ""));
  if (door) door.setBaseUrl(base);
}
if (flag("self-test")) { impl = SELF; levels.push("vectors"); }
if (flag("vectors") && target && /^https?:\/\//.test(target)) console.error("note: with a URL target, --vectors runs the test vectors against this runner's own crypto, not the door's (see the vectors heading below).");
const vectorsAgainst = impl === SELF ? (flag("self-test") ? "this SDK's own crypto (self-test)" : "this runner's own crypto, NOT the door: a door's crypto can't be reached over HTTP; to test yours, pass a module that exports `implementation`")
  : impl ? `the \`implementation\` exported by ${target}` : undefined;
// C234: the reference host's console queue (a JSON command file in <dir>, its result in <dir>/done), polled by the host every second.
const hc = opt("host-console");
const consoleCmd = async (cmd: Record<string, unknown>): Promise<any> => {
  const name = `${Date.now()}-${String(cmd.cmd)}-${randomBytes(4).toString("hex")}`; mkdirSync(hc!, { recursive: true });
  writeFileSync(`${hc}/${name}.json`, JSON.stringify(cmd));
  for (let i = 0; i < 50; i++) { await new Promise((r) => setTimeout(r, 100)); const f = `${hc}/done/${name}.result.json`;
    if (existsSync(f)) { try { const r = JSON.parse(readFileSync(f, "utf8")); return r?.ok === true ? r.result : undefined; } catch { return undefined; } } }
  return undefined;
};
if (hc) {
  endSeat = async (place, seatId) => (await consoleCmd({ cmd: "end_seat", place, seat_id: seatId }))?.ended === true;
  tryConfig = async (place, patch) => { const r = await consoleCmd({ cmd: "try_config", place, patch }); return Array.isArray(r?.problems) ? r.problems : null; };
}
let presigned;
try {
  const fixtureFlags = !!(opt("card") || opt("key") || opt("visitor-fixtures") || optAll("mandate").length);
  if (fixtureFlags) {
    presigned = loadPresigned({
      cardPath: opt("card"),
      keyPath: opt("key"),
      fixturesDir: opt("visitor-fixtures"),
      mandates: optAll("mandate").map((x) => { const i = x.indexOf("="); if (i <= 0) { console.error('shokai-conformance: --mandate needs <role>=<file>'); process.exit(2); } return { role: x.slice(0, i), path: x.slice(i + 1) }; }),
    });
  }
} catch (e: any) { console.error("shokai-conformance: " + (e?.message ?? e)); process.exit(2); }
const report = await runConformance(base, { levels, place: opt("place"), mcp: opt("mcp"), endSeat, tryConfig, holdGrace: opt("hold-grace") !== undefined ? Number(opt("hold-grace")) : undefined, spend: { value: opt("spend"), currency: opt("spend-currency"), args: opt("spend-args") ? JSON.parse(opt("spend-args")!) : undefined }, implementation: impl ?? (flag("vectors") ? SELF : undefined), vectorsAgainst: vectorsAgainst ?? (flag("vectors") && !impl ? "this runner's own crypto, NOT the door: a door's crypto can't be reached over HTTP; to test yours, pass a module that exports `implementation`" : undefined), presigned });
server?.close();
const claimText = opt("claim"); const evPath = opt("evidence");
if (evPath && !flag("accept-evidence-exec") && process.env.SHOKAI_ACCEPT_EVIDENCE_EXEC !== "1") {
  console.error("shokai-conformance: --evidence runs implementer-supplied commands on this machine (command + test file in the implementation directory). Re-run with --accept-evidence-exec (or SHOKAI_ACCEPT_EVIDENCE_EXEC=1) only in an environment you trust.");
  process.exit(2);
}
const claim = claimText ? evaluateClaim(report, claimText, loadClasses(), evPath ? loadEvidence(evPath) : undefined) : undefined;
console.log(flag("json") ? JSON.stringify(claim ? { ...report, claim: { text: claimText, ...claim } } : report, null, 2) : formatReport(report) + (claim ? "\n\n" + formatClaim(claimText!, claim) : ""));
if (!flag("json") && flag("vectors") && target && /^https?:\/\//.test(target)) console.log("\nA passing vectors section here says nothing about the door at " + target + ": the vectors ran on this runner's own crypto. Only the core and extension checks above are about the door.");
const v = verdict(report);
const vectorFails = report.results.filter((x) => x.level === "vectors" && x.status === "fail").length;
if (vectorFails && !flag("json")) console.error(`\n${vectorFails} test vector check(s) failed: exit 5.`);
process.exit(v.core === "fail" ? 1 : claim && !claim.ok ? 4 : Object.keys(v.extensionFails).length ? 3 : vectorFails ? 5 : 0);
