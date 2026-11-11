// Runs every snippet in this folder (the ones the README and the site section quote) against 127.0.0.1: each must serve a door
// a visiting representative is admitted at. Usage: node examples/drop-in/snippets/check.mjs (needs packages/shokai built).
import { mkdtempSync, mkdirSync, symlinkSync, cpSync } from "node:fs";
import { tmpdir } from "node:os"; import { join, dirname } from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:http";
const HERE = dirname(fileURLToPath(import.meta.url)), PKG = join(HERE, "../../../packages/shokai");
const d = mkdtempSync(join(tmpdir(), "shokai-snippets-")); cpSync(HERE, d, { recursive: true });
mkdirSync(join(d, "node_modules/@kigenka"), { recursive: true }); symlinkSync(PKG, join(d, "node_modules/@kigenka/shokai"), "dir");
for (const m of ["express", "hono", "@hono"]) symlinkSync(join(PKG, "node_modules", m), join(d, "node_modules", m), "dir");
const imp = (f) => import(pathToFileURL(join(d, f)).href);
const SDK = await import(pathToFileURL(join(PKG, "dist/src/index.js")).href);
let pass = 0, fail = 0; const check = (c, w) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${w}`); };
const listen = (handler) => new Promise((r) => { const s = createServer(handler); s.listen(0, "127.0.0.1", () => r(s)); });
const aya = SDK.createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["tea.browse"] });
// A fresh visitor (its own card) per snippet: the snippets share one door, and a door caps concurrent seats per card (C287, 2).
const admitted = async (base) => (await SDK.createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["tea.browse"] }).visit(await SDK.findPlace(base, "kettle"), { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } })).seated;
console.log("drop-in snippets");
const { app: expressApp, door } = await imp("express.mjs");
const s1 = await listen(expressApp); const o1 = `http://127.0.0.1:${s1.address().port}`; door.setBaseUrl(o1 + "/shokai");
check(await admitted(o1 + "/shokai") && (await (await fetch(o1 + "/")).text()) === "Kettle & Leaf", "express.mjs: a pass at the door; the site unchanged");
const { placeAt } = await imp("find.mjs");
check((await placeAt(o1 + "/", { allowLoopbackHttp: true }))?.name === "kettle", "find.mjs: discover() finds the door from the site's address");
const { app: honoApp } = await imp("hono.mjs"); const { getRequestListener } = await import(pathToFileURL(join(PKG, "node_modules/@hono/node-server/dist/index.mjs")).href);
const s2 = await listen(getRequestListener(honoApp.fetch)); const o2 = `http://127.0.0.1:${s2.address().port}`; door.setBaseUrl(o2 + "/shokai");
check(await admitted(o2 + "/shokai") && (await (await fetch(o2 + "/.well-known/shokai")).json()).type === "door_pointer", "hono.mjs: a pass at the door, and /.well-known/shokai");
const route = await imp("next-route.mjs");
const s3 = await listen(async (req, res) => { const ch = []; for await (const c of req) ch.push(c);
  const out = await route[req.method](new Request(`http://${req.headers.host}${req.url}`, { method: req.method, body: req.method === "POST" ? Buffer.concat(ch) : undefined }));
  res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer())); });
const o3 = `http://127.0.0.1:${s3.address().port}`; door.setBaseUrl(o3 + "/shokai");
check(await admitted(o3 + "/shokai"), "next-route.mjs: a pass at the door through the route handlers");
const { doorFor, events } = await imp("platform.mjs");
const site = { id: "kettle", door: { name: "kettle", displayName: "Kettle & Leaf", category: "store", baseUrl: "http://127.0.0.1:0/shokai", purposes: [{ code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation"], level: "discover" }], approvedBy: { name: "Mika Tanabe", role: "Owner" } } };
const pd = doorFor(site); await pd.ready;
const v = await aya.visit(pd, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
check(v.seated && events.some((e) => e.type === "pass" && e.site === "kettle"), "platform.mjs: a door per site with a KV store, and its events");
for (const s of [s1, s2, s3]) s.close();
console.log(`drop-in snippets: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
