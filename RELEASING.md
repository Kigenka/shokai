<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing `@kigenka/shokai`

Status for v0.3.0: **prepared, not published.** Publishing is one step, taken only with the editor's explicit approval.

## What is ready

- `packages/shokai/package.json`: name `@kigenka/shokai`, version `0.3.0`, author YSY, Apache-2.0, `files` limited to `dist/src`, `dist/examples`, `conformance-data`, `spec`, `README.md`, `LICENSE`, `NOTICE`; bins `shokai` (`demo`, `visit`, `conformance`, `--version`) and `shokai-conformance`; `publishConfig` `{ access: public, provenance: true, tag: latest }`.
- No `repository`, `homepage` or `bugs` links yet: the repository is private, so they would be dead links on the npm page. Add them back when it is public (step 4 below).
- `"private": true` stays in the repository as the safety catch; it is removed only in the working copy that publishes.
- `prepack` checks the core is in sync with the reference, wipes `dist/` and builds, so the package never carries stale files or tests.
- `npm pack` gives 85 files, about 434 kB packed and 1.5 MB unpacked (as of 2026-10-28), with no dependencies (the MCP SDK is an optional peer). The packed file installs in an empty folder and `npx shokai demo` runs in about two seconds.

## The first publish: from a laptop, without provenance

The repository is private, and npm provenance needs a public repository and a cloud CI runner, so the first publish of v0.3.0 is made by the editor from a laptop with `--provenance=false`. `publishConfig.provenance` stays `true` for later publishes from CI.

1. Confirm the npm scope `@kigenka` belongs to Kigenka (the editor's account owns the organization), with two-factor auth on every owner account.
2. `npm login` (the editor, in their own terminal; npm asks for the second factor).
3. From a clean checkout of the release commit:

```bash
cd packages/shokai
npm ci && npm test                       # sync check, typecheck, every SDK test, conformance self-test
npm pkg delete private                   # the safety catch, in this working copy only; don't commit it
npm publish --provenance=false --access public --tag latest   # npm asks for the one-time code
git checkout package.json                # put the safety catch back
```

## Later publishes: from CI, with provenance (once the repository is public)

1. **Make `github.com/Kigenka/shokai` public.** npm provenance is only generated for packages published from a public repository, by a cloud-hosted CI runner.
2. Remove `"private": true` from `packages/shokai/package.json` in the release commit, or have the workflow remove it.
3. Confirm the npm scope `@kigenka` belongs to Kigenka, with two-factor auth on every owner account.
4. Add `repository` (`{ "type": "git", "url": "git+https://github.com/Kigenka/shokai.git", "directory": "packages/shokai" }`), `homepage` and `bugs` back to `package.json`. npm compares `repository.url` with the publishing workflow's repository, case-sensitively: keep `Kigenka` capitalised.
5. On npm, add a trusted publisher for the package: GitHub Actions, organization `Kigenka`, repository `shokai`, workflow `release.yml`, environment `npm-publish`.
6. In the repository settings, create the `npm-publish` environment with a required reviewer (the editor), so a pushed tag still waits for a person.

[`.github/workflows/release.yml`](.github/workflows/release.yml) publishes on a version tag. It checks the tag matches the package version, runs every suite and the quickstart, runs `shokai demo` from the packed file in an empty folder, then runs `npm publish --provenance --access public` (the dist-tag from `publishConfig`). It needs Node 22 and npm 11.5.1 or later for trusted publishing.

```bash
git tag v0.3.1 && git push origin v0.3.1      # for example; then approve the npm-publish environment in GitHub
```

**A CI build won't hash the same as a local one.** The workflow builds the package again (`prepack` wipes `dist/` and compiles), so its tarball's sha256 differs from a tarball packed locally. Compare the file list and contents (`npm pack --dry-run`, or unpack both and diff), not the hash.

## Check after publishing

```bash
cd "$(mktemp -d)" && npx @kigenka/shokai@0.3.0 --version && npx @kigenka/shokai demo && npm view @kigenka/shokai dist-tags
```
