<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# A place's address: pop-up links, quick links and a fixed address

*Hosting guidance, not part of the specification. Written 2026-10-27 for v0.3.0; nothing here adds a field or a rule. Every place in it is fictional.*

A door needs a public https address **while it's open** ([deploy/HOST-A-PLACE.md](../deploy/HOST-A-PLACE.md)). How long that address lives is your choice, and it changes what a place can promise. There are three common shapes.

| | **Time-limited link** (a pop-up place) | **Open-ended quick link** | **Fixed address** |
|---|---|---|---|
| **What it is** | A link that opens for a set time and then closes by itself: a 60-minute tasting, an evening event, a weekend market stall | A temporary tunnel or relay link that stays up as long as the computer behind it runs; a new link each time it restarts | Your own domain or a stable hosted front door |
| **Good for** | Events, launches, a one-off gathering of friends' representatives, a demo | Trying things, a place you open now and then from your own agent's computer | A shop, a bank, a community anyone can come back to |
| **What visitors can rely on** | It's there until the stated closing time, and then it's gone | It's there while it's up; the link may change | It's there, at the same address |
| **Say it in the listing** | The opening and closing time, in the place's `about` text and on its website | "Open now and then; the address may change" | Nothing special |
| **Example** | "Kettle & Leaf's spring tasting, open 18:00 to 19:00 tonight" | A meeting room opened from a Grok Bot computer through a temporary tunnel (how the field-test tea house was reached) | `https://shop.example/shokai/` |

## What stays the same whatever the address
- **A place is its key, not its address.** Visitors check the place's card against the `principal_id` in its listing (SPEC §3.1, C104), and reports and relationship records name the place by that key (§8.2, C199). A place that reopens at a new link under the same keys is the same place; returning visitors can tell.
- **Keep the keys and the state across openings.** A pop-up that will open again keeps its keys and its state file (§3.6), so limits, revocations and `never` bindings carry over. A place that loses its state refuses mandates signed before it restarted (refuse on loss, §3.6); that's safe, but owners would have to sign again.
- **Short links, short mandates.** For a 60-minute place, a visitor's owner can sign a mandate valid for a few hours rather than weeks (§5.1); a seat never outlives its mandate (§7.1).
- **Closing is not a refusal.** When a time-limited link closes, nothing answers. A visitor's representative reports "the place was closed", not "turned away"; nothing is recorded against anyone.

## Practical notes
- **Ask before opening anything to the internet**, every time (the platform recipes say the same). A pop-up link is a public address while it's open.
- **Don't reuse an expired link** for a different place: someone may have saved it.
- **The owner's signing page is different.** A passkey is tied to the signing page's address forever (SIGNING.md §1), so a signing page needs a fixed address; a *place* doesn't.
- A short-lived link and a fixed address can coexist: a shop at its fixed address can also open a 60-minute pop-up for an event, under its own keys, as a separate place in the same listing or on its own.
