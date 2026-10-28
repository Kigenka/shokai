// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.3.0-rc4: the pilot server keeps durable state across restarts or refuses on loss (§3.6, C192), and prefetches a card's
// revocation list only from its fetch allow-list (§2.6, C191; RT-B10). Loopback only, ephemeral keys, a throwaway state dir.
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const check = (c: boolean, w: string) => { if (c) { pass++; console.log("  PASS " + w); } else { fail++; console.log("  FAIL " + w); } };
const freePort = () => new Promise<number>((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const server = fileURLToPath(new URL("../src/pilot-server.js", import.meta.url));

async function main() {
  console.log("pilot server: durable state and card revocation prefetch (v0.3.0-rc4)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shokai-pilot-")); const state = path.join(dir, "state");
  fs.writeFileSync(path.join(dir, "invitees.json"), JSON.stringify({ invitees: [] }));
  const hits: string[] = []; const q = await freePort();
  const rev = http.createServer((req, res) => { hits.push(req.url ?? ""); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ revocations: [] })); }).listen(q, "127.0.0.1");
  const port = await freePort();
  const start = () => new Promise<{ p: ChildProcess; out: () => string }>((resolve, reject) => {
    let out = ""; const p = spawn(process.execPath, [server, "--mode=engawa", "--ephemeral-keys=true", `--port=${port}`, `--state=${state}`, `--invitees=${path.join(dir, "invitees.json")}`,
      `--places=${path.join(dir, "none.json")}`, `--fetch-allow=http://127.0.0.1:${q}/allowed/`], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout!.on("data", (d) => { out += d; if (/gathering digest/.test(out)) resolve({ p, out: () => out }); }); p.stderr!.on("data", (d) => { out += d; });
    p.on("exit", (c) => reject(new Error("pilot exited " + c + "\n" + out)));
  });
  const stop = (p: ChildProcess) => new Promise<void>((r) => { p.removeAllListeners("exit"); p.on("exit", () => r()); p.kill(); });
  const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/places/engawa/entry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  let s = await start();
  // The server may log its startup line just before its first durable write lands; give it up to 3 s (rc4 round 3: was a race).
  for (let i = 0; i < 60 && !fs.existsSync(path.join(state, "engawa.durable.json")); i++) await new Promise((r) => setTimeout(r, 50));
  check(fs.existsSync(path.join(state, "engawa.durable.json")), "run 1 writes the place's durable state file");
  check(!/durable state (restored|missing)/.test(s.out()), "a brand-new place has nothing to restore and nothing to refuse");
  await post({ payload: { type: "card_presentation", from: "did:key:z6MkTest", card: { payload: { revocation_url: `http://127.0.0.1:${q}/allowed/card-1.json` } } } });
  await post({ payload: { type: "card_presentation", from: "did:key:z6MkTest", card: { payload: { revocation_url: `http://127.0.0.1:${q}/elsewhere/card-2.json` } } } });
  check(hits.includes("/allowed/card-1.json"), "a card's revocation_url on the fetch allow-list is fetched before deciding (§2.6)");
  check(!hits.some((h) => h.startsWith("/elsewhere/")), "a revocation_url off the allow-list is never fetched (RT-B10); it counts as unreachable, so the card fails closed");
  await stop(s.p);

  s = await start();
  check(/engawa: durable state restored/.test(s.out()), "run 2 restores the durable state (§3.6)");
  await stop(s.p);

  fs.rmSync(path.join(state, "engawa.durable.json"));
  s = await start();
  check(/durable state missing; refusing mandates valid before/.test(s.out()), "durable state lost after a previous run: the place refuses mandates valid before the restart (refuse-on-loss)");
  await stop(s.p); rev.close();
  console.log(`${pass} pilot persistence checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
