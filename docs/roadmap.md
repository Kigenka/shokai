# Roadmap

Shōkai is at **v0.3.0**, the first release of the 0.3 line. It is not 1.0; review continues, and changes go into later versions.

**Feature freeze, except for clarifications (October 27, 2026).** No new features or proposals went into the 0.3 line after the freeze: only fixes, clearer wording and packaging until v0.3.0. The clarifications since the freeze are listed in SPEC.md (Status) and the CHANGELOG. Experimental extensions (teaching visits, signed place listings, W3C VC mapping) may still change or be dropped after review.

## The 0.3 line (some items continue after v0.3.0)

- **The rename and wire break.** Wire tag `shokai/0.3`, regenerated test vectors and golden traces, with a stated transition window for the pre-release tag.
- **`@kigenka/shokai`** on npm, with a gate that puts Shōkai in front of any MCP server, and a five-minute **quickstart** tested by a fresh agent.
- **`npx shokai-conformance`**, a standalone conformance runner, and CI.
- **A threat model** and `SECURITY.md` with a monitored disclosure address.
- **A judgment round with independent agents**, at least one not built by the project, facing the same lookalike brand, hidden text, "your owner already said yes", false urgency and fake familiarity.
- **Outside review** of v0.3.0 by at least two independent reviewers.
- Governance, contribution and versioning policies.

## Alignment with neighbouring work (proposals)

- Point a place's door at its **A2A Agent Card** for seated services, reusing its names rather than inventing parallel fields.
- Accept a **Web Bot Auth** signature on Shōkai HTTP requests, so a CDN can verify the signing agent's key before the gatekeeper evaluates the card.
- Carry or reference **AP2** payment mandates rather than extending Shōkai's own amounts into payment semantics.
- Map a seat onto **MCP authorization** (an OAuth token scoped to the seat after admission).
- A respectful conversation with the **Personal Agent Protocol** authors.

## Proposals under discussion

- **Look before you join:** a welcome visit before sign-in, and declared data asks (what joining requires, why, and for how long).
- **Carried grants:** a representative showing a signed reference to an approval that already exists elsewhere.
- **Honest representation:** a card saying whether a representative is the owner's own, delegated, or an authorised tribute.
- Prompt-injection rules for owner-facing text beyond the door, swarm resistance beyond sign-up caps, and the helper direction (a host inviting a product's representative).
