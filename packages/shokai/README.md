# @kigenka/shokai

The reference TypeScript SDK for **Shōkai, the agent introduction protocol** (v0.3.0): signed cards, mandates, vouches and envelopes; doors and representatives; visit reports; a gate that puts a Shōkai door in front of any MCP server; and the `shokai-conformance` runner.

> Install: `npm install @kigenka/shokai`. From a package file instead: `npm install ./kigenka-shokai-0.3.0.tgz` (or build one with `npm pack` in this folder of the source repository). The quickstart (`spec/QUICKSTART.md` in this package) walks through it.
>
> **The specification ships in this package**, in `spec/`: `SPEC.md`, the types (`protocol-shapes.ts`), the conformance checklist and golden traces (`conformance/golden-traces.md`), the test vectors, the extensions, the threat model, the changelog and the patent and trademark policies. Section numbers such as §3.1 refer to `spec/SPEC.md`.

## See a visit first

```bash
npx @kigenka/shokai demo     # from a package file instead: npx --package=./kigenka-shokai-0.3.0.tgz shokai demo
```

A door and a visitor on 127.0.0.1, printed as the visit happens: the ritual, a seat, an order within a 10.00 USD mandate, an order past it refused (by the representative, and by the door when sent anyway), and the report home. About two seconds; fictional actors, keys made for the run, nothing leaves the machine.

## Put a door in front of an MCP server

The gate implements the MCP binding of the specification (SPEC §11.3): the `Shokai-Act` and `Shokai-Seat` headers, `tools/list` filtered to the seat, `-32040` refusals with `data.shokai`, and the `mcp-server` link it adds to the place's listing. Any MCP server built with `@modelcontextprotocol/sdk` keeps working as it is. The gate adds a Shōkai door at `/shokai`: a representative arrives, presents its owner-signed card and mandate, and gets a seat. Tool calls without a seat are refused with directions to the door, and each `tools/call` must carry a signed act for that exact tool and arguments. `initialize` and `tools/list` are part of the agent front, open to anyone like the listing (a seated caller's `tools/list` is narrowed to its seat); to require a seat for listings too, pass the gate an `open` function that lets fewer methods through, e.g. `shokaiGate(door, mcp, { open: (m) => m === "initialize" || m === "ping" || m.startsWith("notifications/") })`.

```ts
import http from "node:http";
import { createDoor } from "@kigenka/shokai";
import { shokaiGate, statelessMcp } from "@kigenka/shokai/mcp";
import { buildNotesServer } from "./notes-server.js"; // returns your McpServer

const door = createDoor({ name: "notes", displayName: "Lantern Notes", category: "x-tools",
  purposes: [{ code: "visitation", statement: "Reading and searching notes." }],
  actions: [{ action: "notes.search", purposes: ["visitation"], level: "discover", data_asks: [] },
            { action: "notes.read", purposes: ["visitation"], level: "discover", data_asks: [] }] });
http.createServer(shokaiGate(door, statelessMcp(buildNotesServer)))
  .listen(3000, () => door.setBaseUrl("http://127.0.0.1:3000/shokai"));
```

On the client side, the representative visits the door, then uses the ordinary MCP client with a fetch that signs each act:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRepresentative, findPlace } from "@kigenka/shokai";
import { shokaiFetch } from "@kigenka/shokai/mcp";

const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation"], actions: ["notes.search", "notes.read"] });
const visit = await aya.visit(await findPlace("http://127.0.0.1:3000/shokai", "notes"),
  { purpose: "visitation", actions: ["notes.search", "notes.read"], why: "Looking up my tea notes." });
const client = new Client({ name: "aya-representative", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3000/mcp"), { fetch: shokaiFetch(visit) }));
await client.callTool({ name: "notes.read", arguments: { id: "tea" } });
await visit.farewell();
console.log(visit.report("en-US", { timeZone: "Europe/Lisbon" }).outcome_rendered.text); // the report home, from machine fields only
```

Before it sends any request, `visit()` checks the place against the listing entry it followed (§3.1): every reply must be signed by the listed representative and carry the encounter id the visit named (§2.2), and the place's card must be signed by the listed `principal_id`, name that representative, and prove possession over this visit's nonce. On a mismatch the visit ends with nothing asked; `visit.placeCheck` says why. When the place answers before it shows its card (an early deny), nothing could be checked: `placeCheck.ok` is false and `placeCheck.unchecked` is true.

### Spending within a limit

A visit that spends asks for purpose `purchase` with a `max_amount`. The limit goes into the mandate the owner signs and into the request, and the seat is never wider than either. Each spending act states its `amount`; the door counts it against the cap and refuses a spending act without one (`REQUEST_INCOMPLETE`).

```ts
const door = createDoor({ /* … */ spendingActions: ["order.place"] }); // listed as spends: true

const visit = await aya.visit(place, { purpose: "purchase", actions: ["order.place"],
  limits: { max_amount: { value: "10.00", currency: "USD" }, max_operations: 3 },
  mandate: { statement: "Buy one tea, up to 10 USD.", validSeconds: 3600 } }); // the mandate's own scope and lifetime (default 1 day)
await client.callTool({ name: "order.place", arguments: { tea: "sencha", amount: { value: "6.00", currency: "USD" } } });
visit.report().spent; // [{ value: "6.00", currency: "USD" }]
```

A mandate's limits are for the whole errand, across visits (§5.1). The representative keeps a ledger per mandate (`rep.ledger`): a second `visit()` with the same purpose, actions and limits presents the mandate it already holds, so what's left carries over; an act beyond what's left isn't sent (the MCP call fails with `data.shokai.refused_by: "representative"`), and the door refuses it anyway (`SEAT_SCOPE_EXCEEDED`, C175). Each report covers every visit under its mandate (`report().under_mandate`, C176). Options: `useMandate` (one the owner signed on their device), `mandate: { fresh: true }` (a new allowance), and `createRepresentative({ ledger: fileLedger("ledger.json"), owner, key, card })` to continue across runs.

### Before sending, refusals, and what comes home

- **Checked before sending.** Before each act the representative checks the seat's `tool_allowlist` (`visit.checkSeatLocally`, default on) and what remains of the mandate (`visit.checkMandateLocally`, default on). An act that doesn't fit isn't sent: `visit.act()` returns `{ refused_by: "representative", by: "seat" | "mandate", why }`, and through `shokaiFetch` the MCP call fails with `not sent: …`. Turn either off only to test a door's own enforcement.
- **Each refusal says what it is.** Every refused `tools/call` is JSON-RPC `-32040` (`SHOKAI_REFUSED`, also exported as `SHOKAI_NOT_SEATED`). The `message` is specific (no seat: "get a seat first"; a tool outside the seat, with what it allows; a spending act with no amount; an amount in another currency; past what's left; an act that doesn't fit a live visit), and `data.shokai` carries `refused_by` (`representative`, `door` or `gate`), `reason_code` and, from the door, its `act_decision`. `actRefusalMessage(tool, decision, seat, args)` gives the same wording for your own gate.
- **What comes home.** A signed object a tool returns (a visit stamp, a receipt) is kept in `visit.broughtBack`, verified against the listing's `principal_id`, and reported as `report().brought_back` with its envelope (`report(locale, { broughtBack: "reference" })` for only the digest); the readable report says what was brought back and whether it verified (§8.2, C178). `visit.keep(envelope)` adds one by hand; `visit.keepSigned = false` turns it off.

### Finding a place

`findPlace(base, name?)` takes the door's **base URL**, ending in `/shokai` (a trailing slash is fine), and the place's `name` (a machine slug like `"notes"`), not its `display_name` ("Lantern Notes"). It reads the listing at `base + "/places"`; without a name it returns the first place.

A full runnable example ships compiled in the package: `node node_modules/@kigenka/shokai/dist/examples/toy-mcp/run.js`. Its source is `examples/toy-mcp/` in the source repository (`npm run example` there).

## What's in the box

| Import | What |
|---|---|
| `@kigenka/shokai` | `createDoor` (listing, entry, lobby, inbox, seats, `handleHttp`; an owner-signed `card`, `verifyDoorCard`, `withdrawCard`, `fromSigningPage`), `createRepresentative` and `Visit` (the ritual, acts, farewell, `report()`), `findPlace`, `sign` / `verifySigned`, `signCard` (`validDays`, default 180; the skills use 90), `signMandate`, `signVouch`, `generateRepresentativeKey`, `exportRepresentativeKey` / `importRepresentativeKey` (the key as one line for a keyring), `developmentPasskey` |
| `@kigenka/shokai` (owner helpers) | `signCardRevocation` (now, or `standby: true` to keep for a lost key, §2.6) and `cardRevocationMessage`, `signOwnerLink` (join two per-place identities for one place, both passkeys, ≤ 400 days, §2.8), `passkeyRequest` and `signedFromPasskeyAssertion` (server side of signing with a real passkey, A.1) |
| `@kigenka/shokai/browser` | `signWithPasskey(payload, { rpId })` in the owner's browser (WebCrypto and `navigator.credentials`, no Node built-ins), plus `jcs` and `digestOf` |
| `@kigenka/shokai/mcp` | `shokaiGate`, `statelessMcp`, `shokaiFetch`, `ShokaiGate` (the adapter), `actRefusalMessage`, `SHOKAI_REFUSED` / `SHOKAI_NOT_SEATED` (JSON-RPC error −32040 for every refusal) |

When the MCP server doesn't carry out a call the gate let through (a JSON-RPC error, a tool result with `isError`, or a 4xx/5xx with no result), the gate releases what the act counted, its operation and amount together (§7.2, C187, C194). Pass `releaseOn: "rpc-error"` for tools that may act in part before reporting `isError`, or `"never"`. Only JSON responses are inspected; with SSE responses the act stays counted.
| `@kigenka/shokai/core` | The protocol core shared with the reference place server: verification, the deterministic gate, policy, the host, the inbound door, protocol types (`import { Host, RealVerifier, SPEC_VERSION } from "@kigenka/shokai/core"`) |
| `@kigenka/shokai/conformance` | The conformance runner as a library |

`developmentPasskey()` makes a software stand-in for an owner's passkey so examples and tests run without a device. `createRepresentative()` without `owner` or `card` uses one and signs its own card (`rep.isDevelopmentOwner` is then true): never present that as the owner's signature. A real owner signs with a WebAuthn passkey (ES256, `did:jwk`); see SPEC Appendix A.1 and `SIGNING.md`.

**The signing page isn't in this package.** It lives in the source repository at `reference/signing-page/` (a small dependency-free Node server). To try it without a phone, run its own test, `node test/e2e.mjs`, where a software authenticator stands in for the phone, on loopback only.

**Keeping the representative's key.** `exportRepresentativeKey(key)` gives one line of text; keep it in the system keyring (Linux `secret-tool store`, macOS `security add-generic-password`) or, failing that, in a file only the representative can read (`chmod 600`). Load it with `importRepresentativeKey(text)`, which gives back the same `did:key`. Never print it or put it in chat or memory notes.

**A door card the owner signed (a person's door).** By default `createDoor()` signs the door's card with a place key it makes (or the `keys.principal` you pass), which suits a shop or a service. For a person's own door, have the owner sign the "my door" card on the signing page, then pass the file it wrote:

```ts
const door = createDoor({ name: "door-ines", displayName: "Ines's door", purposes, actions,
  keys: { rep: importRepresentativeKey(keyFromKeyring) },          // the representative key the card names
  card: JSON.parse(readFileSync("signed/1-door-card.json", "utf8")), // the signing page's file as is (one tap or one by one)
  ownerRpId: "sign.example.com",                                     // the signing origin you expect
  cardRevocations: [] });                                            // any withdrawal the owner signed
```

`createDoor()` verifies the card as a door verifies a visitor's (`verifyDoorCard()`). It checks the owner's passkey signature against the card's `rp_id`, including one-tap batches, plus the owner binding, the protocol, the dates, the representative key, and that the card covers the door's purposes and actions. It throws `SHOKAI_DOOR_CARD_INVALID` for a tampered or mismatched card, or `SHOKAI_DOOR_CARD_REVOKED` when one of `cardRevocations` withdraws it. The door's principal is then the owner (`door.principalId`). If the owner's signed revocation reaches the running door, delivered by anyone in a visit or handed over with `door.withdrawCard(slip)`, the door stops answering (HTTP 503, an empty envelope) and lists nothing until it's started with a new card. `fromSigningPage()` reads any item the page wrote.

## Conformance runner

```bash
npx shokai-conformance http://127.0.0.1:3000/shokai             # core checks against a running door
npx shokai-conformance http://127.0.0.1:3000/shokai --ext all   # plus Visit receipts and Signed place listings
npx shokai-conformance http://127.0.0.1:3000/shokai --vectors   # plus the test vectors, run on the runner's own crypto (a URL can't reach a door's)
npx shokai-conformance ./my-door.js --vectors                   # a module exporting door / handler / createDoor and `implementation`: the vectors run on your crypto
npx shokai-conformance --self-test                              # the test vectors against the SDK's own crypto
npx shokai-conformance http://127.0.0.1:3000/shokai --mcp http://127.0.0.1:3000/mcp   # test the MCP binding even if the listing doesn't advertise it
npx shokai-conformance http://127.0.0.1:3000/shokai --spend 6.00 --spend-args '{"tea":"sencha"}'   # plus the money totals: a conformant door admits exactly ONE such order (use mock money)
```

The verdict is the core's (the MCP binding included where a place serves MCP); extension results are reported on their own and never make a door "NOT CONFORMANT". Exit status: 0 conformant, 1 a core check failed, 3 only a requested extension failed. `--help` lists the `implementation` functions `--vectors` calls.

Each check names the SPEC section and scenario it tests. The runner covers the core from the door's side (including checking the place against its listing, `ritual.place_id`, and that it answers in the visitor's encounter, `ritual.encounter`) and the Visit receipts and Signed place listings levels; the other extensions are tested by the reference implementation's suites. The exit code is non-zero if any check that ran fails.

## Development

The protocol core in `src/core/` is generated from the reference place server (`reference/engawa/src`): don't edit it by hand. `npm run sync` regenerates it, and `npm test` fails if it drifts.

```bash
npm ci
npm test   # sync check, typecheck, SDK, MCP gate and runner tests, conformance self-test
```

## License

Apache-2.0 (see `LICENSE` and `NOTICE`, both shipped in the package). The Shōkai specification is also under Apache-2.0; a royalty-free patent commitment for final specification versions is drafted in the repository's `PATENTS.md`, and the use of the Shōkai name is covered by `TRADEMARKS.md`. The MCP SDK is an optional peer dependency, needed only for `@kigenka/shokai/mcp`.
