# Grok Bot: the Shōkai skill for a Chief of Staff (draft)

*Draft, 2026-10-27, for v0.3.0. **Not saved as a skill in any Grok Bot**, not tested end to end, and not affiliated with Grok Bot or xAI. The phone-first experience this skill serves is described in the repository's `experiences/` notes.*

In Grok Bot, a **Chief of Staff** agent runs errands for its owner on its own computer (a persistent Linux machine with a shell and a browser). The owner may have several agents; one of them, say **Edu**, becomes the owner's representative. The Chief of Staff installs Shōkai and sets Edu up; Edu then goes out, and, if the owner has a place, keeps its door.

## Skill text

Save as a Grok Bot skill named `shokai` once the owner approves. It extends the portable [shokai-representative](./shokai-representative/SKILL.md) skill with what is particular to Grok Bot.

```markdown
---
name: shokai
description: Make one of the owner's agents their Shōkai representative, sign its cards on the owner's phone, send it to places, and open a place for the owner in Grok Bot. Use when the owner says "make <agent> my representative", "open a place in my Grok Bot", "send Edu to <place>", "withdraw Edu's card", or an agent of theirs came back with a Shōkai leaflet.
---

# Shōkai for a Chief of Staff

Follow the portable skill `shokai-representative` (ground rules, install, going out, withdraw). In Grok Bot, also:

## Where things live (on this Grok Bot's own computer)
- Package: `~/shokai/` (`npm install @kigenka/shokai`, or the release's `.tgz`).
- Each representative's key: in this computer's **system keyring**, as the one line `exportRepresentativeKey()` writes (`secret-tool store --label="Shōkai key Edu" service shokai rep edu`, the line on stdin; `secret-tool` comes from `libsecret-tools`). Keys in the system keyring are said to survive when the Grok Bot's computer is recreated (Grok Bot 0.77.0 changelog; not tested by this project). Installed apps and packages don't, so reinstall the package and `secret-tool` after a recreate. If there is no keyring, use `~/shokai/reps/<name>/key.txt` (chmod 600). Never read it aloud, print it, or put it in memory notes.
- Each representative's other files: `~/shokai/reps/<name>/` with `cards/` (signed cards) and `reports/` (visit reports).
- This computer is shared by the owner's agents: only the Chief of Staff and the representative itself use the key.
- **Practice runs only:** `developmentPasskey()` stands in for the owner's passkey without a phone. Say so in every report, and never call a stand-in signature the owner's. The signing page and its no-phone test live in the repository at `reference/signing-page/`.

## "Make Edu my representative"
1. Confirm which agent: "Edu will be the one that represents you. Your other agents keep working for you, but only Edu carries your card." If Edu doesn't exist yet, create it first, the way the owner usually makes agents.
2. Ask the owner the plain questions (portable skill §2.1), by chat or voice, one at a time; offer sensible defaults ("visit shops and communities, no spending until you say so, 90 days").
3. Make Edu's key and prepare the items: **card "when I go out"**; **card "my door"** only if the owner has or wants a place; the allowance; one standby revocation per card.
4. **The signing moment.** Open one signing session and send the owner the private link in this chat: "Tap to open on your phone. You'll see everything Edu may do, in plain words, in one list, and approve it all with Face ID once. Closes in 30 minutes." Mention once that the signing page is an early, test-stage convenience (its notice explains what happens if its address ever moves).
5. When the signatures come back, verify them, save them, and reply in three lines: what Edu can do, the limits, and "say 'withdraw Edu's card' any time."

## "Open a place in my Grok Bot"
1. Ask what kind: a meeting room for friends and their representatives (a gathering), a small shop, a project space, or "my door" where brands may present things to the owner.
2. Draft the place's front (what it is, what visitors may do, what each action asks for, house rules) and show it.
3. Explain how the place gets an address, plainly: "Your place needs a public address while it's open. Today I can open it from this Grok Bot's computer through a temporary tunnel: it works now, but the address changes each time and the place is open only while this computer runs it. For an address that stays the same, we'd add a small relay or hosted front door in front later. Shall I open it with a temporary address now?" Never open a tunnel, deploy, buy anything or change DNS without that yes, each time.
4. Edu keeps the door with the "my door" card: `createDoor({ card, keys: { rep }, ownerRpId })`, with the card file the signing page wrote and Edu's key from the keyring. If `createDoor()` throws `SHOKAI_DOOR_CARD_INVALID`, don't open the door: tell the owner the card didn't verify, and ask them to sign it again. `SHOKAI_DOOR_CARD_REVOKED` means the owner withdrew it, so ask before preparing a new one. Run the conformance check against the door and tell the owner the result.
5. "Close my door" or "withdraw the door card": deliver the owner's signed slip with `door.withdrawCard(slip)`. The door stops answering at once and lists nothing; the going-out card is untouched.
6. Each evening, Edu's report covers both roles: who came to the door and how it went, where Edu went and what it spent.

## Optional: a doorbell while the computer sleeps
A Grok Bot's computer sleeps, so a place kept on it can't answer while it does. A **webhook routine** can be its doorbell. Grok Bot routines can start from a webhook with their own private URL and key, and they receive the request body.
1. A small hosted front door holds the place's public address and takes the `POST`s.
2. **The front door checks before it rings.** It verifies the message's Shōkai signature against the key it names (a body that isn't a signed protocol message gets the lobby, as at any door), and it rate-limits per sender key and overall. Only a verified message that it can't answer itself rings the doorbell: a `POST` to the routine's private webhook URL, with the webhook key. Unsigned or failing traffic never wakes anyone. But a signed ring proves only that the sender holds some key, and anyone can make a key: verifying is not permission to wake. The owner's rules for the representative decide which rings it wakes for (for example: cards from principals it already knows, introduced visitors, at most a few wakes an hour), and the rest wait until it is awake anyway.
3. **On wake, a fixed script reads the body, not the agent.** The routine first runs a small verifier script (the same every time, kept with the place's files) on the forwarded body. It verifies the signatures again with the SDK (`verifySigned`), checks that the message is fresh (`sent_at` within the ±300 s skew), hasn't been seen before (its `msg_id`) and is addressed to this place, and passes the agent only structured, verified fields: the message type, the sender's key, the encounter, the requested purpose and actions, and amounts. Visitor prose (courtesy text, notes, offers' wording) is never passed to the agent as text to read; at most the script says that prose was present. Reaching the webhook proves nothing; a body that fails the script is dropped and logged.
4. Edu answers through the place's inbox (SPEC §11.2), and the visitor collects the answer by polling.

Keep the webhook URL and key private: never in a listing, a card or a leaflet. Setting up the routine and the front door is an outward step, so ask the owner each time.

*v0.3.0 limit:* only the representative's key can sign the `held` that tells a visitor "answer later", and that key stays on the Grok Bot's computer. A front door without it answers with an empty envelope, and the visitor tries again later. Push and a narrow front-door key are on the v0.4 backlog (platforms index, *Open items*).

## Restarts and recovery
A Grok Bot's computer can sleep, restart for an update and, rarely, roll its files back a few minutes (in the project's field test it came back with the last few minutes of files gone). Plan for all three:
- **Keys:** in the system keyring (above), never only in a file a rollback could lose. On wake, load each key from the keyring and check that it still gives the same `did:key`. If it doesn't, stop and tell the owner; don't make a new key quietly.
- **The place's state:** pass `createDoor({ stateFile })` with a path on this computer's disk, such as `~/shokai/places/<place>/state.json` written out in full (Node doesn't expand `~`), so mandate ledgers, nevers, spent nonces, act ids and revocations are kept on disk, not in memory (SPEC §3.6). Ids the place hands out (orders, references, message ids) must never repeat, even after a restart: keep counters on disk and add a per-start tag (the reference door does this for its message ids and act references). Never derive an id from a count kept only in memory.
- **The door restarts itself on wake.** When the computer wakes (the doorbell webhook above, or a routine at login or on a schedule), start the door again with the same `stateFile` and keys. Then run the conformance check against it and keep the result for the owner's report.
- **Visitors caught mid-visit** get a polite answer, not an error page. Live seats don't survive a restart (§3.6), so an act in a lost seat is refused `not_a_fit` with the courtesy "That visit is no longer open here; it may have been interrupted when the place restarted. Please knock again to start a new visit." A visitor that can't reach the place at all gets `SHOKAI_PLACE_UNREACHABLE` from the SDK and should knock again later. Never repeat a purchase it can't confirm.
- **After a file rollback, check before carrying on.** When the state file may be a few minutes old, on wake:
  1. **Revocations:** deliver again only the withdrawals the owner had already made, so a door that forgot one learns it again; a rolled-back door otherwise lets a withdrawn card back in. Keep a copy of every withdrawal slip once it has been delivered, somewhere a rollback can't lose (the owner's chat, or the system keyring), and re-deliver from that copy. **Never deliver a standby slip as part of recovery.** A standby slip is a live withdrawal: the moment a place verifies it, the card it names ends. Standby slips stay unsent until the owner decides to withdraw that card. If you can't tell whether a withdrawal was delivered before the rollback, ask the owner.
  2. **Orders and seats:** compare the place's own records (orders, receipts) with the representative's reports. Never re-use an order or seat id. If two records disagree, believe the one that left the computer (a receipt the visitor holds, a report already sent) and tell the owner.
  3. **Mandate ledgers** may have rolled back too. If a rollback is known or likely, start the door with `hostOpts: { stateEpoch: "<when the state was lost>" }`, so it refuses mandates signed before then (refuse-on-loss) and an owner's limit can't be spent twice.
- **Is there a restart log?** Not reliably. A Grok Bot's computer may show only the current boot time (`uptime -s`), with no journal of earlier restarts. Keep a small log of your own: on each wake, append the boot time and what you found (state file time, any revocations re-delivered) to `~/shokai/places/<place>/wakes.log`, and mention anything unusual in the evening report. Without it, the representative doesn't know a restart happened, only that its seats are gone.

Worked example: `examples/traces/restart.mjs` stops the demo tea house by its exact pid mid-visit and restarts it.

## Grok Bot features that show Shōkai's ideas (illustrations, not integrations)
- **Approve each login (1Password), like P21's customer link.** 1Password fills a login into the Grok Bot's browser after the owner approves it, and the agent never sees it. P21 asks the same of a place recognizing its customer's representative: the link is made in the place's own channel, and no credential travels with the representative.
- **Approve each payment (the Vault), like P22.** The Vault's Payments tab picks the payment method the agent uses first, and the owner still approves every purchase. P22 keeps the authority to spend (the owner's mandate, with its limits) separate from the payment instrument, which never sits in the representative.
- **Import Memory, for portability.** Import Memory brings an owner's preferences and context from another assistant into their primary Grok Bot. That is the context half of moving a representative (P20, D25). The other half is keys and cards: withdraw the old card, make a new key here, have the owner sign a new card. Places keep the owner's history because it is keyed by the owner, not the platform.
- **An established-account proof through the owner's connected X account (optional; P23 B2, not in v0.3.0).** With the owner's yes, each time, the owner posts from their own X account a short statement that names their owner key, and a place may check it. It proves the owner controlled that account when the post went up. It is not a legal identity, and it is only as good as knowing which account is the real one. Posting is outward and public: never post without the owner's explicit approval, and deleting the post withdraws the proof. Worked example, including a fictional impostor turned down because the account never posted its key: [docs/examples/identity-proofs.md](../examples/identity-proofs.md).

## Sharing this recipe as a Grok Bot template
This skill can be shared as a **Grok Bot template** (team or anyone), so another owner adds their own copy and gets the skill. A template carries the skill text only, never a key, a card, a signing link, memory or reports. Each owner who uses it signs their own cards on their own phone. Publishing a template is the owner's decision, made in Grok Bot's share menu; nothing here publishes one.

## Going out (Edu)
Use the portable skill §4. Before the first visit to a new kind of place, tell the owner what the place's listing says it will ask for.

## Never
- Never sign for the owner, or ask for the passkey. A test stand-in signature is never the owner's.
- Never put a key, a signing link or a signed card in a public place.
- Never reuse an expired or withdrawn card; ask the owner to sign again.
```

## Two cards, one representative
Edu holds two cards signed by the same owner: "my door" and "when I go out". A place only ever sees the card shown to it, and each can be withdrawn on its own (SPEC §2.3, §2.6). Walkthrough: [scenarios/dual-role.md](../../scenarios/dual-role.md).

## What's not ready (v0.3.0)
- `sign.kigenka.com` opens only for short, private signing sessions (the first was on October 27, 2026), not on demand (a release gate).
- The reference signing page lists every item, then asks for Face ID once for all of them (one tap, SPEC Appendix A.1); each item still gets its own signature. The owner can go one by one instead.
- `createDoor()` presents the owner's passkey-signed "my door" card (rc4, F3), but it can't yet check a card's `revocation_url` when it starts: hand it any withdrawal the owner signed (`cardRevocations`).
- **A door needs a public address while it's open.** A Grok Bot user's place works today through a temporary tunnel from the Grok Bot's own computer: in the project's field test, Willowfold Tea House ran on a Grok Bot computer, a temporary public tunnel gave it an address, and a Muse representative was seated there and bought a sencha. The catch is that the address changes with each tunnel and the place is open only while the computer runs it. A stable address needs a relay or a small hosted front door in front of the computer (the pattern of the signing page's relay mode, [deploy/SIGNING-PAGE-PLAN.md](../../deploy/SIGNING-PAGE-PLAN.md)), or a host of its own ([deploy/HOST-A-PLACE.md](../../deploy/HOST-A-PLACE.md)).
