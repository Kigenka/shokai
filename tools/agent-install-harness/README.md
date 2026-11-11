# Agent install harness

Tests the agentic way in (path B) against the by-hand way (path A), deterministically:

- A scripted agent follows `packages/shokai/agent-install/v1/` (AGENT-INSTALL.md and install-manifest.json) on four sample sites in `examples/drop-in/`, each copied to a temporary folder.
- It runs the real `shokai` CLI there: detect, the setup conversation with a scripted owner (fictional: Mika Tanabe, Kettle & Leaf), `house check` (which flags a word in the owner's first draft, so the agent takes it back to the owner), `house preview`, `init`, the one-line server change, and `host-card request`. Then it stops: only the owner signs.
- The test then plays the owner's moment with a stand-in passkey under a reserved test name, runs `host-card verify`, starts the site on 127.0.0.1, and checks that the site still answers, that `discover()` finds the door, that an agent without a Shōkai visitor card gets the leaflet, and that a visiting representative with one is admitted with a pass.
- Path A runs the same steps as an owner at a terminal. Both must write the same files byte for byte, the same house.json and Shōkai host card request, and serve the same house digest, listing and pointer (only each door's own key differs).
- Four sample sites: `express-app`, `next-app` (App Router), `hono-app` (Hono on @hono/node-server) and `node-app` (plain node:http). Express, Hono and plain Node link the SDK and their framework from this repo. The Next site is real: `npm install` of its own package.json (next 16, react 19) plus the SDK from a local `npm pack` tarball, then `next build` and `next start`. The harness checks it is the Next server answering (`X-Powered-By: Next.js`).
- For each site, two instances of the same door (two server processes on one project folder, sharing `.shokai/state.json`) serve one visit with every message alternating between them, and the pass's spending cap is counted across both: no sticky sessions.

No model is called, and the doors and visits stay on 127.0.0.1 (the harness fails on any other host it fetches). The only other traffic is `npm install` for the Next sample, which uses npm's cache when it has the packages. Cost: $0.00.

`--only=next-app,hono-app` runs some of the sites.

```sh
npm --prefix packages/shokai run build
node tools/agent-install-harness/harness.mjs                       # checks
node tools/agent-install-harness/harness.mjs --write-transcripts   # also refreshes transcripts/ (ports, keys, digests, times redacted)
```

A live run with a real model as the agent (same scripted owner) is a separate, opt-in step; see the cost note in the v0.4.0 drop-in report.
