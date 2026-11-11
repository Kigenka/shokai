# Evidence

These pages publish what was tested locally for the v0.5.0 draft, with enough detail to weigh the claims. They are **not** a certificate, and they do not claim every agent was tested.

Verify on the docs site is this evidence plus the core-vs-rich benchmark. Transparency stays its own story: field tests, review history and the red-team rounds. The two link to each other. They are not the same section.

| Page | What it covers |
|---|---|
| Live door round 0.5 | Native Hermes Agent and OpenClaw against a local door. The full write-up is `docs/evidence/live-round-0.5` in the draft site package. It is not in this public tree yet. Ground truth for those calls is the HTTP log, not a model's own summary. The site publishes the sanitized log (`http_calls.jsonl`), the MCP HTTP harness, the Hermes visitor loop and the configuration under `/evidence/live-round-0.5/`; the exact prompts and the raw output of the 14 signed-card probes are not distributed, so those headline numbers are **reported results**. |
| [Plain-language skill rehearsal](./plain-language-rehearsal-2026-11-10.md) | 10 November 2026 closed rehearsal of owner-facing skill language, plus a real Muse run. Reports what was tested; does not claim the skills always stay plain. |
| [Field tests](../field-tests.md) | Eight earlier field tests (October 25–28, 2026) with Grok Bot, Muse, Hermes and OpenClaw |
| [Red-team rounds](../../security/redteam/README.md) | Scripted attack rounds against the reference door |
| [Review history](../review-history.md) | What reviewers found and what changed |

Ground truth for live framework calls is the HTTP call log, not a model's own summary.
