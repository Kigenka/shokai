// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, SHK-04 (C285, SPEC §12.1): fetches a visitor names. The rules are https only, never an internal address, and a name
// checked and pinned. No redirect is followed, and fetches are budgeted per target and per principal. A refused fetch is unreachable.
// Fictional people.
import { doorMayFetch, resolveForFetch, doorFetch, isRedirect, FetchBudget, type LookupAll } from "../src/fetch-policy.js";
import { createServer } from "node:http";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const fixed = (addrs: { address: string; family: number }[]): LookupAll => async () => addrs;

async function main() {
  console.log("SSRF normative rules (C285)");

  // Canary internal addresses, a non-https scheme and userinfo are refused statically and never fetched.
  const canaries = ["https://169.254.169.254/latest/meta-data/", "https://10.0.0.1/x", "https://[::1]/x", "https://[fd00::1]/x", "https://0.0.0.0/x",
    "http://introducer.example/log", "https://user:pw@introducer.example/log"];
  for (const u of canaries) check(!doorMayFetch(u, false), "refused: " + u);
  for (const u of canaries) check((await doorFetch(u, { lookup: fixed([{ address: "93.184.215.14", family: 4 }]) })) === null, "doorFetch returns null (unreachable) for " + u);

  // A name is resolved and every address it resolves to is checked.
  const r1 = await resolveForFetch("https://revocations.example/list", { lookup: fixed([{ address: "10.0.0.1", family: 4 }]) });
  check(!r1.ok, "a name resolving to 10.0.0.1 is refused");
  const r2 = await resolveForFetch("https://revocations.example/list", { lookup: fixed([{ address: "93.184.215.14", family: 4 }, { address: "169.254.169.254", family: 4 }]) });
  check(!r2.ok, "a name with any metadata address among its answers is refused");
  const r3 = await resolveForFetch("https://revocations.example/list", { lookup: fixed([{ address: "fd00::1", family: 6 }]) });
  check(!r3.ok, "a name resolving to fd00::1 is refused");
  const r4 = await resolveForFetch("https://revocations.example/list", { lookup: async () => { throw new Error("NXDOMAIN"); } });
  check(!r4.ok, "a name that doesn't resolve is refused (fail closed)");
  const r5 = await doorFetch("https://revocations.example/list", { lookup: fixed([{ address: "192.168.1.20", family: 4 }]) });
  check(r5 === null, "doorFetch to a name resolving privately returns null");

  // Public targets are allowed; a name is pinned to the checked address.
  const lit = await resolveForFetch("https://8.8.8.8/x");
  check(lit.ok && lit.address === "8.8.8.8" && lit.family === 4, "a public address literal is allowed");
  let calls = 0;
  const counting: LookupAll = async () => { calls++; return [{ address: "93.184.215.14", family: 4 }]; };
  const pub = await resolveForFetch("https://introducer.example/log", { lookup: counting });
  check(pub.ok && pub.address === "93.184.215.14" && calls === 1, "a public name is resolved once and pinned to the checked address");
  let testCalls = 0;
  const tp = await resolveForFetch("http://localhost:9/x", { testProfile: true, lookup: async () => { testCalls++; return []; } });
  check(tp.ok && tp.address === "127.0.0.1" && testCalls === 0, "the test profile uses no DNS (loopback only)");

  // Redirects.
  check(isRedirect({ status: 301 }) && isRedirect({ status: 302 }) && isRedirect({ status: 307 }) && isRedirect({ status: 0, type: "opaqueredirect" }) && !isRedirect({ status: 200 }),
    "any 3xx or opaque redirect counts as a redirect");
  const srv = createServer((q, s) => {
    if (q.url === "/redir") { s.statusCode = 302; s.setHeader("location", "/ok"); s.end(); }
    else { s.setHeader("content-type", "application/json"); s.end("[]"); }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as any).port;
  try {
    const red = await doorFetch(`http://127.0.0.1:${port}/redir`, { testProfile: true });
    check(red === null, "a redirect (even on loopback, test profile) is refused and counts as unreachable");
    const ok = await doorFetch(`http://127.0.0.1:${port}/ok`, { testProfile: true });
    check(!!ok && ok.ok && ok.body.toString("utf8") === "[]", "a plain answer on loopback under the test profile is read");
  } finally { srv.close(); }

  // Budget: per target and per principal, in fixed windows. A refused attempt counts nothing.
  let t = 1_000_000;
  const b = new FetchBudget({ perTarget: 2, perPrincipal: 3, windowMs: 1000, now: () => t });
  const a1 = b.take("a.example", "did:web:mio.example"), a2 = b.take("a.example", "did:web:mio.example");
  check(a1 && a2, "fetches within the per-target budget are allowed");
  check(!b.take("a.example", "did:web:mio.example"), "the third fetch to one target in a window is refused");
  // The refused attempt above wasn't counted against the principal: it has used 2 of 3.
  const third = b.take("b.example", "did:web:mio.example");
  const fourth = b.take("c.example", "did:web:mio.example");
  check(third && !fourth, "a principal's fourth fetch in a window is refused (per-principal cap 3, a target-refused attempt not counted)");
  check(b.take("c.example", "did:web:ren.example"), "another principal can still fetch a target with budget left");
  t += 1000;
  check(b.take("a.example", "did:web:mio.example"), "a new window restores the budget");

  console.log(`ssrf normative: ${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
