# Diagrams

Mermaid sources in `src/`, rendered to `svg/` and `png/` (2x, 1600 px viewport) by `./render.sh` (needs `npm install` in `site/docs-site` and a local Chrome). Theme: `mermaid-config.json` (paper `#fbf9f4`, indigo `#2c4a6c`, vermilion `#9c4a32`, matching the site).

| Diagram | Shows | Used in |
|---|---|---|
| `thirty-seconds` | The whole idea in one line: owner → representative introduces itself → the host at the door → seat → work → report home; the leaflet when not ready; the optional vouch | README |
| `arrival-sequence` | The arrival story, message by message | Core concepts |
| `layers` | Where Shōkai sits: above transport identity, in front of MCP, A2A and a place's APIs | Architecture |
| `protocols` | Which question each neighbouring protocol answers | Relationship to other protocols |
| `website-front-door` | A place's three layers: the website (outside Shōkai), the agent front (open to look at) and the door (anything personal) | Website, agent front, door; README; Relationship to other protocols |
| `three-ways` | Self-introduction (the normal case), with invitation and vouch as optional extras, and the leaflet for an agent that isn't ready | Arriving |
| `brand-door` | A brand at a person's door: policy, normalisation, hard rules, ceiling, taste, report | Door policy |
| `conduct` | Conduct and consequences, local to one door | Conduct |
| `core-extensions` | The core story and the eleven optional extensions | Extensions |
| `example-*` | One sequence per example | Examples |

Other art in `../assets/`: `hero.svg` (and `hero.png`), built on the arch-with-keystone mark (logo concept 1a), and three 1600×900 social cards (`social-card-1..3.png`, sources in `social-src/`, rendered with headless Chrome).
