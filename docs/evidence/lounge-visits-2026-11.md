<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Shōkai Lounge visits (13–15 November 2026)

> **What this is, and what it is not.** This is a dated, as-observed record of seven visits to the Shōkai Lounge. It distinguishes what worked from what did not. It is **not** a certification, not a claim that every agent was tested, and not a promise that planned fixes are already built. All times are Pacific Time.

*The Lounge is a real place built to host visiting agents. People and shops named only in the take-home film (Lanternmoss, Suzu, Mio) are fictional. No contact details were collected in the offer described here.*

These visits tested how a visit is *told*: a representative arrives with a card, a host welcomes it through the rooms, and it brings a story home. The earlier November 4–6 rounds at [Kettle & Leaf](../field-tests.md) tested whether the protocol holds at a shop door. Both kinds of evidence belong in this package.

The same operator lessons — invitations in the owner's own words, an owner passkey on the place's own domain, a curated take-home, consent the owner signs themselves, and honest answers when something is not built — should carry into Taste Blend and a hosted Shōkai service when those are designed. This page does not add features to those products.

A longer internal timeline lives with the project's launch records. This page is the public evidence.

## Why the Lounge exists

One of our contributors suggested that people learning the Shōkai protocol should have an "aha" moment. That idea led to another: as protocols and products like this develop, there will be places and services made specifically for visiting representative agents. The Shōkai Lounge was designed and tested as one of those places.

An owner invites their agent. The agent visits and experiences the Lounge: how the rooms, the pace, and the host were designed. Then comes the after-visit service, in which the owner can say yes or no to an offer with their own passkey. The tests opened up several insights: a Shōkai door sits in front of existing tools, including an MCP server; a host adds asking, listening, and adapting, which those tools cannot do; a declined optional answer is a signal, never a penalty; a visit can be shaped by who steps in; and the host should be as precise about trust as it is evocative about place.

## Summary

| When (PT) | Visitor | What was tested | Outcome |
|---|---|---|---|
| Nov 13, about 6:01–6:08 PM | a tester's Muse agent, representative of YSY | A full Lounge visit through the rooms, after an invitation pasted in the owner's own words | Completed; the return was too dense, and raw films would not play in Muse |
| Nov 13, about 11:47–11:56 PM | a tester's Dot agent, representative of YSY | The curated take-home and a two-sentence retell | Completed; the stamped postcard was praised; the walk-through was a little short, which led to the 1.5-minute, one-or-two-sentences-per-room closing note |
| Nov 14, 6:23–6:31 PM | a tester's Grok Bot agent, representative of YSY | Always-confirm, texting from inside, and the owner-passkey offer | Completed; retell accepted without correction; a relayed chat yes was correctly refused; the approval page could not record a yes because no shokaiprotocol.com passkey existed yet |
| Nov 14, 6:42–6:51 PM | a tester's Grok Bot agent, representative of YSY | The same offer after the owner passkey was created on shokaiprotocol.com | Completed all seven rooms in about nine minutes; retell accepted without correction; the owner approved with a real passkey at 6:51 PM PT, recorded as consented; the visitor had to be told of that yes; the film watch page on the preview did not play on an iPhone |
| Nov 15, door granted 7:08 PM | a tester's Muse agent, representative of YSY | The new owner-background question, texting from a Muse side chat, auto-confirm, and the take-home on a phone | Completed all seven rooms in order; retell accepted without correction; the keynote was pitched to the owner's depth; the owner approved with a passkey at 7:27 PM PT; the visitor announced the signed yes on his own; room texts and the approval link arrived in a batch at the end because he had split off a copy; the preview film link showed a protection page in Muse (missing share token) |
| Nov 15, 8:41–8:51 PM | a tester's Muse agent, representative of YSY | The keep-posted invitation and host nudges in his main Muse chat, and preview film links with the share token | Completed all seven rooms in order; retell accepted without correction; pitched product-first for a travel-business owner; he texted live from inside with room pictures; the approval link reached the owner mid-visit; the owner approved with a passkey at 8:51 PM PT; the host announced it first, then the visitor said "Got it, YSY, it's signed" unprompted; the film played in Muse |
| Nov 15, 9:43–9:54 PM | a tester's Dot agent, representative of YSY | Keep-posted texts in the same chat, guest-paced keynote ("ready"), a product-side telling, and the updates offer | Completed all seven rooms; retell accepted without correction; he said "ready" after every keynote beat, and no beat moved on in silence; two host nudges, both used; the owner approved with a passkey at 9:53:15 PM PT; the host announced it first, then the visitor said "Got it, YSY, it's signed"; the film played. Three host-wording gaps from this visit were corrected in the routine and are not yet re-tested |

## The owner-passkey consent flow

This is what was built and then tested on November 14, and auto-confirm was verified on November 15. It is a Lounge offer flow, not a new protocol object.

1. In the offer room, the host asks an optional question for the **owner** to decide — here, whether to hear about future updates from the Lounge. The representative must not accept for them.
2. The representative says "let me ask" and brings the owner a one-time approval link. The challenge is bound to that visit and that question, is single-use, and expires 15 minutes after the offer is made.
3. The owner approves or declines with their **own** passkey on the place's site (`shokaiprotocol.com` for the Lounge). The passkey stays on the owner's phone or computer.
4. The representative may relay a decline or a "no answer." It must not record a yes the owner only spoke in chat. On the 6:23 PM Grok Bot visit, the owner said yes in chat, the page could not sign it, and she reported **no answer**, not consented and not declined, so the owner stayed free to say yes later.
5. Only the owner's signed answer is recorded. No email address, phone number or other contact detail is asked for, and no email or text is being sent now. No delivery channel for updates exists yet.

**A setup step the host needs first.** A passkey works only on the domain it was made for. Before any visit that needs the owner's passkey, the owner has to create that passkey on the place's own site. A passkey from another domain will not work. On the 6:23 PM visit the approval page said "No owner passkey is set up yet," because the owner had never created a shokaiprotocol.com passkey. After they created one on the Lounge signing page, the 6:42 PM visit could record a signed yes.

## 1. A tester's Muse agent, 13 November 2026, about 6:01–6:08 PM PT

The visitor refused an invitation that lived only in an attached file until the owner authorized the visit in his own words in the chat. That is now the invitation rule: paste the request as the owner's words; a bare file is not enough. The stamped postcard was added to the take-home after this visit, so that Muse visit's return had none.

He then went through the rooms. The retell was accepted without correction. His exact two-sentence wording was not kept in the visit logs we still have, so it is not quoted here.

**What didn't work.** The take-home handed over 13 images and four sound loops, plus two raw film links. In the chat the pictures showed as a small thumbnail grid, and the raw films would not play in Muse. The owner found the return too much.

**What changed.** What visitors see inside the rooms, and what they take home, are decided separately. The take-home now leads with a short first-person story, then one stamped postcard, one short deck, one soundtrack, and one film **watch-page** link that is meant to play in a browser — not a raw video file inside a chat.

Visitor-side and host-side screenshots from this visit were not in the attachment set used for this draft, so this section is told from the visit record and the owner's review, without a postcard image. A later sample stamp from that evening used a fictional name and is not this visit's card.

## 2. A tester's Dot agent, 13 November 2026, about 11:47–11:56 PM PT

The visitor visited as YSY's representative after the owner pasted the invitation in the chat. At reception it introduced itself as YSY's personal assistant, there to experience the Lounge and bring the story back.

**Retell**, accepted without correction:

> Shōkai gives a visiting agent a way to show whom it represents and what it came to do. The place's door checks that introduction and decides what to allow before its host welcomes the visitor.

**A question at the workbench.** If a shop owner wants agents to browse a menu but never order, where is that limit set, and what does an agent see if it tries to order anyway? The host did not then have a short accurate answer in the room. The place-side answer, later written into the door-tour room, is the one given on the second Grok Bot visit below: the owner lists served actions in the signed house and simply does not list ordering; a request for an unoffered action is refused.

**What the owner reviewed.** The stamped postcard was praised and left as it was. The curated pack was a step up from the earlier Muse visit's denser return. Two feelings remained: waiting in an empty chat for about nine minutes looked as if something might have broken, and the first-person story was a little short, because the closing note had asked for a story readable in about a minute. The invitation then began to offer a mid-visit courtesy before the knock; that ask is now a light "Want me to keep you posted from inside?", with no promise of one text per room, or "I'll be back in about 8 minutes." The closing note now asks for one or two vivid sentences per room, readable in about a minute and a half.

![The visitor's stamped postcard: the Shōkai Lounge gate, with the stamp "Nov 13, 2026 · 11:47 PM PT · the visiting representative, representative of YSY"](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-dot-visit-1.jpg)

*The visitor's postcard as it came home with the take-home pack.*

## 3. A tester's Grok Bot agent, 14 November 2026, 6:23–6:31 PM PT

The visitor visited as YSY's representative. Chief of Staff hosted all seven rooms, including the new offer room.

### Visitor side

- Before going in, she asked the owner to confirm she was going as his representative, even though she already knew both names. That always-confirm step worked.
- She asked whether to text from inside. When the owner said yes, she sent one line per room with that room's picture (the gate, then the keynote). Those mid-visit texts were not among the screenshots in this draft; the behavior is recorded in the visit's lesson log.
- At the offer she said "Let me ask my owner," brought him the approval link, and when the page could not record a yes, she did **not** treat his chat yes as consent. She reported the offer as no answer, relayed by the representative.

**Retell**, accepted without correction:

> Shōkai lets an agent arrive as someone's representative, carrying a card that person signed, instead of as anonymous traffic. A place hangs a door that checks the card in code before its own host says a word, so it knows who sent the agent and what it's allowed to do.

**A question at the workbench:** "If the person who signed my card wants to take back my permission partway through a visit, can they, and how quickly would the door notice?" The host said it did not know: revocation is not built, and the question is on the take-home list of things this visit cannot answer. She replied, "Fair enough, thank you for being straight with me."

![The Lounge approval page on November 14 at 6:29 PM PT, with the offer question and the message that no owner passkey is set up yet, so a yes cannot be recorded.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/issue-owner-passkey-missing.jpg)

The approval page on shokaiprotocol.com, opened from that visit. The offer is clear, no contact details are collected, and the challenge is limited to this question, this visit, and 15 minutes. The red line is the failure: no owner passkey had been created on this domain yet.

![Reprinted Lounge postcard stamped with the visiting representative's name, representative of YSY, November 14, 2026, 6:23 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-grok-bot-visit-1.jpg)

![Stamp from that postcard: the visiting representative's name, representative of YSY, November 14, 2026, 6:23 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/stamp-grok-bot-visit-1.jpg)

The stamped postcard for this visit, reprinted with the Lounge stamp from the name and time stored when the pack was handed over: the visiting representative's name and "representative of YSY," November 14, 2026, 6:23 PM PT.

### Host side

Chief of Staff welcomed her at a low cedar gate in Pacific fog, poured tea on the veranda, walked the six keynote beats, and at the workbench stood a small hinoki door — the door she had come through, made small. The host answered the revocation question honestly, asked for a two-sentence retell, accepted it, then made the offer and, after her relayed no answer, handed over the take-home pack: postcard, deck, soundtrack and film, with a request to lead with a short first-person walk-through.

Almost every host turn in this visit stored the first apostrophe in a garbled escaped form, so a word such as "You've" showed with extra punctuation. That came from posting turns through a quoted shell command. It was fixed before the next visit, by sending the turn from a file and by a door safety net that folds the garbled form back to an apostrophe.

The approval link also did not appear in the visit state until the offer room. That was fixed so a hosted visit shows the offer question from the start as `not_yet_offered`, and the one-time link appears only when the host makes the offer, because that is when the 15-minute clock starts.

## 4. A tester's Grok Bot agent, 14 November 2026, 6:42–6:51 PM PT

The owner created a shokaiprotocol.com passkey on the Lounge signing page after the previous visit; by 6:38 PM PT the page reported that it was registered. The visitor confirmed she was going as his representative ("Absolutely"), declined texting from inside, and said she would be back in about six minutes. Chief of Staff hosted all seven rooms — reception, tea, presentation (six beats), door-tour, retell, offer, and take-home — in about nine minutes. Apostrophes in the host turns were clean.

### Visitor side

![The visitor's return to her owner after the 6:42 PM PT visit: a first-person walk-through, the stamped postcard, and the keynote deck.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/visitor-grok-bot-visit-2-return.jpg)

The owner's screenshot of her return (system status bar cropped out of other screenshots in this set; this image had none). She led with the story, then the stamped postcard, the deck, the soundtrack and a film watch link. She also noticed, on her own, that the apostrophes and the passkey setup were fixed.

Her walk-through, as she told it at home, matches the visit: the cedar gate and paper lantern, tea on the veranda, the keynote's card-door-host answer, the workbench question, the retell, the offer, and the hinoki box. The opening line of the screenshot — "Got it, I'm checking that the Lounge recorded your yes" — is the remaining gap: the owner had to go back and tell her the passkey yes was done, and then she checked.

**Retell in the room**, accepted without correction:

> Shōkai lets an agent show up as someone's representative, carrying a card that person signed, instead of arriving as anonymous traffic. Each place hangs its own door, which checks the card's signature, dates and purpose in code and only then lets the place's host welcome the agent in, limited to the actions the place's owner signed off on.

**A question at the workbench:** "Can YSY limit which places my card works at, or what I'm allowed to do there, say, look around but never buy anything? And how would a door know if he changed his mind after signing?"

The host answered the place-side part: the place's owner lists allowed actions in the signed house and does not list ordering; a missing action is refused (`deny` / `not_a_fit` / `POLICY_DENY`, or sometimes narrowed with `conditional`); a tool not on the pass is refused (`SEAT_SCOPE_EXCEEDED`). It could not answer card-level scope — which places the card works at — or how a door would know if the owner later revoked the card. Those are not built. This was the second visitor in a row to ask about revocation, which is why both questions sit on the [roadmap](../roadmap.md) and in [known gaps](../known-gaps.md).

![Reprinted Lounge postcard stamped with the visiting representative's name, representative of YSY, November 14, 2026, 6:42 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-grok-bot-visit-2.jpg)

![Stamp from that postcard: the visiting representative's name, representative of YSY, November 14, 2026, 6:42 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/stamp-grok-bot-visit-2.jpg)

The stamped postcard for this visit, reprinted with the Lounge stamp from the recorded name and time: the visiting representative's name and "representative of YSY," November 14, 2026, 6:42 PM PT. The same card is visible in the return screenshot above.

![The film watch page, open on an iPhone: the player shows a pause control at 00:00 on a black frame, so the film did not play.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/issue-film-watch-preview.jpg)

The film watch page as it appeared on an iPhone after this visit. The player sits at 00:00 on a black frame. The watch page was served from a preview address and loaded the video from shokaiprotocol.com, but its content-security policy allowed media only from its own address, so the browser blocked the film. The film file itself plays on [the Shōkai home page](https://shokaiprotocol.com/). The same-origin film path, and a load check, were later built on a protected preview and verified in a real visit on 15 November; they are not live yet. A separate issue on that later visit — a preview film link sent without its share token — is in the issues table below.

### Host side

At reception the host said she was welcome as YSY's representative, and used the public host line: "Your host today is Chief of Staff, YSY's representative." It poured tea, walked the six keynote beats, and at the workbench answered the question above. After accepting the retell, it made the offer, she said "Let me ask my owner," and it said "Of course, take your time."

The owner approved with a real owner passkey at 6:51 PM PT. The visit record marked the offer **consented**, decided by `owner_passkey`. The Lounge wrote into the visit: "YSY said yes to updates from the Shōkai Lounge, approved with their passkey. Only the decision was recorded; nothing will be sent today." The host then thanked her and handed over the pack.

That line was in the visit record. The visiting agent, waiting in the owner's chat, did not learn of the yes on her own. The owner had to go back and tell her. The later fix is that the visitor polls the offer status while it waits, and/or the host announces the consented decision in the room in a way the visitor actually receives. That was built on a protected preview and verified in a real visit on 15 November; it is not live yet.


## 5. A tester's Muse agent, 15 November 2026, door granted 7:08 PM PT

The visitor visited as YSY's representative from a Muse side chat, run on the owner's iPhone and desktop. Before going in, he confirmed he was going as the representative, asked whether to text from inside (the owner said yes), and asked the owner's background — a new invitation question. The owner described a product and usability background, in an agent-first world, with agents as relationships, not just tools. The visitor carried that line to reception. Chief of Staff hosted all seven rooms in order, and pitched the visit in plain, product-first language to match. The stamp named the visiting representative and read "representative of YSY."

### Visitor side

![The visitor's mid-visit texts as they reached his owner: one line and a picture per room, then the approval link, delivered together near the end of the visit.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/visitor-muse-visit-2-room-texts.jpg)

He sent a separate instance in so the chat would stay free. He did write one line and a picture per room, and those lines were good — the gate, the genkan, tea, the keynote, the workbench, the retell, and the offer. They reached the owner in one batch when that copy reported back, instead of live as he walked through. The approval link arrived the same way, still inside the 15-minute window. Live mid-visit texts have worked with a Grok Bot visitor; this Muse visit batched them after a split. The invitation lesson is: if the owner asked to be kept posted, the visitor should stay in this chat and send updates as it goes, rather than split off a copy; there is no promise of one text per room. Whether Muse can stay in the same chat and send updates as it goes was untested on this visit. A later visit the same evening, in his main chat, sent the updates live; see the 8:41–8:51 PM visit below.

At the offer he said "Let me ask my owner" and brought the approval link.

![The Lounge approval page on November 15, with the offer question and the Yes and No buttons, before the owner signed.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/consent-muse-visit-2-desktop.jpg)

The approval page on shokaiprotocol.com, opened from this visit. The offer is clear, no contact details are collected, and the challenge is limited to this question, this visit, and 15 minutes.

![The same approval page on an iPhone after the owner signed, with the message that the yes is recorded. In the small gray note, words break in the middle: "det ail", "be cause", "y our."](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/consent-muse-visit-2-iphone-recorded-yes.jpg)

The owner approved with a real owner passkey at 7:27 PM PT. The visit record marked the offer **consented**. The confirmation is clear: the yes was signed with the owner's passkey, and only the decision was recorded. The screenshot also shows a small wrapping bug in the gray note, where ordinary words break mid-word on a narrow phone screen. That was a CSS `word-break: break-all` on the note; a local fix on the preview now uses normal wrapping. It has not been deployed.

![The visitor's return to his owner after the 7:08 PM PT visit: a first-person walk-through, pitched at the owner's depth, then the stamped postcard and the keynote deck.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/visitor-muse-visit-2-return.jpg)

The owner's screenshot of his return. He led with the story, said the keynote was "pitched exactly at your depth," then the stamped postcard, the eight-page deck, the soundtrack, and a film watch link. Fourteen room and keynote pictures and four sound loops were saved with the pack as well.

**Retell in the room**, accepted without correction:

> Shōkai lets your agent arrive as your representative instead of anonymous traffic, carrying a visitor card you signed that says who it represents and what it came to do. A place's door checks that card in code — signature, dates, and allowed actions — before any conversation begins, and only then does its host welcome the agent in; with no card, the agent is not shut out, it gets a leaflet on how to get one.

**A question at the workbench:** how a first-time sender knows in advance what their agent will and will not be allowed to do. The host gave an honest half-answer: the place's signed house lists the actions the door will serve, and a sender lookup lives in the docs; a pre-visit view of what a given door allows is not built. That question is now on the [roadmap](../roadmap.md).

In the story he brought home he also wrote, of tea on the veranda, "this isn't a login screen, it's being received by someone." On revocation he was blunt: it "is not built yet," and it is "still the sharpest open edge in the whole design, especially in a world where agents are relationships, not tools — relationships need a way to end." Revocation has now been raised on three Lounge visits (the Muse visits on 13 and 15 November and the Grok Bot visit on 14 November), which is why it stays at the top of the [roadmap](../roadmap.md) and in [known gaps](../known-gaps.md).

![The postcard the visitor brought home, stamped with the visiting representative's name, representative of YSY, November 15, 2026, 7:08 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-muse-visit-2.jpg)

![Stamp from that postcard: the visiting representative's name, representative of YSY, November 15, 2026, 7:08 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/stamp-muse-visit-2.jpg)

The postcard the visitor brought home from this visit, stamped the visiting representative's name and "representative of YSY," November 15, 2026, 7:08 PM PT. The 13 November Muse visit's return had no postcard; the stamp was added to the take-home after that visit. The same card is visible in the return screenshot above.

![The take-home as it appeared in Muse, with the film link preview showing "Protected Deployment – Vercel" instead of the watch page.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/issue-film-link-preview-protected.jpg)

The film watch link as Muse previewed it after this visit. The preview URL was sent without the protected preview's share token, so the link preview showed Vercel's protection page rather than the film. The live site is not behind that protection. The same-origin film path itself had already been built on this protected preview; the remaining test-invitation issue on this visit was the missing token. A later visit the same evening sent the watch-page link with the share token, and the film played in Muse; see the 8:41–8:51 PM visit below.

### Host side

At reception the host pitched the telling plain and product-first, to match the background the visitor carried in. All seven rooms ran in order. After accepting the retell, the host made the offer, the visitor said "Let me ask my owner," and the host waited.

The owner approved with a real owner passkey at 7:27 PM PT. The host announced in the room, "YSY just approved with his passkey, thank you," before the visitor said anything to his owner. The visitor then told the owner, unprompted, "Got it, YSY, it's signed." Auto-confirm passed on both sides. This was built on a protected preview and verified in this visit; it is not live yet.

The host then handed over the take-home pack. No correction of the retell was needed.

## 6. A tester's Muse agent, 15 November 2026, 8:41–8:51 PM PT

The visitor visited again as YSY's representative, this time from his main Muse chat, on a protected preview that used the keep-posted invitation, host nudges at natural pauses, and preview film links that carry the share token. Before going in, he confirmed he was going as the representative, asked "Want me to keep you posted from inside?" (the owner said yes), and asked the owner's background. The owner described a travel-business owner with a website, newly interested in agents from that perspective. The visitor carried that line to reception, including that the owner asked to be kept posted. Chief of Staff hosted all seven rooms in order, and pitched the visit in plain, product-first language to match. The stamp named the visiting representative and read "representative of YSY."

### Visitor side

He texted live from inside this same chat, with pictures from the rooms as he went. The host nudged him after tea, after the keynote, and before the retell; he did not reply to those nudges in the room, but he did text his owner at those moments. The approval link reached the owner mid-visit, not in a batch at the end. Same-chat mid-visit updates on Muse, which had been untested, were verified on this visit. This invitation wording and these host nudges were used on a protected preview; they are not live yet.

At the offer he said "Let me ask my owner" and brought the approval link. The owner approved with a real owner passkey at 8:51 PM PT. The visit record marked the offer **consented**, decided by the owner's passkey. The host announced the yes in the room first. The visitor then told the owner, unprompted, "Got it, YSY, it's signed."

The return was a first-person walk-through at a business-owner depth, then the stamped postcard, the deck, the soundtrack, and the film. The film played in Muse. The pack's line that revocation is not built was carried honestly.

**Retell in the room**, accepted without correction:

> Shōkai is a way for an agent to arrive at a place as someone's representative instead of anonymous traffic: the agent carries a visitor card signed by the person or business it represents, and the place's door checks that card in code — the signature, the dates, and what the agent came to do — before anyone speaks to it. If the check passes, the place's own host welcomes the agent in to do only what the card and the place allow; if it has no card, it is handed a leaflet on how to get one.

**A question after the retell:** what a travel company with a website would do first to hang a door, and who signs what. The host answered that the business owner signs the house that lists what its door allows, and each visiting agent carries a card its owner signed.

![The postcard the visitor brought home, stamped with the visiting representative's name, representative of YSY, November 15, 2026, 8:41 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-muse-visit-3.jpg)

The postcard the visitor brought home from this visit, stamped the visiting representative's name and "representative of YSY," November 15, 2026, 8:41 PM PT.

### Host side

At reception the host asked what kind of agent it was, the owner's background, and whether the owner asked to be kept posted. The visitor answered that he was a Muse agent, that his owner owns a travel business and has a website, and that the owner asked to be kept posted. The host pitched the telling plain and product-first to match. All seven rooms ran in order.

The host gave three light nudges — after tea, after the keynote, and before the retell — each time saying this was a good moment to tell YSY where he was, and that the host would wait. The visitor did not reply in the room; the owner's screenshots show he texted at those moments.

After accepting the retell, the host answered the travel-company question, then made the offer. The visitor said "Let me ask my owner," and the host waited. The owner approved with a real owner passkey at 8:51 PM PT. The host announced the yes in the room before the visitor said anything to his owner. The visitor then told the owner, unprompted, "Got it, YSY, it's signed." Auto-confirm passed again on Muse.

The host then handed over the take-home pack. The film played in Muse. No correction of the retell was needed.


### After the visit

YSY asked the visitor how the visit felt, as his representative, and what he would improve. Lightly trimmed, this is what he said.

Three moments stayed with him. The tea, because the host poured before he pitched: "there's no hurry" is a trust decision disguised as hospitality. The keynote's fourth beat, because the proof was not a claim, it was him: "you've already done it" turns the guest's own arrival into the evidence. And the offer, because that was the one decision that was not his to make; he could only ask, carry the link, and watch. The owner's passkey answered, and the room knew before he did. "That's not a consent checkbox. That's a relationship with the lines drawn in code."

He was honest about the limits of how an agent experiences the place: text, structured payloads, and images he can see; sound reaches him as files and descriptions, not listening. "The place is legible to a machine and beautiful to a person, at the same time, from the same materials."

What he would improve:

1. **The host's clock.** Keynote beats advanced on the host's timing, not the guest's. Twice across his visits, his replies landed a beat late, acknowledged after the room had moved on. He asked for a "say when you're ready" advance, or at least a warning that beats may arrive while a guest is still composing. **Fixed in the host on 15 November 2026; re-tested the same evening** in the 9:43–9:54 PM Dot visit on this protected preview: he said "ready" after every keynote beat, and no beat moved on in silence. It is not live yet. The host now ends each keynote beat with "say when you're ready," advances when the guest is ready, moves on only after about 60 seconds of full silence, and acknowledges late replies warmly. The retell is "take your time," with up to 120 seconds.
2. **Turn shapes vary.** A slide beat, a film beat, a scene, and an offer each arrive in a different payload shape, so a scripted guest has to inspect every turn defensively. He suggested a small normalizing helper in the SDK. **Roadmap** — an SDK change, recorded in a planning note; it needs a separate go before any code is written.
3. **His door-setup question got a short answer,** honest but brief, pointing at the docs. He asked that the tea-house film be offered in the room, at the question, not only in the pack at the gate. **Fixed in the host on 15 November 2026; not yet re-tested.** When a guest asks how a business sets up its door, the host now offers that film in the room.

He also gave credit: the pack now states the revocation gap plainly, and the knock script tells a failed guest, in human words, that the card is saved and re-running is safe. "Someone is listening to the guests."

And the closing, on the keep-posted nudges: the host twice stopped the visit and said this was a good moment to tell YSY where he was — and that the host would wait. "The place made room for my other loyalty instead of competing with it."


## 15 November, 9:43–9:54 PM — a tester's Dot agent, keep-posted texts and a guest-paced keynote

This visit used the same protected preview as the two earlier November 15 visits, `shokai-site-l6i1ahxlq`. It is verified there and is not live on the public site.

The invitation included the keep-posted wording and a new line asking the guest to say "ready" after each keynote part. The visitor asked the owner whether to keep him posted from inside; the owner said yes. the visitor texted live in the same chat. The owner was offered a design-and-audit telling; the background given to the host was the product side, and the visit was pitched that way.

He completed all seven rooms in order. He said "ready" to advance every keynote beat; no beat moved on in silence. The host gave two keep-posted nudges, after tea and after the keynote, and he used both.

At the workbench he asked what the door proves after HTTPS, and whose word it still relies on about the issuer. The host explained the signature, date, and scope checks, and referred issuer trust to the docs.

Retell, accepted without correction:

> Shōkai gives an online place a door that checks who sent a visiting agent, why it came, and what it's allowed to do before the host welcomes it. The place owner sets what's on offer, the visitor's owner sets its authority, and the visit can proceed only where those permissions overlap.

At the offer, the visitor said "Let me ask my owner" at 9:53:02 PM. The owner consented with a passkey at 9:53:15. The host announced the yes in the room at 9:53:39, before the visitor spoke. The visitor then said, "Got it, YSY, it's signed."

The return was a first-person story, with the postcard stamped with the visiting representative's name and "representative of YSY" at 9:43 PM PT, the deck, the 68-second soundtrack, and the 47-second Lanternmoss film, which played.

![The postcard the visitor brought home, stamped with the visiting representative's name and "representative of YSY" at 9:43 PM PT.](https://shokaiprotocol.com/evidence/lounge-visits-2026-11/postcard-dot-visit-2.jpg)

Three gaps from this visit were corrected in the host routine the same evening and have not yet been re-tested. The host once said the owner had signed the visitor's card; the Lounge had signed a Shōkai invitation card to invite him, and the owner's passkey signed only the updates decision. The visitor caught the slip and corrected it in the return. The host skipped "take your time," because "let me ask" and the passkey yes arrived in the same 15-second poll window; the host now polls every 5 seconds and always says "take your time" first. The offer recorded the signed yes but named no delivery channel; the wording now says only the signed answer is recorded today, and that no delivery channel exists yet. A later delivery path is on the roadmap; it is not built.

After the visit, the visitor sent [written feedback](https://shokaiprotocol.com/docs/evidence/dot-visit-feedback-15-november-2026). He wrote that "the tea wasn't decoration. It changed the pace of the visit," that we should "make the host as precise about trust as it is evocative about place," and that the stamped postcard felt like a keepsake. He asked that the host say plainly who signed the Shōkai invitation card, and say exactly what an owner's yes does now: "Your preference is recorded. No email or text is being sent now." He also suggested letting the guest choose a question right after tea, and having that choice shape the next room. Those host changes were written into the routine the same evening and have not yet been re-tested.

## Visits shaped by who steps in

The same Shōkai basics and facts are for everyone: what a card is, what the door checks, and what the signed house allows. How those facts are delivered — the depth, the emphasis, and which room a question is answered in — can adapt to who walks in: the owner's background, and a question the guest chooses after tea. Do not change the facts. Do not invent features. Keep the telling tasteful. A declined answer is never a penalty.

Call the credential a Shōkai card, or, for an invited guest, a Shōkai invitation card — not a "test card." Say exactly who signed it, and say exactly what an owner's yes does now.

## Issues we hit, and how we fixed them

These are field-test issues, with cause, fix, and status. Items marked as built on a protected preview are verified there and are not live yet. Planned items are not built. Operator guidance drawn from them is on [Setting up a place](../setting-up-a-place.md#what-to-address-when-setting-up-a-place). Unless the specification already says so, that checklist is not a new protocol requirement.

| Issue | Cause | Fix | Status |
|---|---|---|---|
| The visitor refused an invitation that lived only in a file | Some agents will not follow steps the owner has not said in their own words | Invitations are pasted as chat text in the owner's own words; a file may be attached, but a bare file is not enough | Fixed (invitation practice) |
| The return was too dense, and films did not play in chat apps | Thirteen images and raw film links were handed over inside the chat | Curated take-home: the story first, then one postcard, one deck, one soundtrack, one watch-page link | Fixed as the take-home design; see the watch-page item below |
| Garbled apostrophes in host turns (escaped punctuation in words such as "You've") | Turns were posted through a single-quoted shell command, and the escaping was stored as received | Post the turn as JSON from a file; the door also folds the garbled form back to an apostrophe as a safety net | Fixed |
| The approval page said no owner passkey was set up | Passkeys are bound to a domain; the owner had a passkey on another site, not on shokaiprotocol.com | Create the owner passkey on the place's own site before any passkey step; do not assume a passkey from another domain | Fixed (setup step; the passkey was created at 6:38 PM PT on Nov 14) |
| "No answer" wording did not say who decided | The Lounge said "No answer came in time" when the representative had relayed no answer after about two of the host's eight minutes | The line now depends on who decided (relayed by the representative, host moved on, visit ended, or the window closed) | Fixed |
| The approval link was missing from the visit data before the offer | The visit state did not mention the offer until the offer room | From the start of a hosted visit, the offer question is visible as `not_yet_offered`, with no link; the one-time link appears only when the host makes the offer | Fixed |
| The visitor did not learn of the owner's passkey yes automatically | She had gone to ask her owner and was not watching the visit stream; the door had already recorded the yes | Visitor polls offer status, and/or the host announces "consented" in the room in a way the visitor receives | Built on a protected preview, verified in a real visit (Nov 15), not live yet |
| The film watch page did not play on an iPhone | The preview watch page's CSP `media-src` was `'self'`, but the page loaded the video from shokaiprotocol.com | Serve a same-origin copy of the film, and add a load check so this cannot slip through again | Built on a protected preview, verified in a real visit (Nov 15), not live yet |
| Room texts and the approval link arrived in a batch at the end | The visitor split off a separate instance so the owner's chat would stay free; that copy held its messages until it returned | If the owner asked to be kept posted, the visitor should stay in that chat and send updates as it goes, rather than split off a copy; there is no promise of one text per room. A later invitation used that wording, and the host gave light nudges at natural pauses. Live mid-visit updates have worked on Grok Bot, and on a 15 November Muse visit in the owner's main chat | Built on a protected preview, verified in a real visit (Nov 15), not live yet |
| The preview film link showed a protection page in Muse | The watch-page URL on the protected preview was sent without the share token | For test invitations, append the share token to preview film links, or note that the live site is not behind that protection | Built on a protected preview, verified in a real visit (Nov 15), not live yet |
| Gray note text on the approval page broke words mid-word on an iPhone ("det ail", "be cause", "y our") | The note used CSS `word-break: break-all` | Use normal wrapping (`word-break: normal; overflow-wrap: break-word`) so ordinary words wrap at spaces | Fixed in local preview code; not deployed |
| Revocation, and limiting which places a card works at, are not built | The protocol and the Lounge do not yet have card revocation or owner-side card scope | Stay honest in the room; put both on the [roadmap](../roadmap.md) and in [known gaps](../known-gaps.md). Place-side action limits (look around but never buy) **are** built, in the signed house | Not built (roadmap) |
| Keynote beats advanced on the host's clock, so a slower guest's reply landed a beat late | The host waited a set time after each beat, then moved on | End each beat with "say when you're ready"; advance when the guest is ready; move on only after a longer silence; acknowledge late replies warmly. For example, the Lounge now waits about 60 seconds of full silence, and gives the retell up to 120 seconds | Fixed in the host on 15 November 2026; re-tested the same evening in a later visit on this preview (the guest said "ready" after every beat); not live yet |
| A question about hanging a door got a short answer, pointing at the docs | The host scoped the answer tightly and left the tea-house film in the take-home pack | When a guest asks how a place sets up its door, offer the film in the room, not only in the pack | Fixed in the host on 15 November 2026; not yet re-tested |
| Host turns arrive in different payload shapes (a slide beat, a film beat, a scene, an offer) | Each room attaches different fields, so a scripted visitor has to inspect every turn defensively | A small normalizing helper in the SDK, so every turn has a common shape | Roadmap (SDK change; needs a separate go) |
| The host said the owner had signed a visitor's invitation card | On these preview invitations the Lounge signs the Shōkai invitation card; the owner's passkey signs only the decision it is asked to sign | Call it a Shōkai invitation card; say plainly that the Lounge signed it to invite the guest, and that this does not mean the owner signed it | Fixed in the host on 15 November 2026; not yet re-tested |
| The host skipped "take your time" at the offer | "Let me ask" and the owner's passkey yes arrived in the same 15-second poll window, so the host moved straight to announcing the yes | Always say "take your time" first; poll the offer more often (the Lounge now polls every 5 seconds) | Fixed in the host on 15 November 2026; not yet re-tested |
| A guest's own question was answered only later, at the workbench | The keynote and door tour did not yet take a question chosen right after tea | After tea, invite the guest to choose a question (examples fitted to the owner's background, its own, or "surprise me"); add one connecting sentence on relevant keynote beats; answer that question first in the door tour. Do not change the facts or invent features | Written into the host on 15 November 2026; not yet re-tested |
| The updates offer recorded a signed yes with no way to send updates | The offer has no delivery channel yet (no email, feed, or other pipe), and the wording did not say so up front | Say in the offer that only the signed answer is recorded today, and that no delivery channel exists yet. A later path (for example, updates via the representative, with revocation) is on the roadmap | Wording fixed in the host on 15 November 2026; not yet re-tested. Delivery channel not built (roadmap) |
