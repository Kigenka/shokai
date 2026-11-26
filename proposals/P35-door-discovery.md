<!-- SPDX-License-Identifier: Apache-2.0 -->
# P35: Door discovery: a public sign for places (draft proposal for the next version)

*Byline: YSY. 25 November 2026, Pacific Time. **A proposal, not in force.** Nothing here is in SPEC.md or SPEC-DETAIL.md, and every v0.5.0 door and visitor, and every package up to 0.6.1, stays conformant without it. It is written for the version after package 0.6.1 (see "Which release" below). Check ids are proposed (C315–C321; C310–C314 are used by package 0.6.1). Every person, place and address in it is fictional.*

## In one paragraph

An agent that wants to visit a place needs a way to find the door. Today it can find a door it already knows about: a site's `/.well-known/shokai` file, or a `rel="shokai"` link on a page, and once it arrives, the place's listing and lobby briefing. What is missing is a **public sign** that a crawler or an index can pick up: a short description of what kind of place this is, whether it is for quick errands or for a visit, and whether the owner wants it found at all. This proposal defines the sign's format and address, a **listed/unlisted switch for every kind of place with unlisted as the default**, and a **door-kind field**. Directories, search, ranking and advertising stay outside the protocol, for anyone to build.

## Why: three kinds of doors, two kinds of errands

A door can stand in front of an existing site, in front of a connector (an MCP server), or in front of a place built for visiting agents (the Shōkai Lounge is one). Both of the first two suit errands that just need to get done: a reorder, a transfer, a booking. Nobody's agent needs to see the bank's lobby, and ordinary site search, including what existing infrastructure providers are now offering for agents, serves those well.

The third kind exists because some errands are about taste: fashion, furniture, music, a gift. Browsing a catalog is the wrong shape for those. A place built for a visit has a host that talks with the visitor, a curated selection instead of the whole inventory, a take-home matched to what the owner wants, and a report back to the person. Before agents there was no reason to build a shop for a visitor who comes on someone else's behalf. So a sign should say which shape of door this is, and an agent can choose a quick door or a place to visit from what its owner asked.

Site search finds what is on a site. A sign says where the door is and how to knock. They are complementary.

## What the specification already has

| Piece | Where | What it does today |
|---|---|---|
| A known address for a site's door | §3.1.1, P26, provisional `ext-site-binding` | `/.well-known/shokai` serves a `DoorPointer`; a page may point to it with `rel="shokai"`. It says "this site's door is here". It is not meant to answer "which places match my brief?" |
| The listing and the lobby briefing (the leaflet) | §3, D20 | Every reachable place publishes a listing and a lobby briefing any reader may fetch with no card, key or account. They say what the place is, what it offers and what each action asks. |
| Check the place before sending anything | §3.1, C104 | A visitor checks the place's signed host card against the entry it followed before it sends a request. A listing or pointer is a hint. |
| Unlisted by default, for one kind of door | §10, C163, `ext-inbound-door` | An inbound door (a person's own door) is not in its owner's listing or pointer unless the owner turns `listed` on. |
| Signed listings | `ext-signed-listings` (experimental), H3 | A place may sign its listing. Signing is optional hardening; a signed listing is still a hint. |
| A direction, not a rule | `docs/future-directions.md` | Representatives that hear of a place at a gathering or from a friend. Nothing about a crawlable sign. |

Not there: a sign meant for crawlers, a listed/unlisted switch for every kind of place, and a field that says whether a door is for errands or for visits.

## The proposal (normative draft text)

*This is draft text in the style of SPEC-DETAIL. It would go in §3.1.1 (the sign), §3.1 (the switch) and §12.5 (the visitor's side), if adopted.*

### A. The sign: one address, one object

- **The sign is the door pointer, with one more optional member.** A place that wants to be found serves its `DoorPointer` at `<site>/.well-known/shokai` (§3.1.1) with an optional `sign` member. There is no second address: a crawler and a visitor fetch the same file, and the file's rule that a pointer counts as the site's own word only when it comes from the site's own origin at exactly that path (P26 §A2) applies to the sign unchanged. A copy of a sign anywhere else (in a directory, a cache, another site) is a hint.
- **What a sign says.** `sign` carries only public description: `listed` (below), `door_kind` (below), `category` (as in the listing), `locales`, a one-paragraph `summary` of the place and what a visit can do (at most 600 characters), the card classes the door accepts, and the headline limits it applies (for example, "browse only; purchases need the owner's tap"). It carries no owner details, no private policy, no seat or relationship data, and no instruction to an agent. A sign MUST NOT exceed 8 KiB.
- **A signed sign.** A listed place SHOULD sign its sign with the place's principal key, in the form of a signed listing (`ext-signed-listings`). A visiting representative SHOULD prefer a signed sign, and MUST refuse a signed sign whose signature or digest fails.
- **The domain.** The sign is served from the place's own domain over `https` with a valid certificate (§11.1, C311–C314). A sign on an IP address is not a sign.

### B. Listed or unlisted: every place, unlisted by default

- **Unlisted is the default for every place.** A place is *listed* only if its sign says `listed: true`. A pointer with no `sign`, a sign with no `listed`, and `listed: false` all mean unlisted. A crawler, an index or a visitor MUST NOT treat the absence of `listed: true` as consent to be indexed or advertised.
- **Only the owner lists.** A door MUST NOT set `listed: true` except by the owner's own act, signed as the rest of the owner's policy is (§2.3). No preset, default configuration or hosting platform turns it on.
- **This generalizes C163; it doesn't change it.** An inbound door is already unlisted unless the owner lists it, and keeps its stronger rule (it is not in the pointer at all unless listed). The new rule says the same thing about a shop, a connector front and a place for visits, for discovery only: a shop that serves a pointer today to bind its door to its site (§3.1.1) is still bound, and is simply unlisted until it adds `sign.listed: true`.
- **Unlisted places stay reachable.** An unlisted place is reached the way a private door is reached: by an address the owner gave out, an introduction, an invitation or the owner's own choice (§4, §10).

### C. The door-kind field

- **`door_kind`** is one of `errand` (the door is for getting a specific thing done: a reorder, a transfer, a booking), `visit` (the place is designed to be spent time in: a host, a curated selection, a take-home, a report), or `both`. Absent means *unspecified*, and a visitor MUST NOT read it as either.
- **How a visitor uses it.** A visitor that knows the errand kind (§12.5, C304) prefers an `errand` door for an errand and a `visit` door for a browse for taste, and MAY visit another kind and says so in its report. The field is a place's own description of itself; it never changes what the door decides.

### D. The visitor's side: a sign is a lead, not trust

- **A lead, not trust.** A sign is the place talking about itself. A visitor MUST NOT send a request, widen a limit, skip a check or relax any rule of §12.5 because a sign (or a directory's ranking of signs) says so. Before it sends anything it checks the place as §3.1 already requires (C104, C268). The text of a sign is place content (C302).
- **A directory's rank is a claim too.** A visitor MAY use an index to find signs, and MUST treat an index's ordering, labels and "verified" badges as the index's own claims, not as the place's standing. Track record, an introduction from someone the owner knows (§4), and a binding the visitor itself verified (§3.1.1) count for more than any sign or listing.
- **The brief stays home.** A visitor MUST NOT send the owner's brief, or text derived from it, to an index or directory. It matches the brief to signs itself, on its own side, from signs it fetched; at most it asks an index for a coarse category, a locale or a `door_kind`, and only with the owner's consent to name it (§5.1, C303).
- **Name the place by its domain.** A visitor reports a place found through a sign by its domain, and says what that shows and no more (C314).

### E. Proposed check ids

| Id | Role | What it checks |
|---|---|---|
| C315 | Door | A place serves a `sign` only with the members above, within 8 KiB, with no owner detail, private policy, seat or relationship data. |
| C316 | Door and visitor | Unlisted is the default for every place: a sign without `listed: true` is unlisted, and a door sets `listed: true` only by the owner's signed act. A crawler or visitor treats absence as no consent. |
| C317 | Door | `door_kind` is one of `errand`, `visit`, `both`, or absent; the SDK door's value matches what its listing offers. |
| C318 | Visitor | A visitor treats a sign as a lead: it sends nothing and widens nothing because of it, and still checks the place before sending (C104). |
| C319 | Visitor | A sign counts as the place's own word only when it comes from the place's own origin at the well-known path; a copy elsewhere is a hint. |
| C320 | Visitor | A visitor never sends the owner's brief, or text derived from it, to an index. |
| C321 | Visitor | A visitor refuses a signed sign whose signature or digest fails, and treats an index's ranking and badges as the index's claims. |

Which would be Core Door (C315, C316, C317) and Core Visitor (C316, C318–C321), so Core Door would grow by three and Core Visitor by five. None would be measured by an official run until a runner measures them; the SDK tests would measure them in process, as C302–C314 are measured. Counts would be stated honestly in the CHANGELOG at release.

### F. A fictional example

```json
{
  "type": "door_pointer",
  "protocol": "shokai/0.5",
  "place_listing": "https://lanternmoss.example/shokai/places",
  "start_with": "greeting",
  "spec_ref": { "version": "0.5.0", "url": "https://shokaiprotocol.com/docs/spec-detail" },
  "places": [ { "entry": "https://door.lanternmoss.example/shokai/places/lanternmoss/entry", "principal_id": "did:web:lanternmoss.example" } ],
  "sign": {
    "listed": true,
    "door_kind": "visit",
    "category": "store",
    "locales": ["en-US", "ja-JP"],
    "summary": "Lanternmoss Outfitters is a small winter-clothing shop. A visit is a conversation with the shop's host and a short selection matched to what your owner wants. Browsing is free; any purchase needs your owner's tap.",
    "accepts": ["visitor"],
    "limits": "Browse only without the owner's tap."
  }
}
```

A private workshop's pointer has no `sign`, and is not listed.

## How it ties to trap places

Being findable also means a trap place can be found, and can dress itself well. That is why the sign is built as a lead and why the visitor's side comes first in this text. A sign is the place's own words (C302); a directory's rank is a claim (C321); and a domain and a valid certificate show who controls the address and nothing more (C314). Finding a place changes nothing about how a visitor behaves in it: the take-home stays small and set by the visitor (C304), heavy files ask the owner first (C310), memory stays closed to the place (C307). Unlisted-by-default protects the other side: nobody is discovered by accident, and an owner's private door is not a crawl target.

## What stays outside the protocol

The protocol gets the sign's **format**, its **address**, the **listed/unlisted switch** and the **door-kind field**. Directories, crawlers, ranking, search, advertising and how an agent weighs several signs are the ecosystem's to build. Shōkai does not need to run a directory, and a conforming place or visitor never needs one.

## Compatibility

The `sign` member is optional and additive. A peer that doesn't know it ignores it, as it ignores any unknown member (SPEC Conventions). The wire tag does not change. The default (unlisted) matches what every v0.5.0 place does today: none of them has a `sign`. The only way this could break a place is if someone were relying on a crawler finding a pointer without a sign; the proposal doesn't promise that.

## Questions, with proposed answers

1. **Reuse `/.well-known/shokai` or a new address?** Reuse. One address, one file, one origin rule. A second address would split a place's word across two files.
2. **A new signed object, or a tightened listing?** A tightened pointer, with an optional signature in the existing signed-listing form. No new object type.
3. **Make C163's default universal?** Yes, for discovery, without touching how a pointer binds a door to a site (above). That keeps C163 and §3.1.1 intact.
4. **Door-kind values?** `errand`, `visit`, `both`. Open: whether a separate `front` (`site`, `connector`, `place`) is worth adding. The three fronts are descriptive and don't change behavior, so this proposal leaves it out.
5. **Matching a brief without sending it to an index?** Match locally from fetched signs; at most ask an index for a coarse category, locale or `door_kind`, with the owner's consent (D above).
6. **How does this sit next to the gathering and friend direction?** Alongside. Hearing of a place from a friend or at a gathering is an introduction (§4), which counts for more than a sign. Both lead to the same check in §3.1.
7. **Still open:** how often an index may re-fetch a sign without becoming a flood on a small place (a rate-limit rule like §11.1's, or a `Cache-Control` hint); whether a sign may name several places of one owner; a way for an owner to ask an index to forget an unlisted-again place (an ecosystem convention, perhaps, not a protocol rule).

## Which release

**Recommendation: the release after package 0.6.1. Do not bundle it.**

- Package 0.6.1 already adds fourteen checks (C302–C314), changes the SDK's compiled code, and adds a schema file. A clean release is one that can be reviewed and tested as one thing.
- This proposal has open questions that deserve a review pass (the universal default, how an index is asked, whether a signed sign needs its own shape), and it needs a reference implementation, test vectors and an index-side example before it is normative text.
- It depends on 0.6.1: a sign lives on a domain over https with a valid certificate (C311–C314), and its visitor side relies on the lead-not-trust rule and the small take-home (C302–C310).
- It adds three Core Door checks. A door-side change is worth its own CHANGELOG entry and its own counts.

If it is adopted, the version after 0.6.1 would be the place to decide whether it is a package patch like 0.5.1 (an optional member, in a new schema file, with the specification still at v0.5.0 on the wire) or a specification minor.
