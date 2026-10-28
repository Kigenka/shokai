// The demo place, locally: a visit through `shokai visit`, the kill switch, the rate limit and the body cap. Loopback only.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import net from "node:net";
let pass = 0, fail = 0;
const check = (c, w) => { if (c) { pass++; console.log("  PASS " + w); } else { fail++; console.log("  FAIL " + w); } };
const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const dir = mkdtempSync(join(tmpdir(), "shokai-demo-place-"));
const base = `http://127.0.0.1:${port}`;
const start = (extra = {}) => spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, RATE_PER_MIN: "40", ...extra }, stdio: ["ignore", "pipe", "inherit"] });
const ready = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/healthz")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("no start"); };
const cli = createRequire(import.meta.url).resolve("@kigenka/shokai").replace(/index\.js$/, "cli.js");
console.log("Shōkai demo place");
let p = start(); await ready();
check((await (await fetch(base + "/healthz")).json()).open === true, "healthz says open");
check((await (await fetch(base + "/shokai/places")).json()).places?.[0]?.name === "kettle-and-leaf", "the listing names the tea shop");
const v = spawnSync(process.execPath, [cli, "visit", base + "/shokai"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", SHOKAI_DEMO_FAST: "1" } });
check(v.status === 0 && /seated; tools in the seat/.test(v.stdout) && /refused by the door/.test(v.stdout) && /Spent 6\.00 USD of the 10\.00 USD/.test(v.stdout), "`shokai visit` is seated, refused past the limit, and reports home");
check((await fetch(base + "/shokai/places", { method: "POST", body: "x".repeat(70 * 1024) })).status === 413, "a body over 64 KiB is refused (413)");
writeFileSync(join(dir, "CLOSED"), "");
check((await fetch(base + "/shokai/places")).status === 503 && (await (await fetch(base + "/healthz")).json()).open === false, "touching the kill file closes the door at once (503)");
rmSync(join(dir, "CLOSED"));
check((await fetch(base + "/shokai/places")).status === 200, "removing it opens the door again");
let last = 200; for (let i = 0; i < 45; i++) last = (await fetch(base + "/shokai/places")).status;
check(last === 429, "past the per-IP rate limit: 429");
p.kill(); await new Promise((r) => p.on("exit", r));
p = start({ SHOKAI_DEMO_CLOSED: "1" }); await ready();
check((await fetch(base + "/shokai/places")).status === 503, "SHOKAI_DEMO_CLOSED=1 starts it closed");
p.kill(); await new Promise((r) => p.on("exit", r));
p = start(); await ready();
const v2 = spawnSync(process.execPath, [cli, "visit", base + "/shokai"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", SHOKAI_DEMO_FAST: "1" } });
check(v2.status === 0 && /seated; tools in the seat/.test(v2.stdout), "after a restart (durable state restored, new demo keys) a new visit is seated");
p.kill(); await new Promise((r) => p.on("exit", r));
{ // KEY_DIR: the same identity across restarts, keys written 0600, and a visit still works.
  const kd = join(dir, "keys"); const idOf = async () => JSON.stringify((await (await fetch(base + "/shokai/places")).json()).places?.[0]);
  p = start({ KEY_DIR: kd }); await ready(); const a = await idOf(); p.kill(); await new Promise((r) => p.on("exit", r));
  p = start({ KEY_DIR: kd }); await ready(); const b = await idOf();
  const mode = (await import("node:fs")).statSync(join(kd, "rep.pem")).mode & 0o777;
  const v3 = spawnSync(process.execPath, [cli, "visit", base + "/shokai"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", SHOKAI_DEMO_FAST: "1" } });
  check(a === b && /did:key:z6Mk/.test(a) && mode === 0o600 && v3.status === 0 && /seated; tools in the seat/.test(v3.stdout), "KEY_DIR keeps one identity across restarts (keys 0600), and a visit is seated");
  p.kill(); await new Promise((r) => p.on("exit", r));
}
console.log(`${pass} demo place checks passed, ${fail} failed`); if (fail) { console.log(v.stdout, v.stderr); process.exit(1); }
