// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The can-fail check: make a weakened copy of the built SDK (or of a site page) and print where it is, so a case can be run against
// it and shown to turn to GAP. Never edits the real build. The copy lives in packages/shokai/.mut/<name>/ (so the SDK's own
// node_modules still resolve) or /tmp/shokai-mut-<name>/ for a site page, and is removed with --clean.
//   node tools/enforce/mutate.mjs --name=23-sig --file=core/v050.js --find='…' --replace='…'
//   SHOKAI_ENFORCE_SDK=$(that output) node tools/enforce/enforce.mjs --only=23
//   node tools/enforce/mutate.mjs --name=30-form --site=/path/to/dist --file=business.html --find='…' --replace='…'   (prints SHOKAI_SITE_DIST)
//   node tools/enforce/mutate.mjs --clean
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(here, "../../packages/shokai");
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf("="); return i < 0 ? [a.replace(/^--/, ""), "true"] : [a.slice(2, i), a.slice(i + 1)]; }));
if (args.clean) { fs.rmSync(path.join(PKG, ".mut"), { recursive: true, force: true }); for (const d of fs.readdirSync("/tmp")) if (d.startsWith("shokai-mut-")) fs.rmSync(path.join("/tmp", d), { recursive: true, force: true }); process.exit(0); }
const name = String(args.name ?? "m").replace(/[^a-z0-9-]/gi, "");
const subs = args.spec ? JSON.parse(fs.readFileSync(args.spec, "utf8")) : [{ file: args.file, find: args.find, replace: args.replace ?? "" }];
let root, out;
if (args.site) { root = `/tmp/shokai-mut-${name}`; fs.rmSync(root, { recursive: true, force: true }); fs.cpSync(path.resolve(args.site), root, { recursive: true }); out = root; }
else { root = path.join(PKG, ".mut", name); fs.rmSync(root, { recursive: true, force: true }); fs.cpSync(path.join(PKG, "dist"), root, { recursive: true }); root = path.join(root, "src"); out = root; }
for (const s of subs) {
  const f = path.join(root, s.file); const src = fs.readFileSync(f, "utf8"); const n = src.split(s.find).length - 1;
  if (n !== 1) { console.error(`mutate: "${s.find.slice(0, 80)}" found ${n} times in ${s.file} (must be exactly once)`); process.exit(3); }
  fs.writeFileSync(f, src.replace(s.find, () => s.replace));
}
console.log(out);
