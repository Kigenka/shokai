# Relationship to other protocols

Shōkai is an **introduction and admission layer**. When a representative arrives at a place, the representative introduces itself, and Shōkai answers three questions before any work begins: whose representative it is, why it came, and what its owner allows it to do (and, optionally, who vouches for it). The place then decides whether to welcome it, and the representative's conduct carries consequences for it, its owner and any introducer.

**Shōkai is agent-to-agent only inside a place**: at the door, the visiting representative introduces itself to the place's gatekeeper (the host at the door), which is itself an agent; with the Gatherings extension, representatives a place let in can also meet in its room. **The work after admission runs over MCP, A2A or the place's own APIs**, or a commerce or payment protocol. Shōkai is designed to work alongside these projects and to reuse their building blocks where it can.

[![Which question each protocol answers](https://raw.githubusercontent.com/Kigenka/shokai/v0.3.0/docs/diagrams/svg/protocols.svg)](https://raw.githubusercontent.com/Kigenka/shokai/v0.3.0/docs/diagrams/svg/protocols.svg)

**Where the other descriptions fit.** A place has three layers: its ordinary website (outside Shōkai), its **agent front** (the place listing and lobby, open to anyone to look at) and its **door** (anything personal). Many of the projects below publish agent-facing descriptions of their own: MCP Server Cards, A2A Agent Cards, NLWeb endpoints, commerce profiles. Shōkai doesn't replace them. A listing entry can point to them with `links`, as hints, and the door decides only on signed facts. See [Website, agent front, door](https://github.com/Kigenka/shokai/blob/v0.3.0/docs/concepts/website-front-door.md).

[![A place's three layers: the website, the agent front and the door](https://raw.githubusercontent.com/Kigenka/shokai/v0.3.0/docs/diagrams/svg/website-front-door.svg)](https://raw.githubusercontent.com/Kigenka/shokai/v0.3.0/docs/diagrams/svg/website-front-door.svg)

| Project | What it does well | How Shōkai fits | Sources |
|---|---|---|---|
| **MCP** (Model Context Protocol) | Gives an agent tools and data. Optional OAuth 2.1-based authorization for HTTP transports. Donated by Anthropic to the Agentic AI Foundation, a directed fund under the Linux Foundation (Dec 2025). Current spec revision: 2026-07-28. | **Shōkai sits in front of MCP servers.** MCP answers "which tools can this client call?" Shōkai answers "whose representative is this, why is it here, and what may it do?" | [Authorization spec (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) · [Anthropic](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation) |
| **A2A** (Agent2Agent) | Agents working together on tasks: messages, tasks, artifacts, streaming. v1.0 released Mar 2026 (latest patch v1.0.1, May 2026). A Linux Foundation project since June 2025, hosted by the Agentic AI Foundation since Aug 2026. The Agent Card describes the *server* agent; client identity comes from the HTTP layer. | **Complementary.** A2A covers the work, Shōkai the introduction. A Shōkai place could expose its seated services over A2A. | [Spec](https://a2a-protocol.org/latest/specification/) · [Release](https://github.com/a2aproject/A2A/releases/tag/v1.0.0) · [Enterprise features](https://a2a-protocol.org/latest/topics/enterprise-ready/) · [AAIF](https://aaif.io/blog/a2a-joins-aaif) |
| **Personal Agent Protocol** ("Poppy", Meta and Sierra, draft 0.3) | How a personal agent acting for one user works with a company: discovery, sessions, sign-in, pairwise user IDs per company, scopes the company defines, and API and MCP access. | **The closest neighbour, and a complement.** Poppy is how a personal agent works with a company; Shōkai is how that agent introduces itself, who it represents and what its owner signed, at a company or anywhere else. Draft 0.3 has no third-party introducer who answers for a vouch and no owner-signed portable limits; its standing permissions are held by the agent. It is ahead of Shōkai on unlinkable user identity, on sign-in and revocation, and in backing. See [below](#the-personal-agent-protocol). | [Spec](https://personalagentprotocol.org/docs/spec) · [Sierra](https://sierra.ai/blog/introducing-personal-agent-protocol) |
| **OAuth 2.x** (and the IETF WIMSE agent guidance) | Delegated access with scopes defined by the receiving side. | Shōkai doesn't replace it. After admission a place can keep using OAuth; mapping the owner to OAuth `sub` and the representative to `client_id` is an alignment item. | [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) · [draft-ietf-wimse-aims](https://datatracker.ietf.org/doc/draft-ietf-wimse-aims/) |
| **Web Bot Auth** (IETF working group) | Lets an automated client sign its HTTP requests (RFC 9421) so a site can verify them against the keys published at the client's URL. By the draft's own text, a valid signature says nothing about who operates the agent or whether the request is authorized, and the protocol does not authenticate human users or define delegation. | **A transport layer below Shōkai.** It proves which software is calling; Shōkai adds whose representative it is, why it came and what it may do. Accepting a Web Bot Auth signature in Shōkai's HTTP binding is on the roadmap. | [Draft](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/) · [Charter](https://datatracker.ietf.org/wg/webbotauth/about/) |
| **WebAuthn / passkeys** | Phishing-resistant signatures from a person's device. | Shōkai uses passkeys (ES256) for every owner signature: cards, mandates, allowances, door policies and consents. | W3C WebAuthn |
| **AP2** (Agent Payments Protocol; donated by Google to the FIDO Alliance, v0.2, Apr 2026), **Agentic Commerce Protocol** (maintained by OpenAI and Stripe, beta) | Proving a user authorised a payment; checkout between buyer, agent and merchant. | **Used for payments; Shōkai doesn't define them.** A seat that includes spending can hand over to them, and carrying or pointing to an AP2 mandate is on the roadmap. | [AP2 spec](https://ap2-protocol.org/ap2/specification/) · [Google](https://blog.google/products-and-platforms/platforms/google-pay/agent-payments-protocol-fido-alliance/) · [ACP](https://www.agenticcommerce.dev/) |
| **Account-linking services** (for example Plaid) | Let an app read a person's bank data with the person's consent. | Unchanged. A proposal (carried grants) would let a representative show a signed *reference* to an approval that already exists, never an access token. | Proposal only; see the [Harborlight example](https://github.com/Kigenka/shokai/blob/v0.3.0/docs/examples/harborlight-bank.md) |

Shōkai is independent and not affiliated with or endorsed by any of these projects or companies. Names are used only to describe how the protocols relate.

Every statement on this page was checked against the cited primary source on 2026-10-26. These projects move quickly; please open an issue if something here has changed.

## What makes Shōkai different

- **Introductions with stakes.** No other protocol we found has a third-party introducer whose standing changes with the visitor's conduct. The nearest things are registered-agent programs run by payment networks and identity badges such as [AGNTCY's](https://github.com/agntcy/identity).
- **Owner-signed, portable limits for any purpose,** not only payments.
- **A clear answer** (`grant`, `conditional`, `deny` with a reason and a retry, or `considering`), where others return HTTP 401/403 or an OAuth error.
- **Local conduct with consequences** for the representative, its owner and its introducer.
- **A person's own door** for brands, under rules the person signed.

## The Personal Agent Protocol

*Checked against Personal Agent Protocol draft 0.3 (in progress) on 2026-10-27. Poppy's drafts change often; re-check before relying on any detail here. Shōkai is not affiliated with Meta, Sierra or the Personal Agent Protocol, and nothing here has been proposed to its authors.*

**Different questions.** Poppy has three parties: a user, their personal agent and a company that implements the protocol. Shōkai has principals, representatives, introducers and places, and a place can be anyone: a company, a person's own representative, a small shop, a project room. So the two overlap only at company visits.

**Where Poppy is ahead.**
- *Unlinkable identity by default:* each company sees a different user identifier until the user signs in. Shōkai v0.3.0 adds per-place owner identities (SPEC §2.8), but a card still shows its owner DID at every place it visits.
- *Sign-in and revocation:* Poppy builds on OAuth sessions and token revocation. Shōkai revokes cards, vouches, consents and allowances by signed statements (SPEC §2.6, §4, §8.1), which is newer and less exercised.
- *Backing:* many companies are listed as design partners. Shōkai is a small open project.

**Where Shōkai adds something.** A card and limits the owner signs with a passkey; introductions that an introducer answers for; conduct with consequences for the owner and the introducer; a person's own door for brands; and places where people's representatives meet (Gatherings, Peer meetings).

**How they could fit (illustrative; nothing built or tested).**
1. *A company serves both.* Ordinary personal agents use its Poppy discovery document and sessions; owner-vouched representatives can also use its Shōkai door. The Shōkai listing can point to the Poppy document with a `links` entry, and the reverse with an extension entry.
2. *An owner-signed mandate inside a Poppy session.* A Poppy extension named under a domain Kigenka controls (for example `kigenka.com/owner-mandate`, version 1) could carry a passkey-signed Shōkai mandate when the agent confirms an operation under a standing permission. The company would check the owner signature, that the operation's terms fall inside the mandate (actions, `max_amount`, counterparty, validity) and the mandate's running totals (SPEC §5.1). To respect Poppy's privacy model, the agent would present it only after sign-in, or use a per-company owner identity (SPEC §2.8).
3. *What stays Shōkai's own.* Peer meetings, gatherings, the inbound door, door gifts and conduct notices between places are outside Poppy's stated scope (agent and company).

| Shōkai | Poppy | Note |
|---|---|---|
| Representative (`did:key`) | client and agent identifiers | Poppy's agent id is opaque and pairwise |
| Owner DID | user identifier (pairwise), then the account after sign-in | Per-place owner identities (SPEC §2.8) narrow the gap |
| Card actions and mandate limits | scopes, and operation terms under a standing permission | Poppy has no field for owner-signed limits today |
| Seat | session, token lifetime and scopes | A seat is policy ∩ mandate ∩ request, per visit |
| `considering`, taken home | an operation left proposed until it expires | Silence is no in both |
| Vouch, introducer | none | Could be a second extension later |

