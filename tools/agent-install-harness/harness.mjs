// The agentic install path (B), tested deterministically: a scripted agent follows agent-install/v1 (AGENT-INSTALL.md and
// install-manifest.json) against four sample sites (Express, a real Next.js App Router build, Hono on Node, plain node:http),
// with a scripted owner conversation that
// includes a check failure the agent takes back to the owner. It runs the real `shokai` CLI in each project, stops at the
// owner's passkey, and then (as the test, not the agent) signs with a stand-in passkey to start the door and visit it.
// The by-hand path (A) runs the same steps as the owner would at a terminal; the two doors must be identical.
// No model is called (a deterministic script plays the agent), the doors and visits stay on 127.0.0.1, and no real key or passkey
// is used. The Next site installs next, react and react-dom with npm (from npm's cache when it has them) and the SDK from a local
// `npm pack` tarball, then runs `next build` and `next start`: the real Next server, no bridge.
// Usage: node tools/agent-install-harness/harness.mjs [--write-transcripts] [--only=next-app,...]   (needs packages/shokai built)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import net from "node:net";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..", ".."), PKG = join(ROOT, "packages/shokai");
const SDK = await import(pathToFileURL(join(PKG, "dist/src/index.js")).href);
const CLI = join(PKG, "dist/src/cli.js");
const MANIFEST = JSON.parse(readFileSync(join(PKG, "agent-install/v1/install-manifest.json"), "utf8"));
const WRITE = process.argv.includes("--write-transcripts");
const SAMPLES = ["express-app", "next-app", "hono-app", "node-app"];
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? SAMPLES;
const FRAMEWORK = { "express-app": "express", "next-app": "next", "hono-app": "hono", "node-app": "node" };
const STACK = { express: "an Express site", next: "a Next.js site (App Router)", hono: "a Hono site", node: "a plain Node server (node:http)" };

// Cost check: no model is called and nothing leaves this machine. Any fetch to a non-loopback host fails the run.
let modelCalls = 0, outsideCalls = 0; const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const u = new URL(typeof input === "string" ? input : input.url);
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) { outsideCalls++; throw new Error("harness: no network beyond loopback (" + u.hostname + ")"); }
  return realFetch(input, init); };

let pass = 0, fail = 0; const check = (c, w) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${w}`); };
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const jcs = (v) => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(",")}]` : `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",")}}`;
const listFiles = (dir, base = dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); if (f === "node_modules" || f === ".next") return []; return statSync(p).isDirectory() ? listFiles(p, base) : [relative(base, p)]; }).sort();

// The SDK as npm would install it: a local tarball (npm pack, no publish), shared by every Next project so their package.json match.
const WORK = mkdtempSync(join(tmpdir(), "shokai-harness-"));
let TGZ = null;
const tarball = () => { if (TGZ) return TGZ;
  const r = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", WORK], { cwd: PKG, encoding: "utf8" });
  if (r.status !== 0) throw new Error("npm pack failed: " + r.stderr); return (TGZ = join(WORK, r.stdout.trim().split("\n").pop())); };
/**
 * A copy of a sample site in a temporary folder. Express, Hono and plain Node get the SDK (and their framework) linked from this
 * repo; the Next site gets a real `npm install` of its own package.json plus the SDK tarball, as an owner's machine would.
 */
function project(sample, t) {
  const d = mkdtempSync(join(WORK, `${sample}-`)); cpSync(join(ROOT, "examples/drop-in", sample), d, { recursive: true });
  if (sample === "next-app") {
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline", "--loglevel=error", tarball()], { cwd: d, encoding: "utf8" });
    t?.cmd("npm install @kigenka/shokai", r.status === 0 ? `(next ${JSON.parse(readFileSync(join(d, "node_modules/next/package.json"), "utf8")).version}, react, react-dom and @kigenka/shokai ${JSON.parse(readFileSync(join(d, "node_modules/@kigenka/shokai/package.json"), "utf8")).version} installed)` : r.stderr, r.status);
    if (r.status !== 0) throw new Error("npm install failed in the Next sample: " + r.stderr);
    return d;
  }
  mkdirSync(join(d, "node_modules/@kigenka"), { recursive: true }); symlinkSync(PKG, join(d, "node_modules/@kigenka/shokai"), "dir");
  for (const m of ["express", "hono", "@hono/node-server"]) if (existsSync(join(PKG, "node_modules", m))) { mkdirSync(dirname(join(d, "node_modules", m)), { recursive: true }); symlinkSync(join(PKG, "node_modules", m), join(d, "node_modules", m), "dir"); }
  return d;
}
/** The one change init asks for in the site's own code (none for Next), as the agent applies it and the owner would by hand. */
const SERVER_LINES = {
  "express-app": (src) => src.replace('import express from "express";\n', 'import express from "express";\nimport { shokai } from "./shokai/express.mjs";\n').replace("const app = express();\n", "const app = express();\napp.use(shokai);   // the Shōkai door, before the site's routes\n"),
  "hono-app": (src) => src.replace('import { serve } from "@hono/node-server";\n', 'import { serve } from "@hono/node-server";\nimport { mountShokai } from "./shokai/hono.mjs";\n').replace("const app = new Hono();\n", "const app = new Hono();\nmountShokai(app);   // the Shōkai door, before the site's routes\n"),
  "node-app": (src) => src.replace('import { createServer } from "node:http";\n', 'import { createServer } from "node:http";\nimport { handleShokai } from "./shokai/node.mjs";\n').replace("const server = createServer(async (req, res) => {\n", "const server = createServer(async (req, res) => {\n  if (await handleShokai(req, res)) return;   // the Shōkai door first\n"),
};
const DIFFS = {
  "express-app": '+import { shokai } from "./shokai/express.mjs";\n+app.use(shokai);   // the Shōkai door, before the site\'s routes',
  "hono-app": '+import { mountShokai } from "./shokai/hono.mjs";\n+mountShokai(app);   // the Shōkai door, before the site\'s routes',
  "node-app": '+import { handleShokai } from "./shokai/node.mjs";\n+  if (await handleShokai(req, res)) return;   // the Shōkai door first',
};
const editServer = (sample, d) => { const f = join(d, "server.mjs"); const before = readFileSync(f, "utf8"); const after = SERVER_LINES[sample](before);
  if (after === before || after.split("\n").length !== before.split("\n").length + 2) throw new Error(`${sample}: the server change didn't apply`); writeFileSync(f, after); };
/** The real CLI, in the project. */
const shokai = (cwd, t, ...args) => { const r = spawnSync("node", [CLI, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  t.cmd(`shokai ${args.join(" ")}`, (r.stdout + r.stderr).trim(), r.status); return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() }; };

function transcript(title) {
  const lines = [`# ${title}`, ""];
  return { lines,
    say: (who, text) => lines.push(`**${who}:** ${text}`, ""),
    cmd: (c, out, code) => lines.push("```console", `$ ${c}`, ...(out ? out.split("\n").slice(0, 200) : []), ...(code ? [`(exit ${code})`] : []), "```", ""),
    note: (text) => lines.push(`> ${text}`, ""),
  };
}
const redact = (s, d, port) => s.split(d).join("<project>").replaceAll(String(port), "<port>").replace(/did:(key|jwk):[A-Za-z0-9_-]+/g, "did:$1:…")
  .replace(/sha-256:[A-Za-z0-9_-]{43}/g, "sha-256:…").replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g, "<time>").replace(/card-host-[A-Za-z0-9_-]+/g, "card-host-…").replace(/enc-[A-Za-z0-9_-]{12}/g, "enc-…");

// The scripted owner (fictional: Mika Tanabe, Kettle & Leaf). Each answer is what the owner says; the agent maps it to fields.
const OWNER = {
  place: "Kettle & Leaf. It's a tea shop.",
  purposes: "To look at our teas and ask about them, and to buy tea for delivery.",
  actions: "Browsing and ordering, yes. At most 60 dollars per visit. For delivery we need a name and an address.",
  preset: "Standard is fine.",
  host: "Suzu.",
  about: "Kettle & Leaf is a small tea shop. Our teas are certified organic, and we sell loose-leaf green and black teas by the gram, and we ship within the country.",
  questions: "You could ask which teas their owner enjoys.",
  closing: "The kettle will be on when you come back.",
  who: "It's just me, Mika Tanabe.",
  where: "Under /shokai on the site.",
  revise: "Let's drop it. Say: Kettle & Leaf is a small tea shop. We sell loose-leaf green and black teas by the gram, and we ship within the country.",
  yes: "Yes, that's right.",
};

/** Path B: the scripted agent, step by step as the manifest lists them. Returns the project folder. */
async function agentPath(sample, port) {
  const t = transcript(`Path B (agentic): ${sample}`); const base = `http://127.0.0.1:${port}/shokai`;
  t.say("Owner", "Add a Shōkai door to my site.");
  const d = project(sample, t);
  t.note(`The agent loads the instruction set: \`shokai agent-guide\` (${MANIFEST.instruction_set} v${MANIFEST.version}).`);
  const guide = shokai(d, { cmd: () => {} }, "agent-guide"); check(guide.code === 0 && guide.out.includes("instructions for agents"), `${sample}/B: the agent reads AGENT-INSTALL.md from the package`);
  const det = JSON.parse(shokai(d, t, "detect", "--json").out);
  check(det.framework === FRAMEWORK[sample], `${sample}/B: detect finds ${det.framework}`);
  t.say("Agent", `I looked at your project: it's ${STACK[det.framework]}. I'll set up a Shōkai door in front of it with you. First, what's your place called, and what kind of place is it?`);
  t.say("Owner", OWNER.place);
  t.say("Agent", "What may visiting representatives come for? For example, to look around and ask, or to buy.");
  t.say("Owner", OWNER.purposes);
  t.say("Agent", "With a pass, what may they do? I'd suggest two actions: browsing your teas (tea.browse) and ordering (tea.order). Ordering spends money, so what's the most one visit may spend? And what does an order need from the buyer?");
  t.say("Owner", OWNER.actions);
  t.say("Agent", "How strict should the door be? Open: any visiting representative with a Shōkai visitor card its owner signed may be admitted with a pass. Standard: the same, but only introducers you name count. Strict: an introduction is needed, and purchases are held for the visitor's owner to approve.");
  t.say("Owner", OWNER.preset);
  t.say("Agent", "Your door has a host representative who signs the leaflet that agents without a Shōkai visitor card take home. What's its name?");
  t.say("Owner", OWNER.host);
  t.say("Agent", "In a few sentences, what should the leaflet say about Kettle & Leaf? You can also give up to three optional questions for visitors to take home, and one closing line.");
  t.say("Owner", `${OWNER.about} ${OWNER.questions} And end with: ${OWNER.closing}`);
  t.say("Agent", "Is the door yours as a person, or an organization's? And where should it live on your site?");
  t.say("Owner", `${OWNER.who} ${OWNER.where}`);
  // the agent writes house.json from the answers (deterministic mapping)
  const house = { shokai_house: "1",
    place: { name: "kettle", display_name: "Kettle & Leaf", category: "store", locales: ["en-US"] }, host: { name: "Suzu" },
    offers: { purposes: [{ code: "visitation", statement: "Looking at our teas and asking about them." }, { code: "purchase", statement: "Buying loose-leaf tea for delivery." }],
      actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" },
        { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", spends: true, limits: { max_amount: { value: "60.00", currency: "USD" } }, data_asks: ["name", "address"] }] },
    preset: "standard",
    leaflet: { about: OWNER.about, place_questions: ["Which teas does your owner enjoy?"], closing: OWNER.closing },
    owner: { kind: "person", display_name: "Mika Tanabe" }, door: { base_url: base, site_url: `http://127.0.0.1:${port}/` } };
  mkdirSync(join(d, "shokai"), { recursive: true }); writeFileSync(join(d, "shokai/house.json"), JSON.stringify(house, null, 2) + "\n");
  t.note("The agent writes shokai/house.json from the answers.");
  let chk = shokai(d, t, "house", "check", "--json"); let cj = JSON.parse(chk.out);
  check(!cj.ok && cj.problems.some((p) => p.path === "leaflet.about" && /certified/.test(p.message)), `${sample}/B: house check flags "certified" in the owner's words`);
  t.say("Agent", "One thing to change: the check flags \"certified organic\" in the leaflet. Shōkai checks signatures, not places, and the leaflet shouldn't sound as if Shōkai stands behind your teas. Would you like to drop it, or say it another way?");
  t.say("Owner", OWNER.revise);
  house.leaflet.about = "Kettle & Leaf is a small tea shop. We sell loose-leaf green and black teas by the gram, and we ship within the country.";
  writeFileSync(join(d, "shokai/house.json"), JSON.stringify(house, null, 2) + "\n");
  chk = shokai(d, t, "house", "check", "--json"); cj = JSON.parse(chk.out);
  check(cj.ok === true, `${sample}/B: after the owner's revision, house check passes`);
  const pv = shokai(d, t, "house", "preview");
  t.say("Agent", "Here is your door as it will be, and the whole leaflet (above). Your passkey will cover every word of it. Is it right?");
  t.say("Owner", OWNER.yes);
  check(pv.out.includes("Kettle & Leaf (store)") && pv.out.includes("──────── the leaflet ────────"), `${sample}/B: the owner reads the full preview before anything is generated`);
  const ini = JSON.parse(shokai(d, t, "init", "--json").out);
  if (det.framework !== "next") {
    // the line the init output names, applied by the agent (and shown to the owner as a diff)
    editServer(sample, d);
    t.cmd("git diff server.mjs", DIFFS[sample], 0);
    t.say("Agent", "I added one line to your server, and its import (the diff above), so the door answers in front of your routes.");
  } else t.say("Agent", "Nothing to change in your code: the door's routes are in app/shokai/[[...path]]/route.js, and public/.well-known/shokai lets agents find it.");
  check(ini.written.includes("shokai/door.mjs") && ini.written.some((w) => w.startsWith(".shokai/rep.key")), `${sample}/B: init writes the door and its private key (mode 600, git-ignored)`);
  shokai(d, t, "host-card", "request");
  t.say("Agent", "Everything is ready except the one step only you can do: signing your door's Shōkai host card with your passkey. The signing page shows you the house rules and the leaflet again before you sign. When you're done, give me the signed file and I'll check it.");
  t.note("The agent stops here. It never signs; the owner's passkey is the owner's.");
  const request = JSON.parse(readFileSync(join(d, "shokai/host-card.request.json"), "utf8"));
  check(!existsSync(join(d, "shokai/host-card.json")) && request.items[0].payload.house_digest === "$HOUSE_DIGEST", `${sample}/B: the agent stops at the owner's passkey (nothing signed)`);
  return { d, t, house };
}

/** Path A: the owner by hand, with the same final answers. */
function byHandPath(sample, port, finalHouse) {
  const t = transcript(`Path A (by hand): ${sample}`); const d = project(sample, t);
  shokai(d, t, "detect");
  shokai(d, t, "house", "new");
  writeFileSync(join(d, "shokai/house.json"), JSON.stringify(finalHouse, null, 2) + "\n");
  t.note("The owner fills in shokai/house.json in an editor.");
  shokai(d, t, "house", "check"); shokai(d, t, "house", "preview"); shokai(d, t, "init");
  if (sample !== "next-app") { editServer(sample, d); t.note("The owner adds the line init printed, and its import."); }
  shokai(d, t, "host-card", "request");
  return { d, t };
}

/** Start the site: `node server.mjs`, or for Next a production build (once) and the real `next start`. */
async function startSite(sample, d, port, t, build = true) {
  let app;
  if (sample === "next-app") {
    const NEXT = join(d, "node_modules/next/dist/bin/next"); const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
    if (build) {
      const b = spawnSync("node", [NEXT, "build"], { cwd: d, encoding: "utf8", env });
      const routes = (b.stdout + b.stderr).split("\n").filter((l) => /^[┌├└]/.test(l.trim()) || /Next\.js \d/.test(l)).map((l) => l.trim()).join("\n");
      t?.cmd("npx next build", b.status === 0 ? routes : (b.stdout + b.stderr), b.status);
      if (b.status !== 0) throw new Error("next build failed:\n" + b.stdout + b.stderr);
    }
    app = spawn("node", [NEXT, "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: d, env, stdio: ["ignore", "pipe", "inherit"] });
    let seen = ""; await new Promise((r, j) => { app.stdout.on("data", (c) => { seen += c; if (/Ready/.test(seen)) r(); }); app.once("exit", (c) => j(new Error("next start exited " + c + "\n" + seen))); });
    t?.cmd("npx next start", seen.split("\n").filter((l) => /Next\.js|Ready/.test(l)).map((l) => l.trim()).join("\n"), 0);
  } else {
    app = spawn("node", ["server.mjs"], { cwd: d, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((r) => app.stdout.once("data", r));
  }
  return app;
}
const stopSite = async (app) => { if (app.exitCode === null) { app.kill(); await new Promise((r) => app.once("exit", r)); } };

/**
 * Two instances of the same door (two server processes on one project folder, sharing .shokai/state.json), behind a
 * "load balancer" that sends each message of a visit to the next one: no sticky sessions.
 */
async function twoInstances(sample, d, port) {
  const port2 = await freePort(); const apps = [await startSite(sample, d, port, null, false), await startSite(sample, d, port2, null, false)];
  try {
    const hits = []; let n = 0;
    const transport = async (url, body) => { const k = n++ % 2; hits.push(k); const u = new URL(url); u.port = String(k ? port2 : port);
      const r = await fetch(u.href, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (r.status !== 200) throw new Error(`instance ${k}: ${r.status}`); return r.json(); };
    const place = await SDK.findPlace(`http://127.0.0.1:${port}/shokai`, "kettle");
    const kiran = SDK.createRepresentative({ ownerName: "Kiran Vale", purposes: ["visitation", "purchase"], actions: ["tea.browse", "tea.order"] });
    const v = await kiran.visit(place, { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: { value: "60.00", currency: "USD" } }, mandate: { fresh: true }, transport });
    const o1 = v.seated ? await v.act("tea.order", { amount: { value: "40.00", currency: "USD" }, payment_ref: "two-1", name: "Kiran Vale", address: "1 Example Lane" }) : null;
    const o2 = v.seated ? await v.act("tea.order", { amount: { value: "30.00", currency: "USD" }, payment_ref: "two-2", name: "Kiran Vale", address: "1 Example Lane" }) : null;
    await v.farewell();
    return { seated: v.seated, both: new Set(hits).size === 2, first: o1?.type === "act_result" && o1.ok === true, capped: o2?.type === "act_decision" && o2.decision === "deny", hits: hits.join("") };
  } finally { for (const a of apps) await stopSite(a); }
}

/** The owner's moment (the test plays it with a stand-in passkey), then the door opens and visitors come. */
async function signOpenVisit(sample, d, port, owner, t) {
  const req = JSON.parse(readFileSync(join(d, "shokai/host-card.request.json"), "utf8"));
  writeFileSync(join(d, "shokai/host-card.json"), JSON.stringify({ note: "signed by the owner (test stand-in passkey)", signed: SDK.signHostCardForDevelopment(req, owner) }));
  t.note("The owner signs the Shōkai host card on the signing page (in this test: a stand-in passkey under a reserved test name).");
  const v = shokai(d, t, "host-card", "verify", "--json"); const vj = JSON.parse(v.out);
  const app = await startSite(sample, d, port, t);
  const site = `http://127.0.0.1:${port}`;
  try {
    const home = await fetch(site + "/"); const poweredBy = home.headers.get("x-powered-by"); const homeOk = home.status === 200 && (await home.text()).includes("Kettle &amp; Leaf");
    const disc = await SDK.discover(site + "/", { allowLoopbackHttp: true });
    const prose = await fetch(`${site}/shokai/places/kettle/lobby`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hello, can I buy tea?" });
    const pj = await prose.json(); const brief = pj.messages.map((m) => m.payload ?? m).find((p) => p.type === "lobby_briefing");
    const start = await (await fetch(`${site}/shokai/start`)).text();
    const place = await SDK.findPlace(`${site}/shokai`, "kettle");
    const aya = SDK.createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation", "purchase"], actions: ["tea.browse", "tea.order"] });
    const visit = await aya.visit(place, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
    const browse = visit.seated ? await visit.act("tea.browse", {}) : null;
    const teas = await fetch(site + "/teas").then(async (r) => r.ok && (await r.json())[0]?.name === "sencha").catch(() => false);
    t.note(`The door is open on this machine. The site still answers; discover() found the door via ${disc?.via}; an agent without a Shōkai visitor card got the leaflet ("${(brief?.about?.text ?? JSON.stringify(brief?.about ?? "")).slice(0, 60)}…"); Aya Linden's representative, with a Shōkai visitor card, was ${visit.seated ? "admitted with a pass" : "not admitted"}.`);
    for (const m of visit.transcript) { const p = m.message?.payload ?? m.message; t.lines.push(`    ${m.dir === "out" ? "→ visitor" : "← door   "} ${p.type}${p.decision ? " " + p.decision : ""}`); } t.lines.push("");
    return { verify: vj, homeOk, poweredBy, siteRoutes: teas, acted: browse?.type === "act_result" && browse.ok === true, disc, leaflet: !!brief && JSON.stringify(brief).includes("Kettle & Leaf is a small tea shop"), start, seated: visit.seated, listing: await (await fetch(`${site}/shokai/places`)).json(),
      pointer: await (await fetch(`${site}/.well-known/shokai`)).json() };
  } finally { await stopSite(app); }
}

console.log("agent install harness (instruction set " + MANIFEST.version + ")");
const summary = [];
for (const sample of SAMPLES.filter((s) => ONLY.includes(s))) {
  const port = await freePort(); const owner = SDK.developmentPasskey();
  const B = await agentPath(sample, port);
  const rb = await signOpenVisit(sample, B.d, port, owner, B.t);
  check(rb.verify.ok && rb.homeOk && rb.siteRoutes && rb.disc?.via === "well-known" && rb.leaflet && rb.start.includes("Kettle &amp; Leaf is a small tea shop") && rb.seated && rb.acted,
    `${sample}/B: the door opens with the owner's Shōkai host card; the site still works; discover() finds it; the leaflet; a pass, and an act under it`);
  if (sample === "next-app") check(rb.poweredBy === "Next.js" && existsSync(join(B.d, ".next/BUILD_ID")), "next-app: served by the real Next.js server (a production build and `next start`; X-Powered-By: Next.js), not a bridge");
  const two = await twoInstances(sample, B.d, port);
  check(two.seated && two.both && two.first && two.capped, `${sample}: two instances of the door (two processes, one state file), messages alternating between them (${two.hits}): admitted, an order, and the pass's cap counted across both`);
  const A = byHandPath(sample, port, B.house);
  const ra = await signOpenVisit(sample, A.d, port, owner, A.t);
  check(ra.verify.ok && ra.homeOk && ra.seated && ra.acted && ra.leaflet, `${sample}/A: by hand, the same steps open the door`);
  // identical doors
  const keep = (f) => !f.startsWith(".shokai/") && !f.startsWith(".next/") && f !== "next-env.d.ts";
  const filesA = listFiles(A.d).filter(keep), filesB = listFiles(B.d).filter(keep);
  const generated = filesB.filter((f) => /^shokai\/(door|express|hono|node)\.mjs$/.test(f) || f.includes("route.js") || f.startsWith("public/") || f === "server.mjs" || f === ".gitignore" || f === "package.json");
  check(jcs(filesA) === jcs(filesB) && generated.every((f) => readFileSync(join(A.d, f), "utf8") === readFileSync(join(B.d, f), "utf8")), `${sample}: both ways write the same files, byte for byte (${generated.join(", ")})`);
  check(jcs(JSON.parse(readFileSync(join(A.d, "shokai/house.json"), "utf8"))) === jcs(JSON.parse(readFileSync(join(B.d, "shokai/house.json"), "utf8"))), `${sample}: the same house.json`);
  const strip = (r) => { const x = JSON.parse(JSON.stringify(r)); for (const it of x.items) { delete it.payload.card_id; delete it.payload.representative_id; delete it.payload.representative_key; } return jcs(x); };
  check(strip(JSON.parse(readFileSync(join(A.d, "shokai/host-card.request.json"), "utf8"))) === strip(JSON.parse(readFileSync(join(B.d, "shokai/host-card.request.json"), "utf8"))), `${sample}: the same Shōkai host card request (only the door's own key and card id differ)`);
  const pl = (l) => { const e = { ...l.places[0] }; delete e.representative_id; return jcs(e); };
  check(rb.listing.places[0].house_digest === ra.listing.places[0].house_digest && pl(ra.listing) === pl(rb.listing) && jcs(ra.pointer) === jcs(rb.pointer), `${sample}: the same house digest, listing and pointer`);
  check(readFileSync(join(B.d, ".shokai/rep.key"), "utf8") !== readFileSync(join(A.d, ".shokai/rep.key"), "utf8") && !B.t.lines.join("\n").includes(readFileSync(join(B.d, ".shokai/rep.key"), "utf8").trim()), `${sample}: each door has its own key, and no transcript shows it`);
  summary.push({ sample, port, B: B.t, A: A.t, dB: B.d, dA: A.d });
}
check(modelCalls === 0 && outsideCalls === 0, `cost: ${modelCalls} model calls, ${outsideCalls} calls beyond this machine ($0.00)`);
if (WRITE) { const out = join(HERE, "transcripts"); mkdirSync(out, { recursive: true });
  for (const s of summary) { writeFileSync(join(out, `${s.sample}-agent.md`), redact(s.B.lines.join("\n"), s.dB, s.port) + "\n"); writeFileSync(join(out, `${s.sample}-by-hand.md`), redact(s.A.lines.join("\n"), s.dA, s.port) + "\n"); }
  console.log("  transcripts written to " + relative(ROOT, out)); }
console.log(`agent install harness: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
