#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// `npx @kigenka/shokai demo`: a door and a visitor on this machine (127.0.0.1 only), the visit printed as it happens, then the
// report home. Fictional place and owner; development keys made for this run and thrown away. Nothing leaves this computer.
// `shokai visit <door-url>`: the same visit against a demo door elsewhere (it sends only the demo owner's card and mandate).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { createDoor, createRepresentative, findPlace, SPEC_VERSION, PROTOCOL } from "./index.js";

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = c("2"), bold = c("1"), green = c("32"), red = c("31"), cyan = c("36");
const short = (did: string) => (did.length > 28 ? did.slice(0, 20) + "…" + did.slice(-6) : did);
const line = (who: string, text: string) => console.log(`  ${who.padEnd(12)} ${text}`);
const pause = (ms: number) => new Promise((r) => setTimeout(r, process.env.SHOKAI_DEMO_FAST ? 0 : ms));
const USD = (value: string) => ({ value, currency: "USD" });

async function demo() {
  const t0 = Date.now();
  console.log(bold(`\nShōkai demo`) + dim(`  (${PROTOCOL}, spec ${SPEC_VERSION}; fictional actors, keys made for this run)\n`));

  const door = createDoor({ name: "kettle-and-leaf", displayName: "Kettle & Leaf", category: "store",
    about: "A small tea shop. Its door greets visiting representatives.",
    purposes: [{ code: "purchase", statement: "Ordering tea for pickup." }],
    actions: [{ action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
              { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
    spendingActions: ["order.place"] });
  const server = createServer(async (req, res) => {
    let body = ""; for await (const ch of req) body += ch;
    if (!(await door.handleHttp(req, res, body))) { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/shokai`; door.setBaseUrl(base);
  try {
    await visitAndPrint(base, "kettle-and-leaf", t0, door.entry);
  } finally { server.close(); }
}

async function visitAndPrint(base: string, name: string | undefined, t0: number, entry?: string, next = "Next: the quickstart in the README puts this door in front of your own MCP server.") {
    console.log(bold("1. A place opens its door"));
  const place = await findPlace(base, name);
  line("door", `${place.display_name ?? place.name} at ${cyan(entry ?? place.entry)}`);
  line("listing", `${place.actions.map((a) => `${a.action} (asks for ${(a.data_asks ?? []).join(", ") || "nothing"})`).join(", ")}`);
  await pause(250);

  console.log(bold("\n2. Aya's representative arrives"));
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place"] });
  line("card", `signed by Aya's passkey ${dim(short(aya.owner.id))}, for representative ${dim(short(aya.id))}`);
  line("mandate", `Aya allows: purchase, menu.view + order.place, up to ${bold("10.00 USD")}`);
  await pause(250);
  const visit = await aya.visit(place, { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("10.00") },
    why: "Aya would like a tea for pickup this afternoon." });
  for (const m of visit.transcript) {
    const p = m.message?.payload ?? m.message; const who = m.dir === "out" ? "→ visitor" : "← door";
    const extra = p.type === "invitation_response" ? ` ${p.decision === "grant" ? green(p.decision) : red(p.decision)}` : (p.type === "greeting" || p.type === "farewell") && p.courtesy?.text ? dim(` "${p.courtesy.text}"`) : "";
    line(who, `${p.type}${extra}`);
  }
  if (!visit.seated) { line("door", red("not seated: " + (visit.response?.courtesy?.text ?? visit.response?.reason_code ?? visit.decision ?? "no answer"))); process.exitCode = 1; return; }
  line("seat", `${green("seated")}; tools in the seat: ${visit.seat!.tool_allowlist.join(", ")}`);
  await pause(250);

  console.log(bold("\n3. It acts within what Aya allowed"));
  const show = (tool: string, r: any) => line(tool, r?.type === "act_result" && r.ok ? green("done") + dim(" " + JSON.stringify(r.result ?? {}).slice(0, 60))
    : red("refused") + dim(r?.refused_by === "representative" ? ` by the representative itself: ${r.why}` : ` by the door: "${r?.courtesy?.text ?? r?.reason_code ?? r?.decision}"${r?.retry?.credentials ? " (needs a new " + r.retry.credentials.join(", ") + ")" : ""}`));
  show("menu.view", await visit.act("menu.view"));
  await pause(150);
  show("order.place", await visit.act("order.place", { tea: "sencha", amount: USD("6.00") }));
  await pause(150);
  console.log(dim("  Another 6.00 USD would pass the 10.00 USD Aya allowed:"));
  show("order.place", await visit.act("order.place", { tea: "genmaicha", amount: USD("6.00") }));
  console.log(dim("  And if a careless representative sent it anyway, the door counts too:"));
  visit.checkMandateLocally = false;
  show("order.place", await visit.act("order.place", { tea: "genmaicha", amount: USD("6.00") }));
  await visit.farewell();
  line("farewell", "Thank you.");
  await pause(250);

  console.log(bold("\n4. The report home to Aya"));
  const rep = visit.report();
  for (const l of rep.outcome_rendered.text.split("\n")) console.log("  " + l);
  console.log(dim(`\n  Conduct records stay with each place: no global score, nothing on-chain. ${((Date.now() - t0) / 1000).toFixed(1)} s.`));
  console.log(dim("  " + next + "\n"));
}

async function visitRemote(url: string, name?: string) {
  const base = url.replace(/\/places\/?.*$/, "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(base)) throw new Error("visit needs an https:// door (or http://127.0.0.1 for a local one)");
  console.log(bold(`\nShōkai visit`) + dim(`  (${PROTOCOL}, spec ${SPEC_VERSION}; a demo owner "Aya Linden" with keys made for this run)\n`));
  await visitAndPrint(base, name, Date.now(), undefined, "This was a demo owner with keys made for this run; nothing of yours was used. Run your own door: the quickstart in the README.");
}

const cmd = process.argv[2];
if (cmd === "--version" || cmd === "-v" || cmd === "version") {
  // the package version (dist/src/cli.js → package.json), then the protocol it speaks
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  console.log(`${pkg.name} ${pkg.version} (${PROTOCOL}, spec ${SPEC_VERSION})`);
}
else if (cmd === "demo") demo().catch((e) => { console.error(e); process.exit(1); });
else if (cmd === "visit" && process.argv[3]) visitRemote(process.argv[3], process.argv[4]).catch((e) => { console.error(red(String(e?.message ?? e))); process.exit(1); });
else if (cmd === "conformance") { process.argv.splice(2, 1); import("./conformance/cli.js"); }
else { console.log(`Usage: shokai demo                      a door and a visitor on this machine, printed\n       shokai visit <door-url> [place]  the same visit to a demo door elsewhere (a demo owner, keys made for the run)\n       shokai conformance <url>         run the conformance suites (see shokai-conformance --help)\n       shokai --version                 the package version and the protocol it speaks`); process.exitCode = cmd && cmd !== "--help" && cmd !== "-h" ? 1 : 0; }
