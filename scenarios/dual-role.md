<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# One representative, two roles: it keeps its owner's door and goes out

*Informative walkthrough, not part of the frozen catalog and not a SPEC change. Written 2026-10-27 against SPEC v0.3.0-rc4 (feature-frozen). It uses a fictional owner, Kiran, and his representative, Noor; the tea shop, the visitors and every other party are fictional too. Section references are to [SPEC.md](../SPEC.md).*

## The idea
A representative has one job or two:

| Role | Who needs it | What the representative does | Its Shōkai card says |
|---|---|---|---|
| **Going out** (outbound, the visiting representative) | Everyone with a representative | Introduces itself at other places' doors, acts within its owner's limits, reports home (§3–§8) | "Kiran's representative, when I go out" |
| **Keeping the door** (inbound, the host representative; the spec says gatekeeper) | Anyone with a place: a person's meeting room, a shop, a project space, or a person's own door for brands (§10) | Greets visitors; the door checks their Shōkai cards, decides on signed facts and grants a pass; explains, remembers (§3, §6, §7, §9) | "Host of Kiran's meeting room" |

**One owner, one representative, a Shōkai card per role.** Both Shōkai cards are signed by the same owner, Kiran, with the same passkey, and both name the same representative, Noor. The spec sets no limit on Shōkai cards per representative (§2.3, clarification); each Shōkai card has its own `card_id`, `role`, scope and expiry, and is revoked on its own (§2.6, C198).

```mermaid
flowchart LR
  Y["Kiran<br/>owner, one passkey"] -- "signs card 1: host of my meeting room" --> E["Noor<br/>one representative, one key"]
  Y -- "signs card 2: when I go out" --> E
  V["Visitors' representatives"] -- "introduce themselves" --> D{"Kiran's meeting room<br/>Noor, its host representative (card 1)"}
  E -. "is the host representative" .-> D
  E -- "visits with card 2" --> T{"A tea shop<br/>its own host representative"}
  T -- "sees card 2 only" --> E
  E -- "reports home: the room's day and the tea" --> Y
```

## The afternoon

**1. One signing moment (on Kiran's phone).** Kiran's Chief of Staff (his Grok Bot) prepares three items and opens one signing session. The page shows each in plain words and Kiran approves them with Face ID. The page lists all three, then Kiran approves them with a single Face ID (one tap for several items, Appendix A.1, D23; SIGNING.md §3); each item still gets its own signature, and "go through them one by one" is the fallback:

| Item | Plain words on the page | Machine fields that matter |
|---|---|---|
| Shōkai card 1, my door | "Noor hosts your meeting room. He greets visitors, checks who sent them, follows your house rules and tells you how the day went. He can't spend or sign anything for you there." | `card_id: card-noor-door`, `role: "Host of Kiran's meeting room"`, `mandate_scope.purposes: ["gathering"]`, the room's actions (join, post in the room), no spending |
| Shōkai card 2, when I go out | "Noor goes out for you. He introduces himself as your representative and shares only what you allow." | `card_id: card-noor-out`, `role: "Kiran's representative"`, `mandate_scope.purposes: ["visitation", "purchase", "invitation"]` |
| Allowance | "Up to 30 USD a month at shops, 15 USD at a time. Anything more comes home to you." | standing allowance (§5.2) with `max_amount` per period |

Each Shōkai card is checked on its own (with a one-tap batch, each carries its own copy of the signature, `webauthn.batch`, `batch_index`), so the tea shop can check Shōkai card 2 without ever seeing Shōkai card 1. Kiran also gets two standby revocations, one per Shōkai card, to keep (§2.6; SIGNING.md §6).

**2. Noor opens the door.** The meeting room's listing goes up (§3.1): what the room is, what visitors may do there, and the house rules. Noor stands at its door with Shōkai card 1.

**3. A visitor comes, unprepared.** Fen's agent (fictional) arrives with no Shōkai card. Noor answers with the room's leaflet: what the room is, how to come back ready, one plain sentence for Fen, and a kind "not now" (§3.3). Nothing is held against Fen.

**4. A prepared visitor comes.** Maru's representative (fictional) greets, presents its Shōkai card first (§3.2 Shōkai card order); Noor verifies it, then presents **Shōkai card 1** with its possession proof over Maru's nonce. Maru's representative checks Shōkai card 1 against the room's listing (§3.1, C104) and sees "Host of Kiran's meeting room", signed by Kiran's owner key. It introduces itself (`vouch: null`), asks to join, and gets a pass within the room's rules (§7).

**5. Noor goes out.** Mid-afternoon, Kiran asks Noor to find a fine green tea. Noor visits a tea shop as a visitor with **Shōkai card 2**. The shop's host sees only Shōkai card 2 and the mandate under the allowance; it never sees Shōkai card 1 or the room. The shop seats Noor; Noor buys a 12 USD sencha, within the allowance (§5.2, §7.2).

**6. One report home.** In the evening Noor reports both roles in plain words (§8.2): "Two visitors came to your room: Fen's agent wasn't set up yet, so I gave it the leaflet; Maru's representative joined and posted twice. I bought a sencha for 12 USD at the tea shop; 18 USD left this month."

## Withdrawing one Shōkai card
Kiran decides to close the meeting room for a while. He signs a `CardRevocation` for Shōkai card 1 only (§2.6). Every open seat in the room is ended at once (C198), and visitors who arrive next get a kind "not now". Shōkai card 2 is untouched: Noor still goes out, and the tea shop's records about Kiran are unchanged. The reverse works too: revoking Shōkai card 2 ends Noor's open visits elsewhere and leaves the room open.

## What stays the same across both Shōkai cards
- **Accountability is Kiran's.** Records, conduct, sign-up caps and any `never` at a place are keyed by the principal, Kiran's owner DID, whichever Shōkai card was shown (§9.3, §9.4). A third Shōkai card made to get around a "not now" would itself be misconduct (`revisit_violation`, §9.3).
- **Noor's key.** Both Shōkai cards here name one representative key, so a place that saw both could tell they belong to the same representative. That's fine for a public meeting room. An owner who wants the two roles unlinkable gives each its own key and owner identity (§2.8).
- **The duty of loyalty runs both ways** (§1): at the door, Noor protects Kiran from visitors' pressure; outside, Noor protects Kiran's interests and takes anything beyond the allowance home.

## If the room is a person's door for brands
When the "place" is Kiran's own door where brands present offers, it is the inbound door of §10, and Kiran also signs a `DoorPolicy` (public categories, the uninvited allowance, `no_data_for_gift: true`) in the same signing moment. Shōkai card 1's role then reads "Kiran's door". The rest of this walkthrough is unchanged.

## Where rc4 stands (honest notes)
- **Protocol: covered.** Several Shōkai cards per representative (§2.3 clarification), a person as a place's principal (§1, §2.3), the host representative's Shōkai host card (§3.2), revoking one Shōkai card (§2.6, C198), one tap for several items (Appendix A.1, D23), the inbound door (§10).
- **SDK: closed in rc4 (F3).** `createDoor({ card, keys: { rep }, ownerRpId })` takes the "my door" Shōkai card the owner signed on the signing page (the page's file as is, one tap or one by one), verifies it as a door verifies a visitor's Shōkai card, and refuses it if it is tampered with (`SHOKAI_DOOR_CARD_INVALID`) or withdrawn (`SHOKAI_DOOR_CARD_REVOKED`). The owner's signed revocation reaching the running door closes it. Without `card`, `createDoor()` still signs with a place key, which suits a shop. Tests: `packages/shokai/test/doorcard.test.ts`.
- **Hosting: a door needs a public address while it's open.** Kiran's meeting room can open today from his Grok Bot's computer through a temporary tunnel, as the field-test tea house did when a Muse representative got a pass there; the address changes each time and the room is open only while the computer runs it. A stable address needs a relay or a small hosted front door (the signing page's relay mode is the pattern) or a host of its own (deploy/HOST-A-PLACE.md). Going out needs nothing more than outbound HTTPS.
- **Reference signing page: one tap.** The reference page lists every item and signs them with one assertion (Appendix A.1), each with its own signature copy (`webauthn.batch`, `batch_index`), with one by one as a fallback; tested with a software authenticator, not yet on a real phone.
- **Run once in the SDK, not yet with a real passkey.** [examples/traces/dual-role.mjs](../examples/traces/dual-role.mjs) runs this afternoon in one process (two Shōkai cards for one representative key, the leaflet, a pass in the room, a purchase at the tea shop, revoking Shōkai card 2 ends its pass, the room stays open; 10/10 checks), with an Ed25519 owner key standing in for Kiran's passkey. The field tests given a pass visitors at a real door; a room kept by Noor with Kiran's passkey hasn't run yet.
