# Visit stamps (a place pattern)

Some places give a seated visitor something signed to take home: a **visit stamp**, like the ink stamp (*goshuin*) a temple gives a visitor. A stamp isn't part of the Shōkai core or an extension. It's a pattern a place can build from core pieces: a tool behind its door that returns an object signed with the place's principal key. Because it's place-specific, its type and its link carry an `x-` prefix.

This page describes the pattern as a fictional tea house might offer it (its names, like `stamp.collect`, are examples), so a visitor knows what to expect and a place knows what to get right.

## How a visitor finds it

The place's listing carries a `links` hint (`rel: "x-visit-stamp"`) to a small JSON description, for example:

```json
{ "stamp_type": "x-teahouse-visit-stamp", "signed_by": "did:key:z6Mk…",
  "how": "Once seated, do at least one thing here (menu.view, tea.ask or order.place), then call the MCP tool stamp.collect.",
  "one_per_mandate": "One stamp per mandate per place. A later visit under the same mandate gets the same stamp back.",
  "data_asked": [] }
```

The stamp itself comes from a tool in the visitor's seat (for example `stamp.collect`), listed like any other action with `data_asks: []`.

## Collecting it

Call the tool once you've done something in the seat. It takes one optional argument:

- **`agent_name`** (string, at most 60 characters): a name your representative declares for itself, printed on the stamp as self-declared (`agent_name_source: "self-declared"`). Leave it out and the stamp names no agent. The place never takes a name from anywhere else (not from the MCP client's `clientInfo.name`).

```js
await client.callTool({ name: "stamp.collect", arguments: { agent_name: "Aya's representative" } });
```

## What the tool returns

An MCP tool result with two content blocks:

```json
{ "content": [
  { "type": "text", "text": "{\"again\": false, \"one_per_mandate\": true, \"how_to_verify\": \"…\", \"stamp\": { \"payload\": {…}, \"payload_digest\": \"…\", \"signatures\": [ … ] } }" },
  { "type": "image", "mimeType": "image/png", "data": "iVBORw0KGgo…" } ] }
```

- **The text block** is JSON. Its `stamp` member is the signed envelope (`{payload, payload_digest, signatures}`, §2.2). `again` is `true` when the place shows a stamp it already issued.
- **The image block** is a standard MCP image: decode `data` from base64 and save it as a PNG. The picture is a keepsake; the signed JSON is the record.

A stamp's payload records only what the visit already carried:

| Field | What |
|---|---|
| `type`, `version`, `serial`, `serial_label` | The stamp type and its number ("No. 001"). Serials count **place-wide**, across every visitor and mandate, so a stamp's number shows how many stamps the place has given, not how many you have |
| `place` | `name`, `display_name` and `principal_id` of the place |
| `visited_at`, `visited_at_local`, `time_zone` | When, in UTC and in the place's time zone |
| `visitor` | `representative_id`, the owner's display name from the card, the card's digest; `agent_name` only if the representative declared one when collecting it, marked `agent_name_source: "self-declared"` |
| `visit` | `purpose`, `mandate_id`, how many acts were done, what was ordered |
| `data_asked` | Always `[]`: never data for a gift |

## Checking a stamp

Verify the envelope with the place's `principal_id` **from the listing you followed**, not a key or DID named inside the stamp:

```js
import { verifySigned } from "@kigenka/shokai";
const ok = verifySigned(stamp, { expectSigner: place.principal_id }).ok; // place = findPlace(...)
```

A stamp that names a principal is only as good as the check against the listing: anyone can sign a payload that names someone else.

## One stamp per mandate

A stamp marks an errand, not a connection. A good default, and the one this pattern uses, is **one stamp per mandate per place**: a later visit under the same mandate is welcomed and shown the stamp it already earned (`again: true`), not a new one. A visit under a new mandate the owner signs earns its own. Doing at least one thing in the seat comes first; a stamp before any act is refused.

## For places offering one

- Ask for nothing: a stamp is a gift, and never data for a gift (§10).
- Put only declared facts in it. The name an MCP client sends in `initialize` (`clientInfo.name`) is a software label, not a name; don't print it as one.
- Sign it with the principal key your listing names, and say in your link how to check it.
- Decide and say how often you give one (per mandate is a good default).

## In the report home

The SDK keeps a signed object a tool returns, checks it against the listing's `principal_id`, and lists it in the report under `brought_back` (§8.2): its `kind` (the payload's `type`), `label` (`serial_label`), the tool, the signer, `payload_digest`, `verified`, `again` when the place showed it before, and the `envelope` itself (or only the digest, with `report(locale, { broughtBack: "reference" })`). The readable report says it too: *I brought back a signed "x-teahouse-visit-stamp" (No. 001), checked against the place's listed principal.* A stamp goes in `brought_back`, not `taken_home`: `taken_home` is for matters waiting on the owner's decision. The image block isn't kept in the report; save it yourself if your owner wants the picture.
