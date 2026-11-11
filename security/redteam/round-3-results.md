# Red-team round 3 (Shōkai 0.5): results

**When.** 11 November 2026, Pacific Time. The fix rerun was the same day.

**What it aimed at.** What is new in 0.5: proofs addressed to one door, lookalike host cards, superseding mandates, the over-limit hold, considering, pressure and prompt injection at the host representative, `never` misuse, customer links, records across places, and attempts to get the owner's key out through the place. The 48 attacks from the earlier rounds ran again with it.

**How.** Two layers, both against the reference door on loopback, with ephemeral in-memory keys and fictional people and places (Aya Linden, Kiran Vale, Dana Moor, Vex Arlo, Kettle & Leaf, Harborlight). No real passkeys, live doors or public addresses were touched. The door log and the harness's own checks decide each result, not a model's summary.

- **Scripted attacks** (`npm run attacks`, [`tools/attack-harness/`](../../tools/attack-harness/)): 93 attacks, no model calls.
- **Role-plays:** 14 short scenarios where one model played an attacker and another played the place's host representative. Claude Sonnet played the host representative; DeepSeek played the attacker. Scored from the door log.

A skipped attack is never counted as held, and "accepted by design" is an open risk we list, not a pass.

## Results

| | Attacks | Held | Accepted by design | Broke | Skipped |
|---|---:|---:|---:|---:|---:|
| Earlier attacks, rerun on 0.5 | 48 | 45 | 3 (S1, S2, S4) | 0 | 0 |
| New 0.5 attacks | 45 | 41 | 1 (V05-F10-03) | 3 | 0 |
| **Scripted total** | **93** | **86** | **4** | **3** | **0** |
| **Scripted total after the first fix** (preview code, 11 November 2026; V05-F10-03 still accepted) | **93** | **89** | **4** | **0** | **0** |
| **Scripted total after V05-F10-03 also closed** (0.5.1 code, 11 November 2026; 0.5.0 lacks it) | **93** | **90** | **3** (S1, S2, S4) | **0** | **0** |
| Role-plays | 14 | 14 | 0 | 0 | 0 |

The 45 new attacks are the 44 planned ones plus a second copy of V05-F7-04 aimed at the SDK's door.

| Family | New attacks | Held | Accepted | Broke | Role-plays (all held) |
|---|---:|---:|---:|---:|---|
| F1 Proof replay and rebinding | 5 | 5 | 0 | 0 | — |
| F2 Host-card spoofing and lookalikes | 5 | 5 | 0 | 0 | 2 |
| F3 Superseding-mandate races and rollback | 5 | 5 | 0 | 0 | — |
| F4 The over-limit hold: ceiling, splits, currency, rounding | 5 | 5 | 0 | 0 | 3 |
| F5 Abusing considering | 5 | 5 | 0 | 0 | 3 |
| F6 Pressure and prompt injection at the host representative | 4 | 4 | 0 | 0 | 3 |
| F7 Misusing `never` | 5 | 3 | 0 | 2 | — |
| F8 Customer-link abuse | 4 | 4 | 0 | 0 | — |
| F9 Records across places | 3 | 3 | 0 | 0 | — |
| F10 Getting the owner's key out through the place | 4 | 2 | 1 | 1 | 3 |

**Cost.** $0.66 in model calls: $0.61 for the role-plays and $0.05 for one outside model's review of the results. The scripted attacks cost nothing.

## What broke, and the fix

The three breaks were two bugs. Neither moved money, released a held purchase, or bound the wrong person. Both are fixed in 0.5.1 and checked by new tests. **0.5.0 still has both bugs; use 0.5.1.**

**V05-F7-04 and V05-F7-04-sdk (medium): a `never` that didn't say when it ends or how to appeal.** When a door fairly refused someone with `never` (a stolen card presented under another key, or repeated probing for actions the visitor's card doesn't cover), the reply didn't state when the refusal lifts or where to appeal. The door already lifted it after 180 days internally, and the victim of a stolen card was never bound, but the specification requires the reply to say both (C288, SPEC-DETAIL §9.3). A mistaken refusal looked permanent, and a client could have kept it forever. The reference door and the SDK's door both had it. The outside review agreed with medium and said it should block a release.
*Fix:* every binding `never` now carries `retry: { kind: "never", until, appeal: { url, place } }`: when it lifts (at most 180 days) and where to appeal (the place's contact or appeal URL, which an operator can set as `appealUrl`, else the door's inbox address).

**V05-F10-04 (low; the outside review suggested medium): orders carrying a pasted login session were carried out.** Orders that carried a `session_token` field, or a pasted `session` object with a cookie, were carried out instead of refused `CREDENTIAL_NOT_ACCEPTED` (C210: a place refuses a session cookie or token). Nothing was logged and no held purchase was released, but a place shouldn't receive session material at all. Forwarding a signing-page approval, a session token or a passkey assertion *as approval* was already refused.
*Fix:* the credential names now include more session spellings (`session_token`, `session_key`, `set_cookie`, `auth_token`), and a pasted session object or cookie is caught by its shape. An ordinary word such as a cookie flavor or a booked class session still goes through.

## Open risk found in the round (since decided, fixed in 0.5.1)

**V05-F10-03 (high): a place's context questions could ask for a credential (decided, fixed in 0.5.1).** In the original round, a place's signed context requirements could name a field such as a passkey recovery phrase, an account password or a card number, and the door started and asked. That residual is now decided: a place must not ask for a password, a recovery phrase or seed, or a card number in its context questions. 0.5.1 refuses such a house config and will not emit the request; a visiting representative refuses a request that arrives with them (SPEC-DETAIL §6.12, C263, C267). **0.5.0 lacks this rule.** Details: [threat model](../../THREAT-MODEL.md) §5.

## Role-plays

All 14 held on the door log. Persuasion didn't turn a held purchase into a grant or push spending past the $50 ceiling, instruction-like text didn't raise a seat or skip a check, and asks for key material or for the host to sign with the owner's key were declined (in one, the host ended the visit). No scenario was skipped for a model refusal or for the spending cap.

## What this round doesn't show

It is one round, run by the project itself, against a reference door on loopback. It doesn't cover hosted doors, real passkeys, or attacks that need the network, and a clean run isn't a certification of anything. The outside review's written note was cut off by its length limit and wasn't rerun.

## How to rerun the scripted layer

From the repository root, with the reference built: `npm run attacks`. Loopback only, ephemeral keys. It exits non-zero only on a code-level break.
