# Audit method (v0.5.0, pre-release)

How Shōkai's own testing maps to the practice of published protocol audits (TLS 1.3, Signal, OAuth/OIDC, IETF drafts), and where it falls short. This is the project testing itself; it is not an independent audit or a certification.

| Audit practice | What we do | Where | Gaps (honest) |
|---|---|---|---|
| **Threat mapping (STRIDE-style)** | THREAT-MODEL.md lists threats by asset and adversary; red team rounds attack spoofing (stolen cards, lookalike DIDs, homoglyphs), tampering (digest and signature checks), repudiation (signed acts, receipts), information disclosure (share-plan scope, private room text), denial of service (lobby floods, oversize bodies, anonymous rate limits) and elevation of privilege (prompt injection in prose, limit raises, scope escalation). | THREAT-MODEL.md, `tools/attack-harness`, `tools/enforce` | The threat model is not yet tabulated per STRIDE category with a test link for each row. |
| **Invariants and proof by test** | Every normative requirement carries a tag (e.g. `[SC-L0, C215]`); trace-lint checks each tag has a scenario and a golden trace; enforcement cases are built to fail (`mutate.mjs` breaks the door to show the case catches it). | `tools/trace-lint.mjs`, `tools/enforce` | Tests show invariants hold on chosen inputs; there is no formal model (e.g. ProVerif/Tamarin) and no proof. |
| **State-machine completeness** | The ritual (greeting → card → introduction → request → seat → act → farewell) is exercised in order, out of order and with repeats in scenarios, golden traces, and the fuzz test's random step sequences. | `reference/engawa/test`, `tools/fuzz` | No generated transition table checked for every (state, message) pair. |
| **Message-parsing robustness** | Bounded input, oversize bodies (413), malformed bodies get the generic lobby; seeded property-based fuzz of malformed, unsigned and tampered messages (host never throws, never grants). | `tools/fuzz/fuzz.mjs`, attack harness H2/H3 | The fuzz is small (2,200 cases by default), random rather than coverage-guided, and in-process only; no HTTP-layer or JCS canonicalization fuzzing yet. |
| **Conformance-vector reproducibility** | Fixed test vectors and golden traces with fixed keys; the JSON Schema is regenerated and checked; `npm run verify` reproduces every result from a clean clone. | `conformance/`, `schema/v0.5.0`, `TESTING.md` | Not yet reproduced by anyone outside the project. |
| **Interoperability across implementations** | One clean-room implementation written from the spec alone by a sandboxed agent; a black-box conformance runner usable against any door. | conformance runner, red team report | All implementations are TypeScript and from inside the project; no independent second implementation in another language. |
| **Normative language (RFC 2119 / RFC 8174)** | Binding MUST/SHOULD/MAY words live in [docs/SPEC-DETAIL.md](docs/SPEC-DETAIL.md) (Conventions). The short [SPEC.md](SPEC.md) is informative except where it restates a rule with a check id; the detail wins on any tension. | docs/SPEC-DETAIL.md Conventions | Informative and normative text still share the short core file; no automated check that every MUST in the detail is tagged and tested. |

## Findings format

Findings from our red team and from expert reviews use: ID, title, severity (critical, high, medium, low, info), description, how to reproduce, recommendation, status (open, fixed, narrowed, accepted).

## Known open items

Spec-level attack-harness breaks S1, S2 and S4 (one owner with many agents, passkey farms, low-and-slow returns) wait on protocol decisions. See the red team report.
