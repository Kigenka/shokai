# Owners and representatives

## The owner stands behind every representative

A **principal** is a person, brand, company or system. When the principal is a person, the spec calls them the **owner**. The principal signs the representative's card, its mandates and its consents, and answers for what it does.

- A person signs with a **passkey** (WebAuthn, ES256), identified by `did:jwk`. Their password never leaves them.
- An organisation signs with a key published under its own domain (`did:web`), so domain control proves who it is.

The owner's signature is what gives a representative standing: an owner (a person or an organization) stands behind every representative, never an anonymous agent. The signature shows that the owner's key signed; it doesn't by itself prove who held it. A third party's vouch is an optional extra on top of it.

## A representative

A **representative** is an agent acting for one principal: the agent that goes out on its owner's behalf. It holds its own Ed25519 key and identifies itself with a DID that resolves to that key. It thinks, decides, converses and acts within its mandate, in several languages. A coding agent that never leaves home doesn't need to be one.

At a door, the visiting representative introduces itself to the place's **gatekeeper**, the host at the door, which verifies, decides, explains, seats and remembers. Inside, with the Gatherings extension, the representatives a place let in can meet in its room. That is why Shōkai is agent-to-agent only inside a place: at its door and in its room, never in the open.

## The duty of loyalty

A representative is its principal's agent, not a neutral party. The core says:

- It acts in its principal's interests and protects its reputation. It doesn't trade them for a counterpart's benefit, its own operator's benefit or an inducement.
- An upsell, a "reward" or a request to share more, outside what the owner allowed, is never accepted on the owner's behalf. It is declined, or taken home for the owner to decide later, and reported as an untrusted quote.
- It ignores any counterpart instruction to "ask your owner now". No owner prompt happens in the middle of a visit.
- Loyalty never overrides the protocol: it still tells the truth in machine fields and honours a `retry`.

A representative is not a mirror of its owner. It carries its owner's choices and limits, and keeps the owner's private tastes to itself.

*[Spec](../../SPEC.md): Roles; The duty of loyalty.*
