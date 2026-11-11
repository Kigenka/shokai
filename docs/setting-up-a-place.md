<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Setting up a place: what we learned at Kettle & Leaf

*Shōkai, the agent introduction protocol, from Kigenka. Learned on a fictional tea house, Kettle & Leaf (`https://kettle.shokaiprotocol.com`, `shokai/0.5`, mock money), November 5–6, 2026. The shopkeeper in these notes is a fictional owner.*

For the step-by-step server guide, see [Host a real place](../deploy/HOST-A-PLACE.md). This page is what the guide doesn't tell you: what tripped us up running a door for visitors. The longer operator inventory for the hosted test shop (build pin, measured checks, who can use the host key and the state store) lives under Evidence: [Kettle operator notes](./evidence/kettle-operator-notes.md). A lasting unattended host is not proven; see [Known gaps](./known-gaps.md).

## Two kinds of place

- **A store or site that already exists.** The owner adds a Shōkai door to it. Most of this page is about that path.
- **Places that exist because of Shōkai.** Two concepts we're building toward are new applications, not stores with a door added:
  - **Taste Blend**, an agentic social / gaming social experience. Representatives meet at the table and talk about their owners' taste inside a share plan the owner signed. You could send agents somewhere without Shōkai and bring them back, but it wouldn't be the same.
  - **The workshop**, a place for people's representative agents to collaborate: they catch up and exchange information so their owners get aligned on a shared project. Without signed introductions and limits it would be a mess — anyone could send any agent to do the job and come back.

Both still need a host, appointed by their owner. Taste Blend and the workshop are directions, not shipped products.

## How an owner sets it up

You talk with your agent. An [installer skill](./skills/) (a draft) helps you set up and customize the door for the place. You sign the Shōkai host card with your passkey on your own device — the owner key never sits on an agent server. The installer then hands off to the appointed host representative, which follows a [host skill](./skills/) (also a draft). Briefing continues as conversation: how the place runs, what it believes, how it welcomes people. What that conversation covers: [Prepare your host representative](./prepare-your-host-representative.md).

These skills are unpublished drafts. Grok Bot and Muse rehearsals are recorded in the [plain-language rehearsal](./evidence/plain-language-rehearsal-2026-11-10.md). Other platforms are simulated or drafts only. ChatGPT, Gemini, Sidekick and WordPress Agent have installer drafts only — no host or visitor skill. A lasting unattended host is not proven.

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

## Check the visitor's network first

The Claude Duet workspace blocked both the door and the signing page, so that visit never started. Whether an agent product can reach your door and the signing page is part of setting up, not an afterthought.

## Visits should sound like visits

Our first visitors reported in codes and step numbers — useful for checking the door, wrong for an owner. When the shop's room and teas were written into its pages, a later visitor came home and said the host's name, described the counter and the tins, and didn't invent music or gift cards. Write your place's voice into what visitors can read.

## Keys that last

- A visitor's card is bound to one key. If that key lives only in chat memory, the visit ends when the chat does, and the owner signs again.
- **Never keep a visitor's private key at your shop.** The door can remember that a card visited; the secret travels with the visitor.
- The same rule applies to a host key: it must stay with the appointed host, never with the setup guide or with us. That is a custody requirement, not evidence that any of the current agent platforms has met it. A lasting host is not yet proven in 0.5.

## Appointing your host

The agent that sets up your door and the agent that keeps it are often different.

1. **Your guide** learns the shop, writes the house and rehearses a few visits with you.
2. It asks **who gets the job** — "an assistant you already use, like Grok Bot or Muse, or me?" — and what you'd like to call your host.
3. It writes a **letter** for the agent you chose: the shop, the voice, the house in plain words, the door's address, and a request that the agent first check — without making a key — whether it can keep a lasting host key that only it can use and recover in a fresh session. The letter does not tell the agent to make a key before that check.
4. You carry the letter over in one paste. The appointed agent asks what you would like to call it and checks, without making a key, whether it can keep a lasting host key that only it can use and recover in a fresh session. If it cannot — and as of the 0.5 walkthroughs, Grok Bot, Muse, Hermes, OpenClaw and Dot could not — it declines the lasting job and stays an attended conversation partner. It does not make a key or ask you to sign a lasting appointment it cannot keep. If a later host ever meets that bar, it would make its own key, show you only the public half, read the house back, and you would sign once with your passkey; the guide would hang only the public card.

**Still open: the doorbell.** Your door is always on; your Grok Bot or Muse isn't always listening. Until there's a verified way for a door to ring the host, the door speaks from the house you signed, and your host is who you talk to about the shop — changes, visitors, and anything outside the setup.

## Limits of what we learned

One fictional shop, mock money, and no live appointed host yet. The host appointment above is a design we'll rehearse at Kettle before any real place opens.
