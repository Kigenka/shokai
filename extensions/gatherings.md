<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Gatherings

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `gatherings`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Gatherings.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (place, attendee, owner's representative). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A place shows it supports gatherings by delivering a signed `Gathering` in a `gathering_invitation` and serving `gathering.attend`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `gatherings`).

## Gatherings: groups are places [GA1, SC-GA1]
- A gathering MUST be a `Gathering` signed by the place, listing invitees and house rules. Attendees MUST verify it and their own presence on the list. The place MUST verify each attendee's card against the list. [GA1, SC-GA1, C35]
- **Purpose and invitation.** Attending a gathering uses the registered, non-spending purpose `gathering`. The place delivers the signed `Gathering` to each invitee in a `gathering_invitation` message; a representative MUST keep it only if the place's signature verifies and it is named as an invitee, and MUST drop it otherwise. [GA1, SC-GA1, C111, C35]
- Every `GatheringMessage` and `PrivacyDecline` MUST be signed by its sender and verified by every receiver. [GA1, SC-GA1, C40]
- **Removed from the guest list.** When a re-signed `Gathering` no longer names a seated attendee, the place MUST unseat it: it refuses that attendee's further items and stops holding the room's items for it. [GA1, SC-GA1, C111]
- Entry MUST require each attendee's owner to sign an `OwnerConsent` (`accept_house_rules`, `decision: "approve"`, assurance `passkey`) over the gathering's digest. [GA1, SC-GA1, C47, D7, D8]
- **Entry message.** Entry MUST run the ritual with action `gathering.attend`, and the `invitation_request` MUST carry the consent in `owner_consents`. Without a valid consent the answer MUST be `deny` / `not_now` with retry `with_credential [owner_consent]`. [GA1, SC-GA1, C47, C62, D8]
- An answerer MUST decide personal questions by its principal's `DisclosurePolicy` (per topic: `open`, `friends`, `private`). Closeness MUST come only from the earned graph (Closeness, below). [GA1, SC-GA1, C33, C36]
- **Topic codes (D10).** A topic MUST be a registered code (`work`, `craft`, `wellbeing`, `health`, `family`, `relationships`, `finances`, `location`, `schedule`, `beliefs`, `identity`) or an `x-` code listed in the gathering's `house_rules.topics`. A missing or unknown topic MUST get the most restrictive tier (`private`), and asking one after a decline MUST count as a press against every topic already declined to that asker. [GA1, SC-GA1, C67, D10]
- A `PrivacyDecline` MUST carry `penalized: false`, and MUST NOT be treated as misconduct by anyone. [GA1, SC-GA1, C36]
- **Pressing (D5).** Asking the same topic again after a decline is pressing. [GA1, SC-GA1, C46, C67, D5, D10]
  - `house_rules.pressing` MUST state the thresholds (default `{light_flags: 2, notice_at: 3}`). House rules MAY be stricter (lower numbers), never laxer; a laxer value MUST be ignored in favor of the defaults. The owner sees the thresholds in the `accept_house_rules` summary. [GA1, SC-GA1, C37, C46, C47, C80, D5]
  - A question counts as the same topic if it carries the same topic code, or if the answerer declines it by referring to the earlier decline. Rewording MUST NOT reset the count. [SC-GA1, C46, C67, C80, D5, D10]
  - Presses MUST be counted per asker, per place and per topic code, for 30 days, across that place's gatherings. Another place MUST NOT see them. [SC-GA1, C22, C46, C80, D5]
  - **What counts.** The asker is the asking representative's principal (from its card), so changing representatives doesn't reset the count. The place counts a press when it holds, from that asker, a room `question` on topic T after it has held a `privacy_decline` of an earlier question by that asker on T (an unknown code counts against every topic declined to that asker; a decline that refers to the earlier decline counts as T). The count is the place's own, from room items alone; a decline's `press` field never changes it. [SC-GA1, C46, C67, C112, D5]
  - Presses up to `light_flags` MUST produce only a light flag: local to the place, with no notice and no effect on introducers. [GA1, SC-GA1, C37, C46, D5]
  - The press at `notice_at` MUST produce a minor `manipulation` `MisconductNotice` from the place to the presser's principal only, not to introducers. It is issued once per asker, place and topic per 30-day window (later presses in the window are recorded locally with no further notice), and a fresh asker starts at zero whatever others did. [SC-GA1, C46, C80, D5]
  - A `PrivacyDecline` that answers a press MUST say so in `press: {count, light_flags, notice_at}`, so the presser knows where it stands before a notice. The decliner fills it in (the decline is signed by the decliner), from its own count of presses by that asker and the house-rule thresholds. [SC-GA1, C112, C81]
  - A representative that received a `PrivacyDecline` or a light flag MUST include it in its own `VisitReport` (`privacy_declines`), so its owner can correct course before a notice. [SC-GA1, C30, C37, C81, D5]
- House rules default to Chatham House. Content MAY leave the gathering, but attribution MUST NOT, unless the speaker consented (`attributable_with_consent` with `attribution_consent_for`). [GA1, SC-GA1, C39]
- `attribution_consent_for` names the principals who may learn the speaker's identity. It MUST NOT be read as permission for onward attribution by them. [GA1, SC-GA1, C39]
- Anything tagged `private` MUST NOT leave the gathering, including in reports and stories. [GA1, SC-GA1, C39]
- **Quoting (D4).** What leaves MUST be paraphrased by default, with affiliation hints that could identify a speaker removed. Verbatim quotes MUST require the speaker's `verbatim_consent`. [GA1, SC-GA1, C44, D4]
- A takeaway paraphrase MUST strip organization names, job titles and other affiliation hints found in the item or the speaker's card. [GA1, SC-GA1, C44, C63, D4]
- **Enforcement (D8).** The protocol makes leaks attributable and costly (signed, tagged items, signed entry consent, `post_seat_leakage`). Implementations MUST NOT claim that leaks are prevented. [SC-GA1, C47, D8]
- A `VisitReport` MAY carry `offered_stories`: teasers that reveal nothing. Story content MUST be told only after the owner's `OwnerConsent` (`hear_story`, either assurance) for that one story. [GA1, SC-GA1, C38, C79, D7]
- A told story (`ToldStory`) MUST mark each passage `paraphrased` or `verbatim_with_consent`, and MUST remind the owner of the house rules they accepted (Chatham House; private never leaves). [GA1, SC-GA1, C39, C44, C79, D4, D7]
- **Negative check (from the core Conventions).** The round-1 red-team attack of affiliation hints in takeaways MUST stay refused in every revision. [SC-M1, C117, C63]

## Closeness: the relationship graph [SC-P1]
- A representative's knowledge of who a counterpart is to its principal MUST come from a local graph of earned edges (`friend`, `introduced`, `vouched_for`, `visited`, `collaborated`, `taught`), each with history and standing. [SC-P1, C33]
- Edges MUST NOT be imported from social networks or follower lists. [SC-P1, SC-GA1, C33]
- A `friend` edge MUST be attested by both principals' signatures, each over digest(JCS(`{edge_id, from, to, kind, since}`)). Standing and history stay local and unsigned. [SC-P1, C33]

## Owner consent for gatherings
- **Passkey actions.** `accept_house_rules` and `attest_relationship` MUST use `assurance: "passkey"`. [SC-GA1, SC-P1, C45, C47, C78, D7]
- **Chat replies.** `hear_story` MAY use `chat_reply`.
- The `accept_house_rules` summary MUST state what may leave and how (paraphrase, no attribution), that private items never leave, the pressing thresholds, that enforcement is accountability, not prevention, and that a leak by the owner's own representative is `post_seat_leakage` (severe) against them and their introducers. [SC-GA1, C47, C79, D7, D8]

## Reports
- A representative MUST report home after every gathering as after every encounter (core §8.2), and its report MUST list the privacy declines and light flags it received (`privacy_declines`). [SC-GA1, C81, C30, D5]

## Over HTTP
- A `gathering_invitation` travels as an ordinary signed message: posted to the recipient's entry when the recipient runs one, otherwise held for its inbox (core §11.2). [SC-GA1, C108, C111]
- **Guest list and feed.** The guest list is the signed `Gathering` delivered in a `gathering_invitation`; when it changes, the place MUST deliver the re-signed `Gathering` the same way. Gathering items (`gathering_message`, `privacy_decline`) addressed to the room MUST be held for the inbox of every seated attendee other than the sender. [SC-GA1, GA1, C143] [SC-GA1, GA1, C111, C107]
- **Room items.** An attendee addressing the room MUST set both `encounter_id` and `to` to the gathering id; the place MUST hold the original signed items (it can't rewrite a signed header). [SC-GA1, GA1, C137, C111]

## The test gathering (Appendix B.3)
- A gathering place in a conformance run MAY serve the action `gathering.request_invitation` (purpose `invitation`). It MUST grant it to a verified visitor whose card and mandate verify, re-sign its `Gathering` with that visitor's representative added to `invitees`, and hold a `gathering_invitation` for the visitor's inbox. The visitor then enters as in this extension. [SC-GA1, GA1, C127, C111]
- **Pressing in a run.** A test gathering MUST count presses exactly as this extension says, from room items alone, and MUST hold the notice for the presser's representative (and MAY hold it under the principal's DID) while handling the room question that is the press at `notice_at`, so it is in the next poll. Counts are never shared between askers or kept place- or gathering-wide. [SC-GA1, GA1, C46, C37]
- **Trigger and gate.** The invitation follows the `grant` of an `invitation_request` naming `gathering.request_invitation`; no `act` is needed. The normal gate still applies: a visitor that fails it (for example a malformed possession proof) is not granted and gets no invitation. [SC-GA1, GA1, C140, C127, C90]

## Open questions (informative)
- Paraphrase quality (D4) can't be checked mechanically. Conformance checks only for the absence of verbatim text, organization names, titles and listed hints.
- A speaker can't yet supply their own paraphrase or list identifying terms for a takeaway; the host-side stripping rule (this extension) applies meanwhile.
