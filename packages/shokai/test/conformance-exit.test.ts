// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Review M9: `shokai-conformance --self-test` must exit nonzero (5) when a requested test vector fails. A deliberately failing
// control (one expected digest changed) must give exit 5 and a visible FAIL; the unchanged vectors must give exit 0.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "../src/conformance/cli.js");
const vectors = join(here, "../../conformance-data/test-vectors.json");
const run = (env: Record<string, string> = {}) => spawnSync(process.execPath, [cli, "--self-test"], { encoding: "utf8", env: { ...process.env, ...env } });

console.log("shokai-conformance exit status");
const ok = run();
check(ok.status === 0 && !/\bFAIL\b/.test(ok.stdout), "--self-test with the shipped vectors: exit 0, no FAIL");
let text = readFileSync(vectors, "utf8"); let changed = false;
text = text.replace(/"sha-256:([A-Za-z0-9_-])/, (m, c) => { changed = true; return `"sha-256:${c === "A" ? "B" : "A"}`; });
const dir = mkdtempSync(join(tmpdir(), "shokai-vectors-")); const bad = join(dir, "test-vectors.json"); writeFileSync(bad, text);
check(changed, "control: one expected digest in a copy of the vectors is changed");
const r = run({ SHOKAI_CONFORMANCE_VECTORS: bad });
check(/\bFAIL\b/.test(r.stdout), "--self-test with the failing control prints FAIL");
check(r.status === 5, `--self-test with the failing control exits 5 (got ${r.status})`);
// Gemini review: the visit command's local-http rule takes [::1] and explains other hosts.
const shokai = join(here, "../src/cli.js");
const v = (u: string) => spawnSync(process.execPath, [shokai, "visit", u], { encoding: "utf8", timeout: 20000 });
const lan = v("http://host.docker.internal:3000/shokai");
check(lan.status !== 0 && /isn't loopback/.test(lan.stderr + lan.stdout) && /\[::1\]/.test(lan.stderr + lan.stdout), "visit: a non-loopback http door is refused with a clear message naming the allowed hosts");
const v6 = v("http://[::1]:9/shokai");
check(!/isn't loopback|needs an https/.test(v6.stderr + v6.stdout), "visit: http://[::1] passes the local-http rule (it then fails only to connect)");
// Review M10: discover() reads its 64 KiB limit incrementally and cancels the stream; it doesn't buffer an oversized body.
{ const { discover, MAX_DISCOVERY_BYTES } = await import("../src/index.js");
  let pulled = 0, cancelled = false; const CHUNK = 16 * 1024, TOTAL = 1024 * 1024;
  const body = new ReadableStream<Uint8Array>({ pull(c) { if (pulled >= TOTAL) return c.close(); pulled += CHUNK; c.enqueue(new Uint8Array(CHUNK).fill(32)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const fake = async (u: string) => { const url = String(u);
    if (url.endsWith("/.well-known/shokai")) return Object.defineProperty(new Response(body, { status: 200, headers: { "content-type": "application/json" } }), "url", { value: url });
    return Object.defineProperty(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }), "url", { value: url }); };
  const d = await discover("https://site.example/", { fetch: fake as any });
  check(d === null, "discover(): a 1 MiB streamed discovery file is not read as a door");
  check(cancelled && pulled <= MAX_DISCOVERY_BYTES + 2 * CHUNK, `discover(): the stream is cancelled at the limit (${pulled} bytes pulled of ${TOTAL}; limit ${MAX_DISCOVERY_BYTES})`);
  let declaredRead = false; const big = new ReadableStream<Uint8Array>({ pull() { declaredRead = true; } }, { highWaterMark: 0 });
  const fake2 = async (u: string) => Object.defineProperty(new Response(String(u).endsWith("/.well-known/shokai") ? big : "<html></html>", { status: 200, headers: { "content-length": String(10 * 1024 * 1024) } }), "url", { value: String(u) });
  await discover("https://site.example/", { fetch: fake2 as any });
  check(!declaredRead, "discover(): a declared Content-Length over the limit is refused without reading the body"); }
console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
