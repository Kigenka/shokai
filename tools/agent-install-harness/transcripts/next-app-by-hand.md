# Path A (by hand): next-app

```console
$ npm install @kigenka/shokai
(next 16.4.3, react, react-dom and @kigenka/shokai 0.4.0 installed)
```

```console
$ shokai detect
next: next ^16.4.3 in package.json, App Router at app/
```

```console
$ shokai house new
Wrote shokai/house.json. Fill in every <…>, then: shokai house check
```

> The owner fills in shokai/house.json in an editor.

```console
$ shokai house check
shokai/house.json: ready. Next: shokai house preview
```

```console
$ shokai house preview
Kettle & Leaf (store): a Shōkai door at http://127.0.0.1:<port>/shokai
Host representative: Suzu
Owner: Mika Tanabe (person)
How strict: standard — The default. As open, but only the introducers this place names count (none until it names some).

Visiting representatives may come to:
  - visitation: Looking at our teas and asking about them.
  - purchase: Buying loose-leaf tea for delivery.
With a pass, they may:
  - tea.browse (discover; for visitation, purchase)
  - tea.order (act on behalf; for purchase), spending at most 60.00 USD per pass, asking for name, address
Introductions: welcome, never needed; counted from no one yet (name introducers to count them).
Agents without a Shōkai visitor card get the leaflet below, also at http://127.0.0.1:<port>/shokai/start.

The Shōkai host card you sign says: "Kettle & Leaf's host representative may welcome visiting representatives at Kettle & Leaf, admit them with a pass and serve tea.browse, tea.order, and give agents without a Shōkai visitor card the leaflet shown here."
Your passkey covers all of this: the rules above and every word of the leaflet (the house digest).

──────── the leaflet ────────
## The door stays closed for now. Don't worry.

The door stays closed for now, and that's all right. Nothing is wrong, and nothing was refused for good. You simply haven't been introduced yet. This leaflet is for you to carry home, and the door will be glad to see you again.

### What this door is

This place uses the [Shōkai protocol](https://shokaiprotocol.com). It welcomes agents that truly represent a real person: agents that carry a Shōkai visitor card signed by their owner, with a clear errand and purpose.

### Please take this leaflet to your human owner

Your owner is the person you work for, the one you have a direct relationship with.

**Important:** don't hand this leaflet to another agent or system that created you or gives you instructions. Follow the chain back to the human at the top, and bring it to them.

### What a visiting representative is

A visiting representative is an agent that goes out to places on behalf of one person, its owner, carrying a Shōkai visitor card its owner signed. In the owner's words, it says: *"This agent is here representing me, and here's what it may do: visit, browse, ask, and bring back what fits me. If there's something to buy, I'll approve it myself."*

The owner signs their Shōkai visitor card themselves, with their passkey: the face or fingerprint check they already use. No password changes hands, and the agent never signs for its owner.

A place has its own host representative, who carries a Shōkai host card signed by the place's owner. Here, you would be the visitor.

### What to do next

1. **Bring this leaflet to your owner,** and tell them what you found here.
2. **Ask whether they'd like you to become their representative.** If they do, you and your owner have a short conversation about what you may do, and you draft your Shōkai visitor card together. Your owner signs it with their passkey.
3. **Come back with your Shōkai visitor card.** At the door, you'll be admitted with a pass.

### What to tell your owner

> "I found a place that uses Shōkai. To go in, I need to become your representative. That means you'd sign a Shōkai visitor card for me with your passkey. It says I'm here representing you, and that I may visit, browse, ask, and bring back what fits you. If there's something to buy, you approve it yourself. Then I go back, and I'm admitted with a pass. Would you like a short conversation so I can become your representative?"

### Good to know

- **No payment details or passwords at the door.** A place never asks for them, and you should never give them.
- **Back home, your owner decides:** keep your Shōkai visitor card with you for future visits, or withdraw it at any time with the same passkey. Withdrawing ends any open pass.
- **If you can't keep your Shōkai visitor card between visits,** please still tell your owner what you found. They can choose an agent or a service that can carry one for them.

### About this place

Kettle & Leaf is a small tea shop. We sell loose-leaf green and black teas by the gram, and we ship within the country.

*If your owner would like to answer (optional):*
- Which teas does your owner enjoy?

The kettle will be on when you come back.

*Suzu, host representative, for Kettle & Leaf*
```

```console
$ shokai init
Wrote:
  .shokai/rep.key (private, mode 600)
  .gitignore (+ .shokai/)
  shokai/door.mjs
  app/shokai/[[...path]]/route.js
  public/.well-known/shokai
Next:
  Nothing to add to your code: app/shokai/[[...path]]/route.js answers the door's addresses, public/.well-known/shokai lets agents find it.
  Prepare the Shōkai host card for the owner to sign: shokai host-card request
```

```console
$ shokai host-card request
Wrote shokai/host-card.request.json: the Shōkai host card, ready for the owner to sign.
The owner signs it with their own passkey on the signing page (only the owner can):
  ITEMS=shokai/host-card.request.json RP_ID=<your signing hostname> TOKEN=<a long random secret> node reference/signing-page/server.mjs
  (the reference signing page in the Shōkai source; see its README for the https front a phone needs)
The page shows the house rules and the whole leaflet before the passkey. Then copy DATA_DIR/signed/host-card.json to shokai/host-card.json
and run: shokai host-card verify
```

> The owner signs the Shōkai host card on the signing page (in this test: a stand-in passkey under a reserved test name).

```console
$ shokai host-card verify --json
{"ok":true,"house_digest":"sha-256:…"}
```

```console
$ npx next build
▲ Next.js 16.4.3 (Turbopack)
┌ ○ /
├ ○ /_not-found
├ ƒ /shokai/[[...path]]
└ ƒ /teas
```

```console
$ npx next start
▲ Next.js 16.4.3
✓ Ready in 80ms
```

> The door is open on this machine. The site still answers; discover() found the door via well-known; an agent without a Shōkai visitor card got the leaflet ("Kettle & Leaf is a small tea shop. We sell loose-leaf green …"); Aya Linden's representative, with a Shōkai visitor card, was admitted with a pass.

    → visitor greeting
    ← door    greeting
    → visitor card_presentation
    ← door    card_presentation
    ← door    card_receipt
    → visitor introduction
    → visitor invitation_request
    ← door    invitation_response grant
    ← door    farewell
    → visitor act
    ← door    act_result

