# Contributing to Shōkai

Thank you for looking at Shōkai. It's at v0.3.0, not 1.0, so review is the most useful contribution right now: read the specification, try to implement it, and tell us where it's unclear or unsafe.

## Ways to help

- **Open an issue** for anything unclear, contradictory or unsafe. Quote the section (for example "§6.7") and, if you can, the conformance check involved (for example "C151").
- **Implement it** from [`SPEC.md`](./SPEC.md) alone, run the conformance runner against your door (`npx shokai-conformance <url>`), and tell us where you had to guess. An independent implementation is the strongest review there is.
- **Propose a change.** Small fixes can be a pull request. A change to normative behaviour starts as a proposal in [`proposals/`](./proposals/): copy the shape of an existing one (problem, proposal, open questions) and open a pull request with it.
- **Report a vulnerability privately.** See [SECURITY.md](./SECURITY.md); please don't open a public issue for it.

- **Ask or discuss** in GitHub Discussions: questions, ideas, and what you built.

## Getting started

You need Node.js 20 or later (CI runs 20, 22 and 24) and git.

```bash
git clone https://github.com/<your-username>/shokai.git   # your fork of github.com/Kigenka/shokai
cd shokai
npm run setup        # installs the reference place, the prototype, the SDK and the schema tools
npm test             # every suite: vectors, golden traces, scenarios, HTTP, SDK, conformance runner, JSON Schema
git checkout -b my-change
```

Useful commands while you work:

| Command | What it checks |
|---|---|
| `npm run trace-lint` | Every MUST/SHOULD in SPEC.md and the extensions is tagged to a scenario, trace or check |
| `npm run trace-typecheck` | Every golden trace typechecks against `protocol-shapes.ts` |
| `npm run schema` / `npm run check-schema` | Regenerates `schema/v<version>/schema.json` from `protocol-shapes.ts` / checks it is current and that the golden traces validate |
| `npm run check-links` | Links stay inside the spec bundles; every version marker agrees |
| `npm run quickstart` | Runs QUICKSTART.md as written, in a fresh temp directory |
| `cd packages/shokai && npm test` | The SDK and the conformance runner |

### Where things live

- **The specification:** `SPEC.md` (normative), `extensions/`, `SIGNING.md`; the wire types in `protocol-shapes.ts`, and the JSON Schema generated from them in `schema/`. Don't edit `schema/` by hand.
- **Conformance:** `conformance/` (golden traces, test vectors, the checklist); the runner is in `packages/shokai/src/conformance/`.
- **The SDK:** `packages/shokai/`. Its `src/core/` and `spec/` are copied from the reference and the root by `scripts/sync-core.mjs`: edit the originals, then run `npm run sync` in `packages/shokai`.
- **Reference implementations:** `reference/engawa/` (the place server whose core the SDK ships), `reference/prototype/`, `reference/signing-page/`.
- **Proposals:** `proposals/`, numbered, not normative until merged into the spec.

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin 1.1](./DCO.txt) instead of a contributor license agreement. Each commit must carry a sign-off line stating that you wrote the change or otherwise have the right to submit it under the project's licenses:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it for you. Use your real name (sorry, no anonymous contributions). Pull requests whose commits aren't all signed off can't be merged.

## Licenses

- **Code and the whole specification** (the reference implementations, the SDK, tools and tests, plus `SPEC.md`, `extensions/`, `conformance/`, `proposals/`, `protocol-shapes.ts` and `THREAT-MODEL.md`): [Apache License 2.0](./LICENSE), including its patent licence (§3).
- **Explanatory documentation** (`docs/`): [Creative Commons Attribution 4.0](./LICENSE-docs).
- [`REUSE.toml`](./REUSE.toml) maps every path to its license; the license texts are in [`LICENSES/`](./LICENSES/).

By signing off, you agree that your contribution is licensed under the license that applies to the files you change. The copyright holder's royalty-free patent commitment for final specification versions is described in [PATENTS.md](./PATENTS.md) (a draft; its wording is pending legal review), and the use of the project's names and logo in [TRADEMARKS.md](./TRADEMARKS.md).

New source files start with a short header (use `#` instead of `//` in shell and Python files, and an HTML comment in specification Markdown):

```
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
```

To check licensing information locally, run [`reuse lint`](https://reuse.software/) (for example `pipx run reuse lint`). It isn't part of CI yet, because CI would have to download the tool on every run.

## AI-assisted contributions

You may use AI tools (code assistants, agents, language models) to help write code, specification text, tests or documentation. The rules are the same as for any other contribution:

- **The person who signs off is accountable.** Your `Signed-off-by:` line is your DCO statement for the whole contribution, including any part an AI tool produced. An AI tool can't sign off, and a sign-off can't name one.
- **Review it as your own.** Read, understand and test everything you submit. Don't submit output you couldn't explain in review.
- **Only submit what you have the right to license.** Don't submit material that reproduces third-party code or text you don't have the right to contribute under the project's licenses, or that your tool's terms don't let you contribute.
- **Say so when it's substantial.** If an AI tool wrote a substantial part of a change, mention it in the pull request description (for example "drafted with an AI assistant, reviewed and tested by me"). This helps reviewers; it doesn't change who is accountable.
- Fictional examples and the no-secrets rule below apply to AI output too.

## Rules for spec changes

- Every new MUST or SHOULD carries at least one tag: a scenario (`[SC-…]`), a golden trace (`[G…]`) or a conformance check (`[C…]`). `npm run trace-lint` must report 0 gaps.
- Golden traces must still typecheck (`npm run trace-typecheck`).
- Behaviour changes come with tests in the reference implementation (`reference/engawa/test/`) and, if they're visible on the wire, a conformance check.
- Add an entry to [`CHANGELOG.md`](./CHANGELOG.md) under "Unreleased".

## Pull requests

- Keep each pull request to one topic.
- Run `npm test` at the repository root before you push (see the README for setup). CI runs the same checks.
- Use fictional people, businesses and places, and example domains (`*.example`), in examples and tests. Real technologies and standards (MCP, OAuth, passkeys/WebAuthn, payment or bank-data services and so on) may be named when they're described accurately as existing infrastructure. Don't imply that any real company endorses, partners with or behaves in a certain way in Shōkai.
- Never commit keys, tokens, `.env` files, local state or personal data.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). How decisions are made is described in [GOVERNANCE.md](./GOVERNANCE.md).
