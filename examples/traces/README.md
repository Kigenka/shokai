<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Traces behind the example diagrams

| File | What | Reproduce |
|---|---|---|
| `willowfold-muse.transcript.txt` | Willowfold Tea House's own transcript of a Muse representative's visit, field test 2026-10-27 (tunnel address and a local path replaced) | Not reproducible: a recorded field test |
| `restart.mjs`, `restart.trace.json` | The demo tea house is killed by its exact pid mid-visit and restarted: a clear retry, a polite "please knock again", no repeated ids, a withdrawn card stays withdrawn, the visit completes (DIDs shortened, port masked) | `(cd packages/shokai && npm run build) && T=$(mktemp -d) && (cd packages/shokai && npm pack --pack-destination $T) && (cd deploy/demo-place && npm install --no-save $T/kigenka-shokai-*.tgz) && node examples/traces/restart.mjs` |
| `dual-role.mjs`, `dual-role.trace.json` | One representative, two cards, a revocation (SDK, in one process) | `(cd packages/shokai && npm run build) && node examples/traces/dual-role.mjs` |
| `brand-door.mjs`, `brand-door.trace.json` | A friend introduces a brand at a person's door (reference implementation, scenario V29-D2) | `(cd reference/engawa && npm run build) && node examples/traces/brand-door.mjs` |

The store, bank and marketplace diagrams come from recorded wire logs of the v0.3.0-rc4 simulated-team rounds, kept privately until they are scrubbed for the planned "how Shōkai was tested" page. Those pictures still say `seat` and `seated`. That is the log. The v0.5.0 draft calls that grant a pass, and these traces were not redrawn as v0.5 runs. The tea-shop diagram is the 2026-10-27 field-test transcript and still says seated for the same reason. The community-room diagram follows [reference transcript 07](../../reference/prototype/transcripts/07-gathering-at-the-engawa.md). Diagram sources are in [../diagrams/src/](../diagrams/src/); render with `docs/diagrams/render.sh`'s settings (`mermaid-config.json`).
