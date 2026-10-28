# Shōkai JSON Schema

The wire types of Shōkai are defined in TypeScript first, in [`protocol-shapes.ts`](../protocol-shapes.ts), and made available here as JSON Schema (draft-07) for implementers in other languages.

| Version | Schema | Wire tag |
|---|---|---|
| v0.3.0 | [`v0.3.0/schema.json`](v0.3.0/schema.json) | `shokai/0.3` |

- **Generated, not written by hand.** `npm run schema` regenerates it from `protocol-shapes.ts` (with [ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator)); `npm run check-schema` fails if it is stale. Change the TypeScript, never the JSON.
- **Tested against the golden traces.** `check-schema` validates every message in [`conformance/golden-traces.md`](../conformance/golden-traces.md) that has no fixture placeholder, and checks that broken controls (no signatures, another wire tag, an unknown message type) fail.
- **Where to start.** `WireMessage` is a signed envelope (`payload`, `payload_digest`, `signatures`); `ShokaiMessage` is any payload; `DoorPointer` is what a door publishes. Signed objects such as cards and mandates are `Signed<…>` definitions.
- **What a schema can't check.** Signatures, digests, timestamps in context, limits, and every rule that needs state: those are in [SPEC.md](../SPEC.md) and the conformance runner (`npx shokai-conformance`). A message that validates here can still be refused at a door. Where the schema and SPEC.md disagree, SPEC.md wins; please [open an issue](https://github.com/Kigenka/shokai/issues/new/choose).

The SDK ships the same file in the releases after 0.3.0: `spec/schema.json` in the package, importable as `@kigenka/shokai/schema.json`.
