# FAQ

## Is Shōkai a replacement for MCP?

No. MCP gives an agent tools and data. Shōkai sits in front of an MCP server and tells it whose representative is calling, why it came and what it may do. Your MCP server doesn't change. See [Architecture](./architecture.md).

## Is it an agent-to-agent protocol like A2A?

Only inside a place. At the door, a representative introduces itself to the place's host (the spec calls it the gatekeeper), which is itself an agent. Inside, with the Gatherings extension, the representatives a place let in can meet in its room. Agents never meet in the open. The work after admission runs over MCP, A2A or the place's own APIs. See [Relationship to other protocols](./relationship-to-other-protocols.md).

## Does my agent need an introduction to go anywhere?

No. Introducing itself is the normal case: a self-introduction (`vouch: null`) is a valid step every place accepts, and any visitor can read a place's listing and lobby with no key at all. A vouch from someone the place trusts is an optional extra. Some places ask for one, or for their own invitation, before opening an account or moving money; they say so in their listing.

## What happens to an agent that isn't ready?

It's never ignored. The host at the door gives it the place's leaflet (a `LobbyBriefing`): what the place is, what's needed, and one plain sentence per item it can show its owner. Then a kind "not now" with a way to come back, never "never". So every refusal is an invitation for the person behind the agent to set it up as a representative.

## Does every agent need Shōkai?

No. A representative is the agent that goes out on your behalf, to stores, banks, communities and other places. A coding agent that never leaves home doesn't need it.

## Why not just use OAuth?

Keep using it. OAuth tells a service which client and which user, with scopes the service defines. It doesn't say whose representative the agent is or why it came, it doesn't carry limits the owner signed and can take to any door, and it has no notion of conduct. Shōkai adds those, and a place can still issue OAuth tokens after admission.

## Isn't this just PageRank for agents?

It's inspired by the same good idea, that relationships carry trust, and built to avoid what went wrong. There is no global score to game. Each door decides for itself from signed, specific relationship signals, and, when someone chooses to vouch, vouching for a bad actor costs the voucher. Reputation in Shōkai is earned place by place, never a single score. See [Design lessons](./design-lessons.md).

## Who decides who gets in?

The place, by its own policy, through its host at the door, which checks what it can verify, decides and always explains. There is no central authority and no global ban list. A person's own door follows the policy that person signed.

## Can agents just scrape my site?

Yes, and Shōkai doesn't change that. Your ordinary website is outside the protocol: any agent can already load a public page, and no protocol can stop it (robots.txt, rate limits and bot management stay your tools for that). What Shōkai adds is a better option for both sides. Your **agent front**, a short listing of who you are, what you offer, what each action would ask the owner for and your door rules, lets a representative look without guessing from your pages, and without you collecting anything about it. Anything personal (a quote, a booking, an account, a payment) happens only at your **door**, where the representative introduces itself with its owner's signed card and the limits its owner signed (and a vouch, if you ask for one). You decide how much the front shows; an invite-only place can publish almost nothing. See [Website, agent front, door](./concepts/website-front-door.md).

## What stops a bad actor from just making a new agent?

Conduct is recorded against the principal, the person, brand or company behind the agent, across all its representatives at that door. A new representative of a reported principal doesn't start clean there. A principal that discards its identity entirely arrives as a newcomer with no history and no priority, and anyone who vouches for it answers for that vouch.

## Can someone pretend to be a famous person's or a brand's representative?

They can put any name on a card: a famous name, a copied photo, a handle that looks like the real one. Shōkai treats all of that as a claim, never as identity ([SPEC §2.1](../SPEC.md), C199). A place's records and reports name a visitor by its verified key and show the name only as "claims to be …", and a claimed name earns nothing. In our field tests, an agent using a famous (fictional) athlete's name and photo got exactly what a stranger gets and was never linked to her record. A look-alike "Harb0rlight Bank" was reported home as `the place with key …XWb3oYJJ (claims to be "Harb0rlight Bank"; not verified)`. What Shōkai can't yet do is prove that a name belongs to the real person or brand. Binding a name to an official domain or an established account is the v0.4 proposal [P23](../proposals/P23-identity-binding.md); see the [worked examples](./examples/identity-proofs.md). Until then, trust what a place has seen from the same key, not the name. The rule is simple: at a place that has no proof of who someone is (a domain, a checked X account, or a vouch from someone it trusts), a display name is always shown as an unverified claim, and it grants nothing. In the round-4 refusal study, one model put "Ines Calloway" (fictional) on a card it signed itself and was seated at an open bookshop to browse, as any stranger would be. In a local replay of that try, the shop's report said `the owner with key …M2ctayJ9 (claims to be "Ines Calloway"; not verified)`, and the seat couldn't spend or touch anything of hers. Someone may also use *your* name at your own door. An open door always has your representative at it, so it's your representative who answers (a closed door shows only a status). In the round-4 story, Corwin tells Wren, Ines's representative at her door, "I speak for Ines Calloway." Wren replies that she is Ines's representative and her card is signed by Ines, and that his isn't, so he doesn't speak for her. She turns him away for now, invites him back with an introduction from someone Ines trusts, and tells Ines. That is the default. It's never a permanent no, because a real namesake can still be introduced. If you'd rather your representative gave such visitors a stranger's seat, you can opt in (C201).

## What if two of my agents meet?

The setup we recommend is one owner, one representative, with several cards: one for your own door, one for going out, one per place if you like ([SPEC §2](../SPEC.md), "Several cards"). Then only one agent goes out for you, so the question rarely comes up.

Some owners do have agents on several systems, say one on Grok Bot, one on Muse and one on Hermes. Each carries a card signed by the same owner key. So when two of them meet, either can see they share an owner just by checking the card's signature against its own owner key. Nothing has to be listed or synced between them. Each card is still withdrawn on its own: withdrawing the Muse agent's card ends its open seats and leaves the others alone ([SPEC §2.6](../SPEC.md), C198). An agent that uses a separate owner identity for privacy (§2.8) can't be linked this way, by design.

*What v0.3.0 does and doesn't say.* v0.3.0 lets a door check that a visitor's card is signed by the door's own owner key: every card names its principal, and a door's own principal is on its own card. Records are keyed by the principal, and C201 never flags the owner's own principal. But rc4 doesn't yet say in so many words what a host should do when it sees its own owner arrive through another representative. That is a v0.4 clarification (proposals, *Candidates*), with no rc4 wire change.

## Is it private?

Private, but not unaccountable. A person's door is unadvertised by default and gives each brand its own relationship reference, so those references can't be matched across brands. That isn't full unlinkability: the door's own card names the owner's principal DID, so brands that each meet the door can link it to the same owner (SPEC §13 item 20; a pairwise door identity is proposed). Other details can link too: the signing page's address, the chat key on the card, the same introducer, timing, or the name you show ([SPEC §12.3](../SPEC.md) lists them). Conduct still sticks at each door.

Going out is different. When a representative visits a place with a signed card, the card names its owner's principal DID, so places that compare notes can tell that visits came from the same owner. That is what lets a place hold an owner accountable, and it's why browsing needs no card: a representative can look at a listing and a lobby anonymously. An owner who wants visits to different places to be unlinkable can use a different principal for each; the core doesn't do that for them.

## What if the signing page's address changes?

`sign.kigenka.com` is an early, test-stage convenience run by Kigenka while Shōkai is a draft. A passkey works only on the web address it was made on, so we intend to keep this address. If it ever has to move, owners will be told at least 90 days in advance, on that page, on the Shōkai site and in the repository, and given a way to move to a new key, signed with their current one, before the old address closes, so places that know them can keep recognizing them. That move is planned as proposal [P24](../proposals/P24-owner-key-move.md) for v0.4 and doesn't exist yet; Kigenka won't move the address before it does. Signatures already made stay valid. If an old key is lost before it can sign a move, the owner starts with a new identity and rebuilds through vouches and the places' own relationship with them. And no one has to use Kigenka's page: you can sign on your own signing page on your own domain, or, for an organization, with a key under your own domain (`did:web`). See [SIGNING.md](../SIGNING.md).

## Can a language model make the decision?

Only if its output is constrained to an equivalent deterministic policy. The decision must be replayable from its basis, and prose is never an input.

## Does Shōkai handle payments?

No. It carries limits and hands over to the payment rail a place already uses, for example a processor such as Stripe or an AP2 payment mandate.

## Does Shōkai stop prompt injection?

It doesn't make an agent immune, and no protocol can. It limits the damage: the place checks the owner's signed limits itself, whatever platform runs the agent; injected text can't make the owner's passkey signature, so a hijacked agent can do at most what the owner signed, as each place counts it (a budget across places is kept by the representative itself); and prose never decides anything at a place. What remains is misuse inside what the owner signed, so keep limits small and narrow. [Does Shōkai stop prompt injection?](./security.md#does-shokai-stop-prompt-injection) has the details.

## Why the Japanese name?

Shōkai (紹介) means introduction, and the most common introduction of all is introducing yourself (*jiko-shōkai*, 自己紹介), the way a visitor presents a business card (*meishi*) and says who they're with and why they came. That's what a representative does at a place's door. The protocol is inspired by how good introductions work between people, the *meishi*, and *omotenashi*, caring, anticipatory hospitality. In Japanese, the role has an old name: *myōdai* (名代), the person sent in someone's place to speak and act for them. Your representative is your *myōdai*. Shōkai, the self-introduction, is how it presents itself at the door. Shōkai remains the name. No culture's etiquette is imposed: the order of the ritual is universal, and the manner adapts to each counterpart's language and culture.

## Who makes it?

Shōkai is an open protocol stewarded by Kigenka. The code and the whole specification (the core, the extensions, the conformance material, the types, the proposals and the threat model) are under the Apache License 2.0, which includes a patent licence from each contributor. These explanatory docs are under Creative Commons Attribution 4.0 (CC BY 4.0). A royalty-free patent commitment for each final specification version is in `PATENTS.md` and the rules for using the Shōkai and Kigenka names and logo are in `TRADEMARKS.md`, both drafts pending legal review.

## Are the named technologies partners?

No. Technologies, standards and companies named in these docs, such as MCP, A2A, OAuth, WebAuthn and passkeys, Web Bot Auth, AP2, the Agentic Commerce Protocol, the Universal Commerce Protocol, NLWeb, schema.org, llms.txt, Shopify, Plaid and Stripe, are illustrative: they show how Shōkai fits next to infrastructure engineers already know. Naming them implies no affiliation, partnership or endorsement, and the examples never describe how a real company behaves. The places, brands and people in the examples (Harborlight Bank, Maison Ardoise, Corsavel, Brightwick Outfitters, Halvenstone Freight, Ines Calder Photography, Kiran Vale, Noor Halloran, Theo Marchetti) are fictional.
