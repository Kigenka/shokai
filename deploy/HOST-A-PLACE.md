<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Host a real place

Your door is where your place's host representative greets visiting representatives. The door checks what it can verify and decides on signed facts, and always explains. Anonymous visiting representatives, agents that aren't ready, get your leaflet (the lobby briefing) and a kind "not now", so their owner learns how to come back ready. Most visiting representatives will simply introduce themselves; you decide where, if anywhere, you also ask for a vouch.

This guide takes the [quickstart](../QUICKSTART.md)'s door and makes it ready for a public host: a stable identity, state that survives restarts, limits at the edge, and a kill switch. It borrows the lockdown from the [demo place](demo-place/README.md). The code below is tested: `npm run quickstart` runs it, visits it and runs the conformance checks against it.

This page is the developer server guide — how to run the door process. The owner-facing path in 0.5 is a conversation: an [installer skill](../docs/skills/index.md) (a draft) helps the owner set up and customize the door, the owner signs the Shōkai host card with their passkey (the owner key never sits on an agent server), and the conversation hands off to an appointed host representative ([host skill](../docs/skills/index.md), also a draft). Briefing continues there. Owner-facing notes: [Setting up a place](../drafts/package-0.5/setting-up-a-place.md) and [Prepare your host representative](../docs/prepare-your-host-representative.md).

## What you need

- **Node.js 22 or later**, and a host that runs **one long-lived process with a persistent disk**: a small VM, a container with a volume (for example a Fly.io Machine with a volume, as [DEPLOY.md](DEPLOY.md) plans for the demo), or any service that keeps a directory between restarts.
- **A domain with TLS** in front of the process (a proxy such as Caddy or your platform's edge). Places are reached over `https` only.
- Not a fit as is: stateless functions with no shared disk. The door would lose its ledgers on every cold start; it refuses rather than forgets (refuse-on-loss, SPEC §3.6), so visiting representatives would keep getting `not_now`.

For how long the address should live (a 60-minute pop-up, a quick link, or a fixed address), see [docs/place-addresses.md](../docs/place-addresses.md) (guidance only).

## 1. The server

Save this next to your project as `place.mjs`, and copy [`demo-place/keys.mjs`](demo-place/keys.mjs) beside it. The MCP part, the door's purposes and actions, and `PRICES` are the quickstart's; replace them with your own tools.

```js file=place.mjs
// place.mjs: the quickstart's server, ready for a public host.
import http from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDoor } from "@kigenka/shokai";
import { shokaiGate, statelessMcp } from "@kigenka/shokai/mcp";
import { loadOrCreateKeys } from "./keys.mjs";

const env = process.env;
const PORT = Number(env.PORT ?? 8080), HOST = env.HOST ?? "127.0.0.1";       // HOST=0.0.0.0 only behind your TLS proxy
const PUBLIC_URL = (env.PUBLIC_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const DATA_DIR = env.DATA_DIR ?? "./place-data";                             // on the persistent disk
const KEY_DIR = env.KEY_DIR ?? "./place-keys";                               // private keys: not in DATA_DIR, never committed
const KILL_FILE = join(DATA_DIR, "CLOSED");                                  // touch it to close the door at once
const RATE = Number(env.RATE_PER_MIN ?? 120), MAX_BODY = 64 * 1024;
mkdirSync(DATA_DIR, { recursive: true });

// Your MCP server (here: the quickstart's tea shop).
const PRICES = { sencha: "6.00", hojicha: "5.50", genmaicha: "5.00" };
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

const door = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },   // since v0.4.0: the person who approved this door's Shōkai host card
  name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [
    { action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
  ],
  spendingActions: ["order.place"],
  keys: loadOrCreateKeys(KEY_DIR),                       // one identity across restarts
  stateFile: join(DATA_DIR, "door-state.json"),          // ledgers, nevers, spent nonces and revocations survive restarts
  baseUrl: PUBLIC_URL + "/shokai",
  // maxEncounters: open encounters the door keeps at once (SDK default 10,000; new arrivals past it are refused, §3.4).
  // stateEpoch: only if door-state.json was lost (set STATE_LOST_AT to when it was lost)
  hostOpts: { maxEncounters: 10_000, ...(env.STATE_LOST_AT ? { stateEpoch: env.STATE_LOST_AT } : {}) },
});
const gate = shokaiGate(door, statelessMcp(buildServer));

const hits = new Map(); setInterval(() => hits.clear(), 60e3).unref();
const reply = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const server = http.createServer((req, res) => {
  if (req.url === "/healthz") return reply(res, 200, { ok: true, open: !existsSync(KILL_FILE) });
  if (existsSync(KILL_FILE)) return reply(res, 503, { error: "closed for now" });
  const ip = (env.TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "") || req.socket.remoteAddress;
  const n = (hits.get(ip) ?? 0) + 1; hits.set(ip, n);
  if (n > RATE) return reply(res, 429, { error: `at most ${RATE} requests a minute` });
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return reply(res, 413, { error: "body too large" });   // a fast path; the door's own reader also counts a chunked body's bytes (413)
  gate(req, res);
});
server.requestTimeout = 10e3; server.headersTimeout = 10e3;
server.listen(PORT, HOST, () => console.log(`door:  ${PUBLIC_URL}/shokai/places\nmcp:   ${PUBLIC_URL}/mcp`));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => server.close(() => process.exit(0)));
```

## 2. Run it

```sh
npm install @kigenka/shokai@0.5.0 @modelcontextprotocol/sdk zod
PUBLIC_URL=https://place.example HOST=0.0.0.0 TRUST_PROXY=1 DATA_DIR=/data KEY_DIR=/keys node place.mjs
npx --no-install shokai-conformance https://place.example/shokai   # the core checks against your door (from another machine, once 0.5.0 is on npm: npx -p @kigenka/shokai@0.5.0 shokai-conformance …)
```

The core checks include `seat.max_amount`: the runner is admitted with a pass with a 0.01 cap and asks for 1.00, so a door that enforces caps moves no money. The running totals (`seat.max_amount_total`, `mandate.max_amount_total`) need one admitted order and are opt-in: add `--spend <one order's amount> --spend-args '<the order's other arguments as JSON>'`, against mock money.

Put the proxy in front so `https://place.example/shokai` and `/mcp` reach the process. Then point an agent at it with [ANY-AGENT-PROMPT.md](ANY-AGENT-PROMPT.md), using your address.

## 3. What each part is for

| Part | Why | If you skip it |
|---|---|---|
| `KEY_DIR` (`rep.pem`, `principal.pem`, mode 0600) | The door's DIDs stay the same, so relationship records and reports keep meaning the same place | Every restart is a new place to every visiting representative |
| `stateFile` on the persistent disk | Mandate ledgers, `never` bindings, spent nonces, revocations (SPEC §3.6) | A restart could let an allowance be spent twice; the door instead refuses mandates from before it started |
| `STATE_LOST_AT` | If `door-state.json` is ever lost, set this to the time it was lost; mandates valid before then are refused | Same as above |
| The kill switch (`$DATA_DIR/CLOSED`) | Close the door at once, no restart: every request but `/healthz` gets 503 | You'd have to stop the process |
| Rate limit, 64 KiB bodies, 10 s timeouts | Cheap protection at the edge. Behind it, the door counts any body whose signature doesn't verify as anonymous (60 a minute per address, 600 in total), caps open encounters at `maxEncounters` (10,000 by default, set explicitly above, §3.4) and keeps only the newest 5,000 log lines | One client can tie it up. A full `shokai-conformance` run from one address can reach the default 120 a minute: raise `RATE_PER_MIN` while you test |
| `TRUST_PROXY=1` only behind your proxy | The rate limit sees the real client address | Anyone could spoof `X-Forwarded-For` |

## 4. Before you open it

- **Who may vouch for visiting representatives (optional).** Self-introduced visiting representatives are the normal case. If you ask for a vouch for actions that move money or create accounts, name your trusted introducers by DID (`trustedIntroducers`); never `"*"` there (SPEC §4).
- **What the door fetches.** To check vouches, allowances and Shōkai cards, the door fetches the revocation addresses visiting representatives name: `https` only, 2 s timeout, no redirects, and never a loopback, private or link-local address. A DNS name can still point inside your network, so give the process egress rules that block your private ranges and cloud metadata addresses.
- **Personal data.** Declare in `data_asks` everything an action will ask the owner for; visiting representatives read it before they join (§3.1).
- **Back up** `DATA_DIR` (not `KEY_DIR`) and watch `/healthz` from outside.
- **Logs.** Don't log message bodies; they can carry owners' details.
- **Signing.** Visiting representatives' owners sign with their own passkey, on their own device; your door never needs a signing page. [SIGNING.md](../SIGNING.md) is the signing profile (what an owner must see), not a hosted page. The package includes a reference signing page under `reference/signing-page/` that you can run yourself; this draft does not ship an always-on hosted signing service.

## 4a. The v0.5.0 house settings

A v0.5.0 door speaks `shokai/0.5` and still answers `shokai/0.3` visitors during the transition window (SPEC §11.1). Its v0.5.0 settings go in the house config's `policy`, inside the `house_digest` your owner signs, so changing any of them needs a new Shōkai host card (SPEC §2.3). The SDK takes them today as `createDoor({ policy: { … } })`; typed options are a follow-up.

| Setting | What it does | Rule |
|---|---|---|
| `summary` (required) | The house summary visitors read before they ask in: name, purposes, conduct rules, outside classifiers, retention, `message_cap`, offers. Served at `<entry>/house-summary.json`; its digest goes on your Shōkai host card | Every member it repeats must equal the policy, or the door won't start (§2.3, C248) |
| `conduct_rules` | Your house rules in one sentence each: registered codes or `x-` codes | Shown before admission; the door still enforces what code can check (C246) |
| `third_party_classifiers` | Each outside classifier that sees visitor content: `name`, `purpose`, `jurisdiction` (country codes), `retention_days`, `role` | Absent = none; never `"*"`; nothing goes out before the visitor's `invitation_request`, and nothing for `shokai/0.3` visitors (§6.10, C250) |
| `retention_days` | How long you keep raw visitor text and model output | Default 30, at most 90; deletion requests answered within 30 days with a receipt (§12.4, C255) |
| `limit_calls`, `hold_grace_s` | Hold a purchase above the owner's limit and let the owner approve that one purchase | Needs `purchaseHoldSeconds`; grace 0–5 s; the approval covers one act and never raises the pass's limit (§7.3, C230) |
| `repeat_caps`, `message_cap` | Bounds on repeats and messages per encounter | Positive integers (§3.4, §7.2) |
| `door_questions` | At most three questions you answered when setting up the door | §8.4, C252 |

The door refuses to start with an invalid value (SPEC §2.3, "A valid house config"). Before your owner signs, they must see the lobby text, the summary, the classifiers and the limits (SIGNING.md §9).

## 5. Rollback and closing

- Close: `touch $DATA_DIR/CLOSED`. Reopen: remove it.
- Roll back: run the previous version against the same `DATA_DIR` and `KEY_DIR`. The state file is versioned (`"v": 1`); copy it before an upgrade.
- Retire: close it, keep `DATA_DIR` for as long as your mandates and `never` bindings run (up to 180 days), then delete the keys.

What this guide doesn't cover yet: a `did:web` identity for your organisation (the SDK's door uses `did:key`), running more than one process per door, and a key-file helper in the SDK itself (`keys.mjs` fills that gap).
