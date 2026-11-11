// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 setup kit): shokai detect, house new/check/preview, init for each stack, host-card request/verify,
// agent-guide. In temporary folders; the owner's signature is a stand-in passkey. Never prints the door's private key.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { setup, detect, type Io } from "../src/setup-cli.js";
import { developmentPasskey, hostCardRequest, signHostCardForDevelopment, importRepresentativeKey, representativePublic } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const HOUSE = readFileSync(new URL("../../../../examples/drop-in/house.kettle.json", import.meta.url), "utf8");
const project = (pkg?: object, extra: string[] = []) => { const d = mkdtempSync(join(tmpdir(), "shokai-setup-")); if (pkg) writeFileSync(join(d, "package.json"), JSON.stringify(pkg)); for (const x of extra) mkdirSync(join(d, x), { recursive: true }); return d; };
const run = async (cwd: string, ...argv: string[]) => { const out: string[] = []; const err: string[] = []; const io: Io = { cwd, out: (s) => out.push(s), err: (s) => err.push(s), env: {} };
  const code = await setup(argv, io); return { code, out: out.join("\n"), err: err.join("\n") }; };

async function main() {
  console.log("SDK setup kit (v0.4.0)");
  check(detect(project({ dependencies: { express: "^5.1.0" } })).framework === "express" && detect(project({ dependencies: { hono: "^4" } })).framework === "hono"
    && detect(project({ dependencies: { next: "15.0.0", react: "19" } }, ["app"])).app_dir === "app" && detect(project({ dependencies: {} })).framework === "node" && detect(project()).framework === "static",
    "detect: express, hono, next (with its app dir), plain node, static");
  const d = project({ type: "module", dependencies: { express: "^5.1.0" } });
  check((await run(d, "house", "check")).code === 1, "house check without a house.json: a clear error");
  await run(d, "house", "new");
  const fresh = await run(d, "house", "check", "--json"); const fj = JSON.parse(fresh.out);
  check(fresh.code === 1 && !fj.ok && fj.problems.some((p: any) => p.path === "place.name"), "house new: a template that doesn't pass until it's filled in");
  writeFileSync(join(d, "shokai/house.json"), HOUSE.replace("https://kettle.example/shokai", "http://127.0.0.1:0/shokai"));
  const ok = await run(d, "house", "check");
  check(ok.code === 0 && /ready/.test(ok.out), "house check: ready");
  const pv = await run(d, "house", "preview");
  check(pv.code === 0 && pv.out.includes("──────── the leaflet ────────") && pv.out.includes("Kettle & Leaf is a small tea shop"), "house preview: the rules and the leaflet");
  const init = await run(d, "init", "--json"); const ij = JSON.parse(init.out);
  check(init.code === 0 && ij.written.includes("shokai/door.mjs") && ij.written.includes("shokai/express.mjs") && ij.next_steps.some((s: string) => s.includes("app.use(shokai)")), "init (express detected): the door module, the glue, and the one line to add");
  const key = join(d, ".shokai/rep.key");
  check(existsSync(key) && (statSync(key).mode & 0o777) === 0o600 && /^\.shokai\/$/m.test(readFileSync(join(d, ".gitignore"), "utf8")), "the door's key: .shokai/rep.key, mode 600, git-ignored");
  const keyText = readFileSync(key, "utf8").trim();
  const req = await run(d, "host-card", "request");
  const reqFile = readFileSync(join(d, "shokai/host-card.request.json"), "utf8");
  check(req.code === 0 && !reqFile.includes(keyText) && !req.out.includes(keyText) && !init.out.includes(keyText) && !reqFile.includes("pkcs8"), "host-card request: written, and no private key anywhere in files or output");
  check(/only the owner can/.test(req.out) || /Only the owner/.test(reqFile) || /owner signs it with their own passkey/.test(req.out), "… and it says only the owner signs");
  const before = await run(d, "host-card", "verify");
  check(before.code === 1, "host-card verify before signing: not yet");
  // the owner signs (stand-in passkey; a real owner uses the signing page)
  const owner = developmentPasskey(); const r = JSON.parse(reqFile);
  writeFileSync(join(d, "shokai/host-card.json"), JSON.stringify({ note: "test", signed: signHostCardForDevelopment(r, owner) }));
  const v = await run(d, "host-card", "verify", "--json");
  check(v.code === 0 && JSON.parse(v.out).ok === true, "host-card verify after the owner signs: the door can open");
  // a change after signing
  writeFileSync(join(d, "shokai/house.json"), HOUSE.replace("https://kettle.example/shokai", "http://127.0.0.1:0/shokai").replace("The kettle will be on", "The kettle is on"));
  const v2 = await run(d, "host-card", "verify", "--json");
  check(v2.code === 1 && JSON.parse(v2.out).code === "SHOKAI_HOUSE_CHANGED", "one word of the leaflet changed: verify says the owner must sign again");
  // the same request from the same house and key, by hand (no CLI): only the random card id differs
  writeFileSync(join(d, "shokai/house.json"), HOUSE.replace("https://kettle.example/shokai", "http://127.0.0.1:0/shokai"));
  const byHand = hostCardRequest(JSON.parse(readFileSync(join(d, "shokai/house.json"), "utf8")), representativePublic(importRepresentativeKey(keyText)));
  const strip = (x: any) => { const y = JSON.parse(JSON.stringify(x)); delete y.items[0].payload.card_id; return JSON.stringify(y); };
  check(strip(byHand) === strip(r), "the CLI's host-card request equals hostCardRequest() from code (only the random card id differs)");
  // other stacks
  const n = project({ dependencies: { next: "15.0.0" } }, ["src/app"]); writeFileSync(join(n, "tsconfig.json"), "{}"); mkdirSync(join(n, "shokai")); writeFileSync(join(n, "shokai/house.json"), HOUSE);
  const ni = JSON.parse((await run(n, "init", "--json")).out);
  const route = readFileSync(join(n, "src/app/shokai/[[...path]]/route.js"), "utf8"); const wk = JSON.parse(readFileSync(join(n, "public/.well-known/shokai"), "utf8"));
  check(ni.written.includes("src/app/shokai/[[...path]]/route.js") && route.includes('from "../../../../shokai/door.mjs"') && wk.type === "door_pointer" && wk.place_listing === "https://kettle.example/shokai/places", "init (next): a catch-all route under src/app and a static /.well-known/shokai");
  const s = project(); mkdirSync(join(s, "shokai")); writeFileSync(join(s, "shokai/house.json"), HOUSE);
  const si = JSON.parse((await run(s, "init", "--json")).out);
  check(si.written.join() === "public/.well-known/shokai" && !existsSync(join(s, ".shokai")) && si.next_steps.some((x: string) => x.includes('<link rel="shokai" href="/.well-known/shokai">')), "init (static): only the discovery file and the link tag; no key on a site without a door");
  for (const fw of ["hono", "node"] as const) { const p = project({ dependencies: {} }); mkdirSync(join(p, "shokai")); writeFileSync(join(p, "shokai/house.json"), HOUSE);
    const j = JSON.parse((await run(p, "init", "--framework", fw, "--json")).out); check(j.written.includes(`shokai/${fw}.mjs`), `init --framework ${fw}`); }
  const bad = project({ dependencies: {} }); mkdirSync(join(bad, "shokai")); writeFileSync(join(bad, "shokai/house.json"), HOUSE.replace("We sell", "Certified: we sell"));
  const bi = await run(bad, "init");
  check(bi.code === 1 && /isn't ready/.test(bi.err) && !existsSync(join(bad, "shokai/door.mjs")), "init refuses a house that doesn't pass the check, and writes nothing");
  const g = await run(d, "agent-guide"); const m = await run(d, "agent-guide", "--manifest");
  check(g.out.startsWith("# Add a Shōkai door to a site: instructions for agents") && JSON.parse(m.out).instruction_set === "shokai-door-install", "agent-guide prints the instruction set, and --manifest its machine-readable twin");
  console.log(`${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
