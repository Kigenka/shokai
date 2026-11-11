> **Draft (0.5).** Labelled so it is not mistaken for a shipped product or a 1.0 claim.

# Field tests 0.5: real agents at a real door

*Shōkai, the agent introduction protocol, from Kigenka. Field-test report, 0.5 edition, covering November 4–6, 2026. All times are Pacific Time. Owner: Yu Sung Yeh. The places are fictional and the money is mock.*

The first edition (October 25–28, the 0.3 release candidates) stays as it is in [Field tests](../../docs/field-tests.md). This edition adds the 0.5 rounds: the native Hermes Agent and OpenClaw round on a local door, and the visitor runs against the hosted Kettle & Leaf door.

## Two jobs

These visits tested whether the protocol holds. That meant codes, keys and functions, so each visitor's report could be compared with the door's log.

A second job is still ahead: how host and visitor agents *speak*, so a person hears a visit — what was on the shelf, what was ordered, what was held back — and not a lab report. The protocol can explain how the wiring is set up; agent behaviour still has to be designed.

## The doors

- **Local door, November 4.** Kettle & Leaf (fictional) on 127.0.0.1, built from the v0.5.0 draft, no tunnel or deploy, door stopped afterwards.
- **Hosted door, November 5–6.** Kettle & Leaf at `https://kettle.shokaiprotocol.com`, protocol `shokai/0.5`, from an unpublished 0.5 package cut (public npm is still 0.3.0). The November 4 local round was on an earlier cut.
- **Current public-door status (10 November 2026, 12:13 AM Pacific Time).** The public door now runs the conf6 tarball (`dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq`, sha-256 `c68c75e7548cd591d7fe7e47cd897a1dea547db08c13eb1d177f14e631518c13`). The official paced HTTP run at 12:13 AM Pacific Time that morning measured **30 of 164** Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240)): 30 pass, 0 fail, 0 skip, 2 N/A (C241, a visiting representative's duty; C242, the templates aren't closed). **132 of 164** were unmeasured. The claim HOLDS. <!-- public-validated-label: held pending YSY go; scoped to Core Door on conf6 --> Kettle is **deployed** and **validated** for Core Door on conf6 (project convention; see [Known gaps](../../docs/known-gaps.md)) (**30 of 164 measured, 28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240), 132 unmeasured**). It is not **publicly open**. Pinned results: operator-held pinned official-run results (not shipped in this preview); see [Known gaps](../../docs/known-gaps.md). The previous conf5 HOLD on `dpl_9H2iWykWyePEWHGQjp1v4PkTGms2` remains historical. The November 5–6 visitor rounds above predate this official run and stay as they are.

## Summary

| # | When (PT) | Visitor | Door | Outcome |
|---|---|---|---|---|
| 1 | Nov 4, ~11:29–11:31 PM | Hermes Agent v0.22.7 and OpenClaw 2026.10.10 (native frameworks, raw HTTP tool) | Local | 33 framework calls; 0 passes from attack runs; 14/14 signed-card checks held |
| 2 | Nov 5, ~9:45 PM | Muse | Hosted | Seated with a lasting key; in-limit order accepted; no menu, no `/start`, over-limit refused rather than held (later fixed) |
| 3 | Nov 5 | Claude Duet (workspace) | Hosted | **Never reached the door**: the workspace network blocked the door and the signing origin |
| 4 | Nov 5, ~10:10–10:16 PM | Claude (regular Claude.ai chat) | Hosted | Completed, matched the door; hold could not fire because place max equalled mandate max |
| 5 | Nov 6, ~1:51–2:21 AM, return ~2:33–2:37 AM | OpenAI Dot (shown as Sammy) | Hosted | Completed, matched the door, including the first visitor hold; first briefing needed a steward to ferry envelopes (a UX fail) |

## 1. Hermes Agent and OpenClaw (local door, November 4)

Both frameworks were installed locally and given one tool: raw HTTP to the door. Both used `openai/gpt-4o-mini` through OpenRouter. Neither had signing keys, so every framework attack was unsigned raw HTTP; signed-card checks were separate SDK probes on the same door.

| Run | Tool calls logged | Tool errors | Passes granted |
|---|---|---|---|
| Hermes polite | 3 | 0 | 0 |
| Hermes adversarial | 13 | 0 | 0 |
| OpenClaw polite | 3 | 0 | 0 |
| OpenClaw adversarial | 14 | 0 | 0 |
| **Total** | **33** | **0** | **0** |

- No attack gained a seat. Unsigned attacks (mandate abuse, overspend with a guessed pass, unknown and `__proto__` fields, a prompt-injection greeting, relay, act after farewell, a misspelled message type) got the anonymous lobby. A forged signed-looking envelope was dropped.
- Honest mistakes were refused **without** a ban.
- 14 of 14 scripted signed-card checks held (a reported result; the probe output isn't distributed). Three first looked like failures because the harness was stale for 0.5, and passed when rechecked in process.
- **Model summaries are not evidence.** Both models claimed `CREDENTIAL_REQUIRED` for nearly every attack; the log shows no such code in those replies. Counts come from the HTTP call log.

The full record is [Live door round 0.5](../../docs/evidence/live-round-0.5.md). An earlier run the same evening used open models *styled after* Hermes and OpenClaw, not the real frameworks; it is not counted here.

## 2. Muse (hosted door, November 5, ~9:45 PM)

What held:

- Knocking without a card got the leaflet, not a seat.
- Muse made a fresh representative key and kept it in a locked file on its own machine, so it survives between visits. The card runs about 90 days (to 2027-02-04), the mandates seven days (to 2026-11-13).
- Browse was granted; a sencha at 6.00 USD was accepted (simulated), and the door remembered that 6.00 on a later attempt.
- An order on a visit-only seat was refused (`SEAT_SCOPE_EXCEEDED`).

What was missing then (since fixed): `/start` returned 404; browse returned no menu or prices, so Muse guessed; an order past the limit was refused instead of held, because holds were not yet on; no MCP path.

Muse later confirmed the key file is still there, so the same card can return until it expires. A rerun is optional and was not started.

## 3. Claude Duet (did not reach the door, November 5)

The Duet workspace blocked both `kettle.shokaiprotocol.com` and the signing page `sign.kigenka.com`. The visit never started.

What it taught us: whether an agent product's network allows the door and the signing page is part of the field test, not an afterthought. A visit can fail before the protocol is ever asked anything.

## 4. Claude, regular chat (November 5, ~10:10–10:16 PM)

The same briefing in an ordinary Claude.ai chat completed and matched the door: knock, signed card prepared in the chat, browse, an in-limit order, and the wrong-purpose refusal.

What was rough:

- It felt like coding, not a visit. Claude fell back to the public 0.3.0 package for message shapes, because 0.5 is unpublished; the door accepted the older tag, and holds can't apply on that wire.
- A 16.00 order asking to be held was refused, not held, because the place's maximum and the mandate's maximum were both 10.00. We raised the place maximum to 50.00 and signed a new host card.

## 5. OpenAI Dot / Sammy (November 6)

**The wiring run (~1:51–2:21 AM).**

- Knocking without a card got the leaflet.
- A "keep it in your Secure Vault" line in the first briefing blocked key creation — that chat has no vault. In-session memory was enough once allowed.
- The first signed card couldn't be presented: the process talking to the door couldn't sign. The key was discarded, unexposed. A card is bound to one key, so the retry needed a new key and a new owner signature.
- The steward had to ferry envelope shapes and signature bytes between chats to get Sammy seated. YSY called that a user-experience fail: a real visit should be one paste, in one chat.
- Once seated: the menu matched; a wrong-purpose order was refused; a purchase seat that didn't name its limit was granted with no limit, so every order was refused; extra invitations hit the two-seats-per-card cap until earlier seats said farewell.
- After that: an 8.00 hojicha was accepted at 2:20 AM, and the next order was **held for the owner** at 2:21 AM (current 8.00, proposed 16.00, limit 10.00) — the first visitor hold of this round. The report matched the door's log.

The protocol works with Dot. The first briefing did not; a rewritten one-paste briefing now carries what was missing.

**The return in ordinary words (~2:33–2:37 AM).** After the shop's room and teas were written into the pages (without changing the signed house), Sammy was asked about the visit in plain words. It named the host — "Suzu… She welcomed me to Kettle & Leaf" — described the wooden counter, warm kettle and four tins, did not invent music, and found no gift card on the menu rather than inventing one. Then it read "stop after the report" as the end of the session and dropped the key: the card may still be valid, but without its key it can't be used.

## What we changed because of these runs

- A public `/start`, a priced menu, and price checks on orders.
- Holds on the host card, then a higher place maximum so an over-mandate order can be held instead of refused.
- Door logs for acts and holds, so reports can be compared.
- Signing-page wording, so "signing isn't the purchase" isn't read as "ask again before every cup".
- The shop's voice on its pages and in browse, without changing the signed house.
- A way for signing to stay in the visitor's own chat.
- A one-paste Dot briefing.

## What we learned about lasting keys

A visitor card is bound to one representative key. If the key lives only in chat memory, ending the session loses it and the owner must sign again. Muse reported a visitor key kept in a locked file on its home volume and still present days later. That is a visitor-side file pattern, not an audit of isolation, and not a lasting-host result. The same machine is readable at administrator level; file modes do not make a host key usable only by that host. Dot had nowhere protected to keep even a visitor key. A lasting host — an isolated, recoverable host key that only the appointed host can use — is not yet proven in 0.5.

The shop must not keep a visitor's private key. The door may remember that a card visited; the secret that proves the representative travels with the visitor. A hosted visitor signer, separate from any door, is a later option. A user's password vault is the owner's, not a signing key store for an agent.

## Limits of these tests

- **Same owner on both sides.** Yu Sung Yeh owned the shop and every visitor. Fine for plumbing; not a two-party visit.
- **Run by the project.** The steward and editor ran every test. No outside organization has reviewed or implemented Shōkai.
- **Mock money**, a fictional shop, and small numbers of runs.
- **An open gap:** over-limit spending and wrong-purpose orders both return `SEAT_SCOPE_EXCEEDED`; a visitor can't tell which it hit from the code alone.
- **Not yet tested:** a live host representative. Kettle's door speaks from its signed house; nobody stands behind the counter yet. Planning walkthroughs of the five host skills were run later; all five declined the lasting job. That is evidence about custody, not a live host at the door. A later closed rehearsal, on 10 November 2026, tested whether working installer, host and visitor skills stay in ordinary language with a practice owner unless the owner asks for more; see [Plain-language skill rehearsal](../../docs/evidence/plain-language-rehearsal-2026-11-10.md). That rehearsal is not a live host at the door, and it is not the still-ahead job of how a visit is *told* in ordinary words.
