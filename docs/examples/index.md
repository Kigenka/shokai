# Worked examples

Place stories, each with a diagram and short message snippets. For the first walkthrough, a self-introduction at a tea shop, start with [How Shōkai works](../how-it-works.md). Most visits are self-introductions: the owner signs a **Shōkai visitor card**, and the **agent representative** presents it at the door. A vouch is optional in v0.5.0 ([SPEC §4](../../SPEC.md)); it appears only where a story needs one, and is labeled as optional. **These examples are non-normative**, written for **v0.5.0**: the specification decides, and where an example and the spec disagree, the spec wins.

The grant a place gives is a **pass**. On the wire that object is the `seat` field. Messages on this visit are tagged `shokai/0.5`.

The eight beats of a prepared visit are the same on every page: (1) at the doorstep, the agent representative reads the listing, and a visitor without a Shōkai visitor card gets the leaflet, not a rejection; (2) the door checks the Shōkai visitor card and an audience-bound possession proof, and the Shōkai host card is shown with its proof; (3) the host representative welcomes; (4) the visitor states its purpose and the owner's signed mandate limits; (5) the door decides (`grant`, `conditional`, `deny` with `not_now` or `not_a_fit`, or `considering`); (6) a pass (wire: `seat`) is admission; (7) every act is checked, including `act_held` and a superseding mandate when one is needed; (8) the visitor reports home, and the door keeps a local record. There is no global score.

[Runnable examples](../../examples/README.md) are a separate set: doors and visitors you can run. They are not the same list as these stories.

| Example | Shows |
|---|---|
| [A personal representative at a bank](./harborlight-bank.md) | A self-introduction, Shōkai cards both ways, a standing allowance, a narrow pass, the duty of loyalty, taking a transfer home |
| [Look before you join](./look-before-you-join.md) | An agent representative without a Shōkai visitor card, the open listing, and the leaflet with plain owner sentences |
| [At a freight company](./enterprise-coworker.md) | A freight company sets a host representative for each internal resource, and its co-worker agent also visits a carrier's and a warehouse partner's doors; a customer link made in the company's own channel; an act outside the pass |
| [An online university](./online-university.md) | Draft: three doors the university sets — a university Workspace door in front of its own Drive, a course door operated by the course-making agent, and onboarding so each student has their own representative |
| [At a fan community](./fan-community.md) | Three doors, three owners, around the community — the Society's door in front of its gallery and request desk, a creator's own door, and a studio's licensing desk |
| [A collector at a heritage watchmaker](./heritage-watchmaker.md) | A Shōkai visitor card and a no-spend mandate, a welcome in the house's own register, a pass to view and request, `considering` for a limited piece |
| [At an introduction-only club](./introduction-only-club.md) | A members' club whose door rule is a signed introduction from a current member, with a cap; a leaflet and `not_now` without one; most doors don't need a vouch |

## Situations and proofs

These are not place tours. Each one is a situation the protocol already handles in v0.5.0, or a short proposal that points to a worked example rather than repeating it.

| Example | Shows |
|---|---|
| [Unsolicited offer, pressure declined](./pressure-declined.md) | The eight beats, then hidden text, false urgency and fake familiarity, a misconduct notice, `never` with an expiry and an appeal path, local consequences |
| [Proving who a representative is for](./identity-proofs.md) | A brand tied to its domain (in v0.5.0), a `CustomerLink` for a customer the place already knows (§5.4), a person tied to their X account (P23, still a draft), and a fictional famous-person impostor refused with `not_now` and a vouch retry |
| [A leaflet isn't a rejection](./leaflet-isnt-a-rejection.md) | An agent representative without a Shōkai visitor card gets the leaflet and `not_now`, not a rejection |
| [Considering an unusual order](./considering-unusual-order.md) | `considering` for an unusual but honest request, so a person can decide |
| [A held act at a 50.00 ceiling](./act-held-ceiling.md) | `tea.order` held at a USD 50.00 ceiling, then released by a superseding mandate |
| [Card and mandate lifetimes](./card-and-mandate.md) | A Shōkai visitor card that lasts months, and a short-lived mandate (for example, USD 20.00 today) |
| [Proofs both ways](./proofs-both-ways.md) | The door checks the visitor card and an audience-bound proof, and shows the host card with its proof |
| [Badges at the door](./badges-at-the-door.md) | Proposal, not built: a badge presented alongside the visitor card |
| [Assets lent by reference](./assets-lent-by-reference.md) | Proposal, not built: an asset lent by reference, and `not_now` until an open loan is settled |

## Optional: vouches

Vouches and introducers are optional in v0.5.0 ([SPEC §4](../../SPEC.md)). They are not the way a door usually admits someone. **Most doors don't need one.** The stories above that use one say so. [At an introduction-only club](./introduction-only-club.md) is the worked example of a place that made a signed introduction its own door rule, with a cap, and of the same optional vouch at a person's own door.

**About the names.** The places, brands and people in these stories (Harborlight Bank, Maison Ardoise, Corsavel, Kettle & Leaf, Brightwick Outfitters, Halvenstone Freight, Redfen Trailways, Quaymill Warehousing, Sorawick Online University, Cadrelune, The Inkfold Society, Northlamp Studio, The Copperroom Circle, Aya Linden, Kiran Vale, Noor Halloran, Theo Marchetti, Mira Castellane, Ines Marlow, Elias Moreau, Sol Park, Nao Igarashi, Rowan Pell) are fictional. Real technologies (MCP, OAuth, passkeys, Plaid, Stripe and others) are named only to show where Shōkai fits; that implies no affiliation or endorsement, and no example describes how a real company behaves.

**About the snippets.** Snippets are abridged: the signed envelope (`payload_digest`, `signatures`) and most of the ritual header (`protocol: "shokai/0.5"`, `from`, `to`, `msg_id`) are left out, and keys and digests are shortened with `…`. Field names are those of the v0.5.0 schemas. Every real message in this specification travels signed, with `protocol: "shokai/0.5"`.
