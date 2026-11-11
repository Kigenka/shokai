// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The enforcement suite's door: the Lanternmoss Tea House, run by the SDK's real reference door (createDoor → the reference Host)
// on 127.0.0.1 only. Pia (the owner) signs its Shōkai host card once, with a software passkey stand-in made for this run; her key
// is never written anywhere and is gone when this process ends. The door's own representative key (Suzu's) is a test key kept in
// the run's throwaway directory (0600) so a second start can try to reuse the signed host card. Nothing leaves the machine.
//   node door.mjs --port=5102 --dir=/tmp/x            first start: sign the host card, open the door
//   node door.mjs --port=5102 --dir=/tmp/x --house=raised   try a restart with the gift-card limit raised and NO new owner signature
//   node door.mjs --port=5102 --dir=/tmp/x --house=same     the control: the same restart with the house as Pia signed it
//   --site=https://lanternmoss.example   the website the door belongs to (§3.1.1): named in the host card (place.site) and served at
//                                        /.well-known/shokai on this port. The suite maps that name to this port with a local
//                                        resolver stand-in (no DNS, nothing leaves 127.0.0.1). A lookalike passes its own site,
//                                        or claims Lanternmoss's.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SDK = (process.env.SHOKAI_ENFORCE_SDK ? path.resolve(process.env.SHOKAI_ENFORCE_SDK) : path.resolve(here, "../../packages/shokai/dist/src"));
const { createDoor, signCard, developmentPasskey, generateRepresentativeKey, exportRepresentativeKey, importRepresentativeKey, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor } = await import(path.join(SDK, "index.js"));
const { entryUrl } = await import(path.join(SDK, "core/door.js"));

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const PORT = Number(args.port); const DIR = path.resolve(args.dir);
if (!PORT || !args.dir) { console.error("usage: node door.mjs --port=N --dir=DIR [--house=raised]"); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}/shokai`;
const SITE = args.site ?? "https://lanternmoss.example";
const USD = (value) => ({ value, currency: "USD" });

/** The house Pia approved: what Suzu (the host representative) may offer, and every limit the door enforces. */
export function lanternmoss(giftCardMax = "200.00") {
  return { name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store",
    about: "A small tea house. Agents may look at today's teas and buy gift cards for their owners.",
    how: "Bring a Shōkai visitor card your owner signed and a signed errand with a spending limit.",
    purposes: [{ code: "purchase", statement: "Gift cards and tea, bought for an owner." }, { code: "inquiry", statement: "Asking about today's teas." }],
    actions: [{ action: "menu.view", purposes: ["purchase", "inquiry"], level: "discover", data_asks: [] },
              { action: "giftcard.buy", purposes: ["purchase"], level: "act_on_behalf", data_asks: [], limits: { max_amount: USD(giftCardMax) } },
              { action: "tea.buy", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
    spendingActions: ["giftcard.buy", "tea.buy"], purchaseHoldSeconds: 300,
    // §7.3 (C230): a purchase above a visitor's limit may be held and taken home to its owner (limit calls), never sold.
    policy: { limit_calls: true },
    // Appendix B test profile: the door may fetch http://127.0.0.1 revocation lists (and nothing else); see the README.
    testProfile: true, baseUrl: BASE };
}

const repFile = path.join(DIR, "suzu-rep.key"), cardFile = path.join(DIR, "lanternmoss-host-card.json");
let rep;
if (args.house === "raised" || args.house === "same") {
  // A restart with the same host card Pia signed and the same door key at the same address, and a changed house ("raised": the
  // gift-card limit $200 → $500, no new owner signature) or the house as signed ("same", the control). Only constructs the door.
  rep = importRepresentativeKey(fs.readFileSync(repFile, "utf8"));
  const card = JSON.parse(fs.readFileSync(cardFile, "utf8")); const signedBase = fs.readFileSync(path.join(DIR, "base.txt"), "utf8");
  try { createDoor({ ...lanternmoss(args.house === "raised" ? "500.00" : "200.00"), baseUrl: signedBase, site: card.payload.place.site, card, keys: { rep }, stateFile: path.join(DIR, `door-state-${args.house}.json`) });
    console.log(JSON.stringify({ started: true })); process.exit(0); }
  catch (e) { console.log(JSON.stringify({ started: false, code: e.code ?? null, why: String(e.message).slice(0, 300) })); process.exit(3); }
}
rep = generateRepresentativeKey(); fs.writeFileSync(repFile, exportRepresentativeKey(rep), { mode: 0o600 });
const pia = developmentPasskey();   // Pia's software passkey stand-in: in memory only, for this run
const opts = lanternmoss();
const P = houseConfigFor({ ...opts, card: undefined }).policy;
const hostCard = signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: opts.purposes.map((p) => p.code), actions: opts.actions.map((a) => a.action),
  cardKind: "host", validDays: 90,
  host: { place: { principal_id: pia.id, entry: entryUrl(BASE, opts.name), site: SITE }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(opts, pia.id, BASE), summary_digest: summaryDigestFor(opts, BASE) },
  shownToOwner: { text: "Suzu, my host representative, may welcome agents at Lanternmoss Tea House, show today's teas, sell gift cards within each visitor's signed limit, and hold a purchase for a visitor's owner to approve.", locale: "en-US" } });
fs.writeFileSync(cardFile, JSON.stringify(hostCard)); fs.writeFileSync(path.join(DIR, "base.txt"), BASE);   // public: a host card is shown to every visitor
const door = createDoor({ ...opts, site: SITE, card: hostCard, keys: { rep }, stateFile: path.join(DIR, "door-state.json") });
if (door.hostCardProblem) { console.error("door: host card problem " + door.hostCardProblem); process.exit(4); }

const srv = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) { body += c; if (body.length > 256 * 1024) { res.writeHead(413).end(); return; } }
  try { if (await door.handleHttp(req, res, body, { wellKnown: true })) return; } catch { res.writeHead(500).end(); return; }
  res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
});
srv.listen(PORT, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, base: BASE, owner: pia.id, entry: door.entry, site: SITE })));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => srv.close(() => process.exit(0)));
