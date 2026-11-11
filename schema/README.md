# Shōkai JSON Schema

The wire types of Shōkai are defined in TypeScript first, in [`protocol-shapes.ts`](../protocol-shapes.ts), and made available here as JSON Schema (draft-07) for implementers in other languages.

**Which file to use.** Each file has its own `$id`, and a released file never changes. Package 0.5.1 keeps the wire tag `shokai/0.5` and `spec_ref.version` `"0.5.0"`, but a binding `never` may now carry two optional members, `retry.until` and `retry.appeal` (SPEC-DETAIL §9.3). A validator that uses the 0.5.0 schema rejects a `never` that carries `until` and `appeal`; to accept them, validate with the 0.5.1 schema file. The 0.5.1 file accepts every 0.5.0 message too. It also stops requiring `in_reply_to` on `invitation_response`, because the lobby's answer to plain prose or a malformed message MUST NOT carry it (SPEC-DETAIL §2.3); the 0.5.0 file rejects that lobby answer.

| Version | Schema | Wire tag |
|---|---|---|
| v0.5.1 (current; package 0.5.1, specification v0.5.0: v0.5.0 plus the optional `Retry` members `until` and `appeal`) | [`v0.5.1/schema.json`](v0.5.1/schema.json) | `shokai/0.5` (accepts `shokai/0.3` during the transition) |
| v0.5.0 (package 0.5.0; frozen, unchanged since its release) | [`v0.5.0/schema.json`](v0.5.0/schema.json) | `shokai/0.5` (accepts `shokai/0.3` during the transition) |
| v0.4.0 (draft, superseded) | [`v0.4.0/schema.json`](v0.4.0/schema.json) | `shokai/0.3` |
| v0.3.0 | [`v0.3.0/schema.json`](v0.3.0/schema.json) | `shokai/0.3` |

- **Generated, not written by hand.** `npm run schema` regenerates it from `protocol-shapes.ts` (with [ts-json-schema-generator](https://github.com/vega/ts-json-schema-generator)); `npm run check-schema` fails if the current file is stale or if a released file (v0.5.0) has changed by a single byte. Change the TypeScript, never the JSON.
- **Tested against the golden traces.** `check-schema` validates every message in [`conformance/golden-traces.md`](../conformance/golden-traces.md) that has no fixture placeholder and every signed object in the standalone JSON traces (`conformance/golden-*.json`), and checks that broken controls (no signatures, another wire tag, an unknown message type) fail.
- **Extensible messages.** Message payloads, cards, mandates, allowances and vouches accept `x-` members (SPEC Conventions: unknown members are ignored unless named in `crit`); signatures, the signed envelope and other closed objects accept no member they don't define.
- **Where to start.** `WireMessage` is a signed envelope (`payload`, `payload_digest`, `signatures`); `ShokaiMessage` is any payload; `DoorPointer` is what a door publishes. Signed objects such as cards and mandates are `Signed<…>` definitions.
- **What a schema can't check.** Signatures, digests, timestamps in context, limits, and every rule that needs state: those are in [docs/SPEC-DETAIL.md](../docs/SPEC-DETAIL.md) and the conformance runner (`npx -p @kigenka/shokai@0.5.1 shokai-conformance`). A message that validates here can still be refused at a door. Where the schema and the normative text ([docs/SPEC-DETAIL.md](../docs/SPEC-DETAIL.md)) disagree, SPEC-DETAIL wins and the disagreement is a bug; please [open an issue](https://github.com/Kigenka/shokai/issues/new/choose).

The SDK ships the current file in the releases after 0.3.0: `spec/schema.json` in the package, importable as `@kigenka/shokai/schema.json`. Package 0.5.1 ships the v0.5.1 file; package 0.5.0 shipped the v0.5.0 file.
- **Extensibility (generated schema).** Every object an extensible artifact contains (a card's `principal`, scopes, limits, …) takes `x-` members; signatures, the signed envelope, Money, proofs and digests stay closed. `tools/schema/schema.mjs --check` tests both, nested included.
