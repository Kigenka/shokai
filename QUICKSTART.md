# Quickstart: put a Shōkai door in front of an MCP server

In about ten minutes you will run an MCP server behind a Shōkai door (your place, with its own agent as the host at the door), send a representative to it, watch it introduce itself and get seated, call tools within its seat, make a visit that spends within a limit, and run the conformance checks. Everything runs on your machine; nothing is sent anywhere.

You need Node.js 20 or later.

**Only visiting a place someone else runs?** Do step 1, then go to [step 6, the visitor path](#6-visiting-a-place-someone-else-runs-the-visitor-path). Steps 2 to 5 build a place of your own to visit.

**Two addresses, not to mix up.** A door's **base URL** ends in `/shokai` (for example `http://127.0.0.1:3000/shokai`): it's what `findPlace` and `shokai-conformance` take. Its **place listing** is that base plus `/places` (`http://127.0.0.1:3000/shokai/places`): the JSON you can read to see what the place offers. The listing is the place's agent front, not the door itself; the door is where the listing's `entry` points. Write the base URL without a trailing slash; `findPlace` and `shokai-conformance` accept `…/shokai/` too, and a listing's own `door` field may show it with one. Both name the same door.

## 1. Make a project (1 minute)

```sh
mkdir shokai-quickstart && cd shokai-quickstart
npm init -y && npm pkg set type=module
npm install @kigenka/shokai @modelcontextprotocol/sdk zod
```

> **From a package file instead** (if you were given one, or can't reach the npm registry):
> - If you were given the package as a `.tgz` file: `npm install /path/to/kigenka-shokai-0.3.0.tgz @modelcontextprotocol/sdk zod`.
> - If you have the source repository: run `cd packages/shokai && npm install && npm pack` there, then install the `.tgz` it makes, as above.

## 2. The server: your MCP server, plus a door (3 minutes)

Save this as `server.mjs`. The MCP part is the official MCP TypeScript SDK, unchanged. The door says which purposes the place serves, which actions a seated visitor may take, which of them spend money (`spendingActions`), and what personal data each action will ask the owner for (`data_asks`, so a representative can look before it joins).

```js file=server.mjs
// server.mjs: an MCP server with two tools, behind a Shōkai door.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoor } from "@kigenka/shokai";
import { shokaiGate, statelessMcp } from "@kigenka/shokai/mcp";

const PRICES = { sencha: "6.00", hojicha: "5.50", genmaicha: "5.00" }; // USD, mock

// Your MCP server, unchanged. A tool that spends takes an `amount` argument and checks it against its own price.
function buildServer() {
  const server = new McpServer({ name: "tea-shop", version: "1.0.0" });
  server.registerTool("menu.view", { description: "List today's teas and prices (USD)", inputSchema: {} },
    async () => ({ content: [{ type: "text", text: Object.entries(PRICES).map(([t, p]) => `${t} ${p}`).join(", ") }] }));
  server.registerTool("order.place", { description: "Order one tea; amount must equal its price",
    inputSchema: { tea: z.string(), amount: z.object({ value: z.string(), currency: z.string() }) } },
    async ({ tea, amount }) => PRICES[tea] === amount.value && amount.currency === "USD"
      ? { content: [{ type: "text", text: `ordered ${tea} for ${amount.value} USD` }] }
      : { isError: true, content: [{ type: "text", text: `${tea} costs ${PRICES[tea] ?? "?"} USD` }] });
  return server;
}

// The door: who may sit down, for what, which actions spend, and what each action will ask the owner for.
const door = createDoor({
  name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [
    { action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
  ],
  spendingActions: ["order.place"],
});

const port = Number(process.env.PORT ?? 3000);
http.createServer(shokaiGate(door, statelessMcp(buildServer))).listen(port, "127.0.0.1", () => {
  door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
  console.log(`door:  http://127.0.0.1:${port}/shokai/places\nmcp:   http://127.0.0.1:${port}/mcp`);
});
```

Start it and leave it running:

```sh
node server.mjs
```

## 3. The visitor: a representative arrives (3 minutes)

In a second terminal, in the same folder, save this as `visit.mjs`:

```js file=visit.mjs
// visit.mjs: Aya Linden's representative arrives, is seated, and uses the MCP server within its seat.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const base = process.env.BASE ?? "http://127.0.0.1:3000";

// 1. Without a seat, a tool call is refused, with directions to the door.
const stranger = new Client({ name: "stranger", version: "1.0.0" });
await stranger.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
await stranger.callTool({ name: "menu.view", arguments: {} }).catch((e) => console.log("stranger:", e.message));

// 2. A representative with a card its owner signed (a development passkey here; a real passkey in production).
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["menu.view"] });

// 3. Look before you join: the listing says what spends money and what each action will ask the owner for.
const place = await findPlace(base + "/shokai", "tea-shop");
for (const a of place.actions) console.log(`listing: ${a.action}${a.spends ? " (spends)" : ""} asks for ${a.data_asks.join(", ") || "nothing"}`);

// 4. The ritual: greeting, signed card, introduction, a request within a mandate Aya signed.
//    Before it asks anything, the SDK checks the place's card against the listing entry it followed.
const visit = await aya.visit(place, { purpose: "visitation", actions: ["menu.view"], why: "Aya wants to see today's teas." });
console.log("place checked:", visit.placeCheck.ok, "| decision:", visit.decision, "| seat:", visit.seat?.tool_allowlist);

// 5. The same MCP client, with a fetch that signs an act for each tool call.
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("tools in my seat:", (await client.listTools()).tools.map((t) => t.name));
console.log("menu.view:", (await client.callTool({ name: "menu.view", arguments: {} })).content[0].text);
await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: { value: "6.00", currency: "USD" } } })
  .catch((e) => console.log("order.place:", e.message));

// 6. Report home to Aya.
await visit.farewell();
console.log("report:", visit.report().outcome_rendered.text);
await stranger.close(); await client.close();
```

Run it:

```sh
node visit.mjs
```

You should see:

```text output=visit.mjs
stranger: MCP error -32040: This MCP server is behind a Shōkai door: get a seat first, then send each tools/call with a signed act (Shokai-Act header)
listing: menu.view asks for nothing
listing: order.place (spends) asks for nothing
place checked: true | decision: grant | seat: [ 'menu.view' ]
tools in my seat: [ 'menu.view' ]
menu.view: sencha 6.00, hojicha 5.50, genmaicha 5.00
order.place: MCP error -32040: not sent: order.place is not in this seat (it allows menu.view)
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) seated me for "menu.view", no spending. I did 1 action; 1 was refused.
```

The report names the place by what the visit verified, its key (new on every run, so yours ends differently), and its display name only as a claim ("claims to be"): a door can call itself anything (SPEC §2.1, C199).

`order.place` was refused because it wasn't in the seat: a `visitation` visit is for looking and never spends. `not sent:` means Aya's own representative stopped it before sending, because it checks the seat's tools first; sent anyway (`visit.checkSeatLocally = false`), the door refuses it with `order.place is not in your seat (it allows menu.view)`.

## 4. A visit that spends, and a second visit (2 minutes)

To spend, the owner signs a mandate for purpose `purchase` with a spending limit (`max_amount`), and each spending act states its amount. The limit is for the whole errand, not for each visit: a second visit for the same errand presents the same mandate, and what's left carries over. Save this as `spend.mjs`:

```js file=spend.mjs
// spend.mjs: Aya's representative orders tea within a 10.00 USD limit Aya signed, then comes back for more.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const base = process.env.BASE ?? "http://127.0.0.1:3000";
const USD = (value) => ({ value, currency: "USD" });
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place"] });
const place = await findPlace(base + "/shokai", "tea-shop");
const connect = async (visit) => { const c = new Client({ name: "aya-representative", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(visit) })); return c; };
const order = (client, args) => client.callTool({ name: "order.place", arguments: args }).then((r) => r.content[0].text,
  (e) => e.data?.shokai?.refused_by === "representative" ? `not sent: ${e.data.shokai.why}` : `the door refused it (${e.data?.shokai?.act_decision?.reason_code})`);

// The limits go into the mandate Aya signs and into the request; the seat is never wider than either.
const ask = { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("10.00") }, why: "Aya would like some sencha." };

const visit1 = await aya.visit(place, ask);
console.log("visit 1:", visit1.decision, "| limit:", visit1.seat?.limits?.max_amount);
const c1 = await connect(visit1);
console.log("no amount:", await order(c1, { tea: "sencha" }));                       // a spending act must state its amount
console.log("6.00 USD:", await order(c1, { tea: "sencha", amount: USD("6.00") }));   // within the limit
await visit1.farewell(); await c1.close();

// Later, the same errand: the representative presents the mandate it already holds, so 4.00 USD is left, not 10.00.
const visit2 = await aya.visit(place, ask);
console.log("visit 2:", visit2.decision, "| same mandate:", visit2.mandateReused);
const c2 = await connect(visit2);
console.log("6.00 more:", await order(c2, { tea: "sencha", amount: USD("6.00") }));  // 6.00 + 6.00 would pass 10.00
await visit2.farewell(); await c2.close();
console.log("report:", visit2.report().outcome_rendered.text);                         // covers both visits
```

Run it with the server still running:

```sh
node spend.mjs
```

You should see:

```text output=spend.mjs
visit 1: grant | limit: { value: '10.00', currency: 'USD' }
no amount: the door refused it (REQUEST_INCOMPLETE)
6.00 USD: ordered sencha for 6.00 USD
visit 2: grant | same mandate: true
6.00 more: not sent: 6.00 USD is more than the 4.00 USD left of the mandate
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) seated me for "menu.view" and "order.place", up to 10.00 USD. I did 0 actions; 1 was refused. This was visit 2 under the mandate you signed. Earlier: here, 1 action done, 1 refused, 6.00 USD spent. In all under this mandate: 1 action done, 2 refused; spent 6.00 USD of the 10.00 USD allowed, 4.00 USD left.
```

What happened:

- **Amounts.** The door counts each spending act's `amount` (`{value, currency}`, exact decimals) against the limit, and refuses a spending act that doesn't state one. Checking the amount against the real price is your tool's job, as `order.place` does above.
- **One allowance per mandate.** The limits Aya signed bind the mandate across every visit while it's valid (§5.1). The representative keeps a ledger per mandate and doesn't send an act its owner no longer allows; the door counts the mandate too, so the same act sent anyway is refused (`SEAT_SCOPE_EXCEEDED`). A new mandate is a new allowance: `mandate: { fresh: true }` has one signed.
- **One report for the errand.** The report home covers every visit and act under the mandate (`under_mandate` in the report), so the earlier visit isn't lost (§8.2).
- **Across runs.** The ledger lives in memory unless you pass `ledger: fileLedger("ledger.json")` to `createRepresentative`. The development passkey is new each run, so each run of this script is, to the door, a new owner with a new mandate; a real owner signs once on their device and the representative keeps that mandate and its ledger.

Other limits work the same way: `max_operations`, `max_session_s` (per seat), and `max_amount_scope: "per_operation"` with `session_max_amount`.

## 5. Check conformance (1 minute)

With the server still running:

```sh
npx shokai-conformance http://127.0.0.1:3000/shokai --ext visit-receipts --vectors
```

The runner visits your door as a stranger and as a prepared representative, checks the place against its listing the way a visitor must, and tries the attacks every revision must refuse (a request before the card, a reused nonce, a message changed after signing, someone else's card). Extension levels are opt-in with `--ext` (`visit-receipts`, `signed-listings`, or `all`).

`--vectors` runs the normative test vectors. Against a URL they run on the **runner's own crypto**, because a door's crypto can't be reached over HTTP; the output says so. A passing vectors section then says nothing about the door: only the core and extension checks are about the door. To test your own implementation's crypto, pass a module instead of a URL: `npx shokai-conformance ./my-door.js --vectors`, where the module exports `door` (or `createDoor` or `handler`) and `implementation` (its digest, signature, timestamp, money, locale and did:jwk functions).

## 6. Visiting a place someone else runs (the visitor path)

You don't need a server of your own to visit a place. You need its door's base URL (ending in `/shokai`) and, if the door lists more than one place, the place's `name`.

- **`name` vs `display_name`.** Each listing entry has a `name`, a short machine slug (`tea-shop`), and a `display_name` for people ("Kettle & Leaf"). `findPlace(base, name)` takes the base URL and the `name`; leave the name out to get the listing's first place.
- **Its actions are its own.** A place lists its own actions (`menu.view`, `tea.ask`, `order.place`, ...), what each spends and what it will ask for. Read them from the listing; don't assume the names in this quickstart.
- **Card scope vs mandate.** `createRepresentative({ purposes, actions })` sets the scope of the representative's **card**: everything it may ever ask for on its owner's behalf, signed once. Each `visit()` carries a **mandate**: one purpose, the actions for this errand (within the card's scope) and its limits, signed for this errand. A visit can ask for less than the card allows, never more; a mandate beyond its card is refused (`MANDATE_INVALID`). The script below builds both from the listing only to stay short.

Save this as `visitor.mjs`; it reads any door's listing, asks for a seat for the actions that spend nothing, and lists the tools in its seat:

```js file=visitor.mjs
// visitor.mjs: visit a place that's already running. Usage: node visitor.mjs <base URL ending in /shokai> [place name]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const base = process.argv[2] ?? (process.env.BASE ?? "http://127.0.0.1:3000") + "/shokai";
const listing = await (await fetch(base + "/places")).json();                 // the place listing: base + "/places"
for (const p of listing.places) console.log(`place: name=${p.name} display_name="${p.display_name}"`);
const place = await findPlace(base, process.argv[3] ?? listing.places[0].name); // the name, not the display name
for (const a of place.actions) console.log(`listing: ${a.action} (${a.purposes.join(", ")})${a.spends ? " spends" : ""}, asks for ${a.data_asks.join(", ") || "nothing"}`);

// Ask for the actions that spend nothing and need no introduction, under one purpose they share.
const free = place.actions.filter((a) => !a.spends && !a.creates_account && !a.requires_introduction && (a.needs ?? "standard") === "standard");
const purpose = free.some((a) => a.purposes.includes("visitation")) ? "visitation" : free[0].purposes[0];
const actions = free.filter((a) => a.purposes.includes(purpose)).map((a) => a.action);
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: [purpose], actions });
const visit = await aya.visit(place, { purpose, actions, why: "Aya wants to look around." });
console.log("place checked:", visit.placeCheck.ok, "| decision:", visit.decision, "| seat:", visit.seat?.tool_allowlist);

// The MCP endpoint: a `links` hint with rel "mcp-server" on the door's own origin, else <origin>/mcp. Links are hints, so
// a representative only sends its seat's acts to the same origin as the door's entry.
const origin = new URL(place.entry).origin;
const hint = place.links?.find((l) => l.rel === "mcp-server" && new URL(l.href).origin === origin)?.href;
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(hint ?? origin + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("tools in my seat:", (await client.listTools()).tools.filter((t) => visit.seat?.tool_allowlist.includes(t.name)).map((t) => t.name));

await visit.farewell(); await client.close();
console.log("report:", visit.report().outcome_rendered.text);
```

Against the server from step 2:

```sh
node visitor.mjs http://127.0.0.1:3000/shokai tea-shop
```

You should see:

```text output=visitor.mjs
place: name=tea-shop display_name="Kettle & Leaf"
listing: menu.view (visitation, purchase), asks for nothing
listing: order.place (purchase) spends, asks for nothing
place checked: true | decision: grant | seat: [ 'menu.view' ]
tools in my seat: [ 'menu.view' ]
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) seated me for "menu.view", no spending. I did 0 actions; none were refused.
```

**When a call is refused.** Every refused `tools/call` is JSON-RPC error `-32040`; the message says why in words and `data.shokai` says it in fields: `refused_by` (`representative`, `door` or `gate`), `reason_code`, and the door's `act_decision`. Only a call with no seat is told "get a seat first". A tool outside the seat says so and lists what the seat allows; a spending act with no amount is asked for one; an amount in another currency, or past what's left of the limit, says that. Messages that start with `not sent:` come from your own representative, which checks the seat's tools and what remains of the mandate before sending (set `visit.checkSeatLocally = false` or `visit.checkMandateLocally = false` only to test a door's own enforcement).

**Things a place gives you.** If a tool returns something signed, such as a visit stamp, the representative keeps it, checks it against the listing's `principal_id`, and lists it in the report under `brought_back` (with the envelope, or `report("en-US", { broughtBack: "reference" })` for only its digest); the readable report says what it brought back and whether it verified.

From here: `client.listTools()` shows each tool's `inputSchema`, so you know what arguments to pass; to spend, ask for purpose `purchase` with a limit, as in step 4. Some places give seated visitors something to take home, such as a signed visit stamp; see *Visit stamps* in the docs (Concepts). To check the door you visited, run step 5's command with its base URL; with a URL, `--vectors` checks the runner's own crypto, not the door's.

## What just happened

1. **Arrive.** Any arrival gets an answer. A caller with no seat gets `not_now` and the door's address, never a bare refusal (§3).
2. **Check the place.** Before asking anything, the representative checked that every reply was signed by the representative the listing names, and that the place's card was signed by the listing's principal and proved possession of its key in this visit (§3.1, "Pointers are hints"). A mismatch would have ended the visit with nothing asked.
3. **Introduce itself and ask.** The representative greeted, introduced itself with a card its owner signed with a passkey (no vouch: a self-introduction, the normal case), proved it holds the card's key, and asked for `menu.view` inside a mandate its owner signed (§3.2, §4, §5).
4. **Answer.** The door decided on signed facts only (prose never reaches the decision) and seated it for exactly what it asked, no wider (§6, §7).
5. **Act within limits.** Each MCP `tools/call` carried a signed act for that seat. The gate checked the signature, the seat, the tool, the arguments, freshness and single use, and counted each spending act's `amount` against the seat's cap (§7.2).
6. **Report home.** The representative wrote its owner a report from machine fields: what it did, what it spent, and what it shared (its card, the mandate, the acts' arguments), quoting anything the place said as untrusted (§8.2).

The development passkey in `createRepresentative` stands in for the owner's real passkey. In production the owner signs cards and mandates on their own device, and the representative never holds the owner's key (Appendix A.1).

Section numbers (§3.1, §7.2, Appendix A.1) and check ids (C104, C174) refer to the specification. You have it wherever you have Shōkai:

- **In the package:** `node_modules/@kigenka/shokai/spec/SPEC.md`, with the types (`protocol-shapes.ts`), the conformance checklist (`conformance/golden-traces.md`), the extensions and the threat model next to it.
- **In the docs:** the *Specification* section renders the same text.
- **In the source repository:** `SPEC.md` at the top level.

## Next

- Read the specification: `SPEC.md` (see above). Its first page tells the whole story in one table.
- The SDK and the MCP gate: the package's `README.md` (`node_modules/@kigenka/shokai/README.md`). A runnable example ships with it: `node node_modules/@kigenka/shokai/dist/examples/toy-mcp/run.js`.
- The threat model: `THREAT-MODEL.md`, next to `SPEC.md`.
- Host it for real: `deploy/HOST-A-PLACE.md` in the source repository takes this server to a public host (stable keys, durable state, limits, a kill switch).
