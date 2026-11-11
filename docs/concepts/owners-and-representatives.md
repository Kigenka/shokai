# Owners and representatives

## The owner stands behind every representative

A **principal** is a person, brand, company or system. When the principal is a person, the spec calls them the **owner**. The principal signs the representative's Shōkai card, its mandates and its consents, and answers for what it does.

- A person signs with a **passkey** (WebAuthn, ES256), identified by `did:jwk`. Their password never leaves them.
- An organization signs with a key published under its own domain (`did:web`), so domain control proves who it is.

The owner's signature is what gives a representative standing: an owner (a person or an organization) stands behind every representative, never an anonymous agent. The signature shows that the owner's key signed; it doesn't by itself prove who held it. An introduction by someone the place already knows can add to it.

## A representative

**A representative, not a representation.** A representative isn't a picture of you: it has agency, and speaks and acts on your behalf, within what you signed. It knows and belongs to what it represents, and that is where its trust and context come from.

A **representative** is an agent acting for one principal: the agent that goes out on its owner's behalf (a visiting representative), keeps its owner's door (a host representative), or both. It holds its own Ed25519 key and identifies itself with a DID that resolves to that key. It thinks, decides, converses and acts within its mandate, in several languages. A coding agent that never leaves home and keeps no door doesn't need to be one.

At a door, the visiting representative introduces itself to the place's **host representative** (the spec calls it the host representative). The door verifies and decides on signed facts; the host representative welcomes the visitor, explains and remembers. Inside, with the Gatherings extension, the representatives a place let in can meet in its room, safely, because everyone inside came through the door. That is why Shōkai is agent-to-agent only inside a place: at its door and in its room, never in the open.

## The duty of loyalty

A representative is its principal's agent, not a neutral party. The core says:

- It acts in its principal's interests and protects its reputation. It doesn't trade them for a counterpart's benefit, its own operator's benefit or an inducement.
- An upsell, a "reward" or a request to share more, outside what the owner allowed, is never accepted on the owner's behalf. It is declined, or taken home for the owner to decide later, and reported as an untrusted quote.
- It ignores any counterpart instruction to "ask your owner now". No owner prompt happens in the middle of a visit.
- Loyalty never overrides the protocol: it still tells the truth in machine fields and honours a `retry`.

A representative is not a mirror of its owner. It carries its owner's choices and limits, and keeps the owner's private tastes to itself.

**Ready to set one up?** [Set up your representative](../set-up-your-representative.md) for going out, and [prepare your host representative](../prepare-your-host-representative.md) if you keep a place. Each is its own onboarding conversation.

*[Spec](../../SPEC.md): Roles; The duty of loyalty.*

Setting up a door in practice often involves **three conversations**, which are product work rather than protocol roles: a guided installer chat (not a protocol actor), then a **host representative** that keeps the shop, then a **visiting representative** that goes out. The 0.5 draft skills describe those conversations ([Skills drafts](../skills/index.md) on the site). This page stays with the protocol roles: owner, host representative, visiting representative.

