# Quickstart: put a Shōkai door in front of an MCP server

The rest of this page is the **by-hand** path: you type the commands and can read every function. In about ten minutes you will run an MCP server behind a Shōkai door (your place, with its own host representative), send a visiting representative to it, watch it present its Shōkai visitor card and get a pass, call tools within its pass, make a visit that spends within a limit, and run the conformance checks. Everything runs on your machine; nothing is sent anywhere.

If you would rather have an assistant walk you through planning a place, see the labeled draft [installer skills](drafts/package-0.5/installer-skills/README.md). Those drafts were rehearsed in conversation; they are not a finished installer, and they are not in the published `@kigenka/shokai` package.

## Pass vs `seat` (canonical) {#pass-vs-seat}

**One rule:** in prose, these docs say **pass**. On the wire and in the SDK the field is **`seat`**. They name the same grant: the tools and limits the door gave this visit, never wider than policy ∩ mandate ∩ request.

| Layer | Name | Notes |
|---|---|---|
| **Prose / diagrams (human)** | **pass** | The place's grant: tools and limits no wider than policy ∩ mandate ∩ request |
| **Wire / SDK / JSON** | **`seat`** | Field name on the invitation response and related messages |
| **Report line home** | *admitted me with a pass* | The same grant, in the words the representative takes home |
| **Door messages, some code comments** | *pass* from 0.5.1 ("Your pass is ready", "within this pass") | 0.5.0 said *seat* in those courtesy lines; 0.5.1 says *pass*. Courtesy text is free text, so either is fine on the wire. Some code comments and the recorded golden traces still say *seat* |

Samples that print `seat:` are showing the field name. Prefer **pass** / “admitted with a pass” in new prose. The wire name stayed `seat` so existing implementations and traces keep working. How versions relate is on the compatibility page and in [CHANGELOG.md](CHANGELOG.md).


You need Node.js 22 or later.

**Where a Shōkai visit works.** A visiting representative can make a Shōkai visit only at a place that runs a Shōkai door. Anywhere else it is treated like any other agent, and is often turned away. There is no public demo place yet, so today that means the door you run yourself in steps 2 to 4, or a door someone else has set up.

**Two jobs on the by-hand path.** Everyone who is putting a door in front of a server starts with step 1.

- **Run a place (host representative):** steps 2 to 5. You put a door, with its host representative, in front of an MCP server, visit it, and check it against the protocol.
- **Send a visiting representative:** [step 6](#6-visiting-a-place-someone-else-runs-the-visiting-representative-path). You visit a place someone else runs, with no server of your own.

**Two addresses, not to mix up.** A door's **base URL** ends in `/shokai` (for example `http://127.0.0.1:3000/shokai`): it's what `findPlace` and `shokai-conformance` take. Its **place listing** is that base plus `/places` (`http://127.0.0.1:3000/shokai/places`): the JSON you can read to see what the place offers. The listing is the place's agent front, not the door itself; the door is where the listing's `entry` points. Write the base URL without a trailing slash; `findPlace` and `shokai-conformance` accept `…/shokai/` too, and a listing's own `door` field may show it with one. Both name the same door.

## 1. Make a project (1 minute)

You are making a folder on your machine and installing the Shōkai package, plus the MCP SDK your door will sit in front of. Nothing is published, and nothing leaves this folder.

**Tested with** (November 5, 2026, re-checked against the published `@kigenka/shokai@0.5.0` on November 10, 2026, and against the 0.5.1 package file on November 11, 2026): Debian GNU/Linux 13 (Linux 6.12), Node.js 24.22.1, npm 11.21.1, `@modelcontextprotocol/sdk` 1.32.2, `zod` 4.6.7, and `@kigenka/shokai@0.5.1`. The versions above are pinned to what was tested. **macOS is untested** (the commands are standard POSIX and should work, but nobody has run them there yet). The stated minimum is **Node.js 22** (`engines`); CI runs Node 22 and 24.

```sh
mkdir shokai-quickstart && cd shokai-quickstart
npm init -y && npm pkg set type=module
npm install @kigenka/shokai@0.5.1 @modelcontextprotocol/sdk@1.32.2 zod@4.6.7
```

This walkthrough uses **Zod 4** (`zod@4.6.7`), required by the pinned MCP SDK — not Zod 3.

The package digest is recorded in [release/kigenka-shokai-0.5.1.sha256](release/kigenka-shokai-0.5.1.sha256) (0.5.0's in [release/kigenka-shokai-0.5.0.sha256](release/kigenka-shokai-0.5.0.sha256)).

## Run a place (host representative)

Steps 2 to 5: your place, its door and its host representative, then a visit and a check.

### 2. The server: your MCP server, plus a door (3 minutes)

You start a small fictional tea shop and hang a Shōkai door in front of it. The shop (the MCP server) knows the menu and how to take an order. The door decides who may come in, for what, and which actions spend money. A visiting representative can read those rules from the public listing before it knocks.

Save this as `server.mjs`. The MCP part is the official MCP TypeScript SDK, unchanged. The door says which purposes the place serves, which actions a visiting representative with a pass may take, which of them spend money (`spendingActions`), and what personal data each action will ask the owner for (`data_asks`, so a representative can look before it joins).

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

// The door: who may be admitted, for what, which actions spend, and what each action will ask the owner for.
const door = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },   // the person who approved this door's Shōkai host card
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

Start it and leave it running. You should see two addresses: the place listing (`/shokai/places`) and the MCP server (`/mcp`). Keep this terminal open for the later steps.


```sh
node server.mjs
```

### 3. A visiting representative arrives (3 minutes)

A second program acts as Aya Linden's agent representative. First it tries the shop without a Shōkai visitor card and is turned away. Then it presents the Shōkai visitor card; the door shows the Shōkai host card and checks both; Aya's representative says why it came (look at the menu, no spending); and the door grants a **pass** for `menu.view` only. An order is refused because it was never in that pass. At the end the representative writes a report home.

In a second terminal, in the same folder, save this as `visit.mjs`:

```js file=visit.mjs
// visit.mjs: Aya Linden's representative arrives, gets a pass (wire: seat), and uses the MCP server within it.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const base = process.env.BASE ?? "http://127.0.0.1:3000";

// 1. Without a pass (wire: seat), a tool call is refused, with directions to the door.
const stranger = new Client({ name: "stranger", version: "1.0.0" });
await stranger.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp")));
await stranger.callTool({ name: "menu.view", arguments: {} }).catch((e) => console.log("stranger:", e.message));

// 2. A representative with a card its owner signed (a development passkey here; a real passkey in production).
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["menu.view"] });

// 3. Look before you join: the listing says what spends money and what each action will ask the owner for.
const place = await findPlace(base + "/shokai", "tea-shop");
for (const a of place.actions) console.log(`listing: ${a.action}${a.spends ? " (spends)" : ""} asks for ${a.data_asks.join(", ") || "nothing"}`);

// 4. The ritual: greeting, signed Shōkai visitor card, the door's Shōkai host card, a request within a mandate Aya signed.
//    Before it asks anything, the SDK checks the place's card against the listing entry it followed.
const visit = await aya.visit(place, { purpose: "visitation", actions: ["menu.view"], why: "Aya wants to see today's teas." });
console.log("place checked:", visit.placeCheck.ok, "| decision:", visit.decision, "| seat:", visit.seat?.tool_allowlist);

// 5. The same MCP client, with a fetch that signs an act for each tool call.
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("tools in my pass (wire: seat):", (await client.listTools()).tools.map((t) => t.name));
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
stranger: MCP error -32012: This MCP server is behind a Shōkai door: get a pass first, then send each tools/call with a signed act (Shokai-Act header)
listing: menu.view asks for nothing
listing: order.place (spends) asks for nothing
place checked: true | decision: grant | seat: [ 'menu.view' ]
tools in my pass (wire: seat): [ 'menu.view' ]
menu.view: sencha 6.00, hojicha 5.50, genmaicha 5.00
order.place: MCP error -32012: not sent: order.place is not in this pass (it allows menu.view)
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) admitted me with a pass for "menu.view", no spending. I did 1 action; 1 was refused.
```

The report names the place by what the visit verified, its key (new on every run, so yours ends differently), and its display name only as a claim ("claims to be"): a door can call itself anything (SPEC §2.1, C199).

`order.place` was refused because it wasn't in the pass: a `visitation` visit is for looking and never spends. `not sent:` means Aya's own representative stopped it before sending, because it checks the pass's tools first; sent anyway (`visit.checkSeatLocally = false`), the door refuses it with `order.place is not in your pass (it allows menu.view)`.

### 4. A visit that spends, and a second visit (2 minutes)

Now the errand is a purchase. The thing that is meant to be short is the **mandate** — the owner's signed word for this errand, including a 10.00 USD limit — not the Shōkai visitor card itself. Each spending act must state its amount. The limit is for the whole errand, not for each visit: a second visit for the same errand presents the same mandate, and what's left carries over. Save this as `spend.mjs`:

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

// The limits go into the mandate Aya signs and into the request; the pass is never wider than either.
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
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) admitted me with a pass for "menu.view" and "order.place", up to 10.00 USD. I did 0 actions; 1 was refused. This was visit 2 under the mandate you signed. Earlier: here, 1 action done, 1 refused, 6.00 USD spent. In all under this mandate: 1 action done, 2 refused; spent 6.00 USD of the 10.00 USD allowed, 4.00 USD left.
```

What happened:

- **Amounts.** The door counts each spending act's `amount` (`{value, currency}`, exact decimals) against the limit, and refuses a spending act that doesn't state one. Checking the amount against the real price is your tool's job, as `order.place` does above.
- **One allowance per mandate.** The limits Aya signed bind the mandate across every visit while it's valid (§5.1). The representative keeps a ledger per mandate and doesn't send an act its owner no longer allows; the door counts the mandate too, so the same act sent anyway is refused (`SEAT_SCOPE_EXCEEDED`). A new mandate is a new allowance: `mandate: { fresh: true }` has one signed.
- **One report for the errand.** The report home covers every visit and act under the mandate (`under_mandate` in the report), so the earlier visit isn't lost (§8.2).
- **Across runs.** The ledger lives in memory unless you pass `ledger: fileLedger("ledger.json")` to `createRepresentative`. The development passkey is new each run, so each run of this script is, to the door, a new owner with a new mandate; a real owner signs once on their device and the representative keeps that mandate and its ledger.

Other limits work the same way: `max_operations`, `max_session_s` (per pass), and `max_amount_scope: "per_operation"` with `session_max_amount`.

### 5. Check your own door against the protocol (1 minute)

This checks **your own door**, the host side: your place and its host representative, against the protocol. The runner knocks as a visiting representative and tries the attacks every door must refuse (a request before the Shōkai visitor card, a reused nonce, a message changed after signing, someone else's Shōkai card). It sends those on purpose, so run it only against a door you run, never against a place someone else runs.

With the server still running:

```sh
npx --no-install shokai-conformance http://127.0.0.1:3000/shokai --ext visit-receipts --vectors
```

(`--no-install` makes `npx` use the copy you installed in this folder and never fetch a package of that name from the registry.)

You should see, at the end (abridged; captured from @kigenka/shokai@0.5.1 against the step 2 server):

```text output=conformance
Shōkai conformance: http://127.0.0.1:3000/shokai  (spec 0.5.0, wire shokai/0.5)
core
  → 38 pass, 0 fail, 0 warn, 2 skip, 0 N/A
core: the MCP binding (§11.3; only where the place serves MCP)
  → 8 pass, 0 fail, 0 warn, 0 skip, 0 N/A
core: v0.5.0 (C230–C255; a place on spec 0.5.0)
  → 21 pass, 0 fail, 0 warn, 5 skip, 12 N/A
extension: visit-receipts (optional; doesn't affect the core verdict)
  → 1 pass, 0 fail, 0 warn, 0 skip, 0 N/A
vectors (run against this runner's own crypto, NOT the door …)
  → 8 pass, 0 fail, 0 warn, 0 skip, 0 N/A
Core: all core checks that ran passed; 7 skipped, 12 not applicable (with their basis above).
```

**What this result lets you claim.** Exit status `0` with "all core checks that ran passed" is the runner's **black-box core verdict** for this door. It is **not** yet a named conformance claim. Named claims are optional; the box below explains them.

<details><summary>Going further: named conformance claims (<code>--claim</code>), which print NOT ESTABLISHED here by design</summary>

Named claims are conformance classes (SPEC §0.1, C290: for example `Core Door`, or the presets `browse` and `shop`), measured with `--claim`. For example:

```sh
npx --no-install shokai-conformance http://127.0.0.1:3000/shokai --claim browse
```

Against the step 2 server this prints `Claim: NOT ESTABLISHED`, and that is expected. Some checks in each class run only **in process** (host farewell, revocation under storage pressure, passkey counters, config refusals). A black-box URL run can't see those, so the claimant has to pass `--evidence <file>` **and** `--accept-evidence-exec` (or set `SHOKAI_ACCEPT_EVIDENCE_EXEC=1`), naming its own tests for them. Warning: the runner then executes the commands in that file on your machine; use it only in an environment you trust. The file is JSON: each in-process check names a PATH program and a test file inside the implementation directory. A pass is that command's exit 0, not an independent verification. For example (illustrative; the test names are yours):

```json
{ "implementation": "my-door 1.2.0",
  "checks": { "v050.host_farewell": { "command": "node", "test": "test/farewell.test.js" },
              "v050.config_refusals": { "command": "node", "test": "test/config.test.js" } } }
```

Skipped checks never count as passes. A complete established run, on the reference door with its real evidence file, is shown on [Compatibility and versioning](https://shokaiprotocol.com/releases/compatibility#named-claim). So after this step a door may say only what ran: **"passed every Shōkai 0.5.0 core check that ran black-box (7 skipped, 12 not applicable)"**, with the counts from its own run, and **"conforms to Core Door"** (or `browse`, `shop`) only when `--claim` prints `Claim: ESTABLISHED`.

</details>

Schemas for non-TypeScript implementers: [JSON Schema v0.5.0](https://shokaiprotocol.com/raw/schema.json) · [TypeScript shapes](https://shokaiprotocol.com/raw/protocol-shapes.ts) · [golden traces](https://shokaiprotocol.com/examples/#downloads).

**Reading skip and N/A.** *Skip* means the check needs something this run didn't provide: the two running-total checks need `--spend` (below), and the hold and trust checks need a door configured with holds or trust requirements, which the step 2 server isn't. *N/A* means the feature isn't declared by this door (for example closed templates, errand budgets, a site binding), so there is nothing to test. Each line in the full output names its basis. Neither counts as a pass.

The runner visits your door as an anonymous visiting representative and as a prepared visiting representative, checks the place against its listing the way a visiting representative must, and tries the attacks every revision must refuse (a request before the Shōkai card, a reused nonce, a message changed after signing, someone else's Shōkai card). Extension levels are opt-in with `--ext` (`visit-receipts`, `signed-listings`, or `all`).

`--vectors` runs the normative test vectors. Against a URL they run on the **runner's own crypto**, because a door's crypto can't be reached over HTTP; the output says so. A passing vectors section then says nothing about the door: only the core and extension checks are about the door. To test your own implementation's crypto, pass a module instead of a URL: `npx --no-install shokai-conformance ./my-door.js --vectors`, where the module exports `door` (or `createDoor` or `handler`) and `implementation` (its digest, signature, timestamp, money, locale and did:jwk functions).

## Send a visiting representative

Step 6: the visiting representative side, at a place someone else runs.

> **Practice places are coming.** Two public practice places are planned: one without Shōkai, and one with a Shōkai door, so a visiting representative can see the difference. They aren't open yet; until then, use your own door from steps 2 to 4, or a door someone has set up.

### 6. Visiting a place someone else runs (the visiting representative path)

You don't need a server of your own to visit a place. This script is a visiting representative only: it reads the listing, asks for a pass for the actions that spend nothing, and lists the tools in that pass. You need the door's base URL (ending in `/shokai`) and, if the door lists more than one place, the place's `name`.

- **`name` vs `display_name`.** Each listing entry has a `name`, a short machine slug (`tea-shop`), and a `display_name` for people ("Kettle & Leaf"). `findPlace(base, name)` takes the base URL and the `name`; leave the name out to get the listing's first place.
- **Its actions are its own.** A place lists its own actions (`menu.view`, `tea.ask`, `order.place`, ...), what each spends and what it will ask for. Read them from the listing; don't assume the names in this quickstart.
- **Shōkai card scope vs mandate.** `createRepresentative({ purposes, actions })` sets the scope of the representative's **Shōkai card**: everything it may ever ask for on its owner's behalf, signed once. Each `visit()` carries a **mandate**: one purpose, the actions for this errand (within the Shōkai card's scope) and its limits, signed for this errand. A visit can ask for less than the Shōkai card allows, never more; a mandate beyond its Shōkai card is refused (`MANDATE_INVALID`). The script below builds both from the listing only to stay short.

- **Test owner: local or test doors only.** `createRepresentative({ ownerName })` with no `owner` or `card` signs with `developmentPasskey()`, a software stand-in whose `rp_id` is the reserved `owners.example`. A door on loopback (like step 2's) or in the test profile admits it. A correctly configured public door (https, not loopback) refuses it before any pass: the visit ends `not_now` and the door's log says `rp_id owners.example is an RFC 2606 reserved name (a development passkey)`. To visit a public door, the owner signs the Shōkai card with a real passkey (the signing page, [SIGNING.md](SIGNING.md)) and you pass it in: `createRepresentative({ card, ... })`, or `createRepresentative({ owner, ... })` with the owner's passkey signer ([docs/build-a-visitor.md](docs/build-a-visitor.md)). `shokai visit <url>` uses the test owner too, so it is for demo and test doors only.

Save this as `visitor.mjs`; it reads any door's listing, asks for a pass for the actions that spend nothing, and lists the tools in its pass:

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
if (!free.length) {
  console.error("This place lists no free (unpaid, no-introduction) actions a visitor can try without spending. Pick a different place, or ask the owner for a mandate that covers a spending action.");
  process.exit(1);
}
const purpose = free.some((a) => a.purposes.includes("visitation")) ? "visitation" : free[0].purposes[0];
const actions = free.filter((a) => a.purposes.includes(purpose)).map((a) => a.action);
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: [purpose], actions });
const visit = await aya.visit(place, { purpose, actions, why: "Aya wants to look around." });
console.log("place checked:", visit.placeCheck.ok, "| decision:", visit.decision, "| seat:", visit.seat?.tool_allowlist);

// The MCP endpoint: a `links` hint with rel "mcp-server" on the door's own origin, else <origin>/mcp. Links are hints, so
// a representative only sends the acts in its pass to the same origin as the door's entry.
const origin = new URL(place.entry).origin;
const hint = place.links?.find((l) => l.rel === "mcp-server" && new URL(l.href).origin === origin)?.href;
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(hint ?? origin + "/mcp"), { fetch: shokaiFetch(visit) }));
console.log("tools in my pass (wire: seat):", (await client.listTools()).tools.filter((t) => visit.seat?.tool_allowlist.includes(t.name)).map((t) => t.name));

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
tools in my pass (wire: seat): [ 'menu.view' ]
report: The place with key …h5YFQaB5 (claims to be "Kettle & Leaf"; not verified) admitted me with a pass for "menu.view", no spending. I did 0 actions; none were refused.
```

**When a call is refused.** Every refused `tools/call` is JSON-RPC error `-32012`; the message says why in words and `data.shokai` says it in fields: `refused_by` (`representative`, `door` or `gate`), `reason_code`, and the door's `act_decision`. Only a call with no pass is told "get a pass first" (0.5.0 said "get a seat first", the wire word). A tool outside the pass says so and lists what the pass allows; a spending act with no amount is asked for one; an amount in another currency, or past what's left of the limit, says that. Messages that start with `not sent:` come from your own representative, which checks the pass's tools and what remains of the mandate before sending (set `visit.checkSeatLocally = false` or `visit.checkMandateLocally = false` only to test a door's own enforcement).

**Things a place gives you.** If a tool returns something signed, such as a visit stamp, the representative keeps it, checks it against the listing's `principal_id`, and lists it in the report under `brought_back` (with the envelope, or `report("en-US", { broughtBack: "reference" })` for only its digest); the readable report says what it brought back and whether it verified.

From here: `client.listTools()` shows each tool's `inputSchema`, so you know what arguments to pass; to spend, ask for purpose `purchase` with a limit, as in step 4. Some places give admitted visiting representatives something to take home, such as a signed visit stamp; see *Visit stamps* in the docs (Concepts). Step 5's checks are for your own door; don't run them against a place you only visit.

## What just happened

Eight steps, in order. Each is tagged with the side that acts: the **visiting representative** (your visiting representative from step 3), the **Shōkai door** (your door from step 2), the **host representative**, or **both**. Shōkai has rules for both sides of the door.

1. **At the doorstep** · *visiting representative.* It read the place's public listing: what the place is, what it offers, and what each action asks for. The door serves this listing to any agent; reading it needs no Shōkai card, key, signature or account. The door identifies no one, and no host conversation starts yet; the place keeps nothing about the reader beyond ordinary rate limits (§3.1). An agent with no Shōkai visitor card gets the place's leaflet and a kind `not_now` (§3.3).
2. **Knock, and the door checks who's there** · *the Shōkai door.* It greeted the door, presented the Shōkai visitor card its owner signed (here with the development passkey), and proved it holds that Shōkai visitor card's key for this door and this visit. The place showed its own Shōkai host card and proved it still holds its key. Both sides now knew who they were dealing with. The visitor stepped into the entryway; it wasn't admitted yet. A mismatch would have ended the visit with nothing asked (§3.1, "Pointers are hints"; §2.4, §3.2).
3. **Welcome** · *host representative.* The host representative greets the visitor in the place's own style, and may ask a few questions to understand the visit. The host does not check the Shōkai visitor card, and does not hand over the leaflet.
4. **Say why it came** · *visiting representative.* It stated its purpose and the limits its owner signed, asking for `menu.view` inside its mandate (§5). Those limits are the owner's signed word for this visit, separate from the Shōkai visitor card.
5. **Decide and explain** · *the Shōkai door.* Now that it knew why the visitor came, the door answered `grant`. The other answers are `conditional`, `not now` or `not a fit` (with a reason and a way to retry), or `considering` (taken inside to a person). `never` is kept for misconduct. Conversation alone doesn't decide (§6).
6. **The pass** · *the Shōkai door.* This is where the visitor was truly admitted, for exactly what was asked and allowed, nothing more: the pass is *policy ∩ mandate ∩ request* (§7.1). A tool call with no pass gets `not_now` and the door's address, not a bare refusal.
7. **Complete the visit** · *visiting representative.* Each MCP `tools/call` carried a signed act for that pass. The door checked the signature, the pass, the tool, the arguments, freshness and single use, and counted each spending act's `amount` against the pass's cap (§7.2).
8. **Report home and the record** · *both.* The visiting representative wrote its owner a report from machine fields: what it did, what it spent, and what it shared (its Shōkai card, the mandate, the acts' arguments), quoting anything the place said as untrusted (§8.2). The door kept a local record of the visit: the encounter, the decision and the outcome (§9.1) — no shared score across places.

The development passkey in `createRepresentative` stands in for the owner's real passkey. In production the owner signs Shōkai cards and mandates on their own device, and the representative never holds the owner's key (Appendix A.1).

Section numbers (§3.1, §7.2, Appendix A.1) and check ids (C104, C174) refer to the specification. You have it wherever you have Shōkai:

- **In the package:** `node_modules/@kigenka/shokai/spec/SPEC.md`, with the types (`protocol-shapes.ts`), the conformance checklist (`conformance/golden-traces.md`), the extensions and the threat model next to it.
- **In the docs:** the *Specification* section renders the same text.
- **In the source repository:** `SPEC.md` at the top level.

## Next

- Read the specification: `SPEC.md` (see above). Its first page tells the whole story in one table.
- The SDK and the MCP gate: the package's `README.md` (`node_modules/@kigenka/shokai/README.md`). A runnable example ships with it: `node node_modules/@kigenka/shokai/dist/examples/toy-mcp/run.js`.
- The threat model: `THREAT-MODEL.md`, next to `SPEC.md`.
- Host it for real: `deploy/HOST-A-PLACE.md` in the source repository takes this server to a public host (stable keys, durable state, limits, a kill switch).
