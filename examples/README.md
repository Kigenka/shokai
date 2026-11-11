# Runnable examples

Working doors and visitors you can run. Place stories you read, and situations and proofs, are a different set: [worked examples](../docs/examples/index.md). Every person, business and place here is fictional, and every example is **non-normative**: where an example and [SPEC.md](../SPEC.md) disagree, the spec wins. Written for specification **v0.5.0** and package **0.5.1**.

The protocol calls the grant a place gives a **pass**. On the wire the field is still `seat` in both 0.3 and 0.5. The diagrams on the main example pages were redrawn from the 11 November 2026 0.5 recordings; they say pass in the prose and `seat` only where the wire field or a reason code is shown. Use `@kigenka/shokai@0.5.1` (npm `latest` as of 11 November 2026). The public GitHub repository is [Kigenka/shokai](https://github.com/Kigenka/shokai) at v0.5.1. Some examples still need the project tree, not only the npm package.

**New here?** Run `npx @kigenka/shokai@0.5.1 demo`, then read [How Shōkai works](../docs/how-it-works.md): a tea shop, an anonymous visitor who gets the leaflet, and a representative that introduces itself and buys a green tea within its owner's limit.

**See also:** [worked examples](../docs/examples/index.md) and the [Quickstart](../QUICKSTART.md). Use cases live on the documentation site.

## The main examples, each with a diagram from a real run

Each page is a short story, one sequence diagram drawn from a recorded 0.5 run you can repeat, and what it shows. [traces/](traces/README.md) says where each diagram came from.

| Example | Kind of place | The diagram is drawn from |
|---|---|---|
| [Tea shop](tea-shop.md) | Shop | A 0.5 SDK recording (11 November 2026): Aya orders tea within a 10.00 USD limit. |
| [Store](store.md) | Shop | A 0.5 SDK recording: a purchase within a 100.00 USD limit, and one refused past it. |
| [Bank](bank.md) | Bank | A 0.5 SDK recording: a transfer, then a revisit the bank counts under the same mandate. |
| [Marketplace](marketplace.md) | Marketplace | A 0.5 SDK recording: turned away with the leaflet, then back prepared. |
| [Community room](community-room.md) | A gathering | A 0.5 recording on the protocol core: discretion and a report home. |
| [Brand door](brand-door.md) | A person's own door | A 0.5 recording on the protocol core ([traces/brand-door.mjs](traces/brand-door.mjs)). |
| [One representative, two roles](dual-role.md) | A person's meeting room, and a tea shop | A 0.5 SDK recording ([traces/dual-role.mjs](traces/dual-role.mjs)). |
| [Online university](university.md) | A campus, a course, a study room and a coursework folder | A 0.5 SDK recording ([traces/university.mjs](traces/university.mjs)): a narrow pass for a prospective student, enrollment with a signed offer, another student's records refused. |
| [A place restarts](traces/README.md#about-the-diagrams) | A tea house | A 0.5 recording ([traces/restart.mjs](traces/restart.mjs)): stopped mid-visit, the visitor knocks again, and what was spent still counts. |
| [Two refusals](traces/README.md#about-the-diagrams) | A tea room | A 0.5 SDK recording ([traces/refusals.mjs](traces/refusals.mjs)): a stolen card gets a `never` reply with an end date and an appeal link, and a pasted login session is refused. Needs 0.5.1. |

## Run it

| Example | What it shows | Where | Run |
|---|---|---|---|
| **The two-second visit** | A tea shop (*Kettle & Leaf*) and a visiting representative on your machine: the ritual, a pass, an order within a 10.00 USD limit, an order past it refused, the report home | [`packages/shokai/src/cli.ts`](../packages/shokai/src/cli.ts) | **0.5.1:** download [kigenka-shokai-0.5.1.tgz](../release/kigenka-shokai-0.5.1.tgz), then `npx --package=./kigenka-shokai-0.5.1.tgz shokai demo` ([Local trial](https://shokaiprotocol.com/docs/quickstart#local-trial)), or pin `npx @kigenka/shokai@0.5.1 demo`. |
| **Quickstart tea shop** | Your MCP server plus a Shōkai door; a visiting representative that spends within a mandate and comes back for a second visit; the conformance check | [`QUICKSTART.md`](../QUICKSTART.md), code in [`packages/shokai/examples/quickstart/`](../packages/shokai/examples/quickstart/) | `npm run quickstart` (runs QUICKSTART.md as written) |
| **A gate in front of any MCP server** | Three note tools behind a Shōkai door; `tools/list` narrowed to the pass; every call a signed act | [`packages/shokai/examples/toy-mcp/`](../packages/shokai/examples/toy-mcp/) | `cd packages/shokai && npm run example` |
| **A door ready for a public host** | Stable keys, state that survives restarts, edge limits, a kill switch | [`deploy/HOST-A-PLACE.md`](../deploy/HOST-A-PLACE.md), [`deploy/demo-place/`](../deploy/demo-place/) | see the guide |
| **The reference place server** (*The Engawa*) | The whole core and the stable extensions: lobby, gate, passes, misconduct, the inbound door, gatherings, peer meetings | [`reference/engawa/`](../reference/engawa/) | `npm run setup && npm test` |
| **The reference signing page** | An owner makes a passkey and approves, item by item, what their representative asks them to sign | [`reference/signing-page/`](../reference/signing-page/README.md) | `node reference/signing-page/test/e2e.mjs` (software authenticator) |

## Worked examples

Place stories, not this runnable list: [Worked examples](../docs/examples/index.md).

| Example | Kind of place | Shows |
|---|---|---|
| [The tea shop, the first walkthrough](../scenarios/places-first.md#the-tea-shop-the-first-walkthrough) | Shop | Self-introduction, the leaflet for an anonymous visitor, a purchase within a signed limit |
| [A personal representative at a bank](../docs/examples/harborlight-bank.md) | Bank | Shōkai cards both ways, a standing allowance, a narrow pass, a transfer taken home |
| [Look before you join](../docs/examples/look-before-you-join.md) | Any | An anonymous look at the listing; the leaflet's plain sentences for the owner |
| [An employee's co-worker agent](../docs/examples/enterprise-coworker.md) | A company's internal tools | A company-vouched role; a gate in front of internal MCP servers |
| [A friend introduces a brand](../docs/examples/brand-door.md) | A person's own door | The optional vouch, paid or genuine |
| [One representative, two roles](../scenarios/dual-role.md) | A person's meeting room, and a tea shop | Two Shōkai cards from one owner: keeping the door and going out |
| [Places first: six everyday scenarios and the room](../scenarios/places-first.md) | Store, marketplace, bank, community | Browsing, buying later within a limit, a cold gift purchase, a marketplace guide, an existing bank customer, a referral trail, representatives meeting in a room; with the gaps rc4 leaves |

## Situations and proofs

| Example | Kind of place | Shows |
|---|---|---|
| [Unsolicited offer, pressure declined](../docs/examples/pressure-declined.md) | A person's own door | Hidden text, false urgency, a misconduct notice |
| [Proving who a representative is for](../docs/examples/identity-proofs.md) | A brand's domain, and a person's account | What published v0.3.0 already checks, and what P23 still leaves as a v0.4 / v0.5 draft |

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
- How the release was tested and reviewed is on [How we built and tested this](https://shokaiprotocol.com/transparency/how-we-built-this).
