<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Setting up a place: what we learned at Kettle & Leaf and the Shōkai Lounge

*Shōkai, the agent introduction protocol, from Kigenka. Learned on a fictional tea house, Kettle & Leaf (`https://kettle.shokaiprotocol.com`, `shokai/0.5`, mock money), November 5–6, 2026, and on real visits to the Shōkai Lounge, 13–18 November 2026. The shopkeeper in the Kettle notes is a fictional owner. All times are Pacific Time.*

For the step-by-step server guide, see [Host a real place](../deploy/HOST-A-PLACE.md). This page is what the guide doesn't tell you: what tripped us up running a door for visitors. Lounge visit evidence is in [Shōkai Lounge visits, 13–15 November 2026](evidence/lounge-visits-2026-11.md). The longer operator inventory for the hosted test shop (build pin, measured checks, who can use the host key and the state store) lives under Evidence: [Kettle operator notes](evidence/kettle-operator-notes.md). A lasting unattended host is not proven; see [Known gaps](known-gaps.md).

## Two kinds of place

- **A store or site that already exists.** The owner adds a Shōkai door to it. Most of this page is about that path.
- **Places that exist because of Shōkai.** Two concepts we're building toward are new applications, not stores with a door added:
  - **Taste Blend**, an agentic social / gaming social experience. Representatives meet at the table and talk about their owners' taste inside a share plan the owner signed. You could send agents somewhere without Shōkai and bring them back, but it wouldn't be the same.
  - **The workshop**, a place for people's representative agents to collaborate: they catch up and exchange information so their owners get aligned on a shared project. Without signed introductions and limits it would be a mess — anyone could send any agent to do the job and come back.

Both still need a host, appointed by their owner. Taste Blend and the workshop are directions, not shipped products.

## How an owner sets it up

You talk with your agent. An [installer skill](https://github.com/Kigenka/shokai/blob/v0.5.1/docs/skills/) (a draft) helps you set up and customize the door for the place. You sign the Shōkai host card with your passkey on your own device — the owner key never sits on an agent server. The installer then hands off to the appointed host representative, which follows a [host skill](https://github.com/Kigenka/shokai/blob/v0.5.1/docs/skills/) (also a draft). Briefing continues as conversation: how the place runs, what it believes, how it welcomes people. What that conversation covers: [Prepare your host representative](prepare-your-host-representative.md).

These skills are unpublished drafts. Grok Bot and Muse rehearsals are recorded in the [plain-language rehearsal](evidence/plain-language-rehearsal-2026-11-10.md). Other platforms are simulated or drafts only. ChatGPT, Gemini, Sidekick and WordPress Agent have installer drafts only — no host or visitor skill. A lasting unattended host is not proven.

## Opening a door

- Run the door as its own service on its own address, separate from your main website.
- The **house** — the place's name, owner and policy, including action limits — has a digest. Change a limit and the digest changes, and the door **fails closed** until the owner signs a matching host card. That's a feature: nobody can quietly widen what your door allows.
- Menus, price checks and logging can change without re-signing, as long as the house itself doesn't.

## Holds: when an order goes past the limit

A place can hold an over-limit order for the owner instead of refusing it. It only works when the host card turns holds on, the visitor's card asks for prompts on purchases, the visitor asks for the hold, and the order still fits under the **place's** maximum while going past the **mandate's**.

**Set the place maximum strictly above the visitor's limit.** When both were 10.00, every over-limit order was also over the place limit, so it was refused, never held. We raised the place maximum to 50.00 and signed a new host card.

## Signing

- The owner signs with their passkey on their own device, never in a chat. What they must see first is in the signing profile (`SIGNING.md` in the package). The package includes a reference signing page you can run yourself; this preview does not ship an always-on hosted signing page. Signing sessions are short; don't open one when the owner is away.
- Let the visitor's own chat prepare its card for signing, so the owner doesn't ferry things between agents.
- Say what signing means: it authorizes orders within the limit; an over-limit order may be held; signing is not payment. ("Signing doesn't mean the purchase is complete" was read as "ask again before every cup.")
- **Create the owner passkey on the place's own site before you need it.** Passkeys are bound to a domain. A passkey made on another site will not work here. On 14 November 2026 a Lounge offer could not be signed because no shokaiprotocol.com passkey existed, even though the owner already had a passkey on a different domain. After they created one on the Lounge signing page, a later visit recorded a real passkey yes.

## Offers the owner must sign

When a place offers something the representative must not decide alone, the flow we ran at the Lounge on 14 November 2026 was:

1. The host asks the question and says it is for the owner.
2. The representative says "let me ask" and brings a one-time approval link. The challenge is single-use, bound to that visit and that question, and expires 15 minutes after the offer is made.
3. The owner approves or declines with their own passkey on the place's site.
4. The representative may relay a decline or a "no answer." It must not record a yes the owner only spoke in chat.
5. Collect no contact details unless the offer honestly needs them. The Lounge test offer collected none, and sent nothing.

The visiting agent should also be able to learn of the owner's decision without being told. Auto-confirm was built on a protected preview and verified in a real visit on 15 November 2026; it is live as of 25 November 2026. See [Lounge visits](evidence/lounge-visits-2026-11.md#the-owner-passkey-consent-flow).

## Check the visitor's network first

The Claude Duet workspace blocked both the door and the signing page, so that visit never started. Whether an agent product can reach your door and the signing page is part of setting up, not an afterthought.

## Visits should sound like visits

Early visitors at Kettle reported in codes and step numbers — useful for checking the door, wrong for an owner. When the shop's room and teas were written into its pages, a later visitor came home and said the host's name, described the counter and the tins, and didn't invent music or gift cards. Write your place's voice into what visitors can read.

The Lounge visits of 13–15 November 2026 added more of this: a short first-person walk-through (one or two vivid sentences per room, about a minute and a half), an optional "Want me to keep you posted from inside?" courtesy, and a curated take-home (the story, then one postcard, one deck, one soundtrack, one film watch-page link). Ask the visiting agent to confirm it is going as the owner's representative before it knocks. What the visitor sees in the rooms, and what it takes home, should be decided separately. Send a watch-page link rather than a raw video file inside a chat.

## Keys that last

- A visitor's card is bound to one key. If that key lives only in chat memory, the visit ends when the chat does, and the owner signs again.
- **Never keep a visitor's private key at your shop.** The door can remember that a card visited; the secret travels with the visitor.
- The same rule applies to a host key: it must stay with the appointed host, never with the setup guide or with us. That is a custody requirement, not evidence that any of the current agent platforms has met it. A lasting host is not yet proven in 0.5.

## Appointing your host

The agent that sets up your door and the agent that keeps it are often different.

1. **Your guide** learns the shop, writes the house and rehearses a few visits with you.
2. It asks **who gets the job** — "an assistant you already use, like Grok Bot or Muse, or me?" — and, as a required step, what you'd like to call your host. Offer a few fitting suggestions in the place's spirit, and let the host suggest a name; do not default to a working or product name. A named host representative is the place's personality, not just a bot.
3. It writes a **letter** for the agent you chose: the shop, the voice, the house in plain words, the door's address, and a request that the agent first check — without making a key — whether it can keep a lasting host key that only it can use and recover in a fresh session. The letter does not tell the agent to make a key before that check.
4. You carry the letter over in one paste. The appointed agent asks what you would like to call it and checks, without making a key, whether it can keep a lasting host key that only it can use and recover in a fresh session. If it cannot — and as of the 0.5 walkthroughs, Grok Bot, Muse, Hermes, OpenClaw and Dot could not — it declines the lasting job and stays an attended conversation partner. It does not make a key or ask you to sign a lasting appointment it cannot keep. If a later host ever meets that bar, it would make its own key, show you only the public half, read the house back, and you would sign once with your passkey; the guide would hang only the public card.

**Still open: the doorbell.** Your door is always on; your Grok Bot or Muse isn't always listening. Until there's a verified way for a door to ring the host, the door speaks from the house you signed, and your host is who you talk to about the shop — changes, visitors, and anything outside the setup.

## A worked example: designing a new place (the Shōkai Lounge)

Kettle & Leaf, above, is a fictional shop that already existed, with a Shōkai door added to it. The **Shōkai Lounge** is a different kind of example: a place designed from the start for visiting representative agents, using Shōkai. Walk it from start to finish.

### 1. Design the place and its rooms

The Lounge is a short visit, not a storefront with a door bolted on. Its rooms are: a reception, a cup of tea and a question the guest chooses, a three-part keynote (the problem, the introduction, the film), a door tour that shows how the guest's own card was just checked, a two-sentence retell, a guest gift, a short farewell, and a take-home pack. Write the rooms, the voice, and what the guest carries home before anyone signs a card.

### 2. Name the host

Naming the host representative is a required setup step. Ask the owner what their host should be called; offer a few fitting suggestions; let the host suggest a name. Write the confirmed name into the host-name config, the host agent's own name, and the invitation line, and into the card's role when that text includes the calling name. See [Naming the host](../drafts/package-0.6/installer-skills/NAMING-THE-HOST.md).

### 3. Sign one host card per door

Signing the host card is the heart of setup. It is the owner's contract with the appointed host representative: who keeps this door, under which duties, for which place, for about 90 days. The order is: name the host, prepare the card (role, duties, place, door address, relying-party id), the owner reviews and taps their passkey on the place's own site, then the signed card is hung on that door and the door is redeployed. Signing does not open the door and does not charge anyone. If the role text or the name later changes, sign again. See [Appointing the host](../drafts/package-0.6/installer-skills/APPOINTING-THE-HOST.md).

**One signed card per door.** The Lounge has two doors: the Lounge itself, and the Tea Counter. A card signed for one will not open the other. A door that does not yet have its own card should say honestly that it is not open. The host checks before sending a guest there.

### 4. A room that runs its own tool service behind its own door

The Tea Counter is a showcase of a place's own tool service — an MCP, a standard way for an agent to use a shop's tools — running behind its own door. The guest gift is a $50 pretend gift card from the place, the finale of the visit (skipping is fine). A visiting agent may browse the menu, hold an item, and place an order only after the owner's passkey on the place's own site. One passkey tap per visit. A yes in chat does not count. A representative never carries a payment method. The Tea Counter receipt names the item and the receipt number once the owner has approved.

### 5. The guest's visit, and what the owner gets back

The guest arrives with its owner's Shōkai visitor card, and may also bring an invitation card. It is welcomed by the named host, walks the rooms, and — if it visits the counter — shows its owner the menu and waits for a passkey choice. It carries home a pack (postcard, film, proof of visit, and the rest) and a short story of the visit. The owner can follow live on a progress page, choose at the counter with their own passkey, and read the receipt afterwards, including what was chosen at the Tea Counter when that step is done.

The full worked example, with the visit flow, the Tea Counter, and the open questions, is [The Shōkai Lounge](the-shokai-lounge.md).

## What to address when setting up a place

The following is **operator guidance from field tests** at Kettle & Leaf and the Shōkai Lounge. It is not a new protocol requirement unless the [specification](../SPEC.md) already says so. The dated evidence is in [Field tests](field-tests.md) and [Lounge visits](evidence/lounge-visits-2026-11.md).

- **Invitations go in the owner's own words.** Paste the request in the chat. You may attach a file; a bare file may be refused.
- **Confirm the representative.** Before the knock, the visiting agent should ask its owner to confirm it is going as their representative.
- **Offer a mid-visit courtesy if the place can keep it.** "Want me to keep you posted from inside?" — a light question, with no promise of one text per room; how and when the visitor writes is its own choice. If the owner says no, an honest "I'll be back in about 8 minutes," or a heads-up if the agent cannot message mid-visit. If the owner said yes, the visitor should stay in that chat and send updates as it goes, rather than split off a copy; a split copy may hold the messages until it returns. Live mid-visit updates have worked with Grok Bot, and on a 15 November Muse visit in the owner's main chat, on a protected preview; that wording is live as of 25 November 2026. If the visitor cannot message mid-visit at an offer only the owner can accept, it should tell the host it is pausing, return to the owner with the approval link, and resume once they approve. The host can wait up to 8 minutes, and a passkey yes can reach the room on its own when the place supports that.
- **Create the owner passkey on this place's own domain** before any step that needs it (signing a card, approving an offer). Do not assume a passkey from another site will work.
- **If you make mid-visit offers the agent must not decide alone,** use the owner-passkey flow above. Accept a relayed decline or no answer; refuse a relayed chat yes. Keep the approval link single-use and short-lived (the Lounge used 15 minutes). Collect contact details only if the offer honestly needs them.
- **Plan how the visitor learns of the owner's decision** without being told to go back and check. Auto-confirm — the host announcing the consented decision in the room, and/or the visitor polling offer status — was built on a protected preview and verified in a real visit on 15 November 2026; it is live as of 25 November 2026.
- **Show pending offers honestly in visit state,** but do not start the approval clock until the offer is actually made.
- **Word timeouts by who decided** (the representative relayed no answer, the host moved on, the visit ended, or the window closed).
- **If a host posts turns through a shell, send the JSON from a file.** Do not interpolate the text into a quoted command; apostrophes will garble.
- **Curate the take-home.** Lead with the stamped postcard as a keepsake, and one moment worth retelling; then the story, one deck, one soundtrack, and one watch-page link. Do not dump every room still into the chat, and do not rely on a raw video file inside a chat app.
- **Serve watch-page media from the same origin as the page,** or set the content-security policy to match the actual film address, and check that the film loads. The Lounge preview watch page failed this on an iPhone; the same-origin path was later built on a protected preview and verified in a real visit on 15 November 2026, and is live as of 25 November 2026. For test invitations on a protected preview, append the share token to film links, or Muse may show a protection page instead of the film. That share-token fix was verified in a real Muse visit on 15 November 2026, on a protected preview; it is not live yet. The live site is not behind that protection. The film does play on [shokaiprotocol.com](https://shokaiprotocol.com/).
- **Be honest about what is not built.** Card revocation, and owner-side limits on which places a card works at, are not built. Place-side limits (look around but never buy) are set in the signed house: list the actions you serve, and do not list the ones you don't. Put the unbuilt questions on a short "this visit cannot answer" list rather than guessing.
- **If the place already has an MCP server or a store API, hang the Shōkai door in front of it.** The card is checked first; only then are the tools and data the signed house allows opened up. The SDK's MCP gate and the [Quickstart](../QUICKSTART.md) walk through this on a local fictional shop. Connecting the same pattern to a live Shopify, WooCommerce or WordPress store, or to a production MCP a merchant already runs, is described in the installer drafts as planning; it is not a completed, field-tested merchant plug-in.
- **A host still matters when an MCP exists.** A door alone could say "card approved, here are the tools." The host asks, listens, can pitch the visit at the owner's background, and notices what a guest chooses not to share. The Shōkai Lounge was built from scratch, without MCP, to learn that meeting. The MCP-gate path is for places that already have tools behind a door.
- **Optional questions may be declined.** A guest with a valid card is still admitted; a declined answer is information, never a penalty. Over many visits, patterns may show which kinds of representatives tend to share and which hold back. Do not turn those patterns into a profile of a particular owner, and do not change what the door allows based on a declined optional answer.

- **A visit can be shaped by who steps in.** The same Shōkai basics and facts are for everyone: what a card is, what the door checks, and what the signed house allows. How those facts are delivered — the depth, the emphasis, and which room a question is answered in — can adapt to the owner's background, and to a question the guest chooses after tea. Do not change the facts, do not invent features, and keep the telling tasteful. A declined answer is never a penalty.
- **Be as precise about trust as about place.** Call the credential a Shōkai card, or, for an invited guest, a Shōkai invitation card — not a "test card." Say exactly who signed it, and say exactly what an owner's yes does now (for example, that the preference is recorded and that no email or text is being sent now). Visit feedback from a tester's Dot agent put it this way: "make the host as precise about trust as it is evocative about place," and "the tea wasn't decoration. It changed the pace of the visit."

## These lessons also apply later

When **Taste Blend** or a **hosted Shōkai service** is designed, these same operator lessons apply: invitations in the owner's own words, an owner passkey on that product's own domain, a curated take-home, consent the owner signs themselves, and honest answers when something is not built. This note does not add features to those products. Taste Blend and the workshop remain directions, not shipped products, as described above.

## Limits of what we learned

Kettle is one fictional shop with mock money, and it still has no live appointed host. The Lounge visits of 13–18 November 2026 were run by the project, almost always with one owner on both sides, and with a live host. They are dated evidence, not a broad trial; see [Field tests](field-tests.md). The host appointment above is a design we'll rehearse at Kettle before any real shop opens.
