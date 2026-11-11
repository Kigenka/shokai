<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P26 (draft): the drop-in door. Finding a site's door, and the leaflet under the owner's signature

*Status: proposed. Draft text for v0.4.0 (2026-10-30), applied to SPEC.md as two bullets marked DRAFT and moved back out of SPEC.md in v0.5.0 (2026-11-01), because draft text doesn't belong in the normative core. The two texts are below, unchanged. The rule that the lobby text is signed is now normative on its own terms (SPEC §2.3, C236), and showing it to the owner before signing is SIGNING.md §9. Nothing on the wire changes. Every person and place here is fictional.*

## In plain words
1. **A site can say where its door is**, at `/.well-known/shokai` (the same `DoorPointer` as `GET <base>/`) and with `<link rel="shokai">` in its pages. A visiting representative that only knows a site's address can find the door.
2. **Both are hints.** The listing entry and the Shōkai host card still decide (§3.1). The redirect rule (https, the exact path, no query) keeps a site's other pages or a third party from redirecting a visitor into someone else's door.
3. **The leaflet is already under the owner's passkey.** The lobby text is inside the house config, which `house_digest` covers (§2.3). The new sentence says so, and asks whoever prepares a Shōkai host card (an owner's agent, a setup tool, a platform) to show the owner that text before they sign.

## Why now
The v0.4.0 drop-in door (SDK: `discover()`, `door.wellKnown()`, `shokai init`, AGENT-INSTALL v1) lets an owner, or the owner's agent, put a door in front of an existing site. Visitors need one predictable place to look, and owners need to know that the words their door hands out are words they signed.

## Open points for the editor
- Registration: the `shokai` well-known URI (RFC 8615, "Specification Required") and the `shokai` link relation (RFC 8288) are outside submissions, after the specification is public.
- Whether `/.well-known/shokai` may also be a redirect to the door's `GET <base>/` on another origin (allowed today only if the final path is exactly `/.well-known/shokai`; a cross-origin pointer is still a hint).
- v0.5.0 candidate: a separately signed `PlaceLeaflet` (so a leaflet can change without a new Shōkai host card), and the same discovery for A2A Agent Cards (an `extensions` entry).

## The proposed text (moved out of SPEC.md in v0.5.0)

For §2.3 (now covered by SPEC §2.3 "Everything enforced is signed" and SIGNING.md §9; kept here for the record):

> **The leaflet is part of what the owner signs.** A place's lobby (`policy.lobby`: `about`, `how`, `onboarding_url` and its readiness list, §3.3) is part of its house config, so the `house_digest` on its Shōkai host card covers the words its door gives an agent without a Shōkai visitor card, and changing them is a change of house that needs a new signature. Whoever prepares a Shōkai host card for an owner SHOULD show them that text in full before they sign.

For §11.1 (still proposed):

> **Finding the door from a site.** A site MAY publish its door's `DoorPointer` at `/.well-known/shokai` on its origin (JSON, answered to `GET`), and MAY name it from its pages with `<link rel="shokai" href="…">`. A visiting representative looking for a site's door SHOULD try the well-known address first, and MUST use what it finds there only if, after any redirects, the final URL is `https` and its path is exactly `/.well-known/shokai` with no query; it SHOULD treat a `rel="shokai"` link the same way. Both are hints like any pointer: the listing entry and the place's Shōkai host card decide (§3.1, "Pointers are hints"). The well-known name and the link relation are not yet registered (RFC 8615, RFC 8288).

The SDK's `discover()` and `door.wellKnown()` already follow this text; they are an implementation of the proposal, not of the core.

---

## Amendment A (draft, 2026-11-02): binding a door to the site it claims

*Folded into SPEC v0.5.0 (2026-11-02): this amendment is now SPEC §3.1.1 (C257), with `PlaceBinding.site` and `DoorPointer.places[].principal_id` in the shapes and the SDK's `DoorOptions.site`, `checkSite()` and `VisitAsk.site`. Two choices the text below left open are settled there: the SDK stops a visit to an unbound named site even when it spends nothing, unless the owner opts in (`unboundSite: "continue"`); and a door configured with a site refuses to start with a Shōkai host card naming another. Adoption stays provisional until the open discussion GOVERNANCE.md asks for. The text below is kept as drafted.*

*Status: draft, not normative. Nothing here is in SPEC.md, and v0.5.0 doors and visitors stay conformant without it. Sketch vectors: [P26-vectors.json](./P26-vectors.json), checked by `tools/p26-sketch.mjs`; the SDK's `discover()` and `bindToSite()` follow this text and are tested in `packages/shokai/test/adapters.test.ts` (loopback only). Every person, place and address in it is fictional.*

### The gap
v0.5.0 binds a Shōkai host card to a door's **entry address** and principal (SPEC §2.3 `place`, §3.1 C104, C204), and the text above lets a site point to its door. Nothing binds the door to the **website** it claims to belong to. So:
- an attacker can run a door at `lanternmoss-tea.example`, sign their own Shōkai host card for it with their own passkey, and call it "Lanternmoss Tea House". Every v0.5.0 check passes, because the attacker's card is valid for the attacker's own door. Only the display name is false, and §2.1 (C199) already says a name is a claim;
- the pointer rule above lets `/.well-known/shokai` redirect to another origin, and lets a `rel="shokai"` link name any address, so a pointer a visitor reached "from the site" may not be the site's word at all;
- a visitor can't tell its owner "this is the door of lanternmoss.example", only "this door's key is …".

A `did:web` principal on the site's own domain already closes this for organizations (§2.1). A person's place, signed with a passkey (`did:jwk`), has no such binding.

### In plain words
The binding works in both directions. **The site names the door:** the site's own `/.well-known/shokai`, served from its own address, lists the door. **The door names the site:** the owner's signed Shōkai host card says which site it belongs to. A visitor calls a door "the door of lanternmoss.example" only when both agree. Anything else is still a door, but the visitor treats it as a stranger's door and never as that site's.

### Proposed text

**§A1 The site on the Shōkai host card.** A Shōkai host card MAY carry `place.site`: the origin of the website the place belongs to, in its serialized form (scheme `https`, host lowercase and in its ASCII form, the port only when it isn't 443, no path, query, fragment or user info; for example `https://lanternmoss.example`). It is inside the owner's signature. A signing page MUST show it to the owner before the passkey prompt, as the origin in plain text (SIGNING.md §9), so the owner approves which site the door says it belongs to. A card with `place.site` that isn't in that form MUST be treated as naming no site.

**§A2 The site's own word.** A visiting representative MAY treat a door pointer as the site's own word only when it fetched `https://<site>/.well-known/shokai` itself, got `200` with a JSON `DoorPointer`, and every redirect stayed on the site's origin, ending at exactly `/.well-known/shokai` with no query. A pointer reached any other way is a hint (the text above), never the site's word: through a redirect to another origin, through a `rel="shokai"` link to another address, or from a search result, a message or another site's page.

**§A3 A site-bound door.** A visiting representative MAY call a place *the door of `<site>`* in anything it tells its owner only when all of these hold, after the place's Shōkai host card verified as SPEC §3.1 requires:
1. it holds the site's own word (§A2), fetched for this visit or within the cache rule (§A5);
2. that pointer's `places` lists the place's `entry` exactly once, as the same string;
3. the Shōkai host card's `place.site` is that site's origin, and its `place.principal_id` is the card's principal;
4. **cross-site doors:** when the entry's origin isn't the site's (a door hosted on a platform's domain), the listed item MUST carry `principal_id`, and it MUST equal the Shōkai host card's principal. On the site's own origin, `principal_id` SHOULD be listed, and when listed it MUST match.

Otherwise the place is not bound to the site. The visiting representative MUST name it to its owner by its entry's origin and its principal (§2.1), with the display name marked as a claim. When its owner asked it to visit a named site and the errand spends money, it MUST end the visit with no request sent and report: "This door doesn't show that it belongs to <site>, so I didn't go in to buy anything." For an errand that spends nothing it MAY go on, and it says so in its report. A Shōkai host card that names a site whose own file doesn't list it ends the visit the same way, with the same report, whether or not the errand spends.

**§A4 The link tag.** `<link rel="shokai" href="…">` counts only in the page's `head`: the part before `</head>` when the page has one. `rel` is a space-separated token list compared without regard to case. `href` is resolved against the page's final URL, and a `<base>` element is ignored. At most four such links are tried, in document order, and the first that yields a `DoorPointer` is used. A link binds only when it leads to the same site's own `/.well-known/shokai` under §A2. A link to any other address is a hint. So a page whose body carries text from other people (comments, reviews, posts) can't name the site's door.

**§A5 Limits and caching.** A visiting representative MUST NOT read more than 64 KiB of the discovery file or of the page it scans for links. A larger body means no door found, and it is never truncated. It SHOULD give up after 5 seconds. It MAY reuse a site's own word for up to one hour (the revocation-list reuse of §2.6), never beyond the HTTP freshness the site states and never under `Cache-Control: no-store`. It MUST fetch again when the place's Shōkai host card it is shown differs (by digest) from the one it bound, and before a visit that spends when its copy is older than one hour.

**§A6 Several doors on one site.** A site MAY list several places in its pointer's `places`, on its own origin or elsewhere, and each binds on its own (§A3). A listed item on another door base MAY carry `place_listing`, the listing that place's entry belongs to. When the owner named the site but not the place, the visiting representative chooses by the listing entries' purposes and actions, and the one it chooses must still bind.

**§A7 What it proves, and what it doesn't.** A site-bound door proves that whoever controls the website at that origin, as its HTTPS certificate shows today, lists this door, and that the owner who signed the Shōkai host card says it belongs there. It doesn't prove a legal identity or who runs the business. It doesn't protect against a site that has been taken over, since whoever controls the site controls the binding, or against a look-alike domain the owner was given: `lanternrnoss.example` is a different origin and binds only to itself. The visitor shows a domain with mixed scripts in its ASCII form (§2.1, C199). A `did:web` principal on the same domain is a stronger binding and needs no `principal_id` pin.

**§A8 Open points.**
- The SDK can't count redirect hops or see an intermediate origin: `fetch` reports only the final URL. A redirect that leaves the site and returns is accepted. Hop-by-hop redirect handling is a follow-up.
- The SDK's `visit()` doesn't yet apply §A3's stop rule on its own: `bindToSite()` is a helper a visiting representative calls before it goes in.
- SDK doors don't yet put `place.site` in their own Shōkai host card or `principal_id` in `door.wellKnown()`, and `shokai init` writes a static `public/.well-known/shokai` without them. These are follow-ups for when the amendment is accepted.
- `place.site` and the pointer items' `principal_id` and `place_listing` aren't in `protocol-shapes.ts` or the JSON Schema. They are added only if the amendment is adopted (a v0.5.x additive change).
- Registration of the well-known name and the link relation is unchanged (above).
