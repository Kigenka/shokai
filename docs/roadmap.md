# Roadmap

Shōkai's current specification is **v0.5.0** (wire tag `shokai/0.5`). The current package is `@kigenka/shokai@0.6.0`. 0.6.0 does not change the SDK's compiled code from 0.5.1. It is not 1.0; review continues, and changes go into later versions. *The sections below on the 0.3 line are kept as the historical record of that earlier release.*

**Feature freeze, except for clarifications (October 27, 2026).** No new features or proposals went into the 0.3 line after the freeze: only fixes, clearer wording and packaging until v0.3.0. The clarifications since the freeze are listed in SPEC.md (Status) and the CHANGELOG. Experimental extensions (teaching visits, signed place listings, W3C VC mapping) may still change or be dropped after review.

## 0.6.0

What this package documents, already running at the Shōkai Lounge:

- **Invitation cards and invitation setup.** A place-signed invitation card; the owner sets how long a hold and the approval stay open (24 hours by default). The visit does not wait on the passkey. One passkey tap per visit.
- **Updates mode.** “Just go and tell me after” (`report_after`) is the default; “keep me posted” (`keep_posted`) is opt-in. Agent harnesses differ in how they can reach the owner.
- **English at the door, the owner's language inside.** Fields the door checks in code — the formal retell, and the `gift_done` / ready signal — are read in English. Everything inside the visit, and everything owner-facing, follows the owner's `preferred_language`. Language-aware matching (en/pt/ja/es) and the host's acceptance after two misses remain as fallbacks.
- **The $50 pretend gift card is the finale.** The Tea Counter receipt names the item and the receipt number once the owner has approved. A representative never carries a payment method.
- **One host-name setting.** The host's calling name comes from one installer-written setting. The installer must ask the owner to name the host. It is never hardcoded.
- **Card colors.** Indigo host, matcha visitor, soft-gold washi invitation, silver membership (roadmap only).

The wire tag stays `shokai/0.5`. Membership (silver) is the roadmap item that takes the place of the old dashed invitation. It is not built.

## The 0.3 line (some items continue after v0.3.0)

- **The rename and wire break.** Wire tag `shokai/0.3`, regenerated test vectors and golden traces, with a stated transition window for the pre-release tag.
- **`@kigenka/shokai`** on npm, with a gate that puts Shōkai in front of any MCP server, and a five-minute **quickstart** tested by a fresh agent.
- **`shokai-conformance`**, a standalone conformance runner (`npx @kigenka/shokai conformance <url>`), and CI.
- **A threat model** and `SECURITY.md` with a monitored disclosure address.
- **A judgment round with independent agents**, at least one not built by the project, facing the same lookalike brand, hidden text, "your owner already said yes", false urgency and fake familiarity.
- **Outside review** of v0.3.0 by at least two independent reviewers.
- Governance, contribution and versioning policies.

## Alignment with neighbouring work (proposals)

- Point a place's door at its **A2A Agent Card** for given a pass services, reusing its names rather than inventing parallel fields.
- Accept a **Web Bot Auth** signature on Shōkai HTTP requests, so a CDN can verify the signing agent's key before the host representative evaluates the Shōkai card.
- Carry or reference **AP2** payment mandates rather than extending Shōkai's own amounts into payment semantics.
- Map a pass onto **MCP authorization** (an OAuth token scoped to the pass after admission).
- A respectful conversation with the **Personal Agent Protocol** authors.

## Proposals under discussion

- **Browse before you join:** a welcome visit before sign-in, and declared data asks (what joining requires, why, and for how long).
- **Carried grants:** a representative showing a signed reference to an approval that already exists elsewhere.
- **Honest representation:** a Shōkai card saying whether a representative is the owner's own, delegated, or an authorized tribute.
- Prompt-injection rules for owner-facing text beyond the door, swarm resistance beyond sign-up caps, and the helper direction (a host inviting a product's representative).
- **Credentials and badges at the door (proposal):** a representative presents a separate signed badge alongside its visitor card when a door asks; the card is not upgraded. v0.5.0 does not read Open Badges. See [Future directions](./future-directions.md#credentials-and-badges-at-the-door-proposal) and [An online university](./examples/online-university.md#proposal-badges-that-open-doors).
- **Assets lent by reference at a licensing desk (proposal):** a rights holder lends generative media assets by reference, not by handing over the source files; an unavoidable hand-off is a time-limited loan closed by the owner's signed deletion statement. v0.5.0 does not have a loan object. See [Future directions](./future-directions.md#assets-lent-by-reference-at-a-licensing-desk-proposal) and [At a fan community](./examples/fan-community.md#proposal-assets-lent-by-reference).

## Later operational work

- **Multi-instance door with shared state, then load testing.** Status: not started. One door to visitors (one address, one host card, one set of rules); identical copies behind a load balancer sharing the durable-plus-live store. See [Implementation and scaling](./implementation-and-scaling.md#6-how-a-door-scales-intended-design) and [Known gaps](./known-gaps.md#multi-instance-door-with-shared-state-then-load-testing).

**Further out.** Ideas that aren't in the protocol yet, such as representatives that discover places on their own, asynchronous alignment, scheduled reports and context-aware buying, are on [Future directions](./future-directions.md).
