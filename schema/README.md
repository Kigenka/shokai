# Shōkai JSON Schema

The wire types of Shōkai are defined in TypeScript first, in [`protocol-shapes.ts`](../protocol-shapes.ts), and made available here as JSON Schema (draft-07) for implementers in other languages.

| Version | Schema | Wire tag |
|---|---|---|
| v0.5.0 (current, pre-release) | [`v0.5.0/schema.json`](v0.5.0/schema.json) | `shokai/0.5` (accepts `shokai/0.3` during the transition) |
| v0.4.0 (draft, superseded) | [`v0.4.0/schema.json`](v0.4.0/schema.json) | `shokai/0.3` |
| v0.3.0 | [`v0.3.0/schema.json`](v0.3.0/schema.json) | `shokai/0.3` |

- **Generated, not written by hand.** `npm run schema` regenerates it from `protocol-shapes.ts` (with [ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator)); `npm run check-schema` fails if it is stale. Change the TypeScript, never the JSON.
- **Tested against the golden traces.** `check-schema` validates every message in [`conformance/golden-traces.md`](../conformance/golden-traces.md) that has no fixture placeholder and every signed object in the standalone JSON traces (`conformance/golden-*.json`), and checks that broken controls (no signatures, another wire tag, an unknown message type) fail.
- **Extensible messages.** Message payloads, cards, mandates, allowances and vouches accept `x-` members (SPEC Conventions: unknown members are ignored unless named in `crit`); signatures, the signed envelope and other closed objects accept no member they don't define.
- **Where to start.** `WireMessage` is a signed envelope (`payload`, `payload_digest`, `signatures`); `ShokaiMessage` is any payload; `DoorPointer` is what a door publishes. Signed objects such as cards and mandates are `Signed<…>` definitions.
- **What a schema can't check.** Signatures, digests, timestamps in context, limits, and every rule that needs state: those are in [docs/SPEC-DETAIL.md](../docs/SPEC-DETAIL.md) and the conformance runner (`npx -p @kigenka/shokai@0.5.0 shokai-conformance`). A message that validates here can still be refused at a door. Where the schema and the normative text ([docs/SPEC-DETAIL.md](../docs/SPEC-DETAIL.md)) disagree, SPEC-DETAIL wins and the disagreement is a bug; please [open an issue](https://github.com/Kigenka/shokai/issues/new/choose).

The SDK ships the same file in the releases after 0.3.0: `spec/schema.json` in the package, importable as `@kigenka/shokai/schema.json`.
- **Extensibility (generated schema).** Every object an extensible artifact contains (a card's `principal`, scopes, limits, …) takes `x-` members; signatures, the signed envelope, Money, proofs and digests stay closed. `tools/schema/schema.mjs --check` tests both, nested included.
