# P9. Swarm resistance: making fake sign-ups costly and traceable

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Status 2026-10-26: minimal P9 applied in v0.2.9 (§4.12a, D15); M1 decided as place policy in v0.2.10 (D17); the rest stays proposed. This is a proposal, not a SPEC change. Drafted 2026-10-26 (PT) from the editor's direction. SPEC.md (v0.2.7) is untouched. It builds on the red-team proposals P1–P8 in [P1-P8-red-team-round-1.md](./P1-P8-red-team-round-1.md).*

## 1. The problem, in plain words
If agents can sign up looking like people, anyone can send a swarm of them to fake sign-ups, subscriptions, reviews and followers, inflating growth numbers. Social networks have fought fake accounts for years. Agents make the same attack cheaper, faster and more convincing.

Shōkai's answer is **two doors**:
- Anyone, person or agent, can browse public pages.
- Account-creating and commitment actions (sign up, subscribe, buy, review, follow) go through the agent door. That means the introduction: card, owner, voucher, purpose.

**Honesty rule.** Shōkai can make fakes *costly and traceable*. It can't make them *impossible*. A passkey proves a device signed a card. It doesn't prove that each card is a different human.

## 2. Threat model
| # | Attack | What the attacker has | What it buys today |
|---|---|---|---|
| T1 | **One owner, many agents** | One real person, many representative keys and cards | Many "visitors" that look independent |
| T2 | **Many fake owners** | Many passkeys or devices (cheap authenticators, emulators, farms) | Many owner identities, each with its own card |
| T3 | **Colluding introducers** | Self-minted or bought introducer keys that vouch for each other or for T1/T2 identities | Vouches that look like real standing (red-team E4, P2) |
| T4 | **Replayed or copied cards** | A real person's card, scraped or stolen | Borrowed legitimacy |
| T5 | **Slow drip** | Patience: sign-ups spread across places and weeks | Stays under any single place's thresholds |

## 3. Mechanisms that fit the existing protocol

**M1. "Introduction required" for account-creating actions** (policy, not a new message). *Decided 2026-10-26 2:36 PM PT (D17, SPEC v0.2.10 §3): each place decides; a place MAY require an introduction or its own invitation, and SHOULD where it offers accounts or money. Not a protocol-wide MUST.*
- A place can declare an action class `account.create` (and `subscription.start`, `review.post`, `follow`). Its policy requires a full-weight vouch for it.
- The SPEC already has the answer shape. A missing vouch is `deny` / `not_now` / `VOUCH_REQUIRED` with retry `with_credential [vouch]` (§3 "Missing vouch"). The readiness item `introduction` already exists.
- New: a registered action-class list, so that places and agents mean the same thing by "sign up". Browsing stays outside the ritual.

**M2. Introducer standing and accountability** (extends §4.12 and red-team P2, P5).
- Introducers already stake their standing. Misconduct notices go to every introducer in the vouch chain, and penalties grade `reduced` (90 days) or `suspended` (180 days) (§4.12, D1). The brief traces these notices to v0.1b; today they live in SPEC v0.2.7 §4.12.
- Adopt **P2**: a vouch weighs only if its introducer has standing *at this place*. Self-hosted or first-seen introducers carry no weight, and `"*"` is forbidden for account-creating actions. This is the main defence against T3.
- Adopt **P5**: a penalised introducer can't sign its own review.
- New: a misconduct code `fake_signup`, or an extension of `purpose_misrepresentation`, covering accounts created for fake growth. Default severity: serious, rising to severe for a pattern.

**M3. Per-owner and per-introducer rate limits at a place** (extends §4.12 probing, and red-team P6).
- A place MAY cap account-creating actions per owner DID and per introducer per time window (defaults are an open question).
- Past the cap, the answer is `deny` / `not_now` / `RATE_LIMITED` with a retry time (P6 standardises this). It isn't misconduct by itself.
- Effects stay local to the place, as §4.12 requires. This blunts T1 and T5 at each place, and makes T2 cost one passkey per extra identity.

**M4. Optional personhood or identity attestation slot** (provider-neutral).
- A card or invitation request MAY carry an `attestations` item: `{kind: "personhood" | "verified_identity" | "age_over", issuer, proof_ref, issued_at, expires_at}`.
- It's verified by the place against issuers the place chooses. Shōkai names no provider and never requires one.
- A place that needs "one human, one account" can require it for `account.create` with a new typed condition, `require_attestation {kinds: [..]}`, alongside the existing `require_vouch` and `require_mandate`. This is the only mechanism aimed squarely at T2.
- It must be privacy-preserving by default: prefer "a unique person, for this place" over revealing who.

**M5. Place-side reporting of misconduct** (uses §4.12 notices).
- When a place finds fake sign-ups, it issues a `MisconductNotice` to the owner and every introducer in the chain. That already exists.
- New: a recommended *place-to-place* signal, off by default. A place MAY publish signed, aggregate statements about introducers ("introducer X: 40 vouched sign-ups, 38 fake, window W"), and other places MAY weigh them.
- This needs care: §4.12 says another host MUST NOT *apply* a misconduct record it didn't witness. Weighing a signed report as input is different from applying a penalty.

**M6. Replay defence** (T4; mostly already covered).
- A replayed card is already logged as impersonation without notifying its owner (§4.12).
- Adopt **P1** (a normative freshness window) and **P8** (fetch scope).
- Recommend that an `account.create` request bind the card digest *and* a fresh place nonce, so a copied card can't open an account.

## 4. What this can't solve
- **One determined person with many devices** can still make many owners (T2) unless the place requires an attestation (M4), and attestations have their own costs, exclusion risks and privacy trade-offs.
- **Colluding real people** who vouch for each other's fakes are slowed by standing and penalties, not stopped.
- **Agents that skip the agent door** and pose as humans in the human door are a site-security problem (bot detection, Web Bot Auth). Shōkai only makes the honest path easier and more valuable.
- **Cross-place slow drips** (T5) stay hard while misconduct stays local by design.
- Shōkai doesn't judge whether a review's *content* is honest. It judges who sent it, for whom, and with whose backing.

## 5. Open questions
1. **Action classes.** Is `account.create` / `subscription.start` / `review.post` / `follow` the right first list? Should "buy" be in it, given spending already needs a signed limit?
2. **Default caps.** Should the spec suggest default per-owner and per-introducer caps (for example 1 account per owner per place, and N vouched sign-ups per introducer per day), or leave them entirely to places?
3. **Attestation slot.** Do you want it in v0.3 at all, given the privacy and exclusion risks? If so, should "unique for this place" (no global identifier) be a MUST?
4. **Place-to-place signals (M5).** Keep §4.12's strict locality, or allow signed aggregate introducer reports as optional input? This trades privacy and fairness against catching slow drips.
5. **New misconduct code.** Add `fake_signup`, or fold it into `purpose_misrepresentation`?
6. **P2 and P5 first.** They are the backbone of M2. Should P9 wait for a decision on them?
