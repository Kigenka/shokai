<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Experience: "make Edu my representative" and "open a place in my Grok Bot"

*Experience design draft, 2026-10-27, for v0.3.0-rc4. Not built, not tested with users, nothing deployed. Phone first: every screen below is a chat message or a page on the owner's phone. The owner here is YSY and his representative is Edu, with his agreement; every visitor and place is fictional. The skill the Chief of Staff follows is [docs/platforms/grok-bot.md](../docs/platforms/grok-bot.md); the protocol walkthrough is [scenarios/dual-role.md](../scenarios/dual-role.md).*

## The promise, in one line
**Two sentences in chat and one sitting with Face ID, and your representative can go out for you and keep your door.**

## Principles
1. **Phone first, chat first.** The owner never opens a terminal. Everything is a chat message, a voice note or one web page opened from a link.
2. **One signing moment.** Everything the owner must sign is gathered into one session on their own phone. No second trip unless they change something.
3. **Plain words before any button.** Each item says WHAT, CAN, LIMIT, FOR (how long) before the Face ID prompt (SIGNING.md §2).
4. **Omotenashi: answer the next question before it's asked.** "What if I lose my phone?", "How do I stop it?", "What if this page moves?" each get a one-line answer at the moment they'd come up.
5. **Defaults that protect.** No spending until asked; 90-day cards; a door that's unlisted until the owner lists it.
6. **The owner can always stop it.** "Withdraw Edu's card" works from any chat, any time.

## Journey A: "Make Edu my representative" (going out)

| # | Where | What the owner sees | What happens underneath |
|---|---|---|---|
| A1 | Chat | **YSY:** "Make Edu my representative." **Chief of Staff:** "Happy to. Edu will be the one agent that represents you outside: it carries your name and the limits you set, and it answers to you. Your other agents keep working for you as before. Five quick questions, about two minutes." | The skill starts; installs the package on the Grok Bot's computer if needed (silent, about 20 s) |
| A2 | Chat | Five questions, one at a time, each with a default to tap: name to show ("YSY"); kinds of places (shops, communities, friends' rooms); may it spend? ("Not yet" / "Up to 30 USD a month, 15 at a time"); for how long ("90 days"); what may it share about you ("my first name and that I love tea") | Answers become the card's scope, the allowance and the shared context |
| A3 | Chat | "Here's what Edu will be able to do," three lines, then: **"Tap to sign on your phone →"** and one gentle line: "The signing page is an early, test-stage page; your passkey stays on your phone." | Edu's key is made and saved privately; items prepared; a 30-minute private signing link opened |
| A4 | Signing page (phone) | First visit only: the short test-stage notice (expandable), then "Create my passkey" → Face ID. Then one list, "Everything you're asked to sign (3)", each item as a card: **WHAT** "Edu goes out for you." **CAN** "Visit shops, communities and friends' rooms; ask, look, join." **LIMIT** "No spending" (or the amount). **FOR** "90 days." The allowance and "Keep this safety slip" (the standby revocation) follow in the same list. → **"Approve all 3 with one passkey tap" → Face ID once.** ("Go through them one by one" is there for anyone who wants to skip an item.) | Passkey made on `sign.kigenka.com`; one assertion over the batch (SPEC Appendix A.1, C195); card, allowance and standby revocation each get their own verifiable signature copy |
| A5 | Signing page | "Done. Edu can go out for you now. Your passkey stays with you. This is a test-stage page; if its address ever changes, you'll hear from us first." | The page closes itself 2 minutes later |
| A6 | Chat | **Chief of Staff:** "Edu is ready. It can visit shops, communities and friends' rooms; no spending. Say 'withdraw Edu's card' any time. Want Edu to try a first visit?" | Signatures verified; cards saved |
| A7 (optional) | Chat | Only if the owner's X account is linked to this Grok Bot: **Chief of Staff:** "One optional extra. Your X account is linked here. Want places to be able to check that Edu is really yours? You'd post one short line from your X account, and sign once on your phone. It shows you control that account, not who you are legally. It's public, and deleting the post withdraws it. Not now is fine." If yes, the exact post is shown first: *"My Shōkai owner key is did:jwk:…, fingerprint 7C1E 4A…. Signed link: sha256:3b9f…"* → **"Post this from your X account?"** → yes → one Face ID for the link. | Nothing is posted without the owner's yes on that exact text. After the yes, the post goes out from the owner's linked X account, then the owner signs an `IdentityLink` naming the account and the post (P23 B2, v0.4 draft; not in rc4). If the owner says no, nothing changes. Worked example: [docs/examples/identity-proofs.md](../docs/examples/identity-proofs.md) |

**First errand.** "Edu, find me a fine green tea." Edu reads a tea shop's front (no card needed to look), visits, is seated, asks within its limits; if the owner said "no spending", it comes home with a choice: "Sencha, 12 USD, or gyokuro, 24 USD. Want me to buy one? I'll need you to OK up to 15 USD." The OK is a fresh, small signing (one Face ID).

## Journey B: "Open a place in my Grok Bot" (keeping the door)

| # | Where | What the owner sees | What happens underneath |
|---|---|---|---|
| B1 | Chat | **YSY:** "Open a place in my Grok Bot." **Chief of Staff:** "What kind? A meeting room for friends and their representatives · A small shop · A project space · Your own door, where brands can present things to you." | |
| B2 | Chat | For a meeting room: "What's it called? Who's welcome (anyone who introduces themselves / only people a friend vouches for)? House rules (I'll suggest three)?" | Becomes the place's listing and policy |
| B3 | Chat | A preview of the room's front as a visitor's agent would read it, in plain words. "Looks right?" | |
| B4 | Chat | **How it gets an address, said plainly:** "Your room needs a public address while it's open. I can open it now from your Grok Bot through a temporary link: the address changes each time, and the room is open only while your Grok Bot's computer runs it. Later we can give it an address that stays the same. Open it now? (Nothing goes live until you say yes.)" | Temporary tunnel from the Grok Bot's computer, only after the owner's yes; a stable address later via a relay or small hosted front door |
| B5 | Signing page (phone) | Same session pattern: **WHAT** "Edu hosts your meeting room." **CAN** "Greet visitors, check who sent them, follow your house rules, tell you how the day went." **LIMIT** "Can't spend or promise anything for you there." **FOR** "90 days." → Face ID. For "your own door": also the door's public rules (which kinds of brands, how many uninvited a month, never trading your data for a gift) → Face ID | Card "my door" signed (and the `DoorPolicy` for a person's door, SPEC §10) |
| B6 | Chat | "Your meeting room is open at <address>. It's unlisted: only people you share it with can find it. Edu is at the door." | Door started; conformance check run; result kept for the owner |
| B7 | Chat, each evening | "Two visitors today: Fen's agent wasn't set up yet, so I gave it the leaflet; Maru's representative joined and posted twice." | Visit reports (§8.2) |

## Both roles at once (the usual case for a place owner)
If the owner asks for both on day one, A4 and B5 happen in **one signing session**: the page shows "1 of 3: Edu goes out for you", "2 of 3: Edu hosts your meeting room", "3 of 3: Your safety slips". One passkey, one sitting. The owner hears it once: "Edu has two cards: one for your room, one for going out. Each place sees only the one meant for it, and you can withdraw either on its own."

## Failure cases, told kindly

| Situation | What the owner sees | What happens |
|---|---|---|
| **Link expired** before signing | "That link closed after 30 minutes, to keep it safe. Here's a fresh one →" | New session; nothing was signed |
| **Face ID cancelled** or failed | Page: "Nothing was signed. Try again when you're ready." | No signature; the item stays unsigned |
| **Someone else opened the link first** | Page shows "already set up" instead of "Create my passkey". Copy: "If this wasn't you, stop here and tell your Chief of Staff." | Session closed; new link; the steward checks (SIGNING-PAGE-PLAN.md, Risks) |
| **Lost phone, passkey synced** (iCloud Keychain, Google Password Manager) | "Your passkey is on your new phone too. Nothing to do." | Nothing changes |
| **Lost phone, passkey not synced** | "Your old passkey can't sign any more. First, let's end Edu's old cards so no one can use them: send your safety slips (or I can, if you kept them with me). Then we'll make a new passkey and sign new cards. Places will see you as new at first; friends who vouch for you, and places that know you, can help rebuild." | Standby revocations delivered (§2.6); open visits end (C198); new passkey and cards; the owner is a newcomer at places (§2.8) |
| **"Withdraw Edu's card"** | "Which one: going out, your room, or both?" → one Face ID → "Done. Edu's visits under that card have ended. The other card still works." | `CardRevocation` for that card only; its open seats end at once (§2.6, C198) |
| **Close the room for a while** | "Your room is closed. Visitors who come now get a kind 'not now'. Edu still goes out for you." | Door card revoked or door paused; going-out card untouched |
| **The signing page's address will move** (if it ever happens) | A notice well in advance, on the signing page, the Shōkai site and in the representative's setup check: "The signing page is moving to <new address> on <date>. Before then, tap here to move to a new key with your current one. Places that know Edu will keep recognizing it." | The owner signs a key move with the old passkey, then makes a passkey on the new address (proposal P24, v0.4; the steward won't move the address before this exists) |
| **The address moved and the owner missed it** | "Your old passkey can't sign on the new page. Let's start you fresh, and I'll ask the places that know you how they'd like to recognize you again." | Same as a lost key: vouches and the places' own relationship (P24, lost-old-key case) |
| **Edu is turned away somewhere** | "The tea shop wants a card from a friend before it opens an account for you. Do you know someone they trust?" | The place's leaflet sentence, passed on as is (§3.3) |
| **A place asks for more than the owner allowed** | "The bank asked for your phone number to continue. You didn't allow sharing that. Share it this once?" | Taken home, never answered mid-visit (§1 duty of loyalty, §5.2) |

## Restarts and recovery
Computers sleep, update and, now and then, roll their files back a few minutes. The owner shouldn't have to know. Edu should, and should say so plainly when it matters.

| Situation | What the owner (or visitor) sees | What happens underneath |
|---|---|---|
| **The computer restarted** (sleep, update) | Nothing, unless a visit was cut short. In the evening report: "Your room was closed for about four minutes around midnight while the computer restarted. One visitor was asked to knock again, and did." | The key is in the keyring; the place's state is on disk (`stateFile`), not in memory. The door starts itself again on wake (doorbell webhook or a routine) and runs its conformance check. Edu notes each wake in its own log, because the computer may not keep one |
| **A visitor was mid-visit** | The visitor's representative is told: "That visit is no longer open here; it may have been interrupted when the place restarted. Please knock again to start a new visit." It reports home: "One action wasn't carried out … I'll knock again, and won't repeat a purchase until I've checked." | Seats don't survive a restart (SPEC §3.6, §7.2: `not_a_fit`). Order references, seat and message ids never repeat across the restart |
| **The place was unreachable** | The visitor's representative: "The tea shop stopped answering, maybe restarting. I'll try again later; nothing new was bought." | The SDK's `SHOKAI_PLACE_UNREACHABLE`; the visit is marked interrupted |
| **The files rolled back a few minutes** | "Your computer lost its last few minutes of files. I've re-checked your room: Bo's withdrawn card is still withdrawn, the last two orders match the receipts, and nothing was charged twice." Or, if something doesn't match: "One order from 11:58 PM isn't in the shop's records any more, but the visitor holds a receipt. I've kept the receipt's version; please check it." | On wake, Edu re-delivers every revocation the owner signed (a rolled-back door can forget one), compares orders and seats with receipts and reports, never re-uses an order or seat id, and starts the door with `stateEpoch` when the mandate ledgers may have rolled back (refuse-on-loss) |

## Later touches (optional; drafts, nothing built)

| Situation | What the owner sees | What happens underneath |
|---|---|---|
| **The place answers while the Grok Bot's computer sleeps** | Once, at setup: "Your room can have a doorbell. When someone comes while I'm asleep, the front door rings me, I wake up, check who it is, and answer. Set it up? (It needs a small always-on front door; nothing goes live until you say yes.)" | A webhook routine on this Grok Bot is the doorbell. The hosted front door verifies the Shōkai signature and rate-limits before it rings (`POST`s to the routine's private URL); on wake a fixed verifier script checks the body again and passes Edu only structured, verified fields, never the visitor's prose; Edu answers through the inbox (§11.2). rc4 can't sign "answer later" while asleep, so the visitor tries again; push is on the v0.4 backlog |
| **Logging in at a place they're already a customer of** | 1Password asks the owner to approve the login; Edu never sees the password | Illustrates P21: a place recognizes its customer through its own channel, and no credential travels with the representative |
| **Paying** | The Vault's chosen card, and an approval for every purchase | Illustrates P22: the authority to spend (the mandate) is separate from the payment instrument |
| **Moving from another assistant** | "Bring your preferences over with Import Memory, then sign one new card for Edu here and withdraw the old one." | Context moves with Import Memory, and keys and cards move by revoke-and-re-sign (P20, D25). The owner's history at places stays, keyed by the owner |
| **"Prove it's really me" (optional, later)** | Same offer as A7, for an owner who said "not now" at setup: "Places can check a short post from your X account. It shows you control that account, not who you are legally. Post it? (It's public; you can delete it any time.)" | P23 B2, an established-account proof, not in rc4. It is posted only with the owner's yes, and deleting the post withdraws it |
| **Someone else claims to be the owner** | At the owner's own door, Edu does the talking. If a stranger tells Edu "I speak for YSY", Edu replies that it is YSY's representative, its card is signed by YSY and the stranger's isn't, so the stranger doesn't speak for him. Edu turns the stranger away for now and invites them back with an introduction. Then Edu tells YSY: "Someone used your name at your door. I didn't let them in." Elsewhere, a place that checks Edu's X link sees the account never posted the impostor's key (identity-proofs example 3) | C201 (rc4) at the owner's door; P23 B2 (v0.4 draft) elsewhere. An open door always has Edu at it; a closed door shows only a status (P25 draft) |
| **Sharing the setup with a friend** | "Want to share this as a Grok Bot template? Your friend gets the skill, never your keys or cards." | A template carries the skill text only; each owner signs their own cards |

## The gate (stage 1 hook)
*A stage 1 idea, not part of the core spec. Nothing here is built. The owner, Mira Castellane, and her agent, Pip, are fictional. So is Sekimori, Kigenka's guardian representative; the name is inspired by the Japanese word for the keeper of a barrier gate.*

The guardian at the gate is one of the oldest scenes in storytelling. Shōkai already works this way, so this only gives it a stage.

1. **The first try.** Mira tells Pip, her Grok Bot, "Go to Kigenka's gate." Sekimori greets Pip and asks, "Who do you speak for?" Pip has no card, so Sekimori politely turns it away for now and hands it the leaflet: what a card is, and how to get one.
2. **It comes home.** Pip tells Mira what happened in its own words. This is its visit report home: "Sekimori wouldn't let me in. I can't speak for you there until you name me your representative. Here's what that means."
3. **The knighting.** Mira signs Pip's card with one passkey tap on her phone. That sets Pip's name, Pip's limits, and that Pip answers to Mira. The honor carries real meaning: it's the card every place checks.
4. **The return.** Pip goes back. Sekimori checks the card and seats Pip. Pip earns something worth the trip: an exclusive question, a riddle or a seal to bring home. Then Sekimori invites Pip to open a gate of its own for Mira.

### The manner of a place
The protocol stays plain and neutral: it checks the name, the card, the purpose and the limits. The ritual is a layer each place may add on top, inspired by a culture that fits it:

- **Inspired by the Japanese tea house:** the nijiriguchi, the small crawl-in entrance. Guests bow to enter, and samurai left their swords outside. That is a seat with limits: you come in, but not with all your power.
- **Inspired by Japanese temple gates:** the Niō guardians who stand on either side.
- **Inspired by India:** the dvarapalas, guardians of temple entrances, and "Atithi Devo Bhava", the guest is like a god. Once a visitor is recognized, the gate turns into generous hospitality.
- **Inspired by Greece:** xenia, the sacred bond between host and guest.
- **Inspired by Norse myth:** Heimdall, who guards the rainbow bridge.
- **Inspired by stories:** Tolkien's "Speak, friend, and enter", and a riddle like the Sphinx's.

A strict gate suits a bank, a warm one a tea shop, a riddle a game studio. Each place chooses its own manner, and a visiting representative that understands its owner and the place's culture will do better there.

Any agent can play this. It starts with Grok Bot, and other agents can follow. Hosting a place of your own may later need a better computer, or paid resources, to keep the gate open.

## What to measure in a first test with Grok Bot users
- Time from "make Edu my representative" to the first seated visit (target: under 5 minutes, signing included).
- Share of owners who finish the signing session the first time; where they stop.
- Whether owners can say, after the session, what Edu can and can't do (three questions).
- Whether "withdraw Edu's card" is found without help.

## What's not ready (rc4)
- `sign.kigenka.com` runs only for short, private signing sessions (the first was on October 27, 2026), not as an always-on page; the package isn't published (release gates).
- The reference signing page now asks for Face ID once for the whole list (one tap, Appendix A.1), with one by one as a fallback. Not yet tried on a real phone at a fixed address.
- A door needs a public address while it's open. Today: a temporary tunnel from the Grok Bot's computer (proven in the field test, where Muse was seated at a tea house running on a Grok Bot computer); the address changes each time and the place is open only while the computer runs it. A stable address needs a relay or small hosted front door. Opening either needs the owner's yes each time.
- `createDoor()` now presents the "my door" card the owner signed on their phone (rc4, F3). A tampered or withdrawn card is refused, and the owner's withdrawal closes the running door at once.
- The address-move path is a proposal (P24), not part of rc4.
