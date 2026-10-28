# Examples

Working doors and visitors you can run, and annotated visits you can read. Every person, business and place in them is fictional, and every example is **non-normative**: where an example and [SPEC.md](../SPEC.md) disagree, the spec wins. Written for v0.3.0.

**New here?** Run `shokai demo` (below), then read [How Shōkai works](../docs/how-it-works.md): a tea shop, a stranger who gets the leaflet, and a representative that introduces itself and buys a green tea within its owner's limit.

## The main examples, each with a diagram from a real run

Each page is a short story, one sequence diagram drawn from a recorded run (a field test, a simulated-team wire log, or a reference run you can repeat), and what it shows. [traces/](traces/README.md) says where each diagram came from.

| Example | Kind of place | The diagram is drawn from |
|---|---|---|
| [Tea shop](tea-shop.md) | Shop | A field test: a Muse representative seated at Willowfold Tea House, from the place's own transcript |
| [Store](store.md) | Shop | A wire log: two simulated teams, a purchase within a limit and one refused past it |
| [Bank](bank.md) | Bank | A wire log: a transfer, then a revisit the bank counts under the same mandate |
| [Marketplace](marketplace.md) | Marketplace | A wire log: turned away with the leaflet, then back prepared and seated |
| [Community room](community-room.md) | A gathering | A reference prototype run (transcript 07): discretion and a report home |
| [Brand door](brand-door.md) | A person's own door | A reference run you can repeat ([traces/brand-door.mjs](traces/brand-door.mjs)) |
| [One representative, two roles](dual-role.md) | A person's meeting room, and a tea shop | An SDK run you can repeat ([traces/dual-role.mjs](traces/dual-role.mjs)) |

## Run it

| Example | What it shows | Where | Run |
|---|---|---|---|
| **The two-second visit** | A tea shop (*Kettle & Leaf*) and a visitor on your machine: the ritual, a seat, an order within a 10.00 USD limit, an order past it refused, the report home | [`packages/shokai/src/cli.ts`](../packages/shokai/src/cli.ts) | `npx @kigenka/shokai demo`; from this repo: `cd packages/shokai && npm run demo` |
| **Quickstart tea shop** | Your MCP server plus a Shōkai door; a visitor that spends within a mandate and comes back for a second visit; the conformance check | [`QUICKSTART.md`](../QUICKSTART.md), code in [`packages/shokai/examples/quickstart/`](../packages/shokai/examples/quickstart/) | `npm run quickstart` (runs QUICKSTART.md as written) |
| **A gate in front of any MCP server** | Three note tools behind a Shōkai door; `tools/list` narrowed to the seat; every call a signed act | [`packages/shokai/examples/toy-mcp/`](../packages/shokai/examples/toy-mcp/) | `cd packages/shokai && npm run example` |
| **A door ready for a public host** | Stable keys, state that survives restarts, edge limits, a kill switch | [`deploy/HOST-A-PLACE.md`](../deploy/HOST-A-PLACE.md), [`deploy/demo-place/`](../deploy/demo-place/) | see the guide |
| **The reference place server** (*The Engawa*) | The whole core and the stable extensions: lobby, gate, seats, misconduct, the inbound door, gatherings, peer meetings | [`reference/engawa/`](../reference/engawa/) | `npm run setup && npm test` |
| **The reference signing page** | An owner makes a passkey and approves, item by item, what their representative asks them to sign | [`reference/signing-page/`](../reference/signing-page/README.md) | `node reference/signing-page/test/e2e.mjs` (software authenticator) |

## Read it: annotated visits

| Example | Kind of place | Shows |
|---|---|---|
| [The tea shop, the first walkthrough](../scenarios/places-first.md#the-tea-shop-the-first-walkthrough) | Shop | Self-introduction, the leaflet for a stranger, a purchase within a signed limit |
| [A personal representative at a bank](../docs/examples/harborlight-bank.md) | Bank | Cards both ways, a standing allowance, a narrow seat, a transfer taken home |
| [Look before you join](../docs/examples/look-before-you-join.md) | Any | An anonymous look at the listing; the leaflet's plain sentences for the owner |
| [An employee's co-worker agent](../docs/examples/enterprise-coworker.md) | A company's internal tools | A company-vouched role; a gate in front of internal MCP servers |
| [Pressure declined and reported](../docs/examples/pressure-declined.md) | A person's own door | Hidden text, false urgency, a misconduct notice |
| [A friend introduces a brand](../docs/examples/brand-door.md) | A person's own door | The optional vouch, paid or genuine |
| [One representative, two roles](../scenarios/dual-role.md) | A person's meeting room, and a tea shop | Two cards from one owner: keeping the door and going out |
| [Places first: six everyday scenarios and the room](../scenarios/places-first.md) | Store, marketplace, bank, community | Browsing, buying later within a limit, a cold gift purchase, a marketplace guide, an existing bank customer, a referral trail, representatives meeting in a room; with the gaps rc4 leaves |

## By kind of place

| Place | Read | Run or trace |
|---|---|---|
| **Shop** | the tea shop; [places-first (a)–(c)](../scenarios/places-first.md#a-browsing-a-store-no-purchase) | `shokai demo`; the quickstart; transcript [03, store and fashion house](../reference/prototype/transcripts/03-store-and-fashion-house.md) |
| **Bank** | [Harborlight Bank](../docs/examples/harborlight-bank.md); [places-first (e)](../scenarios/places-first.md#e-an-existing-bank-customers-representative-checks-a-balance-or-makes-a-transfer) | transcript [04, taking it inside](../reference/prototype/transcripts/04-bank-considering.md); golden traces G5a, G5b |
| **Community and gatherings** | [places-first (g), the room](../scenarios/places-first.md#g-the-room-representatives-meeting-inside-a-place); [Gatherings](../extensions/gatherings.md) | transcript [07, a gathering at The Engawa](../reference/prototype/transcripts/07-gathering-at-the-engawa.md) |
| **Marketplace** | [places-first (d)](../scenarios/places-first.md#d-the-stores-agent-as-a-guide-and-a-marketplace-guiding-to-different-areas) | (no runnable example yet) |
| **A person's own door** | [brand door](../docs/examples/brand-door.md), [pressure declined](../docs/examples/pressure-declined.md), [dual role](../scenarios/dual-role.md) | SPEC §10; the reference's brand-door suite |
| **Two friends' representatives** | [Peer meetings](../extensions/peer-meetings.md) | transcript [02, peer collaboration](../reference/prototype/transcripts/02-peer-collaboration.md) |
| **Teaching** | [Teaching visits](../extensions/teaching-visits.md) | transcript [06](../reference/prototype/transcripts/06-teaching-visit.md) |
| **Misconduct** | [pressure declined](../docs/examples/pressure-declined.md) | transcript [05](../reference/prototype/transcripts/05-misconduct-and-revocation.md); golden trace M1 |

## Byte-exact references
- [Golden traces](../conformance/golden-traces.md): every core scenario as signed messages, with the checks each one proves.
- [Test vectors](../conformance/test-vectors.json): JCS, digests, Ed25519, passkey assertions, amounts, locales.
- [Narrated transcripts](../reference/prototype/transcripts/README.md) from the reference prototype.

## Not here yet
- A runnable bank or marketplace door (the bank exists as a read-through, a transcript and traces).
- The platform recipes (Grok Bot, OpenClaw, Hermes Agent and others) are in [docs/platforms/](../docs/platforms/README.md), as drafts.
- A page about the tests behind this release (field tests, clean-room implementations, red-team rounds) is planned.
