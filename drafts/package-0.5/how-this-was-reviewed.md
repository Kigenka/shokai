> **Draft (0.5).** Labelled so it is not mistaken for a shipped product or a 1.0 claim.

# How this was reviewed (v0.5.0)

*Shōkai, the agent introduction protocol, from Kigenka. All times are Pacific Time.*

**First, the plain truth.** This is **not an independent human security audit.** Every review below was a language model reading a bundle the project prepared, or a test the project ran. The scores are the models' own. No outside organization has reviewed or implemented Shōkai yet. If you do, please tell us and we'll list it here.

## How the rounds worked

1. **Clean-room model reviews.** Each round gave one fresh model call (Claude Opus 5.5 for reviews 1–9b; Claude Opus 4.5 for review 10) a bundle — the spec, extensions, conformance maps, threat model, testing notes, attack-harness results and a fresh-clone verify log — and asked for scores and findings by severity. Reviewers saw no earlier review unless noted.
2. **Fix, then review again.** Findings were fixed by hand between rounds, with tests. Fix checks re-judged only the earlier blockers.
3. **Outside model reviews of the package and repository** (ChatGPT Pro, Gemini, Fable 5.1), November 4–5.
4. **Live doors.** The field tests ([Field tests 0.5](./field-tests-0.5.md)) checked behaviour against real agents; the door's log is ground truth, not the agent's summary.

Severity scale used by the reviewers: Critical breaks a core guarantee such as spend limits or authentication; High is a likely security, interop or adoption failure; Medium is a real defect with bounded impact.

## Scores

Overall readiness, out of 10, against a mature-standards bar (the reviewers' own words and numbers):

| Review | Date | Overall | Highs |
|---|---|---|---|
| 1 | Nov 4 | 4 | 7 (SHK-01 to SHK-07) |
| 2 (re-review) | Nov 4 | 5 | 3 |
| 3 | Nov 4 | 5 | 3 |
| 4 | Nov 4 | 4 | 4 |
| 4, fix check 1 | Nov 4 | — | 2 new |
| 4, fix check 2 | Nov 4 | — | 2 new |
| 5 | Nov 5 | 5 | 2 |
| 6 | Nov 5 | 5 | 3 |
| 7 | Nov 5 | 6 | 1 |
| 8 | Nov 5 | 5 | 1 |
| 9 | Nov 5 | 5 | 1 |
| 9b (confirmation) | Nov 5 | 7 (security 7) | 0 — "release-clear" |
| 10 (delta) | Nov 5 | not scored | 0 — "clear with notes" |
| Fable 5.1, second review | Nov 5 | 7.0 across site, package and repository | 1 |
| ChatGPT Pro, round 2 | Nov 5 | overall score not recorded as a number in the project files we have (four Highs, later recorded as fixed) | 4 |
| Gemini, round 2 | Nov 5 | overall score not recorded as a number in the project files we have | High count not recorded as a number in the project files we have |

Review 2's breakdown, as one example: clarity 4, security 7, testability 6, interoperability 4, adoptability 3. The scores did not climb steadily; fresh reviewers kept finding new things, which is the point of using fresh ones.

## Every High, and how it was fixed

**Review 1 (Nov 4)**
- **SHK-01** JSON parser differences could let an MCP call bypass the counted amount → one canonical I-JSON reading before verification and budget counting (C284).
- **SHK-02** penalty rules turned honest setup mistakes into 180-day bans → graduated penalties: honest errors warn and retry; only signed misconduct escalates (C288).
- **SHK-03** no must-understand marker; undefined unknown enum values → `crit` and unknown-value rules (C289).
- **SHK-04** visitor-chosen URLs fetched before trust → normative SSRF rules for door fetches (C285).
- **SHK-05** allowance spending had no cap at a single place → host-enforced per-place and per-visit cap with a ledger (C286).
- **SHK-06** free principals defeated per-principal limits → limits that count free principals: introduction-code guessing, seat caps (C287).
- **SHK-07** the core wasn't minimal; "provisional" MUSTs had no conformance meaning → a minimal core plus named extensions, conformance classes and a status vocabulary.

**Review 2 (re-review)**
- **RR-01** core MUSTs depended on an optional extension → owner passkey signatures and durable state are core.
- **RR-02** checks assigned to the wrong class or role → re-homed checks; trace-lint now fails on class drift.
- **RR-03** `POLICY_DENY` counted toward probing → probing counts only `conditional` and `MANDATE_SCOPE_EXCEEDED`; honest refusals never lead to `never`.

**Review 3**
- **R3-01** relay (unknown-key-share) → the 0.5 possession proof is signed over the encounter, nonce and the door's own audience.
- **R3-02** two conformance maps contradicted each other → one source of truth (`classes.json`), drift fails the check.
- **R3-03** Core Door (browse) contradictory → a small, consistent Core Door definition.

**Review 4 and its fix checks**
- **R4-01** `crit` made opt-in extensions mandatory → `crit` scoped to members critical to the artefact's own class. Closed.
- **R4-02** Core Door defined inconsistently; example not conformant → one definition; example rewritten. Fix checks found it partly closed; later repairs below.
- **R4-03** class claims unestablishable → `na` with a stated basis and a `--claim` flag; claims fail on any fail, skip or zero checks.
- **R4-04** audience-bound proof had no byte-exact vector → new vectors and a recorded 0.5 trace.
- **NEW-1** (fix check 1) example door banned honest visitors permanently → expiry and appeal; probing narrowed.
- **NEW-2** (fix check 1) revocations not bound to the card's principal → bound; full store fails closed.
- **N1** (fix check 2) revocation-store poisoning could shut a door → bounded per principal and in total; failing closed only stops new seats.
- **N2** (fix check 2) unbounded encounter state and an O(N) copied-proof scan → scan limited to the sender's own encounters; encounters bounded.

**Review 5**
- **R5-01** the revocation store could be filled to close a door to all newcomers → bounded per principal (16) and in total, never door-wide.
- **R5-02** concurrent holds let an owner approve against a false total → at most one over-limit hold per seat.

**Review 6**
- **R6-01** 180-day `never` only reachable by honest key holders → no presentation check binds a card's principal; setup failures are `not_now`.
- **R6-02** the anonymous rate cap could lock out all newcomers by default → the total anonymous cap is now a MAY.
- **R6-03** misspelled action names counted as probing → probing counts only listed actions outside both mandate and card, with its own answer; guessed action names never count.

**Review 7**
- **R7-01** visitor-side MUSTs tagged with door-role checks → roles follow who each MUST binds.

**Review 8**
- **R8-01** an over-limit hold reserved only the operation, not the amount → the hold reserves its amount against the seat and mandate ledgers; release re-checks.

**Review 9**
- **R9-01** a superseding mandate could be presented as a fresh seat mandate → refused as a seat mandate (`MANDATE_INVALID`); valid only for its bound hold. Review 9b confirmed: no High left.

**Outside reviews (Nov 5)**
- **ChatGPT Pro, four Highs**, all fixed with tests (`round2-guards.test.ts`): sender-mismatched envelopes skipped the anonymous limit; newcomer budget and seat caps were exported but not wired; the encounter cap could evict a closed encounter with a live pass; the inbound boundary measured re-serialised JSON, buffered unbounded bodies and decoded UTF-8 leniently.
- **Fable 5.1, one High**: a development passkey could slip through `setBaseUrl()` → reserved `rp_id`s are judged from the door's current address on every card.

## What stays open

- Review 9b's four mediums (R9b-01 multi-instance hold/release; R9b-02 `current` vs the binding ledger; R9b-03 superseding-mandate refusal on every seat path; R9b-04 exact `MANDATE_INVALID` assertions), as written in internal operator review records (not shipped in this preview), **were closed locally on 9 November 2026 (late evening, Pacific Time)**. Evidence: `packages/shokai/test/instances.test.ts` (hold on A, intervening act on B refused with `SEAT_SCOPE_EXCEEDED`, release once only at `proposed` on C); `docs/SPEC-DETAIL.md` §7.3 and §13 item 36; `packages/shokai/test/r8-overlimit-ceiling.test.ts` (cross-visit release, pinned `MANDATE_INVALID` / `not_now` / `with_credential [signed_mandate]`, customer-link and retry paths); seating choke point in `reference/engawa/src/host.ts` `onRequest` (synced to `packages/shokai/src/core/host.ts`). (R9b-05, the used-raise recording order, was already recorded as fixed.)
- Review 10's two mediums, as written in internal operator review records (not shipped in this preview), **were closed locally on the same pass**. M1: §7.3 now says the used-raise write MUST be durable before the release response; `Door.postParsed` already calls `save()` / `persist()` before returning the envelope. M2: `limitRequestProblem` returns an error if `mandateCurrent` is omitted when `req.mandate` is present.
- Three accepted spec-level attack cases (S1, S2, S4), open by design and recorded in the red-team rounds.
- An outside, human review. That is the gap that matters most.

## 9 November 2026 (local, unpublished)

These are project records and later model reviews, not a human audit. The five statuses are only: signed, appointed, deployed, validated, publicly open. These are project conventions, not specification keywords. **validated** means every measured required Core Door check in the named official run passed (0 fail, 0 skip among those measured) and must be written with the measured/unmeasured counts — for the 12:13 AM Pacific Time, 10 November 2026 Kettle run on conf6, **30 of 164 measured, 28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240), 132 unmeasured**. **publicly open** is an intentional public opening; a reachable URL or `/healthz open=true` is not that status.

- **C296 on hosted Kettle.** Failed-claim backoff now persists in the door's existing store (`liveState`). After a conf4 promote the same day, a signed fictional visitor (Pip Calder) saw `RATE_LIMITED` after a failed claim. Status of that door: **deployed**, not **publicly open**.
- **Kettle host-key custody.** The fictional door runs unattended as a serverless function on Vercel. At request time it loads only the place representative key (`KETTLE_REP_KEY`) from the project's production environment, plus the already-signed host card. The place principal key was removed from the production environment on 2026-11-09 (evening, Pacific Time); owner approvals already come from the owner's passkey at sign.kigenka.com. Parties who can use the representative key: the function at request time; the project operator; members of the Vercel team that owns the project; the hosting platform operator, Vercel; and anyone else with production environment access. An operator-machine 0600 copy of the principal key remains as an offline stand-in and is not in the function bundle. The production door-state store is Upstash. Its write credential can rewrite `never` bindings, probing-window shapes, revocations and spend ledgers; it is not place signing, and the store does not hold the signing keys. Parties who can use that credential: the function; the project operator; members of the Vercel team that owns the project (the write credential is in the production environment, which that team can read); Vercel, which operates that environment; and Upstash as a second platform operator. That is door uptime, not a lasting host; it fails the lasting-host bar in [Known gaps](../../docs/known-gaps.md). The remaining representative-key and store-credential exposures are also recorded in `THREAT-MODEL.md` §9.7. The representative key was not rotated. Suzu is named on the hung card; this package does not claim the status **appointed** for Suzu.
- **Clean-room door.** A spec-only clean-room (a model given only the handoff documents, not an outside organization) built a loopback browse door (Quillfern Tea Room). That is not independent proof of the four in-process checks (those are implementer-provided tests, run by the runner). On 2026-11-09, under the runner from before official C300/C301 HTTP rows (v050.ts sha-256 `861f01646dcfed7bfab5f32c8449201cd89f648064822a04966ac6c2f0615deb`), `--claim "Core Door"` with implementer evidence exited 0 (historical count: 50 of the class's checks ran, a pre-unique-id / pre-row figure). Under the current rules — H1(f) is a normative MUST NOT dated 2026-11-09, not a clarification — Quillfern fails C301. A loopback re-run at 11:11 PM Pacific Time on 9 November 2026 under the current pinned runner (`v050.ts` sha-256 `cbc9708dd84e188f10a4aa271211d9db60759d48a007ab33b445ef6740e0dbf5`; record operator-held clean-room runner record (not shipped in this preview)) still failed C301 (`types=lobby_briefing,invitation_response,farewell; spec_ref=0.5.0; visitor_invitation_response=1`) and the Core Door claim is not established. An earlier official unique-id result at 7:02 PM Pacific Time was recorded under the r5 runner (`v050.ts` sha-256 `2e0367d86354183f3d38b24646e87aac00f6056560a0312b008f84294ce256e7`). See operator-held clean-room report (not shipped in this preview).
- **C301 wording.** Editor decision H1(f), dated 2026-11-09, is a normative rule change: the version-mismatch lobby is that lobby only (MUST NOT also send a visitor `invitation_response` in the visitor's encounter). The H1(f) sentence itself does not name `in_reply_to`. The official runner implements "the visitor's encounter" as an `invitation_response` whose `encounter_id` is this visit's encounter or whose `in_reply_to` names this `invitation_request`. That test is what separates a Kettle-local PASS from a Quillfern FAIL. The byte-identical H1(f) sentence was not rewritten in this pass.
- **Reviews r3 and r4.** Fresh model reviews of the unpublished package are in internal operator review records (not shipped in this preview) and internal operator review records (not shipped in this preview). They are model reviews, not a human audit. Reviewer scores are not our claims.
- **Claim counting (r5).** "N of SIZE checks in the class" is unique check ids, not result rows (a class of one check with three rows is "1 of 1", never "3 of 1"). The claim line now separates checks this run measured, checks cited by black-box HTTP results, checks measured only by implementer-provided in-process tests, and checks not measured at all. SKIP rows whose checks belong to another class are explained and do not count as this class's skips.
- **Suite totals.** The "core 1684/1684" headline is the in-process suite homes (`tools/run-all-suites.sh` / `tools/suite-split.mjs`). Official HTTP runner rows, including C300 and C301, are reported separately in the black-box fernwood run and are not added into that in-process total.
- **Deployed and validated Kettle vs this tree.** The public door runs the conf6 tarball promoted 2026-11-09 at about 11:51 PM Pacific Time (`dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq`, sha-256 `c68c75e7548cd591d7fe7e47cd897a1dea547db08c13eb1d177f14e631518c13`). Production no longer holds the place principal key. The official paced HTTP run at 12:13 AM Pacific Time, 10 November 2026, measured **30 of 164** Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240)): 30 pass, 0 fail, 0 skip, 2 N/A (C241, a visiting representative's duty; C242, the templates aren't closed). **132 of 164** were unmeasured (not cited in this run; self-asserted or not URL-reachable). The claim HOLDS. <!-- public-validated-label: held pending YSY go; scoped to Core Door on conf6 --> Status: **deployed** and **validated** for Core Door on conf6 (project convention; see [Known gaps](../../docs/known-gaps.md)) (**30 of 164 measured, 28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240), 132 unmeasured**); not **publicly open**. Pinned results: operator-held pinned official-run results (not shipped in this preview); see [Known gaps](../../docs/known-gaps.md). The previous conf5 HOLD on `dpl_9H2iWykWyePEWHGQjp1v4PkTGms2` remains historical.
  Method, said plainly: the official runner presented pre-signed owner material signed by passkey at sign.kigenka.com (`--visitor-fixtures`); it never minted a development owner or fake-signed. Group A in-process evidence (C236 config refusals, C240 passkey counters; also backing C234 / C238) ran under `--accept-evidence-exec` and is labelled implementer-provided, not independent verification. A single-use material audit listed which fixtures a run consumes (spent mandates, already-revoked cards, leftover probing / `never` state). Host-side scoped compare-and-set clears of this principal's `never` binding and probing-window shapes were used both to set up the golden run's preconditions (store version 999→1000 at 10:21:05 PM Pacific Time, 9 November 2026; golden pre-check then saw version 1000) and to restore the door after it (store version 1153→1154 at 10:40:56 PM). Those clears used the production Upstash write credential; they are not place signing. Earlier official runs of the same build skipped or failed because of leftover spend on reused mandates, leftover probing-window shapes, an inferred `never` binding from an earlier probing pass, a runner that ran `neg.probing` too early, missing `v050.one_card` / `v050.size` rows, and an already-revoked throwaway card on C198; those were diagnosed and measured again with fresh material.
- **kigenka-sign `card_revocation`.** `sign.kigenka.com` `POST /api/visitor/prepare` now accepts a `card_revocation` item (`card_id`, `revoked_at`; `principal_id` forced to `$OWNER_DID`). Host cards are still refused. Deployed to the kigenka-sign production project as `dpl_5SHJrRhcSfNJALyAsB8By7LGFJw5` (rollback `dpl_31Q7k17dFYP9LpezfrgMnMomW3ft`). Smoke-tested only the same evening. That was a signing-site deploy, not a Kettle door redeploy. See internal operator signing-service notes (not shipped in this preview).
- **Review r5 and r6.** Further local fix passes and model reviews are in internal operator review records (not shipped in this preview) and internal operator review records (not shipped in this preview). r6 disclosure findings were applied locally before a prepared r7 pack. Still not a human audit.
