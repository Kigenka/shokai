# Governance

*Draft for v0.3.0. This document will change as the project grows; changes to it follow the process below.*

## Today: a single editor

Shōkai is maintained by Kigenka. Like many young protocols (the Model Context Protocol began the same way), it starts with a single **editor** who has final say on what goes into the specification and the reference code (a "benevolent dictator" model). The editor:

- merges or declines pull requests and proposals, and explains each decision in the pull request or proposal;
- records every normative decision in the changelog, with the proposal it came from;
- keeps the specification, the conformance suite and the reference implementations in step: a release ships only when all conformance suites and the trace lint pass.

Maintainers who aren't the editor may review and merge editorial fixes, tests and reference-code changes that don't change normative behaviour.

## How a change is decided

1. Open an issue or a proposal (see [CONTRIBUTING.md](./CONTRIBUTING.md)).
2. Discussion stays open for at least **14 days** for normative changes (7 days for editorial ones), unless it fixes a security problem.
3. The editor decides and records the reason. Security fixes may be made first and discussed after, through the process in [SECURITY.md](./SECURITY.md).

## Versions

- Before 1.0, minor versions (0.x) may break compatibility. Each break is listed in the changelog with a migration note.
- Release candidates (`-rcN`) are for review. Before v0.3.0 a release candidate may still gain rules for gaps found in review or field tests (rc4 did); each change is listed in the changelog. The final release freezes the text for its version.

## Tomorrow: a steering group

When there are **at least three independent implementations** that pass the core conformance suite, or **at least five regular contributors from at least three organizations**, the editor will propose a steering group:

- 3 to 7 members from different organizations, with no single organization holding a majority;
- decisions by lazy consensus, falling back to a two-thirds vote;
- an open, written process for joining, and public meeting notes;
- moving the project to a neutral foundation will be considered at that point.

The move itself is a governance change: it is proposed in a pull request to this file and decided under the process above.

## Intellectual property

*Kigenka is the project's steward brand. It is not yet a registered legal entity, so the copyright holder and licensor is Yu Sung Yeh (see [NOTICE](./NOTICE)). The rights may be assigned to Kigenka once it is formed.*

- **Licenses.** Code and the whole specification are under the Apache License 2.0; explanatory documentation in `docs/` is under CC BY 4.0 (see [NOTICE](./NOTICE) and [REUSE.toml](./REUSE.toml)).
- **Copyright.** Contributors keep the copyright in their contributions and license them under those licenses by signing off ([CONTRIBUTING.md](./CONTRIBUTING.md)). There is no contributor license agreement and no copyright assignment. Yu Sung Yeh holds the copyright in the project's own work, under the Kigenka brand.
- **Patents.** Each contributor's patent licence comes from Apache License 2.0 §3. The copyright holder's royalty-free patent commitment for final specification versions is described in [PATENTS.md](./PATENTS.md); it is made per version, and an entry is added there when it is.
- **Names and logo.** The Shōkai and Kigenka names and the arch-and-keystone logo are used for the project under the Kigenka brand (held by Yu Sung Yeh until Kigenka is formed), under [TRADEMARKS.md](./TRADEMARKS.md). They aren't registered.
- **Changing a license.** A license change is a governance change: it is proposed in a pull request and decided under the process above, with at least **30 days** of discussion. Because there is no contributor license agreement, relicensing existing contributions also needs the consent of their contributors. A license change never applies retroactively to versions already published.
- **Forming Kigenka.** If Kigenka is formed as a legal entity, the copyright, the names and logo and the role of patent-commitment signer may be assigned to it; the notices are then updated in one pull request.
- **Moving to a foundation.** If the project moves to a neutral foundation, the move includes the repository, the names and logo, and the published patent commitments, and the foundation's intellectual-property policy then replaces this section.

## Code of conduct

Everyone in project spaces follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Conduct reports go to security@kigenka.com (the contact listed there), not to the issue tracker.
