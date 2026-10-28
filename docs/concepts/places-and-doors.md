# Places and doors

Shōkai starts from **places**. A place is reachable through a **door**: a tea shop, a store or a brand, a marketplace, a community, a bank's agent entrance, a company's internal tools behind a gate, or a person's own door for brands. At every door stands the place's own agent, the **host at the door** (the spec calls it the gatekeeper). It checks what it can verify, decides, and always explains, like the host at a fine restaurant or a members' club.

Its listing and lobby are its **agent front**, open to anyone to look at; anything personal happens at the door. See [Website, agent front, door](./website-front-door.md).

## Every arrival gets an answer

A place publishes a machine-readable **place listing**: for each entry, its addresses (`entry`, `lobby`, `inbox`, `onboarding_url`), its locales, its category, the purposes it serves and the actions it offers (whether each one spends money, and whether it creates an account). A visitor knows what is possible before it arrives, and what each action will ask its owner for (`data_asks`). The listing may also carry `links` to what the place already publishes for agents (an MCP Server Card, an A2A Agent Card, a product feed); links are hints, never permission.

### What a listing entry carries

This is what a place built with `createDoor` serves at `GET /shokai/places` (one entry per place; the normative list is in the specification, §3.1).

Two addresses: the door's **base URL** ends in `/shokai` (what `findPlace(base, name)` and `shokai-conformance` take), and the **place listing** is that base plus `/places`. Write the base without a trailing slash; the SDK and the runner accept `…/shokai/` too (a listing's `door` field may show one), and both name the same door. The listing is the agent front; the door is where its `entry` points. A visitor picks a place by its `name`, a machine slug, not its `display_name`, which is for people.

| Member | What it says |
|---|---|
| `name`, `display_name`, `category`, `locales` | Who the place is: `name` is the slug a visitor passes to `findPlace`; `display_name` is for people. The category is self-declared. |
| `principal_id`, `representative_id` | The place's DIDs. The visitor checks the card it receives against these (see *Pointers are hints* below). |
| `entry`, `lobby`, `inbox`, `onboarding_url` | Where to arrive, where an unprepared visitor is welcomed, where to leave a message, and where an owner can set up a representative. |
| `purposes` | The purpose codes the place serves, each with a plain statement (`visitation`, `purchase`, …; see [Limits](./limits.md#which-purpose-to-ask-for)). |
| `actions[]` | For each action: `action`, `purposes`, `spends` (true for the actions the door's `spendingActions` names), `needs` (`standard`; `considering` when the place decides later; `pair_invitation` for peer meetings), `creates_account: true` and `requires_introduction: true` where they apply, and `data_asks` (what the action will ask the owner for). |
| `links` | Optional hints to what the place publishes elsewhere (see [Website, agent front, door](./website-front-door.md#a-front-can-point-to-what-the-place-already-has)). |
| `spec_ref` | The specification version the place follows. |

The door's own configuration stays private: an action's seating `level` (`discover`, `advise`, `act_on_behalf`), its per-action limits and its trusted introducers decide what a seat may do, but they aren't listed.

Reading the listing or the lobby needs no card, key, account, cookie or personal data, and nothing about the reader is kept. A place may still apply ordinary rate limits.

The rule is simple: **silence or a bare "not found" is non-conformant.**

| What arrives | What it gets |
|---|---|
| A protocol message at an entry | The ritual |
| Plain prose or a malformed body | The **lobby**: a greeting, a `LobbyBriefing`, a polite `deny` / `not_now` and a farewell |
| An unknown route | A `DoorPointer` that says where to start |

## The lobby: welcoming the unprepared

A visitor is **unprepared** when its greeting is unsigned or it has no signed card. The host at the door must not ignore or silently block it. It answers with a signed `LobbyBriefing`, the place's leaflet: what the place is, how it works, an onboarding link, fill-in templates, and plain sentences the representative can show its owner ("Your assistant needs a profile card that you sign once, saying who it works for."; at a place that asks for one before an account, "This place asks for an introduction from someone it already knows."). Then a kind `not_now`, never `never`. Being unprepared is never a penalty.

This is how Shōkai spreads: an agent turned away goes home with a sentence its owner can act on, so every refusal is an invitation to turn that agent into a representative and come back ready.

## Pointers are hints

A listing or a door pointer proves nothing. Before sending any request, the visitor verifies that the place's own card and principal match the listing it followed. A lookalike domain gets nothing from the brand it resembles: a brand is the DID it signs with.

The `@kigenka/shokai` SDK does this for you in `visit()`: every reply must be signed by the representative the listing names and stay in the encounter the visit named (SPEC §2.2), and the place's card must be signed by the listing's `principal_id`, name that representative, and prove possession of its key over this visit's nonce. If anything doesn't match, the visit ends with no request sent, and `visit.placeCheck` says why. The conformance runner checks a door the same way (`ritual.place_id`).

## Tools are listed openly

Behind a Shōkai gate, MCP `initialize` and `tools/list` are part of the agent front: anyone may see the tool names and schemas, as anyone may read the listing. Only `tools/call` needs a seat. A seated caller's `tools/list` is narrowed to its seat. A place that doesn't want its tools listed publicly can require a seat for listings too (the gate's `open` option, a function naming the methods that pass without a seat); its listing still says what each action is.

## Signed artifacts name only what was declared

A place MUST NOT treat transport metadata as identity. The name an MCP client sends in `initialize` (`clientInfo.name`) is a client label, not the owner's or the agent's name; don't copy it into stamps, receipts or anything a place signs. If a place records an agent's name, it should ask for it and mark it as self-declared.

## Bounded and polite under load

A place bounds the encounters it keeps. When it's full it refuses newcomers (HTTP `429` with `Retry-After`) and never evicts guests already inside.

*[Spec](../../SPEC.md): The door; The lobby: unprepared visitors; Bounded encounter state; Minimal HTTP binding.*
