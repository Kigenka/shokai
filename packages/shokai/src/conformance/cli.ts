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
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runConformance, formatReport, verdict, EXTENSIONS, type Level, type Implementation } from "./runner.js";
import { digestOf, Door } from "../index.js";
import { isTimestamp, MONEY_RE, lookupLocale, isCanonicalDidJwk, resolveDid, verifySig } from "../core/crypto.js";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes("--" + n);
const opt = (n: string) => { const i = argv.findIndex((a) => a === "--" + n || a.startsWith("--" + n + "=")); if (i < 0) return undefined; const a = argv[i]; return a.includes("=") ? a.split("=")[1] : argv[i + 1]; };
const target = flag("self-test") ? "" : argv.find((a, i) => !a.startsWith("--") && !["--ext", "--place", "--mcp", "--spend", "--spend-args", "--spend-currency"].includes(argv[i - 1] ?? ""));
if ((target === undefined && !flag("self-test")) || flag("help")) {
  console.log([
    "usage: shokai-conformance <url | module> [--ext visit-receipts,signed-listings | --ext all] [--vectors] [--place <name>] [--mcp <url>] [--spend <amount> [--spend-args <json>] [--spend-currency <ISO 4217>]] [--json]",
    "       shokai-conformance --self-test   (the vectors against this SDK's own crypto)",
    "",
    "  <url>      the door's base address (where GET /places answers)",
    "  <module>   a JS module exporting `door`, `createDoor()` or `handler` (a node:http listener), and optionally `implementation`",
    "  --mcp <url> test the MCP binding (§11.3) at this endpoint even if the listing doesn't advertise one (links rel mcp-server)",
    "  --spend <amount>  also check that money totals hold: a conformant door then admits exactly ONE act of that amount",
    "             (use a place with mock money). --spend-args gives the other arguments one order needs, as JSON.",
    "             Without it, the always-on cap check (seat.max_amount) moves no money at a conformant door.",
    "  --vectors  run the test vectors (Appendix A.2). Against your own crypto, export `implementation` from the module:",
    "               digest(payload) -> \"sha-256:...\"            verify(signature, digest, did, rpId?) -> boolean",
    "               isTimestamp(s) -> boolean                  isMoney(s) -> boolean   (each called with one argument)",
    "               lookupLocale(ranges, available, default) -> {locale, match: \"exact\" | \"fallback\" | \"none\"}",
    "               isCanonicalDidJwk(did) -> boolean          (a missing function makes its vector skip)",
    "",
    "  The verdict is the core's (the MCP binding included where the place serves MCP). Extension results are reported on their own.",
    "  Exit status: 0 core conformant, 1 a core check failed, 2 usage, 3 core conformant but a requested extension failed.",
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
const report = await runConformance(base, { levels, place: opt("place"), mcp: opt("mcp"), spend: { value: opt("spend"), currency: opt("spend-currency"), args: opt("spend-args") ? JSON.parse(opt("spend-args")!) : undefined }, implementation: impl ?? (flag("vectors") ? SELF : undefined), vectorsAgainst: vectorsAgainst ?? (flag("vectors") && !impl ? "this runner's own crypto, NOT the door: a door's crypto can't be reached over HTTP; to test yours, pass a module that exports `implementation`" : undefined) });
server?.close();
console.log(flag("json") ? JSON.stringify(report, null, 2) : formatReport(report));
if (!flag("json") && flag("vectors") && target && /^https?:\/\//.test(target)) console.log("\nA passing vectors section here says nothing about the door at " + target + ": the vectors ran on this runner's own crypto. Only the core and extension checks above are about the door.");
const v = verdict(report);
process.exit(v.core === "fail" ? 1 : Object.keys(v.extensionFails).length ? 3 : 0);
