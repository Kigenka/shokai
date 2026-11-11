<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Traces: the recorded runs behind the examples

A trace is a recording of a real run: a script plays out an example story against the Shōkai code, checks that each step happened the way the story says, and saves what was said at the door. They are here so you don't have to take the example pages on trust. You can read what happened, or run the script yourself and get the same result.

Every trace in this folder except the Willowfold field test was recorded on November 11, 2026, on the 0.5 code, after the 0.5 red-team round and its fixes. Every person, business and place in them is fictional.

## In plain words

When an agent representative arrives at a place, it shows a signed **Shōkai visitor card** that says who sent it and what it may do. If the place agrees, it gives the representative a **pass**: a short list of what it may do there, and up to what amount. (On the wire, the pass is the field `seat`. You'll see that word in the recordings; it means the same thing.)

Each recording below shows that happening in one kind of place, including the times the answer is no:

| Story | What you'll see | Checks |
|---|---|---|
| **Tea shop** (Willowfold Tea House) | Anyone may read the menu without a Shōkai card. Aya's representative introduces itself, gets a pass, orders a 6.00 USD green tea within her 10.00 USD limit, collects a stamp, and writes Aya a report. | 6 of 6 held |
| **Store** (Brightwick Outfitters) | A pass for ordering, up to 100.00 USD. A 40.00 USD order goes through; a further 80.00 USD order is refused, because it would go past the limit. | 5 of 5 held |
| **Bank** (Harborlight Bank) | Under one 50.00 USD mandate, a transfer with no amount is refused as incomplete and 30.00 USD is sent. On a second visit under the same mandate, another 30.00 USD is refused: only 20.00 USD is left. The bank counts the limit across visits. | 8 of 8 held |
| **Marketplace** (Mossgate Commons) | An agent with no Shōkai card is turned away politely, with a leaflet that says how to come back prepared. It comes back with a Shōkai visitor card and gets a pass to browse the stalls. | 6 of 6 held |
| **Community room** (The Engawa) | Three invited representatives enter a gathering after their owners accept the house rules. A private question gets "that's private"; pressing after that is noted. What Aya takes home leaves out the private item. | 7 of 7 held |
| **Brand door** (Kiran Vale's own door) | A friend introduces a brand at a person's own door. The gift comes as a claim ticket, never a home address, and Kiran's private note never leaves the door. | 5 of 5 held |
| **One representative, two roles** (Kiran's meeting room and a tea shop) | Kiran's representative keeps Kiran's room and also goes out shopping for Kiran, with a separate Shōkai card for each job. When Kiran withdraws the shopping Shōkai card, that pass ends and the room stays open. | 10 of 10 held |
| **Online university** (Sorawick Online University) | A campus door, a course door, a study room and a weekly coursework folder. A prospective student gets a narrow pass; an admitted student enrolls with the university's signed offer; another student's records are refused. | 25 of 25 held |
| **A place restarts** (Kettle & Leaf, the demo tea house) | The tea house is stopped in the middle of a visit and started again. The visitor is told clearly to knock again, what was already spent still counts against the limit, a withdrawn Shōkai card stays withdrawn, and the visit completes. | 6 of 6 held |
| **Two refusals** (Juniper Tea Room) | A representative shows another person's Shōkai visitor card and gets a "never" answer, which now says when that ban ends (at most 180 days) and where to appeal. The real owner of that Shōkai card is not banned. An order that carries a pasted login session is refused before the shop sees it. | 7 of 7 held |

Each check either held or failed, and every check ran. Nothing was skipped; a skipped check would never count as one that held.

There is also one older recording that cannot be re-run: **Willowfold Tea House, October 27, 2026**, a field test in which a Muse agent visited a tea house running on a Grok Bot computer for about nine minutes. It is kept as it was recorded, from the 0.3 era, and it says "seated" where the protocol now says pass.

### About the published package

`@kigenka/shokai@0.5.0` was released before the red-team round, so it doesn't have the two fixes from that round; they are fixed in 0.5.1. The **Two refusals** recording shows them, so it needs 0.5.1: run against 0.5.0, three of its seven checks fail, because the "never" answer has no end date or appeal path and the pasted session is not refused. We ran the other nine stories against the published 0.5.0 too, and they wrote the same traces.

### About the diagrams

The diagrams on the example pages (tea shop, store, bank, marketplace, community room, brand door, and one representative with two roles) were redrawn from these 11 November 2026 0.5 recordings. They use **pass** in the prose; where a wire field or reason code is shown, the field is still `seat`. The older Willowfold field-test transcript was not used for the tea-shop diagram; it is kept separately, as recorded.

## For builders: the files

Each story has a script (`.mjs`) and the trace it writes (`.trace.json`). A trace holds the steps, each check and whether it held, and the message flow at the door (direction, message type, decision and reason code). Keys are made fresh for each run, and identifiers, port numbers and dates that change from run to run are masked, so running a script again writes the same file.

| Story | Script | Trace |
|---|---|---|
| Tea shop | [tea-shop.mjs](tea-shop.mjs) | [tea-shop.trace.json](tea-shop.trace.json) |
| Store | [store.mjs](store.mjs) | [store.trace.json](store.trace.json) |
| Bank | [bank.mjs](bank.mjs) | [bank.trace.json](bank.trace.json) |
| Marketplace | [marketplace.mjs](marketplace.mjs) | [marketplace.trace.json](marketplace.trace.json) |
| Community room | [community-room.mjs](community-room.mjs) | [community-room.trace.json](community-room.trace.json) |
| Brand door | [brand-door.mjs](brand-door.mjs) | [brand-door.trace.json](brand-door.trace.json) |
| One representative, two roles | [dual-role.mjs](dual-role.mjs) | [dual-role.trace.json](dual-role.trace.json) |
| Online university | [university.mjs](university.mjs) | [university.trace.json](university.trace.json) |
| A place restarts | [restart.mjs](restart.mjs) | [restart.trace.json](restart.trace.json) |
| Two refusals | [refusals.mjs](refusals.mjs) | [refusals.trace.json](refusals.trace.json) |
| Willowfold field test (recorded, not re-runnable) | n/a | [willowfold-muse.transcript.txt](willowfold-muse.transcript.txt) |

[lib.mjs](lib.mjs) holds the shared recorder, the masking, and a small host kit used by the brand-door and community-room scripts, which run on the protocol core directly because inbound doors and gatherings are not part of the high-level `createDoor` API.

Most scripts run in one process with no network. The restart script is the exception: it starts the demo tea house (`deploy/demo-place`) as its own process on loopback, stops only that process by its exact process id, and starts it again.

## Replay a trace

The scripts import the SDK from `packages/shokai` in this repository, so run them from a checkout of the repository with Node.js 22 or later. A script prints how many checks held and exits with an error if any check fails. The public repository is at v0.5.0; these 0.5 scripts reach it with the next release.

**Every in-process story** (tea shop, store, bank, marketplace, community room, brand door, two roles, university, two refusals):

```bash
(cd packages/shokai && npm install && npm run build)
for s in tea-shop store bank marketplace community-room brand-door dual-role university refusals; do node examples/traces/$s.mjs; done
git diff --stat examples/traces   # nothing changes: the traces come out the same
```

`node examples/traces/university.mjs --check` runs the checks without writing the trace; `npm test` in `packages/shokai` does this.

**A place restarts** (installs the SDK you just built into the demo tea house, without changing its `package.json`):

```bash
(cd packages/shokai && npm run build) && T=$(mktemp -d) && (cd packages/shokai && npm pack --pack-destination $T) && (cd deploy/demo-place && npm install --no-save $T/kigenka-shokai-*.tgz) && node examples/traces/restart.mjs
```

Each trace file starts with the protocol (`shokai/0.5`) and the code it was recorded on. The store's refusal still carries a seat-scope reason code on the wire (`SEAT_SCOPE_EXCEEDED`), which is the wire name for the pass. From 0.5.1 the restart report home says the place "no longer knew my pass"; 0.5.0 said "seat" there.

Diagram sources for the example pages are in [../diagrams/src/](../diagrams/src/), rendered with the settings in `docs/diagrams/render.sh` (`mermaid-config.json`). How Shōkai was built and tested is on [How we built and tested this](https://shokaiprotocol.com/transparency/how-we-built-this).
