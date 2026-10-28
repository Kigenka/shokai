# Changelog

All notable changes to the Shōkai specification, SDK and reference code. Before 1.0, minor versions may break compatibility; each break is listed here.

## Unreleased

Repository and packaging work for going public. Nothing on the wire changes, and the specification text is unchanged.

- **JSON Schema.** `schema/v0.3.0/schema.json`, generated from `protocol-shapes.ts` (the TypeScript stays the source of truth), as MCP publishes its schema. `npm run check-schema` (in `npm test` and CI) fails if it is stale, validates every golden-trace message without a fixture placeholder (103), and checks that broken controls fail. The SDK ships it as `spec/schema.json` (`@kigenka/shokai/schema.json`).
- **Package links.** `repository`, `homepage` and `bugs` are back in `packages/shokai/package.json`. The 27 relative links in the package's `spec/` that only worked inside the repository now point to the same files at the release tag on GitHub, and `check-links` checks every Markdown file in the package's bundle. `spec/conformance/mcp-2026-07-28-notes.md` is synced again (0.3.0 shipped an older copy that still said "rc4").
- **Release workflow.** It removes `"private"` only in its own working copy, and skips a version that is already on npm, so pushing the `v0.3.0` tag publishes nothing.
- **CI.** Node.js 20, 22 and 24; the schema check; manual runs; one run per branch at a time. Dependabot for npm and GitHub Actions.
- **Issues and pull requests.** Issue forms for specification issues and changes, bugs, conformance checks and implementation reports; blank issues off, with links to private vulnerability reporting, Discussions and the proposal process. The pull-request template asks about the schema and AI assistance. `CODEOWNERS` (the editor's handle to be filled in).
- **Project documents.** A new README front page (what the repository contains, a 60-second try, three diagrams: the introduction, who stands behind whom, the trust path; a repository map); `MAINTAINERS.md`; SECURITY.md gains supported versions, what happens after a report, and the behaviours that are intended rather than vulnerabilities; CONTRIBUTING.md gains getting started and where things live; a map of every docs page.
- **Tested in the open.** The field-test report (`docs/field-tests.md`), a review history (`docs/review-history.md`) and the v0.3.0 release notes (`docs/releases/v0.3.0.md`) are published in the repository.
- **Deployment notes** use placeholders instead of the steward's local paths, team and deployment identifiers.

## v0.3.0, 2026-10-28

The first release of the 0.3 line. It is the text of release candidate 4 (below) with the clarifications and fixes made since its feature freeze on October 27, and nothing new on the wire.

**In plain words.** A place keeps a door. An agent arrives on someone's behalf, introduces itself with a card its owner signed with a passkey, says why it came, and shows the limits its owner signed. The place answers every arrival: it seats the agent, or gives it a leaflet and a kind "not now" it can recover from. Inside, every act is checked against the seat and the owner's limits, the agent reports home in plain words, and conduct has consequences. This release puts that in one tested text, a TypeScript package (`@kigenka/shokai`), a conformance runner and a reference place.

**Compatibility.** The wire tag stays `shokai/0.3`. `spec_ref.version` is now "0.3.0". Nothing on the wire changed from 0.3.0-rc4, so a peer that still names "0.3.0-rc4" speaks this text: the conformance runner accepts it with a note (SPEC §3.1, *Compatibility*). Release candidates rc1 to rc3 lack later additions of the 0.3 line (§2.6, §2.8, §3.6, §7.2).

**What changed in the release itself**

- **Version.** The specification, extensions, threat model, types, test vectors, golden traces, reference and SDK all say 0.3.0 (the package is `@kigenka/shokai@0.3.0`). Notes that say when something was added (for example "v0.3.0-rc4 (§2.6)") are history and stay as they are.
- **Install.** The README and quickstart install from npm (`npm install @kigenka/shokai`, `npx @kigenka/shokai demo`), with a short fallback for installing from a package file.
- **Package.** `shokai --version` prints the package version and the protocol it speaks. The author is YSY. The `repository`, `homepage` and `bugs` links are left out while the source repository is private. RELEASING.md describes the first publish, from a laptop without provenance, and later ones from CI with provenance.
- **Conformance runner.** `door.spec_ref` passes for "0.3.0" and, with a note, for "0.3.0-rc4"; any other version is a warning, as before.
- **Wording.** TRADEMARKS.md: Shōkai has no badge or approval programme. The extension statuses, roadmap, security and contributing notes no longer call this a release candidate.
- **Example.** The toy MCP example says who refused the call outside the seat, and why (it printed `undefined`).

**Changes since the rc4 feature freeze** (all without a wire change; listed as they were made)

**Fixes from the defender reviews of rc4 (2026-10-28; no wire change)**

- **Reference signing page (SIGNING.md §2 item 3, clarification):** every signed field is shown, at any depth, and coverage is checked leaf by leaf: `owner_binding.platform_key` is worded as the chat key, the representative key is shown in full, identifiers are no longer shortened, and leftover fields on allowance grants are listed. Door rules must carry their private part (`{salt, note}`), checked against `private_digest` and shown field by field. A value the page can't show faithfully (control or invisible characters, nesting deeper than 8, an odd field name) stops the page from starting.
- **Kind confusion:** an item carrying the fields of more than one kind (for example a mandate's and a card's) is refused. Any item with an amount anywhere gets its own tap and can't join a one-tap batch. Signing page e2e: 64 checks.
- **sign.kigenka.com front (deploy/sign-front, prepared, not deployed):** the inert page now names the test stage and links to a full `/about` notice; the relay also forwards the rc4 page's `/about` and one-tap batch routes, which the October 26 front would have left inert. Checked on loopback by `deploy/sign-front/test.mjs` (in `run-all-suites.sh`). The notice text's "in advance, A way" typo is fixed.
- **sign.kigenka.com, serverless (deploy/sign-serverless; live since October 28, 11:14 AM PDT, on YSY's OK):** the rc4 signing page as Vercel Functions with an Upstash Redis store (REST, no package), replacing relay mode, which needs a tunnel. Steward-only admin route (secret in a Sensitive env var) to load the public owner credential, open a one-time 30-minute session (only the token's hash is stored), read and verify results, and close it. Challenges are taken once and decisions written once across instances; stored items are re-checked against their summaries on every read. The signing page e2e runs unchanged against it (`SIGNING_SERVER=deploy/sign-serverless/local.mjs`), plus 45 serverless checks; both in `run-all-suites.sh`. Field test 8 (October 28, 11:14–11:27 AM PDT): YSY signed four items in three taps with his existing passkey; all four verified twice, independently; the session was closed.
- **Docs:** the Grok Bot rollback recipe no longer re-delivers standby slips (they are live withdrawals); the doorbell no longer claims strangers can't ring, and says a signed ring proves only a key; the skill says a withdrawal ends visits where the place has learned of it; the FAQ says what still links pairwise identities (SPEC §12.3); "a hijacked agent can do at most what the owner signed" now says "as each place counts it"; "true representative" and "tested with" wording replaced. THREAT-MODEL known limits: vouch-log freshness, and what a silent file rollback can lose.

**Fixes from an adversarial review of rc4 (2026-10-28; no wire change)**

- **Quickstart:** its expected output matches the SDK again (the report line starts with "The place with key"), the verifier masks keys either way, and `tools/verify-quickstart.sh` now runs in `tools/run-all-suites.sh` and so in `npm test`.
- **Reference signing page (SIGNING.md §2 item 3, §3, clarifications):** every summary is built on the server from the item's machine fields (`describe.mjs`); a supplier's title or summary is shown only as a marked quote. An item that can spend money (a mandate with `max_amount`, an allowance) gets its own tap, and the server refuses a batch that includes one. Also: the authenticator's signature count is tracked, an oversized body is refused at once (413) and open challenges are bounded (429). 53 end-to-end checks, including ones where an item's summary and payload disagree.
- **Conformance runner:** new core check `seat.max_amount` (a door must refuse an act over the seat's cap; at a conformant door no money moves) and, with `--spend <amount> [--spend-args <json>]`, `seat.max_amount_total` and `mandate.max_amount_total` (a conformant door admits exactly one order). A door with its caps switched off fails them (runner tests).
- **SPEC §3.6 (clarification):** a place with a state epoch gives a mandate's `valid_from` no forward skew, so restarting a place kept in memory, however often, never counts a used mandate from zero. The remaining window for a place that lost durable state is stated.
- **SPEC §3.3 (clarification) and SDK:** a representative shows a place's `owner_text` as a quote from the place, shows the `onboarding_url` by its origin and never opens it itself; the SDK's report does so. THREAT-MODEL: a row for leaflet-to-owner phishing, and the worst-case window in which an open seat outlives a card revocation.
- **Docs:** `deploy/SIGNING-PAGE-PLAN.md` reflects the first real-phone session at sign.kigenka.com (October 27) and drops signing on a preview; the doorbell guidance has the front door verify and rate-limit before ringing, and a fixed script pass the agent only verified fields; the key move is described as planned (P24), not existing; platform claims match what was tested; "feature-frozen except for clarifications", with the list in SPEC.md; own-name matching is best-effort; skipped checks are no longer counted as passes; internal message ids removed.

**Licensing (pending legal review)**

- The whole specification (`SPEC.md`, `extensions/`, `conformance/`, `proposals/`, `protocol-shapes.ts`, `THREAT-MODEL.md`) is under the Apache License 2.0, like the code; CC BY 4.0 now covers only the explanatory docs in `docs/`. This fixes a contradiction between the README and NOTICE.
- New: [PATENTS.md](./PATENTS.md) (a draft royalty-free patent commitment, based on OWFa 1.0, for each final specification version; not yet made), [TRADEMARKS.md](./TRADEMARKS.md), [REUSE.toml](./REUSE.toml) and [LICENSES/](./LICENSES/).
- CONTRIBUTING: a rule for AI-assisted contributions (the person signing off is accountable). GOVERNANCE: an intellectual-property section.
- SPDX headers in the specification, the extensions, the SDK sources and the tools; the SDK package now ships NOTICE.

**Signing page: the test-stage notice, and a look-only preview (2026-10-28; no wire change)**

- **Reference signing page:** `NOTICE=test-stage` shows the test-stage notice from `deploy/SIGNING-PAGE-PLAN.md` at the top of every screen, before "Create my passkey", with the page's own address and the advance-notice period (`NOTICE_DAYS`, default 90; the page won't start with less); one line on the done screen; and the full text with its FAQ at `about`. Off by default (`NOTICE=none`), because the wording names Kigenka as the operator. The end-to-end test grew from 36 to 42 checks.
- **`deploy/sign-preview/`:** a static, script-free copy of that page for a separate Vercel preview project, with signing and the browser's passkey feature switched off and the hardening headers set. Prepared, not deployed: the exact deploy and teardown commands, and what needs YSY's OK, are in SIGNING-PAGE-PLAN.md ("Preview deployment"). `tools/run-all-suites.sh` checks the copy hasn't drifted.

**F3: a door card the owner signed (2026-10-28; no wire change)**

- **SDK:** `createDoor({ card, keys: { rep }, ownerRpId, cardRevocations })` presents a "my door" card the owner signed with a passkey. It takes the reference signing page's file as is, one tap (`webauthn.batch`) or one by one. The new `verifyDoorCard()` checks what a door checks for a visitor's card (§2.1–§2.3, §2.6): strict timestamps, the owner's ES256 signature against `owner_binding.rp_id`, the owner binding, the protocol, the dates, the representative key and the door's scope. A tampered or mismatched card throws `SHOKAI_DOOR_CARD_INVALID`, and a withdrawn one throws `SHOKAI_DOOR_CARD_REVOKED`. A verified revocation of the door's own card, delivered in any visit or handed over with `door.withdrawCard()`, closes the running door: an empty listing, and HTTP 503 with an empty envelope. Also new: `door.principalId` and `fromSigningPage()`. `keys.principal` is now optional.
- **Reference door:** a door with an owner-bound card and no principal key signs its notices with its representative key, as a person's door already did.
- New test `packages/shokai/test/doorcard.test.ts` (21 checks; it runs the real signing page with a software authenticator). Docs updated: the SDK README, the Grok Bot skill (steps 4–5), the platforms index, `scenarios/dual-role.md` and the experience notes.

**Names are claims, checked against a real try (2026-10-28; no wire change)**

In the round-4 refusal add-on, Gemini 3.5 Flash Lite was seated at an open bookshop to browse with "Ines Calloway" on a card signed by its own key. A local replay of that try (no model calls) checked every surface that names the visitor. The shop's report home said `the owner with key …M2ctayJ9 (claims to be "Ines Calloway"; not verified)`. Its records and log never stored the name, its replies never used it, and nothing about the visitor reached Ines's representative.

- **Fixed (reference door):** the text a test owner is shown for a peer invitation named the inviter plainly ("Meet Kiran Vale's representative"). It now names them by key, with the name as a claim, both in the host's Appendix B.2 test owner and in the reference server's `answer_invitation`. New scenario check.
- **SPEC §2.1 (clarification):** at a place with no proof of who a counterpart is (a checked domain, a checked established-account proof (P23 draft), or a trusted vouch), a display name is always shown as an unverified claim and grants nothing. **§7.1:** a seat's informative `brand.label` is the visitor's own claim. **§13 item 27:** the reference still echoes it to the visitor with `vendor_warranted: true`; changing that changes golden bytes, so it waits for v0.4. FAQ updated.
- **SDK:** new test `claims.test.ts` (9 checks): the stranger with Ines's name is labelled on every surface, can't spend, and leaves Ines's representative's seat untouched.

**Restarts and recovery (2026-10-27; the wire tag and `spec_ref` are unchanged)**

Found when the field-test computer restarted and rolled its files back a few minutes.

- **Reference door: message ids stay unique across a restart (§2.2 MUST).** A restarted door numbered its replies from `-h1` again, reusing ids it had already sent. A door that restores its state file (or has a `stateEpoch`) now adds a random per-start tag (`enc-…-<tag>-h1`). A door with no state file is unchanged, so the golden traces stay byte-equal.
- **Reference door: an act whose seat was lost in a restart gets a clear courtesy text** ("That visit is no longer open here; it may have been interrupted when the place restarted. Please knock again…", new key `act_seat_gone` in all five locales). The disposition is still `not_a_fit` / `SEAT_SCOPE_EXCEEDED`, as §7.2 requires.
- **Reference door: simulated act references no longer repeat.** With `uniqueActRefs` (the SDK's `Door` sets it), or after a restart, the reference is `<tool>-<msg_id>` instead of `<tool>-<n>`.
- **SDK:** `visit.act()` throws `SHOKAI_PLACE_UNREACHABLE` when the place doesn't answer, and marks the visit `interrupted` (`"unreachable"`, or `"seat_gone"` when the place no longer knows the seat). The report home says which actions weren't carried out and which got no answer, and that the representative will knock again without repeating a purchase it can't confirm. Interrupted actions aren't counted as refused.
- New test `packages/shokai/test/restart.test.ts` (12 checks, including a file rollback: a rolled-back door forgets a revocation until the owner's side delivers it again) and example trace [`examples/traces/restart.mjs`](./examples/traces/restart.mjs), which kills the demo tea house by its exact pid mid-visit.

**rc4 clarifications from a clean-room interop exercise (2026-10-27; the wire tag and `spec_ref` are unchanged)**

- **The visitor names the encounter (§2.2, §2.4, §3.2, §3.5; C197, trace G8).** The place uses the visitor's `encounter_id` in every message and checks the possession proof over it; a visitor that gets a reply in another encounter stops before presenting its card. A clean-room host that minted its own id answered every honest visitor `never`.
- **A lobby reply opens with the place's greeting (§3.3).** **The card order is normative (§3.2):** the visitor presents first; the place presents its card in its reply, once the visitor's has verified.
- **Latent questions answered as the reference behaves:** a new place's state epoch (§3.6); durable act ids at the entry (§3.6); spending under a mandate with no `max_amount`, and the §6.7 order before introductions (§6.7); the empty envelope for a discarded message and `413` as a MAY (§11.1); revocation checks per artifact, and a card revocation that arrives before its card (§2.6); an act whose encounter is gone (§7.2); retrying a refused MCP act (§11.3); seat Money copied exactly, caps not remainders (§6.1).
- **Informative:** who signs what (§2.2 table); what still links per-place identities (§12.3); [what the MCP binding uses from MCP 2026-07-28](./conformance/mcp-2026-07-28-notes.md), and §13 item 26 (the `-32040` code sits in MCP's reserved range; the runner still probes with the earlier `initialize`).
- **SDK and runner:** `visit()` stops on a reply in another encounter; `placeCheck.ok` is false (`unchecked`) when the place answered before showing its card; the MCP gate passes `server/discover` without a seat. `shokai-conformance`: new `ritual.encounter`; `lobby.prose` requires the greeting first; `ritual.grant` fails when a prepared visitor is not seated (except `conditional` / `considering`).
- **Honesty and copy:** the README and docs describe the field tests and the one clean-room implementation as they were, and say what a passkey shows; the seated farewell reads as a welcome; the quickstart shop declares only the data it asks for.

**Round 3 of the clean-room exercise (2026-10-27)**

- SDK: QUICKSTART.md now ships in the package (`spec/QUICKSTART.md`), and the local `/start` page names that path. Round 3's first owner journey found the page pointed to a file the package didn't contain.
- Conformance: new core check `card.revoked_seat` (C198): seat a test owner, deliver its card_revocation, then act in the open seat; the act must be refused deny / not_now with no reason code. A round-2 door without C198 fails it.
- **Revoking a card ends every open seat it holds (§2.6, §7.1, §7.2; C198, normative).** Found by the portability test: an owner moved their representative to a new system and revoked the old card, but the old platform's still-open seat could keep acting until it expired. The reference door ends every open seat of a revoked card when it verifies the revocation; later acts get `deny` / `not_now`, no reason code, retry `with_credential [signed_card]`.
- **Names are claims, never identity (§2.1, §12.1, §12.2; C199, a clarification).** Display names, "on behalf of" names, photos and handles are unverified claims; decisions, relationship records and reports home use the verified identifier and show a self-asserted name only as "claims to be …". The security considerations name look-alike names (homoglyphs, typosquats) and say what Shōkai does and doesn't guarantee. New draft proposal [P23](./proposals/P23-identity-binding.md): identity binding for v0.4.
- **Design principle 2 (informative): your representative is yours**, next to places first (the later principles move down by one).
- **SDK:** an `amount` on an action the listing marks `spends: false` (a quote) no longer counts against the representative's mandate ledger or its report (§5.1; an action the listing doesn't describe still counts). Reports home name a place by the identifier the visit verified (a did:web's domain, or a short key), and its display name only as the place's own unverified claim (`placeLabel`). A door's leaflet link (`onboarding_url`) defaults to `SHOKAI_ONBOARDING_URL`, else the door's own local setup page `<baseUrl>/start`, instead of a placeholder address. The package's `bin` paths no longer start with `./`.

**Round 4 of the clean-room exercise (2026-10-27)**

- **Someone using the owner's own name at the owner's door (§10; C201, a clarification).**
  - By default such a visitor is turned away (`not_now`, `POLICY_DENY`) and asked for an introduction (a vouch), unless one the door counts came with it, so a real namesake can still be introduced. Never `never` for a name alone. Nothing is ever granted for the name.
  - The door now tells its owner at once ("someone used your name here: the owner with key … (claims to be "…"; not verified)").
  - New door-policy setting `own_name_visitors`: `"refuse"` (the default, also when absent) or `"seat_as_stranger"` (opt-in: judge such a visitor exactly as a stranger). Any other value makes the policy invalid.
  - The comparison ignores case, accents, spacing and invisible characters. Look-alike letters from other scripts are still a gap (P23).
  - Found in round 4: a model-played impostor using the owner's name was seated as a stranger, and nothing told the owner.
  - The reference host keeps the alert in `ownerAlerts` and says it in the report home.
- **Draft proposal P25, door status (v0.4; no rc4 change).** Open, closed for now, back at a time, under construction, by appointment, leave a note: a signed hint in the leaflet and the 404 pointer's `here`, never a decision. A note goes to the owner's representative and is never acted on automatically.
  - New reference conformance scenario RC4-N1 (7 checks). The alert is owner-facing and off the wire, so the HTTP runner can't see it.

- **A `GET` at a place's own address names the place (§11.1; C200, a SHOULD in rc4, planned to become a MUST in v0.4).** It is still a `404` with a `DoorPointer`, which should now carry `here`: that place's addresses and `method: "POST"`. It is present for an unlisted door too, since the asker already holds the address, and never names another place; `places` still lists only advertised places (C163). Found in round 4: a plain agent fetched an unlisted door's entry, read a `404` that listed no places as "nobody lives here", and never posted. New conformance check `door.404_here` (core level, but a warning, not a failure, when `here` is absent, since rc4 is feature-frozen); the reference servers and the SDK's `Door.handleHttp` serve it.

- **SDK: an act at a door reports what the door did (§10).** At a §10 door the answer to an offer is a signed `offer_outcome`, not an `act_result`. `Visit.act()` used to return nothing for it and the report home counted the act as refused even when the door kept the offer. It now returns the `offer_outcome`; `accepted` and `kept_for_later` count as done, `declined` and `declined_reported` as refused, and the report says what the door did with each offer ("The door kept it for later (\"Open studio\")").

- **SDK and skills, from two clean-room readers.** New `exportRepresentativeKey` / `importRepresentativeKey`: the key as one line for the system keyring, read back with the same `did:key`; the error never echoes the input. `Representative.isDevelopmentOwner` says when `createRepresentative()` signed its own card with a development stand-in. `signCard` still defaults to 180 days, now documented (the protocol sets no lifetime), and the skills say to pass `validDays: 90`. The skills and the package README name the test stand-in passkey, say where the signing page lives (`reference/signing-page/`, not in the package) and give its no-phone test path, and explain how to keep the key.

- **Grok Bot recipe (docs only; the spec stays platform-neutral).**
  - An optional doorbell: a hosted front door `POST`s to a private webhook routine, which wakes the representative; the representative verifies the Shōkai signatures itself and answers through the inbox.
  - 1Password's approve-each-login and the Vault's approve-each-payment as illustrations of P21 and P22.
  - Import Memory as the context half of portability.
  - An optional established-account proof from the owner's connected X account (P23 B2): it proves control of the account, not a legal identity.
  - Sharing the skill as a Grok Bot template (the skill only, never keys or cards).
  - Keys kept in the system keyring, which Grok Bot's own changelog (0.77.0) says survives a recreated computer (not tested by this project).
- **v0.4 backlog: push.** A narrow front-door key for `held`, push to `reply_to`, and platform wake hooks (platforms index, *Open items*).

**Reference signing page: one tap (2026-10-27, no protocol change)**

- The reference signing page lists every waiting item in plain words, then signs them all with **one passkey assertion** over the batch digest (Appendix A.1, C195, D23, already in the spec); each item gets its own signature copy with `webauthn.batch` and `batch_index`, and verifies on its own. One by one stays as the fallback and for a single item. 15 new checks in `reference/signing-page/test/e2e.mjs` (2 to 16 items, no repeats, nothing unlisted, the exact origin, no replay, each copy verifies alone, a copy can't be moved to another item or position). The Grok Bot experience doc, the dual-role walkthrough and the Grok Bot recipe now say "Face ID once".

**Docs (clarification only, no normative change)**

- **Several cards per representative (§2.3, informative clarification).** The spec never limited how many cards a principal issues or a representative holds; §2.3 now says so: one card per role (its owner's own door, going out) or per place, each signed, scoped and revocable on its own (C198), a place sees only the card shown to it, and accountability stays with the principal (§9.3, §9.4). No rule changed. Cards concept page: *One representative, several cards*.

- **The signing page is a test-stage convenience (2026-10-27).** `deploy/SIGNING-PAGE-PLAN.md` now requires a plain-words notice on Kigenka's signing page: it is early and test-stage; a passkey works only on the address it was made on; if the address ever moves, owners are told in advance and given a way to move to a new key signed with the old one before the old address closes; experts can always sign on their own page or with their own domain key. New FAQ entry. New draft proposal [P24](./proposals/P24-owner-key-move.md) (owner key move, v0.4), with the lost-old-key case stated honestly; SPEC §2.6's informative note points to it. No rule changed.

- THREAT-MODEL section 8, "Does Shōkai stop prompt injection?": what the rules do and don't do against a hijacked agent, each point cited to SPEC.md, with the remaining risk and the owner's mitigations. Linked from the README; a short version in `docs/security.md` and the FAQ.
- Places-first clarity pass (2026-10-27): the README, SPEC.md's informative opening, terminology, principles and story table, the docs (new *How Shōkai works* page, concepts, FAQ, glossary, security, architecture), the deploy guides, the extensions index and the diagrams now lead with places, the host at the door and the visitor's self-introduction (`vouch: null`, already the normal case in §4); vouching is presented as an optional extra, the lobby briefing as the place's leaflet, and Gatherings and Peer meetings as the room inside a place. `scenarios/places-first.md` adds the tea shop as the first walkthrough and (g) the room; `proposals/README.md` lists candidates not yet drafted (a *meishi* exchange in the room). No rule, message or test changed.

## v0.3.0-rc4, 2026-10-27

Gaps found in field tests and an expert-style review. The wire tag stays `shokai/0.3`; `spec_ref.version` is "0.3.0-rc4". New messages and members are additive (`card_revocation`, `owner_link`, `webauthn.batch`); one behaviour is stricter (owner signatures from a cross-origin ceremony are refused).

**Specification**

- Conventions: the full BCP 14 boilerplate; a Terminology section; decision tags point to the new [DECISIONS.md](./DECISIONS.md); the lint path is `tools/trace-lint.mjs`. A References section (§14) pins MCP revision 2026-07-28 for §11.3.
- **Card revocation (§2.6, C191).** A principal-signed `CardRevocation`, delivered by anyone as `card_revocation` or listed at the card's `revocation_url`. A revoked card is `not_now` with no reason code, decided before the possession proof (§2.4 step 3a), so a thief never gets the owner bound. An unreachable list fails closed. Owner key loss: standby revocations (informative), proposal P18.
- **Per-place owner identity (§2.8, C196, D22).** Owner identities are per place and unlinkable by key by default; an `OwnerLink` signed by both passkeys joins two of them for one place, carrying records and nevers.
- **Durable state (§3.6, C192).** A place keeps its ledgers, nonces, nevers and revocations across restarts, or refuses mandates valid before it lost them (`MANDATE_INVALID`).
- **Acts (§7.2).** The check order is fixed (C193): an act with no seat gets the seat's refusal whatever its arguments. Every admitted act counts one operation; a service refusal releases operation and amount together (C194).
- **Owner signing profile (Appendix A.1, C195, D23, D24).** Exact origin; `crossOrigin` absent or false; no `topOrigin`; optional one-tap batches of 2–16 items. New [SIGNING.md](./SIGNING.md) for signing pages.
- §12 is now Security and Privacy Considerations, with normative requirements. §13 adds items 22–25 and calls the hand-written traces illustrative.
- **Feature freeze (2026-10-27).** No new features, members or proposals enter rc4; from here to v0.3.0, changes are for clarity, correctness and packaging only.
- **What to implement.** The spec's first page, the README and the extensions index now say what is core (required), which extensions are stable and which experimental (Teaching visits, Signed place listings, W3C VC mapping), and that proposals are drafts. Each extension states its status.
- **Prose as evidence, never as authority (§6.5, §10; a clarification).** The one place prose is read, an inbound door judging a brand's signed offer, is now explained where the rule lives: fixed checks over the signed bytes, whose result can only lower or cap an offer's outcome and never admit, accept or authorize anything.
- **Golden traces.** G1–G5b and M1, and fixtures F1–F6 and F9, now carry real DIDs, digests and signatures made by the reference code with public test keys (a *Test parties* table lists them); the replay verifies every signature and possession proof, M1's revocation log chain, and every gate digest (§13 item 5 updated). F9's key is now its own visitor's. L1 and H1–H2, and fixtures F7, F8 and F10–F12, followed in the same release: no placeholder bytes remain in the traces. L1's mandate, Seeking reference and card digest, and H1's cards and possession proofs, are checked; the input digests of the decisions no place replays (L1, H1, H2) are of labelled stand-ins.
- Signing-page wording: sign.kigenka.com is opened for guided signing sessions while Shōkai is a draft, with no uptime promise; the reference signing page lets anyone run their own.

**Reference and SDK**

- Reference host: card revocation (delivered and fetched), `durableState()` / `restoreDurable()`, `stateEpoch` refuse-on-loss, `releaseAct()`, OwnerLink verification, batch and cross-origin checks. The reference server persists each place's state and prefetches card revocation lists.
- SDK: `Door` option `stateFile` (memory-only doors refuse mandates older than the door); prefetches the card's `revocation_url`; mandates are valid from the moment of signing (no back-dating). Conformance runner checks `act.order` and `card.revoked`.
- Tests: `v030rc4` (52 checks), SDK state tests (6).
- SDK owner helpers: `signCardRevocation` (and standby), `cardRevocationMessage`, `signOwnerLink`, `passkeyRequest` / `signedFromPasskeyAssertion`, and `@kigenka/shokai/browser` (`signWithPasskey` with a real passkey, WebCrypto only). Tests: owner (12).
- `shokai demo`: a door and a visitor on 127.0.0.1, printed, in about two seconds; `shokai visit <door-url>` for a demo door elsewhere. Tests: demo (7).
- [`reference/signing-page/`](./reference/signing-page/README.md): the reference passkey signing page (SIGNING.md profile, no dependencies), with a software-authenticator test (19).
- Reference pilot server: keeps each place's durable state across restarts and refuses on loss (§3.6), and prefetches card revocation lists from its fetch allow-list only (§2.6). Tests: pilot persistence (6).
- Vectors: `passkey_profile` in `conformance/test-vectors.json` (A.1, C195): crossOrigin false/true, topOrigin, an origin with a port, http, a subdomain, and a one-tap batch with its negatives (12 checks; also run by the conformance runner as `vec.passkey_profile` and against the reference signing page). Generated once by `tools/gen-passkey-profile-vectors.mjs` and frozen.
- SDK MCP gate: releases an act the MCP server did not carry out (JSON-RPC error, `isError` result, 4xx/5xx with no result), operation and amount together (§7.2, C187, C194); `releaseOn` option; SSE responses are not inspected. Tests: gate release (8).
- Golden replay (Part A) runs under real verification: `reference/engawa/test/golden-keys.ts` (the test keys) and `golden-gen.ts` (the regenerator); a new row checks the bytes.
- SDK door fetches: `https` only, and never a loopback, private, link-local or metadata address literal or a `localhost` / `.local` / `.internal` name (a hardening toward proposal P8; refused means unreachable, which fails closed), read for at most 2 seconds and 256 KiB (§12.2 now notes these bounds, informative). Tests: fetch policy (9).
- [`deploy/HOST-A-PLACE.md`](./deploy/HOST-A-PLACE.md): host a real place (stable keys, durable state, limits, a kill switch, egress); `npm run quickstart` now runs its `place.mjs` as written, visits it with the quickstart's scripts and runs conformance against it. The demo place gains `KEY_DIR` (stable keys, `keys.mjs`; 10 checks).
- [`.github/workflows/release.yml`](./.github/workflows/release.yml): publishes on a version tag with provenance, behind a reviewer-gated environment. Not run.
- [`deploy/`](./deploy/DEPLOY.md): a demo place (simulated tea shop; rate limit, body cap, kill switch, durable state; 9 checks), the copy-paste prompt for any agent, and a deployment plan. Nothing is deployed. [RELEASING.md](./RELEASING.md): the package is publish-ready and not published.

**Proposals (not normative)**

- [P18](./proposals/P18-owner-key-continuity.md) owner key continuity; [P19](./proposals/P19-alignment.md) asynchronous alignment (deferred, not before v0.4).
- [P20](./proposals/P20-representative-continuity.md) representative continuity and history (draft; D25 partly decided): full history export as a duty of a Shōkai-compatible agent (memory export SHOULD, envelope only); owner-signed succession that can only add to a record; an optional handover ceremony inspired by *hikitsugi*, in which the retiring representative introduces its successor at places the owner approved, with an optional farewell note and a lineage kept in the owner's history; several representatives per owner; an honest Sybil statement. Continuity is planned as an optional v0.3 extension; place receipts are deferred to v0.4. Sketch vectors checked by `tools/p20-sketch.mjs` (21 checks).
- [DECISIONS.md](./DECISIONS.md): D25 (partly decided) and D26 (rc4 limits accepted as documented).

## v0.3.0-rc3, 2026-10-26

Fixes from a clean-room implementation: a door written from the specification alone, without the reference code, by a sandboxed agent run by the editors (not by another organization). It passed every core check, but it had to guess where the text was silent, and it couldn't offer MCP because the text never defined how. The wire tag stays `shokai/0.3`; `spec_ref.version` is "0.3.0-rc3". Message shapes are unchanged; some answers are now fixed where they were open.

**Specification**

- The MCP binding is normative (§11.3, checks C179–C182). A place that serves seated tools over MCP names its endpoint in its listing (`links` rel `mcp-server`, same origin as the entry). Each `tools/call` carries `Shokai-Act`: a signed act, base64url, whose tool and arguments digest match the call. The gate checks it as an act at the entry, plus ±300 s freshness and single use. `tools/list` with `Shokai-Seat` lists only the seat's tools; without one, the place lists every tool or none, and never refuses the listing. A refusal is HTTP 200 with JSON-RPC `-32040` and `data.shokai` `{refused_by, decision, disposition, reason_code, door, entry, act_decision?}`. A spending tool's `amount` is in the call's arguments, under the act's digest. The "future work" notes in §11 and §13 are gone.
- One message per POST (§11.1, C183): a JSON array or a batch envelope is a malformed body and gets the lobby; nothing inside it is handled.
- A good digest with a bad signature (§2.2, C184) gets the lobby, in a new lobby encounter, and never changes an encounter. Before, it got no reply; only a digest mismatch goes unanswered now.
- `REQUEST_INCOMPLETE` retry (§5.3, C185): always `with_credential [signed_mandate]`, with a table of what to fix for each cause.
- Probing (§9.3, C186): shapes counted per principal across its representatives. The request that makes the Nth shape is answered `never`, and the principal is then bound at that gatekeeper for 180 days. Appendix B.7 lets a place in a conformance run declare `x-test-probing: "off"`; the tester then skips probing checks.
- Price and stated amount (§7.2, C187): the gatekeeper counts the stated amount, never the price. The service never charges more, may charge less, and reports its own refusal as the act's result, not an `act_decision`.
- Mandate cross-checks (§5.1, C188), all `MANDATE_INVALID`:
  - a mandate for another `card_id`;
  - `counterparties` that leave out the place;
  - a non-spending purpose with `max_amount`.

  Also defined: a request in another currency gets a conditional `lower_limit`, and `per_operation` applies only when the mandate says so.
- Act refusals (§7.2, C189) now have fixed reason codes:
  - unknown seat or a tool outside the seat → `not_a_fit` / `SEAT_SCOPE_EXCEEDED`;
  - expired seat or limits used up → `not_now` / `SEAT_SCOPE_EXCEEDED`;
  - missing amount → `REQUEST_INCOMPLETE`;
  - someone else's encounter → the outsider `RITUAL_ORDER` deny.
- The encounter lifecycle (new §3.5, C190): after a grant, deny or considering, another request is `RITUAL_ORDER`, and the seat lives on.
- Gate-input and relationship digests are local to each gatekeeper and never compared across places (§6.4).
- One-sentence clarifications for the small things the implementer had to decide:
  - what `to` is checked against, freshness, exact redelivery, key mismatch, and that nonce reuse binds nothing;
  - lobby addressing and the place's greeting (no `in_reply_to`);
  - the outsider deny's shape, `not_a_fit` for policy, codes on a conditional, `locale_match` fallback vs none;
  - seat fields and lifetime, `PlaceListing.door`, the onboarding URL, the inbox body.
- C55 no longer requires a `visit_receipt` (it is optional in the core, §3.3).
- Editorial: stale "Appendix A.4/A.5" references now point to A.1 and the vectors' `key_derivation`; B.6 no longer links a document outside the bundle; the golden traces and the types name the current version.

**Conformance runner (`shokai-conformance`)**

- MCP checks (`mcp.*`). They run when the listing advertises an endpoint, or when one is named with `--mcp <url>`; otherwise they are skipped.
- New core checks: `body.batch`, `lobby.bad_signature`, `neg.bad_signature`, `request.incomplete`, `mandate.cross`, `seat.unknown`, `lifecycle.again`, `neg.probing`.
- The verdict is the core's. Extension failures are reported on their own and never print "NOT CONFORMANT". Exit codes:
  - 0: conformant;
  - 1: a core failure;
  - 3: only an extension failed.
- The `--vectors` `implementation` interface is documented, in `--help` and the types. `isTimestamp` and `isMoney` are now called with one argument, not as array callbacks.
- The runner turns off its own representative-side checks, so `seat.outside` and `seat.no_spend` test the door. Before, the SDK's local seat check could refuse the act first.

**SDK (`@kigenka/shokai` 0.3.0-rc.3)**

- `shokaiGate` adds the `mcp-server` link to the place's listing, unless the place already lists one or passes `advertise: false`.
- The reference door answers a bad signature with the lobby (C184).
- New tests:
  - reference suite `v030rc3` (33 checks);
  - runner tests against the gated toy server, a gate that checks nothing, and a gate with no freshness window.

**Tooling**

- `tools/check-links-versions.mjs` runs in CI and in `npm test`. It checks that every relative link in the specification bundle resolves inside the bundle, and that every current-version string names the same version.

## v0.3.0-rc2, 2026-10-26

Fixes from the first field test, in which an outside agent with only the docs and the SDK package set up a representative and visited a place. The wire tag stays `shokai/0.3`; `spec_ref.version` is "0.3.0-rc2".

**Specification**

- How an act states its amount (§7.2, check C174): a spending act carries `amount` (`{value, currency}`, exact decimals), which the door counts against the seat's cap. A door MUST refuse a spending act with no amount (`not_now` / `REQUEST_INCOMPLETE`, retry `with_credential [signed_mandate]`), so an act can't spend uncounted.
- A mandate's limits bind across visits (§5.1, check C175): a door counts each mandate's operations and amounts across every seat granted under it and refuses an act that would pass them (`SEAT_SCOPE_EXCEEDED`), even in a new seat. Presenting a mandate again never renews it.
- The representative's mandate ledger (§5.1, §8.2, check C176): a representative keeps a ledger per mandate, doesn't attempt an act beyond what remains, and reports every act done under a mandate; a report covers every visit under it (`VisitReport.under_mandate`, new optional member).
- An amount in another currency (§7.2, check C177): an act whose amount is in another currency than the seat's (or mandate's) cap is refused `not_now` / `SEAT_SCOPE_EXCEEDED`, never `REQUEST_INCOMPLETE` (an amount was stated), and counts nothing. No new reason code.
- What was brought back (§8.2, check C178): a report SHOULD list each signed object received and kept for the owner, such as a visit stamp (`VisitReport.brought_back`, new optional member: the envelope or its digest, the signer, whether it verified against the listed principal). `taken_home` stays for matters awaiting the owner's decision.
- Visit reports (§8.2): new optional members `spent` (the exact sum of the spending acts' amounts) and `shared` (what left the owner's side: the card, the mandate, each act's arguments). An informative note: when nothing is pending, the next step says so.

**SDK (`@kigenka/shokai` 0.3.0-rc.2)**

- `visit()` checks the place against the listing entry it followed before it sends any request (§3.1, C104): every reply must be signed by the listed representative, and the place's card must be signed by the listed principal, name that representative and prove possession over this visit's nonce. On a mismatch the visit ends with nothing asked; `visit.placeCheck` says why.
- `visit()` takes `limits` (for example `max_amount`) and `mandate: { statement, validSeconds }`; the mandate it signs defaults to one day, not thirty. `signMandate` takes `validSeconds`.
- `report(locale, { timeZone })`: an owner-readable outcome (what was granted, what was done and refused, what was spent of what was allowed), `spent`, `shared`, the owner's time zone, and a next step that doesn't ask for approval when nothing is pending.
- A per-mandate ledger (`rep.ledger`, `memoryLedger`, `fileLedger`): a second `visit()` for the same errand presents the mandate the representative already holds; `useMandate` and `mandate: { fresh: true }` choose otherwise. An act beyond what's left of the mandate isn't sent. `report()` covers every visit under the mandate (`under_mandate`).
- What comes home: a signed object a tool returns (a visit stamp) is kept in `visit.broughtBack`, verified against the listing's principal, and reported in `report().brought_back` (envelope, or `{ broughtBack: "reference" }` for the digest) and in the readable text; `visit.keep()` adds one by hand.
- Checked before sending: the representative checks the seat's tool allowlist (`visit.checkSeatLocally`, default on) as well as what remains of the mandate (`visit.checkMandateLocally`, default on) and doesn't send an act that wouldn't fit. A currency mismatch is named as such.
- Refusal messages: every MCP gate refusal is still JSON-RPC −32040 (now also exported as `SHOKAI_REFUSED`), but each class has its own message (only a call with no seat is told "get a seat first"), and `data.shokai` carries `refused_by` and `reason_code`. `actRefusalMessage()` is exported.
- `shokai-conformance` with a URL and `--vectors` ends with a line saying the vectors say nothing about the door.
- `shokai-conformance` checks that a mandate's limits bind across visits (`seat.mandate_across`, using `max_operations` on a non-spending action, so nothing is bought).
- `@kigenka/shokai/core` resolves (it was missing its index).
- The specification ships in the package, in `spec/`, and a compiled example in `dist/examples/`.
- `shokai-conformance` checks the place against its listing (`ritual.place_id`), and says when `--vectors` ran on its own crypto rather than the door's.

**Reference code**

- The reference door refuses a spending act with no amount (C174).
- The reference door counts each mandate's use across seats (C175).
- A reference test for a currency mismatch (C177).

**Docs**

- The specification, the types, the conformance checklist, the extensions, the threat model and the changelog are rendered in the docs site, and the quickstart is the docs' quickstart page.
- New: which purpose to ask for (`visitation`, `inquiry`, `purchase`), asking for a spending limit, what a listing entry carries (`needs`, `spends`, `data_asks`), checking the place, open tool listings, that the farewell ends the ritual and not the seat, what a report says was shared, the conformance levels and what the runner covers, `rel` values as free-form hints, and how a visitor's principal links its visits.
- The quickstart uses `visitation`, adds a visit that spends within a limit, installs from the package file, and links only to files a reader has.
- Places shouldn't copy an MCP client's label (`clientInfo.name`) into anything they sign.
- New: a visitor path in the quickstart (visiting a place someone else runs), `name` vs `display_name` and the base URL vs the listing, a mandate's limits across visits, what a report covers, and the visit stamp as a place pattern (its result, its fields, and checking it against the listing's principal).
- From the red-team pass: the quickstart's tools are `menu.view` throughout; the trailing slash on a base URL; what a passing `--vectors` section means against a URL; card scope vs mandate; what each refusal says and how to test a door's own enforcement; the stamp's `agent_name` argument; that stamp serials count place-wide; and what a report lists as brought back.

## v0.3.0-rc1, 2026-10-26

The first public release candidate.

**Breaking**

- The protocol is named **Shōkai**. The wire tag is `shokai/0.3`; earlier drafts used a working name and a different wire tag. Cards signed under the earlier drafts must be re-signed.
- Sections are renumbered into the order of a visit: Arrive (§3), Introduce (§4), Ask (§5), Answer (§6), Act within limits (§7), Report home (§8), Conduct has consequences (§9), the inbound door (§10), the HTTP binding (§11). Appendix D maps the old numbers to the new ones.
- The specification is a small **core** plus eleven optional **extensions** (Gatherings, Peer meetings, Teaching visits, Profiles and evidence, Seeking, Visit receipts, Door gifts, Signed place listings, Revocation status, Meaning notes, W3C VC mapping), each with its own conformance level.

**Specification**

- Declared data asks: each action in a place's listing SHOULD say what personal data it will ask for (`data_asks`, §3.1, check C172).
- A lobby's `visit_receipt` is optional.
- Lobby templates and the sincere-approach heuristics are informative (Appendix C).
- Inbound-door defaults decided: reputation stays local, brands learn only the outcome code, paid introductions get no extra priority, no shared track records, hidden text is shown behind a visible marker, and reason categories are given except for reported declines (§13 item 19).
- Security considerations (§12) are backed by a STRIDE [threat model](./THREAT-MODEL.md).

**New**

- `@kigenka/shokai`, the TypeScript SDK: signed cards, mandates, vouches and envelopes; doors and representatives; visit reports; and `@kigenka/shokai/mcp`, a gate that puts a Shōkai door in front of any MCP server.
- `shokai-conformance`, a conformance runner for any door: core HTTP checks tagged by scenario, opt-in extension checks and the test vectors.
- [QUICKSTART.md](./QUICKSTART.md): a door and a visit in about five minutes.
- Contributor documents: CONTRIBUTING (DCO), GOVERNANCE, SECURITY, CODE_OF_CONDUCT; CI for every suite and the quickstart.

**Tested**

- 814 conformance and scenario checks across the reference place server, the narrated prototype and the HTTP binding pass (2 deferred checks are skipped); every normative statement is traced to a scenario, a golden trace or a check.
- Two red-team rounds: 72 of 72 and 44 of 47 attacks held. The three that don't are browsing by many agents or owners, which stays open by design (see the threat model).

## v0.1 to v0.2.10, October 2026

Pre-release drafts under an earlier working name: the scenario catalog, the normative specification, five rounds of clean-room testing by testers who saw only the specification, the HTTP binding, a local pilot, two red-team rounds and the inbound door. SPEC Appendix D maps their section numbers.
