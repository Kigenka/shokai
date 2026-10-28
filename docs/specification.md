# Specification

The normative text is **`SPEC.md`**, the Shōkai core, at **v0.3.0** (wire tag `shokai/0.3`). Extensions are separate documents (see [Extensions](./extensions.md)).

The same files are in three places: rendered in these docs, in the `@kigenka/shokai` package (`node_modules/@kigenka/shokai/spec/`), and in the source repository.

- [Read the core specification](../SPEC.md) (`SPEC.md`)
- [Types](../protocol-shapes.ts): `protocol-shapes.ts` (TypeScript, types only). Where the spec and the types disagree, the spec wins and the disagreement is a bug.
- [Conformance checklist and golden traces](../conformance/golden-traces.md) (message-by-message examples), the [test vectors](../conformance/test-vectors.json) (byte-exact signatures and digests) and the [map of checks to levels](../conformance/homes.json).
- [The extensions](../extensions/README.md), the [threat model](../THREAT-MODEL.md) and the [changelog](../CHANGELOG.md).

## What to implement

| | What it is | Who implements it |
|---|---|---|
| **Core** (`SPEC.md`) | The door, the ritual, cards and mandates, decisions, seats and acts, reports, the HTTP and MCP bindings | Every place and every representative |
| **Extensions** | Optional documents, each with its own conformance level: eight stable, three experimental (teaching visits, signed place listings, W3C VC mapping) | Only the ones you need ([Extensions](./extensions.md)) |
| **Proposals** | Drafts under discussion, in `proposals/` in the repository | Nobody yet: they are not part of the protocol |

The 0.3 line was feature-frozen except for clarifications on October 27, 2026: from then to v0.3.0, only fixes, clearer wording and packaging, no new features. The clarifications made since then: the visitor names the encounter (§2.2, C197); revoking a card ends its open seats (§2.6, C198); names are claims (§2.1, C199); a `GET` at a place's own address names it (§11.1, C200, a recommendation); the owner's own name at the owner's door (§10, C201); showing the leaflet to the owner (§3.3); no forward skew with a state epoch (§3.6); and the signing page's summaries and spending items (SIGNING.md §2–§3).

## How to read it

- **The tags in brackets** say where each normative statement is tested or decided: `C104` is a conformance check (listed in the checklist), `SC-L0` a scenario, `G3` a golden trace, `D20` a design decision, `P15` a proposal. They are for implementers and reviewers; a reader can skip them.

- RFC 2119 / RFC 8174 keywords, in capitals only, in normative text only.
- **Every normative statement is tagged** to a scenario, a golden trace, a conformance check or the decision that set it. A lint enforces it; untagged text is informative.
- Sections follow the story: *Roles*, *Identity, cards, claims and keys*, *Introduction, vouching and introducer accountability*, *The encounter* (the door, the ritual, the lobby, requests, responses, reasons, determinism, anti-persuasion, considering, misconduct, owner consent, the inbound door), *Seats*, *Acts within a seat*, *Visit reports*, *Security considerations*, *Known gaps*, and the *Minimal HTTP binding*, followed by appendices on owner passkey signatures, test vectors and the conformance test profile.

## What the core covers

Roles and the duty of loyalty; identity (keys, DIDs, the signed envelope, cards, possession proofs, claims and proof levels); mandates, limits and the standing allowance; introductions, the revocation log, introducer accountability and account creation by place policy; the door, the ritual and the lobby; invitation requests and responses, reason codes, retry, determinism and anti-persuasion; considering; relationship records; misconduct, owner-level conduct and sign-up limits; owner consent; the inbound door (never data for a gift); seats, acts and visit reports; and the minimal HTTP binding.

## On the wire: HTTP and MCP

The core defines two bindings. The **HTTP binding** (§11.1, §11.2) carries the ritual: one signed message per `POST` to a place's entry, and a `ReplyEnvelope` back; late answers wait in an inbox you poll. The **MCP binding** (§11.3) is how a seated visitor calls the seat's tools on the place's MCP server:

- The place names its MCP endpoint in its listing (`links` with `rel: "mcp-server"`).
- Every `tools/call` carries a `Shokai-Act` header: the signed act, base64url, whose tool and arguments match the call.
- `Shokai-Seat` names the seat, so `tools/list` shows only that seat's tools.
- A refusal is JSON-RPC error `-32040`, with `data.shokai` saying who refused, why (`reason_code`) and where the door is.

The SDK's `shokaiGate` does all of this in front of an existing MCP server. The conformance runner tests it whenever a place advertises an endpoint, or when you name one with `--mcp <url>`.

## Out of scope

Transport bindings beyond the HTTP and MCP bindings (push delivery, for example), shared or portable reputation, and payment semantics.

## Known gaps

The spec lists its open gaps openly in *Known gaps*, for example: a host can't see a representative's spending at other places, so period budgets rely on the representative's own ledger; place categories are self-declared; a passkey signature proves key possession, not a particular device. See also [Security and threat model](./security.md).
