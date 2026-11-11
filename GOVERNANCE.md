# Governance

*Living document, written for v0.5.0. This document will change as the project grows. Changes to it follow the process below.*

## Stewardship today

**Kigenka stewards Shōkai for now.** One **editor** acting for Kigenka (see [MAINTAINERS.md](./MAINTAINERS.md)) has final say on the specification, the conformance suite and the reference code. Many young protocols start this way. Stewardship is meant to be temporary: the section "Path to a neutral home" says when and how it ends.

The editor:

- merges or declines pull requests and proposals, and gives the reason for each;
- records every normative decision in the changelog;
- ships a release only when every conformance suite and the trace lint pass.

Maintainers who aren't the editor may merge editorial fixes, tests and reference-code changes that don't change normative behavior.

## Proposals

- **Numbers.** Every normative change starts as a proposal numbered P1, P2, … in [proposals/](./proposals/README.md). A number is never reused.
- **Status labels.** Each proposal shows exactly one status:
  - **Draft:** being written; not ready for review.
  - **Proposed:** ready for review; discussion is open.
  - **Accepted:** the editor agreed to it; it isn't in `SPEC.md` yet.
  - **Adopted:** merged into `SPEC.md` or an extension; the status names the section and the version.
  - **Withdrawn:** dropped by its author or declined by the editor, with the reason. It is kept for the record.

  A proposal may be adopted in part; its status then says which parts.
- **Discussion.** It stays open for at least **14 days** for normative changes and 7 days for editorial ones. Security fixes may come first and be discussed after (see [SECURITY.md](./SECURITY.md)).
- **Recording a decision.** When a proposal becomes Accepted, Adopted or Withdrawn, the editor:
  - updates its status line and the table in `proposals/README.md`;
  - adds a line to the version's entry in [CHANGELOG.md](./CHANGELOG.md), naming the proposal number, the sections changed and any new conformance checks.

  A proposal is not normative until it is Adopted and listed in the changelog.

## Conformance and versions

- **Conformance.** Every MUST and SHOULD in `SPEC.md` is tied to a check in `conformance/golden-traces.md`, and the trace lint enforces this. An implementation is conformant to a version when it passes that version's core suite. Extensions have their own levels.
- **Versions.** Before 1.0, a minor version (0.x) may break compatibility; each break is listed in the changelog with a migration note. A release candidate (`-rcN`) may still gain rules found in review. A final release freezes its text, and later fixes go into a new version.
- **Wire tag.** Each version names the wire tag it sends (for example `shokai/0.5`). When the tag changes, the specification states a **transition window**: receivers keep accepting the previous tag until a date stated in the changelog (90 days after release for v0.5.0, §11.1). Replies use the tag of the message they answer. After the window ends, a receiver may refuse the old tag.

## Security

Report security problems privately, as [SECURITY.md](./SECURITY.md) explains. Contact: **security@kigenka.com**. Please don't use the issue tracker.

## Path to a neutral home

Kigenka's stewardship is meant to end in a neutral home for Shōkai. Nothing below has been agreed with any organization.

**Triggers.** The editor will start the steps below when any of these holds:

- two or more independent implementations interoperate and pass the core conformance suite;
- at least three regular maintainers who don't work for Kigenka;
- several adopters, from different organizations, run Shōkai doors or representatives in production.

**Steps.**

1. **Open call for maintainers.** A public call, with a written way to join.
2. **Charter.** A short charter, proposed in a pull request to this file. It sets up a steering group of 3 to 7 people from different organizations, with no organization holding a majority. Decisions are made by lazy consensus, falling back to a two-thirds vote, and meeting notes are public.
3. **Terms for trademarks and IP.** Written terms for moving what the project itself holds to the new home: the repository and its hosting, the Shōkai protocol name (word mark) and a designated Shōkai protocol logo, with their goodwill, the copyright the rights holder owns in the project's own work, the role of patent-commitment signer for future versions, the spec contributor agreement records, and the project's domains and package scopes for the protocol. **What does not move:** contributors' own copyrights (they stay with the contributors, under the licenses already granted), patent commitments already made by independent signers (they stay as made), licenses already granted to the public (they can't be withdrawn), and **the Kigenka name, logo, commercial brand and services**, which are expressly reserved and stay with their owner (TRADEMARKS.md).
4. **Choose a home.** Pick a neutral foundation by the charter's process. The leading candidate is the Joint Development Foundation (a Linux Foundation family home for open specifications); talks would start once two or more independent organizations implement Shōkai. Nothing has been discussed or agreed with it.
5. **Move.** Transfer under the agreed terms, and update NOTICE, TRADEMARKS.md, PATENTS.md and this file in one pull request.

Each step is a governance change. It is proposed in a pull request to this file and decided under the process above.

## Intellectual property

*Kigenka is the project's steward brand. It is not yet a registered legal entity, so the copyright holder and licensor is the person named in [NOTICE](./NOTICE).*

**IP status (governing statement).** Shōkai's specification and reference implementation are presently available under Apache License 2.0. The project intends to add a specification-level patent commitment under the OWFa 1.0 Final Specification Agreement (Patent Only), made per final version, starting with v0.5.0, with Yu Sung Yeh (the copyright holder and current founder-steward) as the intended signer; the copyright license stays Apache License 2.0. No such commitment has been executed yet. If the project later moves to a legal entity or a neutral home, later versions may be signed by it, as described in [PATENTS.md](./PATENTS.md); the choice is recorded as decision D27 in [DECISIONS.md](./DECISIONS.md), pending the editor's confirmation and legal review. No existing copyright or patent owner is represented as having made an OWFa commitment merely because the specification has been published. **Scope of a future commitment.** Under OWFa 1.0, a signer's Granted Claims are limited to the patent claims needed to implement the functionality the specification describes (§7.4). A commitment does not reach a signer's whole personal patent portfolio, or claims that are not needed for the specification.

- **Licenses.** Code and the whole specification are under the Apache License 2.0; explanatory documentation in `docs/` is under CC BY 4.0, except the normative `docs/SPEC-DETAIL.md` (Apache-2.0) (see [NOTICE](./NOTICE) and [REUSE.toml](./REUSE.toml)).
- **Copyright.** Contributors keep the copyright in their contributions and license them under those licenses by signing off ([CONTRIBUTING.md](./CONTRIBUTING.md)). There is no copyright assignment. Code, tests, tools and documentation need only the DCO sign-off. Normative specification changes will need the OWF Contributor License Agreement 1.0 (Copyright and Patent) once counsel approves it; until then the project accepts no outside changes to normative files. The copyright holder named in NOTICE holds the copyright in the project's own work, under the Kigenka brand.
- **Patents.** Each contributor's patent license comes from Apache License 2.0 §3. The intended royalty-free patent commitment for final specification versions (OWFa 1.0 Patent Only, intended signer Yu Sung Yeh; not executed; see the statement above) is described in [PATENTS.md](./PATENTS.md); it is made per version, and an entry is added there when it is.
- **Names and logo.** The Shōkai and Kigenka names and the arch-and-keystone logo are used for the project under the Kigenka brand (held by the copyright holder named in NOTICE until Kigenka is formed), under [TRADEMARKS.md](./TRADEMARKS.md). They aren't registered.
- **Changing a license.** A license change is a governance change: it is proposed in a pull request and decided under the process above, with at least **30 days** of discussion. Because contributors keep their copyright and no agreement lets the project relicense their work, relicensing existing contributions also needs the consent of their contributors. A license change never applies retroactively to versions already published.
- **Forming Kigenka.** Kigenka is revisited for incorporation before material operational risk: real money, or a guided signing service for outside users. Who signs a patent commitment is decided through neutral stewardship and legal review, not by forming Kigenka.
- **Moving to a foundation.** See "Path to a neutral home" above. The foundation's intellectual-property policy then replaces this section.

## Code of conduct

Everyone in project spaces follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Conduct reports go to the contact listed there, not to the issue tracker.
