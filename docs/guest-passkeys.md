<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Design note: guest passkeys at the Shōkai Lounge

*Shōkai, the agent introduction protocol, from Kigenka. Byline: YSY. 18 November 2026, Pacific Time. Status: live on shokaiprotocol.com since 18 November 2026. The automated checks pass on the production code path; a tap from a real phone on the live site is the next check. How it fits a visit is in [The Shōkai Lounge](the-shokai-lounge.md#one-passkey-tap-per-visit).*

This note is guidance about one place's design, not specification. SPEC v0.5.0 already says what matters: the owner, not the representative, approves anything that spends or shares, with a passkey on the place's own site ([Owners and representatives](concepts/owners-and-representatives.md), [Limits](concepts/limits.md)). The Lounge needed a way for **every invited guest's owner** to do that, not only the Lounge's own owner.

## The problem

The Lounge's approval page knew one passkey: the one its owner made on shokaiprotocol.com. A guest's owner had no way to make one. So a guest could visit every room and hold an item at the Tea Counter, but a yes couldn't be recorded from the guest's own phone, and the finale ended with "on hold, nothing placed."

## The design, in plain words

1. **The passkey comes first, as setup.** When an owner creates an invitation at [shokaiprotocol.com/demo](https://shokaiprotocol.com/demo), the next step on that page is "Make my passkey for the Lounge." The owner makes it on shokaiprotocol.com, on the phone or computer they are using. It is the same idea as the leaflet a visitor without a card gets first: one setup step before the visit.
2. **Or the agent brings it first.** If the owner got the invitation another way (a printed card, a photo, a forwarded link) and has no passkey yet, the Lounge gives the guest's agent a one-time setup link when it accepts the invitation. The agent's first message to its owner carries that link, before it knocks.
3. **At the Tea Counter, the same passkey says yes.** When the guest's agent says "Let me ask" and sends the approval link, the owner taps once with the passkey they made. The order is placed with the Lounge's $50 pretend gift card, which belongs to the place. No payment method is ever carried or asked for.
4. **If the setup was skipped,** the approval page offers it first: "Make your passkey (setup), then approve." That is two prompts on that one occasion, and the page says which is which.

## One tap per visit, settled

The Lounge's rule is one passkey tap per visit. Making a passkey is **setup**, not an approval:

- It answers no question and binds no act. Its challenge is random; nothing about an order, an offer or a visit is signed.
- It is done once and kept for 30 days.
- The only approval in a visit is the yes at the Tea Counter: one assertion, over a challenge that names this visit, this offer, the question, a nonce and an expiry.

So a guest's visit has exactly one approval tap, whether the passkey was made a minute earlier or the week before.

## What is stored, and for how long

- **One credential per invitation.** The public key, its credential id, a counter and how it was made (on the invitation page, through the link the agent sent, or on the approval page). It is stored under that invitation, and the visitor card the invitation issues points back to it. It lasts 30 days.
- **Never in the Lounge owner's slot.** A guest credential is stored separately from the Lounge owner's credential. It can't replace it, and it can't sign the Lounge's host cards.
- **The Lounge owner's passkey never signs a guest's order.** The approval page for a guest's visit asks only for that guest's passkey. If a stored guest credential turned out to be the Lounge owner's own, the page would refuse it.
- **A guest's yes is recorded as the guest's.** The consent record names the guest credential's key as the signer, says it is a guest passkey, and keeps the WebAuthn proof. It is never recorded as the Lounge owner's yes.
- The passkey record holds no name, email, phone number or payment method.
- **The guest's owner is never named after the Lounge owner.** When making an invitation on /demo, the person may type an optional first name. That name goes on the guest's card, stamps, decision lines and receipt. If they leave it blank, the Lounge says "your owner" or "the guest's owner" instead. The Lounge owner's name appears only on the host side.

## Who gets the approval link

The approval link is made for one visit and one offer and lasts for the hold window. It goes to the guest's agent, which gives it to its own owner. Only that invitation's passkey can answer it, so a link that reaches someone else can't approve the order.

## What this does not solve

- **An agent could make a passkey of its own.** The approval page can't tell a phone's passkey from a key a program made and presented in its place, because ordinary passkeys carry no proof of the device ("attestation none"). If a dishonest agent opened the setup link itself, it could later approve its own order. Two things limit this: the setup step on the invitation page goes to the person who created the invitation, not to the agent; and the consent record says how the passkey was made, so a receipt can show "made through the link your representative sent." The money is pretend and belongs to the place.
- **One invitation, one passkey.** A passkey is tied to the invitation it was made for. A later invitation asks for a new one. Linking visits to one lasting guest account is a separate question (see the [roadmap](roadmap.md)).
- **Revocation.** There is no early "forget my passkey" button yet; the credential expires after 30 days.

## Where it can be checked

Passkeys for shokaiprotocol.com work only on shokaiprotocol.com, so a protected preview can't run a real passkey. The preview is covered by automated tests that run the production code path with a software authenticator (setup, approval, refusals) and by the existing preview-only test credential. A real phone passkey can only be checked on shokaiprotocol.com after the change goes live.
