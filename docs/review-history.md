# Review history

*Shōkai, the agent introduction protocol, from Kigenka. Every review the project has had so far, who or what did it, what it found, and what changed. Published so you can weigh the evidence yourself. All times are Pacific Time.*

**The short version.** Shōkai has been reviewed and tested hard, but almost entirely **inside the project**: by its author, by agents the author ran, and by language models asked to review it cold. **No outside organization has reviewed it or implemented it yet.** That is the most important gap, and the reason v0.3.0 is not 1.0. If you review or implement it, please [tell us](https://github.com/Kigenka/shokai/issues/new/choose); your report will be listed here.

## The releases

| Version | Date | What it was |
|---|---|---|
| v0.1 to v0.2.10 | October 2026 | Drafts, before the public release line |
| v0.3.0-rc1 | 2026-10-26 | First release candidate of the 0.3 line |
| v0.3.0-rc2 | 2026-10-26 | Fixes from field tests 2 to 4 (limits across visits, amounts, reports) |
| v0.3.0-rc3 | 2026-10-26 | The normative MCP binding (§11.3) and rules the clean-room implementation had to guess |
| v0.3.0-rc4 | 2026-10-27 | Card revocation, durable state, the act check order; feature freeze |
| **v0.3.0** | **2026-10-28** | **The release: rc4's text with its clarifications, no wire change; published to npm as `@kigenka/shokai@0.3.0`** |

Every change is in the [CHANGELOG](../CHANGELOG.md).

## 1. Adversarial rounds against the reference door

Two scripted red-team rounds against the reference place server, rerun for v0.3.0-rc1, on loopback with fictional people and fresh keys: round 1 held 72 of 72 attacks; round 2 held 44 of 47, and the 3 that succeed (browsing by many agents or owners) are open by design. Details, and why those three stay open: [security/redteam](../security/redteam/README.md) and the [threat model](../THREAT-MODEL.md).

## 2. Field tests with outside agents

Eight tests from October 25 to 28, 2026: cold developers on Hermes Agent and OpenClaw, probe runs against the door, an independent implementation from the spec alone, Muse as a cold visitor, and two passkey-signing sessions with the author's own passkey. Full report, including costs, what broke and what changed: **[Field tests](./field-tests.md)**.

## 3. A clean-room implementation from the specification alone

Part of the field tests (test 5, October 26): a sandboxed agent built a door for a fictional bookshop from the v0.3.0-rc2 text and the conformance runner only, with no Shōkai code. It passed 24 of 24 core checks and interoperated with the SDK, and its 60 notes led to rc3: the normative MCP binding (§11.3) and rules C184 to C189 for what it had to guess. It was directed by the project, so it isn't independent in the sense that matters most.

## 4. Cold reviews by language models (October 27)

The author asked models to review the project cold, as "a veteran reviewer of internet protocols and developer platforms", from the main documents, a newcomer's cold run and the release state, and to "be honest and specific; do not inflate". Each review was one request through a model router; the scores are the models' own.

| Round | Time | Model | Overall readiness | Cost (USD) |
|---|---|---|---|---|
| 1 | 2:30 AM | DeepSeek V3.2 | 4 / 10 | 0.023 |
| 1 | 2:30 AM | Gemini 3.8 Flash | 5.8 / 10 | 0.065 |
| 2 | 2:51 AM | DeepSeek V3.2 | 6.5 / 10 | 0.029 |
| 2 | 2:51 AM | Gemini 3.8 Flash | 6.5 / 10 | 0.080 |

**What they agreed was strong:** the specification's traceability (every MUST and SHOULD tied to a scenario, a trace or a check), the threat model and its honesty about what Shōkai doesn't prevent, the deterministic decision (signed facts and policy, never prose), the test discipline, and the clear position next to MCP, A2A, OAuth and the Personal Agent Protocol.

**What they ranked as the biggest gaps, and where each stands now:**

| Gap the reviewers named | Where it stands at v0.3.0 |
|---|---|
| The package isn't on npm; nobody outside can try it | **Closed.** `@kigenka/shokai@0.3.0` is on npm (October 28): `npx @kigenka/shokai demo` |
| No public door to test a visitor against | Open. The demo place is ready to host ([deploy/HOST-A-PLACE.md](../deploy/HOST-A-PLACE.md)) but not deployed |
| No independent implementation or outside review | Open. The most important one; see the top of this page |
| Owner key continuity: a lost passkey means a new identity | Open. Proposals [P18](../proposals/P18-owner-key-continuity.md) and [P24](../proposals/P24-owner-key-move.md), for v0.4 |
| Some golden traces used placeholder identifiers | **Closed** in rc4: every hand-written trace carries real DIDs, digests and signatures from public test keys |
| Too many extensions for a first release | Answered, not changed: the core stands alone, and each extension is optional and claimed separately ([What to implement](../README.md#what-to-implement-core-extensions-proposals)) |
| English-first heuristics in the inbound door's pressure checks | Open, recorded in SPEC §13 |
| Defaults left to each place (how long a "considering" answer lasts) | Open, recorded in SPEC §13 |

## 5. Can any agent follow it? (October 27)

A local test of the copy-and-paste prompt for "visit a demo door": small, cheap models (Gemini 3.5 Flash Lite and GPT-5.4 mini) given only the prompt and one command they may run. Each reached a visit and a report home in under 3 seconds of model time, for about 0.002 USD a run. What it found: the first prompt leaked the expected answer (fixed), and a cheap model still embellished the door's greeting in its summary (a model trait, so recorded demos quote the output verbatim).

## Limits of all of the above

- **Inside the project.** The author wrote the specification, the SDK, the test places, the briefs and the probe suites.
- **Model reviews are not expert reviews.** They read what they were given, quickly, and can be confidently wrong. We publish their scores because they were low at first, not because they prove anything.
- **Small numbers.** One run per agent and model, mostly over two days.

## What would change this page

An implementation from another organization, a review by someone who has worked on IETF, W3C, OAuth, WebAuthn or MCP specifications, or a human red team. Each will be listed here with its findings, whatever they are.

*Author: YSY*
