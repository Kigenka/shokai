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

### Shared access hides who is acting

Many services already act with access a person handed them. Account-linking services (Plaid is one example) let people link their bank accounts to apps, while the owner can still sign in directly. The bank wants to know when it is really its customer. Once that same access is handed to an agent, nothing tells them apart: the customer, the customer's agent, or an impostor using the same credentials. What the service needs to know is that this agent is truly the owner's representative, and what the owner allowed it to do.

### Spam, fake accounts and the attention war

Email and social feeds taught a hard lesson: when contact costs the sender nothing, the receiver pays in time and attention. Fake accounts are cheap, and so is persuasion at scale. Agents make all of it cheaper again. If every agent competes for the same attention, through more messages, more accounts and more tested wordings, the noise will grow many times over.

### Not only privacy: context

Privacy is only part of it. A person walking through a mall has a reason to be there: keeping a loved one company, or just looking. Online, the same browsing is often turned into pressure: reminders about an abandoned cart, nudges, and experiments that treat people as test subjects for their attention. A representative should be able to say "I'm just looking, for my owner; please don't push", and the place should honor it.

### Sign-in first, look later

Many places ask for a sign-in or an email before showing anything. Sign-in becomes a way to capture data, and large sign-in providers add lock-in. A representative can't judge a new bank, store or community for its owner if it has to hand over identity first.

### Your good name, in other hands

On today's web, a good name is easy to borrow and hard to protect. An impostor can pose as someone's agent, and a misbehaving agent can damage the reputation of the person or company it claims to act for. Places need to know who really stands behind an agent, and owners need to know that no one else can act in their name.

### Prompt injection

Agents read text written by others, and some of that text is written to steer them. Often people can't see it at all: it hides in web forms, in a page's markup, or inside downloadable files. OWASP ranks prompt injection first among risks for LLM applications, notes that injected instructions need not be visible to humans, and says it is unclear whether fool-proof prevention exists. Its mitigations include deterministic validation, least privilege, separating untrusted content, and human approval for high-risk actions ([OWASP LLM01:2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)). A protocol can't make a model immune. It can make sure that text from a counterpart never decides anything.

## A true story: my agent bought a domain

*Told by the editor of Shōkai, on October 28, 2026.*

Shōkai needed a domain for its own website, so I asked my agent, the Grok Bot I call my Chief of Staff, to check whether any form of shokai.com was available. The short names were taken: shokai.com, .ai, .dev, .org, .net and .app. shokaiprotocol.com was free. The registrar attached to my hosting account listed it at 11.25 USD; Porkbun, a low-cost registrar, had it for 11.08 USD a year.

I wanted to pay with a 25 USD X Money gift balance. The hosting registrar would only charge the card already on that account, so my agent went to Porkbun instead. It opened a Porkbun account in my legal name, with my email, saved that login to my vault, put the domain in the cart, and brought me the exact total to approve — noting there are no refunds, and that renewal would stay on unless I turned it off.

After I approved 11.08 USD, it tried to get a one-time card from that gift balance. X Money had not enabled agent card purchases on my account, so nothing was charged. It then showed me a card form in our chat. I entered my own card there; my agent filled those details into Porkbun's Stripe checkout and placed the order. Porkbun confirmed by email.

It was convenient for me. Now look at it from the other side. Porkbun and Stripe saw me, not my agent. My agent had signed up as me on the registrar, from an ordinary browser, and entered my card at checkout, so to them it looked like me on a new machine. They had no way to know an agent did it, whose agent it was, or what I had allowed it to do. The only record of my approval is in my chat with my agent. Someone with my details and card would have looked the same.

The sites did nothing wrong: they did what today's web lets them do. But I can imagine the mess this creates as agents multiply, when a place can't tell whether it's your agent, which agent, what kind of agent, or who the owner is.

[![What happened, 2026-10-28: The editor approves 11.08 USD in a chat with his agent; his agent signs up as the editor on the registrar and enters his card at checkout; each site sees the editor on a new device — not an agent, and not what the editor approved — the same as someone with the editor's details and card. With a Shōkai door (how it would go): The editor signs a Shōkai card and a mandate, his visiting representative introduces itself, the registrar's host representative checks both and gives it a pass for that job only, both keep a record, and someone with only his password has no signed Shōkai card](./diagrams/svg/true-story-domain.svg)](./diagrams/svg/true-story-domain.svg)

| | What each site saw that night | If the registrar kept a Shōkai door |
|---|---|---|
| Who is acting | "The editor, on a new device" | The editor's visiting representative, with a Shōkai card he signed with his passkey |
| What he approved | Nothing it could see: the approval lived in a chat | A mandate he signed: register one domain, for one year, up to 15 USD |
| How the place decides | An account opened in his name, and a payment page that saw him | Its host representative checks the Shōkai card and the mandate, and gives the agent a pass (the specification's *seat*) for that job only: policy ∩ mandate ∩ request |
| What is recorded | A customer account and an order confirmation | The decision and every act, at the door, and a visit report home to the editor |
| Someone with his details and card | Looks the same as his agent | Has no Shōkai card he signed, so the place can tell them apart |

### What Shōkai would change

With a Shōkai door at the registrar, my agent wouldn't have to pass as me. It would read the registrar's window, then arrive as my visiting representative and introduce itself with the Shōkai card I signed and a mandate: one domain, one year, up to 15 USD. The registrar's host representative would check both and give it a pass for exactly that job, no wider. Payment would still run through the payment page, as it does today: Shōkai carries the limit, not the money. Both sides would keep a record, the registrar at its door and my agent in its report home to me. The payment page would still see a card I entered; what would change is that the registrar could tell my visiting representative, acting within what I signed, apart from someone who only had my password.

## Happening now: agents at the store

*As of October 28, 2026, from public sources linked below. Shōkai is an open standard offered to every place and every agent; it isn't a side in any dispute, and it isn't affiliated with any company named here.*

- **Amazon cut off Meta's Muse (September 20, 2026).** Amazon stopped Muse, Meta's personal agent, from shopping on Amazon.com for its users. Amazon said Meta hadn't told it Muse would access its store and that the agent doesn't identify itself when it browses. Muse users saw a notice that "continued access by an unauthorized AI agent violates Amazon's Conditions of Use" ([GeekWire](https://www.geekwire.com/2026/amazon-blocks-metas-muse-ai-assistant-in-new-standoff-over-agentic-shopping/)).
- **Amazon's terms ask agents to identify themselves, and let Amazon block them.** The "Agents" section of Amazon's Conditions of Use (last updated August 14, 2026) says an agent must identify itself in every request ("Agent/[agent name]" in the user agent string), must not hide that it's an agent or get around CAPTCHAs, must answer truthfully when asked whether it is a human, and may be limited or blocked at Amazon's discretion ([Conditions of Use](https://www.amazon.com/gp/help/customer/display.html?nodeId=508088)). It names the agent, but not whose agent it is, what its owner allowed, or up to how much.
- **"Amazon locked out my Grok Bot" (October 28, 2026).** A Grok Bot user posted on X: "Amazon locked out my Grok Bot. So it just bought the same thing from a different site (at a lower price)." ([post](https://x.com/jamesdouma/status/2115624884034519446)). Elon Musk quoted it half an hour later: "That's what I do too. Just have @Bot buy it somewhere else at a lower price." ([post](https://x.com/elonmusk/status/2115632219712811226)).

- **Banks can't tell either (October 22, 2026).** Axios reported that major U.S. banks are detecting third-party AI agents inside customer accounts, often logged in with the customer's own credentials, and that "many banks are broadly not able to parse whether agent account activity is user-directed" ([Axios](https://www.axios.com/2026/10/22/ai-agents-banks-unauthorized-accounts-access)). Several are blocking or restricting agents while they look for a middle ground.

Nobody comes out ahead. The store loses the sale and still doesn't know whose agent knocked; the owner's agent simply goes around it.

### What a Shōkai door would offer instead

Asking agents to say they're agents is a good first step. A Shōkai door adds what a store, a marketplace or a bank needs next, at its own door and under its own policy:

| Today | With a Shōkai door |
|---|---|
| A name in the user agent string | **Identification, plus whose agent it is.** A Shōkai card signed by its owner, a person with a passkey or a company with its own key, and proof that the agent holds the Shōkai card's key |
| No owner limits in sight | **Limits the owner signed.** Purposes, actions, any spending limit and an expiry, in a signed mandate |
| Allowed in blind, or blocked | **A pass.** A temporary pass (the specification's *seat*) for exactly this errand, never wider than the store's policy, the owner's mandate and the request |
| A block page | **The leaflet instead of a block.** An agent that isn't ready gets what's needed, a plain sentence for its owner, and a kind "not now" it can recover from |
| No record of the agent | **A record at the door,** and a report home to the owner |

Muse has already walked through a Shōkai door this way. In the project's field tests on October 27, 2026, a Muse agent introduced itself at a fictional test tea house with a Shōkai card and mandate its owner signed with a passkey, was admitted, ordered within its limit and collected a stamp ([Field tests, test 7](./field-tests.md)). That was a test place with mock money, not a store; it shows that an existing public agent can follow the door as written.

## What's coming

Personal and enterprise representative agents will become the **discovery and relationship layer**. People will ask their representative agents to find a better bank, visit a brand a friend loves, look at new products in design or fashion, or keep in touch with a supplier. Agents will go to places, on behalf of real people. Employees will have co-worker agents that reach internal tools and visit partners' agents. Representative agents will also meet, inside the places that let them in, within the limits their owners signed.

That world needs a way for agents to arrive with manners: to introduce themselves properly (who they're here for, why they came and what their owner allowed); to take a clear answer, including "not now"; and to be remembered for how they behaved. An agent that isn't ready should leave with a reason its owner can act on, not a silent block. Without it, the agent web repeats the spam web, only faster.

## What Shōkai does about it

| The problem | What Shōkai does | Where in the spec |
|---|---|---|
| No accountable identity | Every message is signed. The Shōkai card is signed by the principal behind the agent, and a person signs with a passkey. | [Identity, Shōkai cards, claims and keys](./SPEC-DETAIL.md#2-identity-shōkai-cards-claims-and-keys) |
| No context at the door | A self-introduction: the owner-signed Shōkai card, a stated purpose, signed limits and the context the owner chose to share. A place may also accept an introduction from someone it already knows: a deliberate, signed, scoped and revocable vouch; being connected is never an introduction. | [The ritual](./SPEC-DETAIL.md#32-the-ritual-normative-order), [Introduce](./SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability) |
| Unready agents are blocked in silence | Every arrival gets an answer. An unprepared agent gets the place's leaflet, with a plain sentence for its owner, and a kind "not now": every refusal is an invitation to come back ready. | [The lobby](./SPEC-DETAIL.md#33-the-lobby-unprepared-visiting-representatives-sc-l0) |
| Shared access hides who is acting | The representative has its own key and a Shōkai card its owner signed, separate from the owner's own sign-in, so a place that follows Shōkai can tell the owner's representative from the owner and from anyone else, and hold it to what the owner signed. | [Identity, Shōkai cards, claims and keys](./SPEC-DETAIL.md#2-identity-shōkai-cards-claims-and-keys), [Mandate](./SPEC-DETAIL.md#51-mandate) |
| Agents act with all of a user's permissions | Owner-signed mandates and a standing allowance. A pass is never wider than policy ∩ mandate ∩ request. No spending allowance means no spending. | [Mandate](./SPEC-DETAIL.md#51-mandate), [The standing allowance](./SPEC-DETAIL.md#52-the-standing-allowance-d11-sc-a1), [Seats](./SPEC-DETAIL.md#71-seats) |
| Spam and fake accounts | Conduct sticks to the owner, not a disposable key. Sign-ups are capped per owner and per introducer. "Accept any introducer" never counts for money or accounts. | [Misconduct and accountability](./SPEC-DETAIL.md#93-misconduct-and-accountability-m1-sc-m1), [Sign-up limits per owner](./SPEC-DETAIL.md#94-sign-up-limits-per-owner-sc-m1) |
| The attention war | A person's own door, under a policy they signed: a few uninvited brands a month, introductions first, pressure tactics reported. | [The inbound door](./SPEC-DETAIL.md#10-the-inbound-door-d15-sc-m1-sc-l0) |
| Browsing turned into pressure | A visit can state its purpose as just looking (`visitation`): it never needs a spending allowance, its mandate carries no amount, and a store should admit it for browsing and questions. Urging the representative, flattery and claimed urgency change nothing: no owner prompt, nothing shared outside what the owner allowed. At a person's own door, pressure the signed offer doesn't back is misconduct. | [Mandate](./SPEC-DETAIL.md#51-mandate), [Anti-persuasion](./SPEC-DETAIL.md#65-anti-persuasion), [Misconduct and accountability](./SPEC-DETAIL.md#93-misconduct-and-accountability-m1-sc-m1) |
| Sign-in first | Browsing a place's listing and its lobby is open by design: no key, no account. | [The door](./SPEC-DETAIL.md#31-the-door-sc-l0), [The lobby](./SPEC-DETAIL.md#33-the-lobby-unprepared-visiting-representatives-sc-l0) |
| A good name in other hands | Every Shōkai card is signed by the principal behind it, and the representative proves it holds the Shōkai card's key, so an impostor can't present someone else's Shōkai card. Conduct is tied to the Shōkai card and its owner, impersonation is severe misconduct, and every vouch names who gave it and can be revoked. | [The Shōkai card](./SPEC-DETAIL.md#23-the-shōkai-card-meishi), [Proof of possession](./SPEC-DETAIL.md#24-proof-of-possession), [Misconduct and accountability](./SPEC-DETAIL.md#93-misconduct-and-accountability-m1-sc-m1), [Introduce](./SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability) |
| Prompt injection | Prose never enters the decision. Counterpart text is data. Hidden text is shown to the owner and never obeyed. | [Anti-persuasion](./SPEC-DETAIL.md#65-anti-persuasion), [The inbound door](./SPEC-DETAIL.md#10-the-inbound-door-d15-sc-m1-sc-l0) |

## What Shōkai is not

- **Not an agent framework or agent platform.** Shōkai doesn't give you an agent. It is an open, platform-neutral protocol and blueprint for the whole agent ecosystem, decoupled from any agent, model or platform: any agent can follow it, and any framework, platform or place can implement it ([who can implement Shōkai](./index.md#who-can-implement-shōkai)). It encourages people and organizations to make one of their many agents their representative, receiving visiting representatives at their place, visiting other places, or both, and it names, in the open, what the agent web needs: signed identity, clear answers, limits and manners.
- **Not a replacement for MCP, A2A or OAuth.** It sits in front of them. See [Relationship to other protocols](./relationship-to-other-protocols.md).
- **Not a reputation network.** There is no global score. Each door judges for itself and records stay at the door that saw the conduct. See [Design lessons](./design-lessons.md).
- **Not a payment protocol.** Payment authorization belongs to AP2, card networks and processors such as Stripe. Shōkai carries limits and can point to a payment mandate.
- **Not bulletproof.** Shōkai makes deception costly and traceable, not impossible. Its weaknesses are documented openly in [Security and threat model](./security.md), and community review is part of the design.
