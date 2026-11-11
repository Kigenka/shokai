# Diagrams

Mermaid sources in `src/`, rendered to `svg/` and `png/` (2x, 1600 px viewport) by `./render.sh` (needs `npm install` in `site/docs-site` and a local Chrome). Theme: `mermaid-config.json` (paper `#fbf9f4`, indigo `#2c4a6c`, vermilion `#9c4a32`, matching the site).

| Diagram | Shows | Used in |
|---|---|---|
| `thirty-seconds` | The whole idea in one line: owner signs a Shōkai visitor card and a mandate → the visiting representative presents its visitor card → the host representative → pass (wire: seat) → work → report home; the leaflet when not ready; an optional vouch from someone known here | README |
| `arrival-sequence` | One visit, message by message: greetings, host-card fetch and house summary, visitor card and audience-bound proofs, the introduction message, invitation, a pass (wire: seat), optional act_held, farewell and report home | Core concepts |
| `layers` | Where Shōkai sits: above transport identity, in front of MCP, A2A and a place's APIs | Architecture |
| `protocols` | Which question each neighbouring protocol answers | Relationship to other protocols |
| `website-front-door` | A place's three layers: the website (outside Shōkai), the agent front (open to look at) and the door (anything personal) | Website, agent front, door; README; Relationship to other protocols |
| `three-ways` | Self-introduction (the normal case), or by invitation, or introduced by someone known here, and the leaflet for an agent that isn't ready | Arriving |
| `brand-door` | A brand at a person's door: policy, normalisation, hard rules, ceiling, taste, report | Door policy |
| `conduct` | Conduct and consequences, local to one door | Conduct |
| `mcp-door` (and `-tall`) | Plain MCP with no door, versus a Shōkai door in front: introduce, review and decide, a pass with only the tools granted, every call checked | What is Shōkai? |
| `purpose-lanes` (and `-tall`) | The door asks why a representative came first: learn (no spending), buy (within the signed amount, may buy nothing), or customer business (only the named actions) | Limits |
| `core-extensions` | The core story and the eleven optional extensions | Extensions |
| `example-*` | One sequence per example | Examples |
| `example-pressure-declined` | A brand at a person's door: eight beats, then a manipulative offer declined and reported, with never's expiry and appeal (drawn for page width) | Unsolicited offer, pressure declined |
| `example-leaflet-isnt-a-rejection` | A visitor without a Shōkai visitor card gets the leaflet and not_now (drawn for page width) | A leaflet isn't a rejection |
| `example-considering-unusual-order` | An unusual request is taken inside as considering (drawn for page width) | Considering an unusual order |
| `example-act-held-ceiling` | A tea.order over a 50.00 ceiling is held, then released by a superseding mandate (drawn for page width) | A held act at a 50.00 ceiling |
| `example-card-and-mandate` | A visitor card that lasts months, and a short mandate for today (drawn for page width) | Card and mandate lifetimes |
| `example-proofs-both-ways` | Visitor card and host card, each with an audience-bound proof (drawn for page width) | Proofs both ways |
| `example-university-host`, `example-university-visiting` (each with a `-tall` variant for phones) | The online campus from the host side and from the visiting side | An online university (runnable walk) |
| `example-university-three-doors` | Three doors the university would set: a Workspace door, a course door, and onboarding | An online university (draft) |
| `example-university-workspace-door` | A faculty co-worker agent visits the university's Workspace door to read one week's submissions | An online university (draft) |
| `example-fan-community-doors` | Three doors, three owners, around a fan community: the community's door, a creator's door, and a studio's licensing desk | At a fan community (draft) |
| `example-fan-community-license` | A fan's agent visits a studio's licensing desk to ask for a license for one short film | At a fan community (draft) |
| `example-enterprise-doors` | A freight company sets doors in front of internal resources and visits partners' doors | At a freight company (draft) |
| `example-enterprise` | An employee's co-worker agent visits the shipments door (drawn for page width) | At a freight company (draft) |
| `example-enterprise-carrier` | The same co-worker agent visits a carrier's booking door | At a freight company (draft) |
| `example-introduction-only-club` | An introduction-only members' club: the door rule, a leaflet for visitors without an introduction, and a research pass | At an introduction-only club (draft) |
| `example-introduction-only-club-visit` | A new member's representative is admitted after a current member signs an introduction | At an introduction-only club (draft) |
| `true-story-domain` (with a `-tall` variant for phones) | A true story: what each site saw when the editor's agent bought a domain, and the same errand at a Shōkai door | Why Shōkai exists |

Other art in `../assets/`: `hero.svg` (and `hero.png`), built on the arch-with-keystone mark (logo concept 1a), and three 1600×900 social cards (`social-card-1..3.png`, sources in `social-src/`, rendered with headless Chrome).
