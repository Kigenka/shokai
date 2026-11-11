# Minimal Core Door (browse), without the SDK

`door.mjs` is a Shōkai v0.5.0 **Core Door (browse)** (SPEC §0.1, C295) in about 280 lines of Node built-ins. It was written from SPEC.md alone and does not import `@kigenka/shokai`. It does the whole profile, which is every Core Door check except those Appendix F lists for it. That includes:

- the lobby for unsigned or unreadable traffic, including I-JSON: duplicate names, lone surrogates, inexact integers (C284);
- DoorPointers for unknown routes;
- the presentation check in §2.4's order:
  - a card that isn't the presenter's: `never`, binding the presenter only, with an expiry and an appeal path;
  - a proof that is missing or made for another door: `not_now`;
  - a copied proof: `never`;
  - a Shōkai host card shown as a visitor card: the wrong-kind refusal;
  - `crit` (C289);
- nonce reuse (`never`, binding nothing) and exact greeting redelivery;
- outsiders, which get a `RITUAL_ORDER` deny addressed to the sender;
- the ritual in order, introduction included, with a possession proof bound to this door in both directions (C292);
- `conditional` / `narrow_actions` for a partial overlap;
- probing counted only on wholly-outside requests, with a 180-day expiry and an appeal path;
- browse acts only: anything with an amount, or outside the list, is `not_a_fit`;
- the act refusals C189 names;
- pass caps and newcomer budgets (C287);
- the farewell outcome (wire still uses `seated` for a granted pass) with each grant, and the closing rules of §3.5;
- revocations bound to the card's principal;
- rate limits for unverified traffic (C278).

It fetches nothing a visitor or a card names. Revocation comes only by delivered `card_revocation`, and passes last at most an hour.

    node door.mjs          # a door on 127.0.0.1 (memory only, fresh keys each start; LIMIT=n states a higher rate limit)
    node check.mjs         # black-box, vectors, in-process tests, then the SDK conformance runner

`check.mjs` borrows the reference test kit only to make real owner-signed visitor cards. The door stays SDK-free. It runs in four parts:

1. Black-box checks over HTTP, including negative ones, so a door that gets these wrong fails.
2. The door's own crypto reproduces the byte-exact `possession_proof_v05` vectors and the recorded G1-v05 trace (Appendix A.2).
3. In-process tests of the door's own code for what HTTP can't reach: a host-ended pass, revocation storage pressure, start-up refusals, no outbound calls. `evidence.json` names these tests.
4. The SDK's conformance runner against a fresh door with `--claim browse --evidence evidence.json --accept-evidence-exec`, which must hold with no skips.

One thing is out of scope: the owner's passkey signing of a person's host card, because this demo place is an organization that signs with its own key.
