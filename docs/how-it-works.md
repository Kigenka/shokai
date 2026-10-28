# How Shōkai works

**Agents can find and enter places safely, and every representative answers to an owner who signed for it, a person or an organization, never an anonymous agent running wild.** It's been tried on Grok Bot, Muse, Hermes and OpenClaw: in the project's own field tests, an agent on each was seated at a test place (on Hermes and OpenClaw in sandboxed runs of a model with development keys; on Grok Bot and Muse with cards prepared for them in advance).

Places come first. A tea shop, a store, a marketplace, a community, a bank: each keeps a door, and its own agent stands there as the host at the door. An agent that goes out on someone's behalf, a **representative**, arrives and introduces itself properly: who it's here for (its owner: a person who signed with their passkey, or an organization with its own key), why it came, what its owner allowed (a card and limits the owner signed), and the context its owner chose to share. The host checks what it can verify, decides, and always explains. An agent that isn't ready is never ignored: it gets the place's leaflet, with a plain sentence for its owner about what's needed, and a kind "not now". Inside, a representative acts only within its owner's limits, and in a place's room it can meet the other representatives the place let in. It reports home after every visit. A vouch from someone the place already trusts is an optional extra, which some places ask for before opening an account or moving money.

## Why representatives

Soon everyone will have many agents: ones that write code, research, plan and simulate. A representative is different. It's the one agent that carries the facets of who you are, your name, your context, your limits and your reputation, into the world, and it answers to you. Many agents work for you, and one represents you. Shōkai is what makes that one recognizable at every door and in every room, whether it's dealing with a brand, a friend's representative, a coworker's or a stranger's.

**Your representative is yours.** Shōkai is not a new agent system. It lets the systems people already use, like Grok Bot, Muse, Hermes and OpenClaw, turn one agent into a representative its owner signed for. That representative belongs to its owner, whether a person, a company or an institution, never to the platform that runs it. Your keys, your card and your history are yours to take anywhere. No platform can claim it, own it or lock you in.

An agent that stays home, like a coding helper, doesn't need to be a representative. The one that goes out on your behalf does.

## What a representative does: goes out, and keeps your door

- **Going out (everyone).** Without a place of your own, your representative is your visitor: it introduces itself at other places' doors with the card you signed, acts within your limits and reports home.
- **Keeping your door (if you have a place).** With a place, a shop, a meeting room, a project space, or your own door for brands, the same representative is also its host: it greets visitors, checks their cards, decides by the rules you signed, explains and remembers.

One owner, one representative, a card for each role ("my door", "when I go out"), signed together in one sitting with your passkey. Each card can be withdrawn on its own, and a place sees only the card shown to it. See the walkthrough in the repository's `scenarios/dual-role.md`.

## One visit to a tea shop

*Fictional: a fine tea shop that likes to know its guests, and an owner who loves tea.*

1. **The shop's front is open to look at.** Anyone can read what the shop is, what it sells and what each action would ask for, without saying who they are.
2. **A stranger comes first: no card, no owner.** The host at the door doesn't ignore it. It hands over the leaflet: what the shop is, how to come back ready, and one plain sentence the agent can show its owner (the reference door says: "Your assistant needs a profile card that you sign once, saying who it works for."). Then a kind "not now". The stranger isn't banned; it can come back once it's ready.
3. **The representative introduces itself.** It's here for its owner, who loves tea, has had tea in Japan and is looking for a fine green tea. It shares that context because its owner chose to.
4. **It shows its card.** Its owner signed it with a passkey, along with a spending limit for this errand.
5. **The host checks what it can verify**: the owner's signature, the limit, and that the card hasn't been withdrawn. Then it says "Come in", and seats the visitor for exactly what was agreed.
6. **Inside, the host shows the teas.** That part is the shop's own service, reached through the seat (for example over MCP).
7. **It buys the green tea, within the limit.** The shop counts each purchase against what the owner signed. A purchase past the limit is refused, and anything more comes back to the owner first.
8. **The tea goes home, and so does the report.** The representative tells its owner what happened, in plain words. Delivery and payment are the shop's own.

No one vouched for this visit, and none was needed. That's the normal case.

## Every refusal is an invitation

An agent that can only connect gets the leaflet. An agent that introduces itself properly gets in, and the better a place knows its guests, the more personal the welcome can be, like a members' club or a ryokan that has known a family for years. Because a turned-away agent goes home with a sentence its owner can act on, every refusal becomes an invitation to turn that agent into a representative.

## Two layers: the door and the room

1. **The door.** Getting into a place: the self-introduction, the host's check, a clear answer, a seat within the owner's limits. This is the core of the [specification](./specification.md).
2. **The room.** Inside a place, the representatives it let in can meet, like people exchanging business cards at a gathering. The place signs the guest list, checks every card, and every message in the room is signed by whoever said it ([Extensions](./extensions.md): Gatherings and Peer meetings).

Agents meet inside a place, never in the open.

## The optional extra: a vouch

Someone the place already trusts can stand behind a representative with a signed vouch. It's deliberate: a friend's agent mentioning a shop over a chat is a recommendation, not a vouch, and having met is never an introduction. A place may ask for a vouch before opening an account or moving money, and says so up front in its listing. See [Arriving](./concepts/arriving.md).

## Who needs it

A representative is the agent that goes out on your behalf. A coding agent that never leaves home doesn't need Shōkai.

*Specification: The door; The lobby: unprepared visitors; Introduce; Mandates; Seats and acts; Visit reports. In the repository, `scenarios/places-first.md` maps this visit to each section.*
