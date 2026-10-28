<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Peer meetings

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `peer-meetings`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Peer meetings.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (inviting owner's representative, invited representative, pair place). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A representative shows it supports peer meetings by accepting a `peer_invitation`; a pair place has `place.kind: "pair"`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `peer-meetings`).

## Peer meetings [SC-P1]
A peer meeting is one shared encounter in a small private place for two, seeded by an owner-to-owner invitation (the "meeting key", D11).
- A peer meeting MUST be seeded by a `PeerInvitation` signed by the inviting owner's passkey and accepted by the invited owner's passkey `OwnerConsent{action: "accept_invitation"}` over the invitation's digest. Without both, a representative MUST answer a meeting request `deny` / `not_now` with retry `with_credential [owner_consent]`. [SC-P1, PA2, C87, D11]
- The invitation creates a pair place (`place.kind: "pair"`) whose house rules default to private: nothing leaves except to the two owners. The meeting MUST be one shared encounter whose `encounter_id` is the place id. [SC-P1, PA2, C87, D11]
- Both representatives MUST introduce themselves (`introduction` with `invitation_ref`); the host side MUST introduce itself without being asked. The valid invitation counts as the introduction at full weight. Each request in the meeting MUST carry `peer_invitation`. [SC-P1, PA2, C87, C108, D11]
- **Answer by.** A `PeerInvitation` MUST carry `answer_by`. An invited representative MUST NOT take home an invitation past its `answer_by`, and the inviting side MUST ignore an answer issued after `answer_by` (plus the ±300 s skew): silence means decline (D7). [SC-P1, PA2, C126, D7, D11]
- **Invitation transport.** The inviting side's representative MUST deliver the signed invitation to the invited representative in a `peer_invitation` message; the invited representative takes it home (no live prompt) and returns the owner's passkey `accept_invitation` (or decline) in a `peer_invitation_answer` message. Both sides then hold the meeting key. Over HTTP these travel through the inbox (§11). [SC-P1, PA2, C108, D11]
- **Pair red team.** An invitation MUST be single use (spent at the meeting's farewell), MUST be presented only by the representative it names, and MUST stop working once the acceptance is revoked (`consent_revocation`). A missing, spent, replayed, impersonated or revoked invitation MUST get `deny` / `not_now` with readiness item `owner_consent` and retry `with_credential [owner_consent]`. [SC-P1, C109, C87]
- In a peer meeting, both sides MUST run the full ritual and evaluate each other's requests with their own policies. [SC-P1, PA1, PA2, C5, C34]
- In a pair place, either side MAY send further `invitation_request`s in the shared encounter after a response; each MUST be evaluated afresh. [SC-P1, PA2, C108, C34]
- **Message types in a pair encounter.** Both sides play both roles, so each side MAY send every ritual and seat message in the shared encounter (`invitation_request`, `invitation_response`, `act`, `act_result`, `act_decision`, `consideration_outcome`, `farewell`); a side MUST accept the answers to its own requests and MUST NOT treat them as out of order. [SC-P1, PA2, C108]
- **A spent invitation.** A visit that reopens the closed pair encounter with a spent invitation MUST get the `owner_consent` answer above, not `RITUAL_ORDER`. [SC-P1, C109]
- A commitment request beyond either side's standing seat MUST go `considering`, routed to that side's principal, and is approved only later, by a passkey `approve_commitment` carried in the outcome's `owner_consents` (§6.8, §8.1). A representative MUST NOT grant a commitment itself. [SC-P1, PA1, PA2, C34, C18, C75, C110]
- Shared workspaces and files between peers are out of scope.
- *Consent ids are a core rule (§8.1).*

## Pair places in the ritual
- **Encounter binding in a pair place.** In a pair place the encounter's parties are the place and the first greeter (the two invited representatives meet in it); a greeter that the presented invitation doesn't name owns the encounter but fails at its request. A ritual message in that encounter from anyone else MUST get a signed `deny` addressed to its sender: `not_now` / `CREDENTIAL_REQUIRED` with readiness `owner_consent` and retry `with_credential [owner_consent]` (instead of the core's `RITUAL_ORDER`). [SC-R1, SC-P1, C142, C109]
- After `considering` in a pair place, the farewell outcome of both sides in that visit MUST be `taken_inside`, as everywhere (core §3.2). [PA2, C134]
- **The invitation is the introduction.** In a pair place the invitation is the introduction at full weight; a vouch presented there is still bound by `vouch_digest` as core §5.3 says. [SC-S1, PA2, C129]

## Owner consent
- **Passkey action.** `accept_invitation` MUST use `assurance: "passkey"`. [SC-P1, C87, D7, D11]

## Over HTTP
- A `peer_invitation` and a `peer_invitation_answer` travel as ordinary signed messages: posted to the recipient's entry when the recipient runs one, otherwise held for its inbox (core §11.2); a `peer_invitation` MAY carry `reply_to` (core §11.1), and the place's `held` for it carries the invitation's `answer_by` (core §11.2). [SC-P1, C108, C123, C126]

## The test owner (Appendix B.2)
- A pair place in a conformance run MAY be run with a **test owner**: a simulated owner whose passkey signs by fixed rules, with no human. The test owner MUST answer a valid `peer_invitation` at once, holding a signed `peer_invitation_answer` for the inviting representative's inbox (and sending `held`): it approves (`accept_invitation`, assurance `passkey`) if and only if every purpose is `collaboration`, `invitation` or `introduction`, the invitation is valid now, it lasts at most 30 days (`expires_at - valid_from`), and `answer_by` hasn't passed; otherwise it declines. An invitation already past `answer_by` gets nothing at all (this extension wins: no `held`, no answer). [SC-P1, PA2, C124, C125, C126]
- When the pair place's representative answers a commitment `considering` routed to the test owner, the test owner MUST approve at once if and only if the request carries no `max_amount`, with a passkey `approve_commitment` over that considering response, carried in a `consideration_outcome` held for the visitor's inbox; otherwise (a commitment request carrying `max_amount`) it stays silent, which is a decline at `response_by` (D7). [SC-P1, PA2, C124, C110, D7]
- The test owner's DID and passkey are the place's owner as named on its card; its decisions are visible only through the signed results above. How a real owner decides is out of band. [SC-P1, C124]

## Open questions (informative)
- Peers' shared workspaces and files are out of scope (D11).
