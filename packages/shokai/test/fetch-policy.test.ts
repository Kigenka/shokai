// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.3.0-rc4 (reference hardening, proposal P8 fetch scope): what a door fetches for itself. Outside the test profile: https only, never its own host or network.
import { doorMayFetch } from "../src/fetch-policy.js";
import { createDoor } from "../src/index.js";
import { createServer } from "node:http";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
console.log("Door fetch policy");
check(doorMayFetch("https://introducer.example/shokai/revocations", false), "a public https URL may be fetched");
check(!doorMayFetch("http://introducer.example/log", false), "plain http is refused outside the test profile");
const inner = ["https://127.0.0.1/x", "https://localhost/x", "https://[::1]/x", "https://10.1.2.3/x", "https://172.16.0.9/x", "https://192.168.1.1/x",
  "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/x", "https://0.0.0.0/x", "https://[fd00::1]/x", "https://[fe80::1]/x", "https://[::ffff:10.0.0.1]/x",
  "https://printer.local/x", "https://db.internal/x", "https://intranet/x", "https://user:pw@introducer.example/x", "file:///etc/passwd", "not a url"];
check(inner.every((u) => !doorMayFetch(u, false)), `loopback, private, link-local, metadata, .local/.internal, bare names, credentials and non-https are refused (${inner.length} cases)`);
check(doorMayFetch("https://172.32.0.1/x", false) && doorMayFetch("https://8.8.8.8/x", false), "public address literals next to private ranges are allowed");
check(doorMayFetch("http://127.0.0.1:9000/log", true) && !doorMayFetch("https://introducer.example/log", true), "test profile: loopback only (Appendix B.1)");
{ // The door records a refused URL as unreachable without fetching it, so the vouch gets no weight (fail closed, §4).
  const door = createDoor({ name: "p", displayName: "P", purposes: [{ code: "visitation", statement: "Looking." }], actions: [{ action: "a.view", purposes: ["visitation"], level: "discover", data_asks: [] }] });
  const url = "https://169.254.169.254/latest/meta-data/";
  const t0 = Date.now(); await (door as any).prefetch({ vouch: { payload: { revocation_log: url } } });
  const f = door.fetched.get(url);
  check(!!f && f.ok === false && Date.now() - t0 < 500, "a metadata-address revocation log is recorded unreachable at once, never fetched");
}
{ // Size and time bounds: an answer over 256 KiB, or one that stalls past 2 s, counts as unreachable (fail closed, §2.6, §12.2).
  const srv = createServer((q, s) => {
    if (q.url === "/small") { s.setHeader("content-type", "application/json"); s.end("[]"); }
    else if (q.url === "/big") { s.setHeader("content-type", "application/json"); s.end("[" + " ".repeat(300 * 1024) + "]"); }
    else if (q.url === "/chunked") { s.setHeader("content-type", "application/json"); s.write("["); const c = " ".repeat(64 * 1024); let i = 0; const t = setInterval(() => { if (i++ < 6) s.write(c); else { clearInterval(t); s.end("]"); } }, 5); }
    else { s.write("["); /* never ends */ }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r())); const port = (srv.address() as any).port;
  const door = createDoor({ name: "p", displayName: "P", purposes: [{ code: "visitation", statement: "Looking." }], actions: [{ action: "a.view", purposes: ["visitation"], level: "discover", data_asks: [] }], testProfile: true } as any);
  const u = (p: string) => `http://127.0.0.1:${port}${p}`;
  await (door as any).prefetch({ vouch: { payload: { revocation_log: u("/small") } } });
  await (door as any).prefetch({ vouch: { payload: { revocation_log: u("/big") } } });
  await (door as any).prefetch({ vouch: { payload: { revocation_log: u("/chunked") } } });
  const t0 = Date.now(); await (door as any).prefetch({ vouch: { payload: { revocation_log: u("/stall") } } }); const took = Date.now() - t0;
  check(door.fetched.get(u("/small"))?.ok === true, "a small answer is read (test profile, loopback)");
  check(door.fetched.get(u("/big"))?.ok === false && door.fetched.get(u("/chunked"))?.ok === false, "an answer over 256 KiB is unreachable, whether its length is declared or streamed");
  check(door.fetched.get(u("/stall"))?.ok === false && took < 3000, `an answer that stalls is cut off at the timeout (${took} ms) and counts as unreachable`);
  srv.closeAllConnections(); srv.close();
}
console.log(`${pass} fetch policy checks passed, ${fail} failed`); if (fail) process.exit(1);
