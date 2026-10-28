# Why Shōkai exists

Agents are starting to act for people, businesses, communities and brands. They search, compare, book, buy, ask and answer. Soon there will be far more of them than there are human hours to answer them. The question is not whether agents will arrive at every service on the web. It is whether anyone will be able to tell who sent them.

## The problem today

### Agents arrive with no accountable identity

When an agent reaches a website, an API or an MCP server today, the service can usually learn one of two things: which software is calling (an API key, an OAuth client, or a signed request under Web Bot Auth), or which user signed in. It rarely learns the thing it actually needs to decide well:

- *Whose* representative is this, and does that person stand behind it?
- Why did it come?
- What did its owner actually allow it to do here, today, and up to how much?
- How has it, and the people behind it, behaved here before?
- Sometimes also: does someone I already trust stand behind it?

The IETF Web Bot Auth draft is explicit about its limits: a valid signature ties a request to the keys published at the automated client's URL, but says nothing about who operates the agent or whether the request is authorized, and the protocol does not authenticate human users or define delegation ([draft-ietf-webbotauth-httpsig-protocol, §4.1 and §4.6](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/)). OAuth carries scopes the receiving side defines ([MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)). Neither says whose representative an agent is or why it came, and neither carries limits the owner signed and can take anywhere.

So services face a poor choice: **block agents, or let them in blind.** Blocking pushes agents toward imitating people (typing saved passwords, solving challenges). Letting them in blind means an agent can act with every permission its user has.

### Spam, fake accounts and the attention war

Email and social feeds taught a hard lesson: when contact costs the sender nothing, the receiver pays in time and attention. Fake accounts are cheap, and so is persuasion at scale. Agents make all of it cheaper again. If every agent competes for the same attention, through more messages, more accounts and more tested wordings, the noise will grow many times over.

### Sign-in first, look later

Many places ask for a sign-in or an email before showing anything. Sign-in becomes a way to capture data, and large sign-in providers add lock-in. A representative can't judge a new bank, store or community for its owner if it has to hand over identity first.

### Prompt injection

Agents read text written by others, and some of that text is written to steer them. OWASP ranks prompt injection first among risks for LLM applications, notes that injected instructions need not be visible to humans, and says it is unclear whether fool-proof prevention exists. Its mitigations include deterministic validation, least privilege, separating untrusted content, and human approval for high-risk actions ([OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)). A protocol can't make a model immune. It can make sure that text from a counterpart never decides anything.

## What's coming

Personal and enterprise representatives will become the **discovery and relationship layer**. People will ask their representative to find a better bank, visit a brand a friend loves, or keep in touch with a supplier. Agents will go to places, on behalf of real people. Employees will have co-worker agents that reach internal tools and visit partners' agents. Representatives will also meet, inside the places that let them in, within the limits their owners signed.

That world needs a way for agents to arrive with manners: to introduce themselves properly (who they're here for, why they came and what their owner allowed); to take a clear answer, including "not now"; and to be remembered for how they behaved. An agent that isn't ready should leave with a reason its owner can act on, not a silent block. Without it, the agent web repeats the spam web, only faster.

## What Shōkai does about it

| The problem | What Shōkai does | Where in the spec |
|---|---|---|
| No accountable identity | Every message is signed. The card is signed by the principal behind the agent, and a person signs with a passkey. | *Identity, cards, claims and keys* |
| No context at the door | A self-introduction: the owner-signed card, a stated purpose, signed limits and the context the owner chose to share. Optionally, a deliberate, signed, scoped and revocable vouch from someone the place trusts; being connected is never an introduction. | *The ritual*, *Introduce* |
| Unready agents are blocked in silence | Every arrival gets an answer. An unprepared agent gets the place's leaflet, with a plain sentence for its owner, and a kind "not now": every refusal is an invitation to come back ready. | *The lobby* |
| Agents act with all of a user's permissions | Owner-signed mandates and a standing allowance. A seat is never wider than policy ∩ mandate ∩ request. No spending allowance means no spending. | *Mandate*, *The standing allowance*, *Seats* |
| Spam and fake accounts | Conduct sticks to the owner, not a disposable key. Sign-ups are capped per owner and per introducer. "Accept any introducer" never counts for money or accounts. | *Misconduct and accountability*, *Sign-up limits per owner* |
| The attention war | A person's own door, under a policy they signed: a few uninvited brands a month, introductions first, pressure tactics reported. | *The inbound door* |
| Sign-in first | Browsing a place's listing and its lobby is open by design: no key, no account. | *The door*, *The lobby* |
| Prompt injection | Prose never enters the decision. Counterpart text is data. Hidden text is shown to the owner and never obeyed. | *Anti-persuasion*, *The inbound door* |

## What Shōkai is not

- **Not a replacement for MCP, A2A or OAuth.** It sits in front of them. See [Relationship to other protocols](./relationship-to-other-protocols.md).
- **Not a reputation network.** There is no global score. Each door judges for itself and records stay at the door that saw the conduct. See [Design lessons](./design-lessons.md).
- **Not a payment protocol.** Payment authorization belongs to AP2, card networks and processors such as Stripe. Shōkai carries limits and can point to a payment mandate.
- **Not bulletproof.** Shōkai makes deception costly and traceable, not impossible. Its weaknesses are documented openly in [Security and threat model](./security.md), and community review is part of the design.
