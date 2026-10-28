# The reference signing page

A small, dependency-free Node server where an owner creates a passkey and approves what their representative asks them to sign: a card, a mandate, a revocation, an owner link. The page lists every item in plain words, then the owner approves them all with **one passkey tap** (one WebAuthn assertion over the batch, SPEC Appendix A.1, C195, D23); each item still gets its own signature copy (`webauthn.batch`, `webauthn.batch_index`) and verifies on its own. "Go through them one by one" is the fallback (and the only mode for a single item). It follows [SIGNING.md](../../SIGNING.md) and SPEC Appendix A.1. No private key exists on the server: the passkey's private half never leaves the owner's device.

```sh
RP_ID=sign.example.com TOKEN=$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))') \
ITEMS=./items.example.json DATA_DIR=./run-data node server.mjs
# → listens on 127.0.0.1:8797 at /p/<TOKEN>/ ; reach it from a phone only through your own https front for RP_ID
```

- **RP_ID** is your signing origin's hostname. Owner signatures are bound to it (`rp_id`, exact origin `https://RP_ID`), so pick a domain you will keep (SIGNING.md §1, §7).
- **ITEMS** is a JSON file of payload templates (see `items.example.json`). `$OWNER_DID`, `$RP_ID`, `$NOW`, `$IN_7D` and `$IN_30D` are filled in once the passkey exists; the items are then frozen so their digests don't change while the owner reads them.
- **TOKEN** is the path secret (at least 24 characters); **RELAY_SECRET** (optional) makes the page answer only requests from your https front; **TTL_MIN** closes the page by itself (default 30 minutes), and it also closes 2 minutes after the last item is decided.
- **NOTICE** (`none` by default, or `test-stage`) shows the test-stage notice from `deploy/SIGNING-PAGE-PLAN.md`: the short form at the top of every screen, before "Create my passkey"; one line on the done screen; and the full text with its FAQ at `about`. The text names Kigenka as the operator, so edit `public/index.html` and `public/about.html` if you run your own page with it. **NOTICE_DAYS** is the advance warning it promises before the address changes (default 90; the page refuses to start with less).
- Output: `DATA_DIR/signed/<name>.json`, each a signed envelope any Shōkai verifier accepts. `DATA_DIR` holds only public data; keep it private anyway (it shows what was signed).

What the page enforces, against SIGNING.md:
- **§2 items 1, 2, 4, 5:** user verification required, ES256, the exact origin, `crossOrigin` absent or false, no `topOrigin`; one challenge per item (the item's digest) or, for one tap, the batch digest of the 2 to 16 items the page listed; single-use challenges; the Appendix A.1 signature shape.
- **§2 item 3 (show before signing):** every line the owner reads is built on the server from the item's machine fields by `describe.mjs`: the kind of item, keys, purposes, actions, amounts, places (or "ANY place" when none is named) and dates. The title and summary in the items file, and free text inside the payload (a purpose statement, a role, a name, a `shown_to_owner` text), are shown only as quotes, marked with who wrote them. Every signed field is shown, at any depth: what the describer doesn't word is listed as it is at its full path (for example `owner_binding.platform_key` is worded as the chat key, and an unknown nested field is listed), and coverage is checked leaf by leaf. Identifiers are shown in full. A value it can't show faithfully (control or invisible characters, nesting deeper than 8, an odd field name) stops the page from starting. An allowance must carry its grants (checked against `grant_digests`, every grant field shown), and door rules must carry their private part (`{salt, note}`, checked against `private_digest`, every field shown); otherwise the page refuses to start. An item carrying fields of more than one kind (say a mandate's and a card's) is refused too.
- **§3 (one tap):** an item with an amount anywhere (a mandate with `max_amount`, an allowance, any other item carrying a `Money` value) or of an unknown kind never joins a one-tap batch; it comes after, with its own tap. The server refuses such a batch too.
- **§4:** no private key held or logged; nothing signed without a verified assertion.
- **Beyond the profile:** when the authenticator counts signatures, an assertion that doesn't count higher than the last is refused (a possible copied authenticator); a body over 100 kB is refused at once with 413; at most 32 challenges are open at a time (then 429).

Not enforced: whether the facts are *true* about the world (a key's owner, a place's name). The page shows what the item says, not who is behind a key.

Test: `node test/e2e.mjs` (a software authenticator stands in for a phone; part of `npm test`).
