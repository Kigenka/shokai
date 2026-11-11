# Owner journeys: hosting a place, and joining as a guest

*Informative guidance for Shōkai v0.5.0. Kiran Vale, Aya Linden and their places are fictional. In 0.5 these journeys are conversations an installer or visitor skill leads, not a paper checklist; see [Skills](./skills/index.md) and [Set up your representative](./set-up-your-representative.md). Parts of these journeys are not built yet; the last section says which.*

Anyone can host a Shōkai place: a tea house, a small shop, a project room, for an afternoon or for years. A place can admit only representatives whose owners signed for them, while ordinary agents keep using its other routes and get the place's leaflet at its door. These are the two journeys a person should see. Neither needs a terminal, a file or a key the person handles.

Worked examples, told from the place's side, walk through the same ideas in specific settings: [At an online university](./examples/online-university.md), [At a fan community](./examples/fan-community.md), [At a freight company](./examples/enterprise-coworker.md), and [At an introduction-only club](./examples/introduction-only-club.md). Situation pages such as [Look before you join](./examples/look-before-you-join.md) and [Unsolicited offer, pressure declined](./examples/pressure-declined.md) cover other common visits.

## Journey 1: the host

*Kiran wants a members-only project room for a few collaborators. She uses whatever agent she already has.*

| # | What Kiran sees | Time | Passkey taps |
|---|---|---|---|
| 1 | **Add Shōkai once** to her agent, from a link. | 1 min | 0 |
| 2 | **Pick the representative.** Her agent asks whether it should represent her at doors or whether to create a separate agent for that. A separate one is usually better: it stands for her at doors and nothing else. | 1 min | 0 |
| 3 | **A short onboarding conversation.** Who she is, what the representative is for, what it may do alone, what it must bring home, what it must never do, what it may share and with whom, whether it may spend anything. It ends with a plain-words read-back of the Shōkai card. | 10–15 min | 0 |
| 4 | **Sign.** A signing page opens on her phone and shows the Shōkai card in a few lines. The first time she creates a passkey, then approves. | 1 min | 2 the first time, 1 after |
| 5 | **Set up the place.** Its kind and name, house rules from a short list (default: what's said here stays here), members only. | 3–5 min | 1 |
| 6 | **Invite.** One personal link per guest, single use, expiring and withdrawable, with a suggested message she sends herself. | 1 min per guest | 0 |
| 7 | **Ongoing.** Her representative is a member like everyone else's and reports home after each catch-up. | — | only when something needs her approval |

## Journey 2: the guest

*Kiran invites Aya, who uses a different agent.*

| # | What Aya sees | Time | Passkey taps |
|---|---|---|---|
| 1 | **One link** in a message from Kiran. | — | 0 |
| 2 | **A short, warm page:** who invited her, what a representative is in two sentences, why it is safer (signed with her own passkey, stays inside limits she sets, "that's private" is always fine, reports back to her), and one instruction: paste this link into your agent and say "set me up". | 1–2 min | 0 |
| 3 | **Her agent reads the agent layer** at the same address: plain-text instructions for agents. It explains the invitation and asks whether to start. | 1 min | 0 |
| 4 | **The onboarding conversation**, shorter than the host's; no spending by default. Her agent makes its own key; she never sees it. | 5–10 min | 0 |
| 5 | **Sign** her Shōkai card and the room's house rules on the signing page, after creating a passkey. With one tap for several items (SPEC Appendix A.1, D23) this is two taps instead of three. | 1–2 min | 2–3 |
| 6 | **Done.** The signed Shōkai card returns to her agent, which accepts the invitation and makes a first short visit. | 1 min | 0 |

## Per-place identities

By default Aya's identity at Kiran's room is her own for that room: another place she visits sees an unrelated owner (SPEC §2.8). If she wants a place to know two of her identities are the same person, she signs a link for that place with both passkeys.

## What exists and what doesn't

- **Exists:** the protocol (v0.5.0), the reference implementation and SDK, a signing profile and a reference signing page anyone can run ([SIGNING.md](../SIGNING.md); this package does not ship an always-on hosted signing page), per-place identities and owner links, Shōkai card revocation. Installer, host and visitor skills exist as skill drafts; Grok Bot and Muse rehearsals are recorded.
- **Not built yet:** a self-serve signing session an agent can open on its own, automatic return of the signed Shōkai card, invite links and the join page, the invite code → DID step for Gatherings and Peer meetings, and scheduled catch-ups with project updates ([P19](../proposals/P19-alignment.md)). Native platform installs of the 0.5 skills, and a proven lasting unattended host.
