<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing `@kigenka/shokai`

Status: **v0.3.0 is published** (`@kigenka/shokai@0.3.0`, dist-tag `latest`, October 28, 2026, 11:59 AM PDT), by the editor from a laptop, without provenance. Its tarball: sha256 `f4b12f8dc722db2fcaf9110ab9eb372478311b5c5e3f4086d6ae883ebfc0d515`, npm shasum `fa3ac40e9c0a6fcae497d7003fb2476ca2e05e62`, 85 files. Every publish is taken only with the editor's explicit approval.

## The package

- `packages/shokai/package.json`: name `@kigenka/shokai`, version `0.3.0`, author YSY, Apache-2.0, `files` limited to `dist/src`, `dist/examples`, `conformance-data`, `spec`, `README.md`, `LICENSE`, `NOTICE`; bins `shokai` (`demo`, `visit`, `conformance`, `--version`) and `shokai-conformance`; `publishConfig` `{ access: public, provenance: true, tag: latest }`.
- `repository`, `homepage` and `bugs` point to `github.com/Kigenka/shokai` (from the release after 0.3.0; 0.3.0 was published without them while the repository was private). npm compares `repository.url` with the publishing workflow's repository, case-sensitively: keep `Kigenka` capitalised.
- Markdown links in the package's `spec/` that point at repository files the package doesn't ship are rewritten by `scripts/sync-core.mjs` to the same file at this version's tag (`https://github.com/Kigenka/shokai/blob/v<version>/…`), so they work on npmjs.com and in `node_modules`. Push the tag with the release.
- `"private": true` stays in the repository as the safety catch; it is removed only in the working copy that publishes (by hand for the first publish, by the approved release job after that).
- `prepack` checks the core is in sync with the reference, wipes `dist/` and builds, so the package never carries stale files or tests.
- `npm pack` gives 85 files, about 434 kB packed and 1.5 MB unpacked (as of 2026-10-28), with no dependencies (the MCP SDK is an optional peer). The packed file installs in an empty folder and `npx shokai demo` runs in about two seconds.

## The first publish (done): from a laptop, without provenance

The repository was private, and npm provenance needs a public repository and a cloud CI runner, so the first publish of v0.3.0 was made by the editor from a laptop with `--provenance=false`. `publishConfig.provenance` stays `true` for later publishes from CI. Kept here as the record, and as the fallback if CI is unavailable.

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
2. The release job removes `"private": true` in its own working copy just before `npm publish` (done in `release.yml`).
3. Confirm the npm scope `@kigenka` belongs to Kigenka, with two-factor auth on every owner account.
4. `repository`, `homepage` and `bugs` are in `package.json` (done).
5. On npm, add a trusted publisher for the package: GitHub Actions, organization `Kigenka`, repository `shokai`, workflow `release.yml`, environment `npm-publish`.
6. In the repository settings, create the `npm-publish` environment with a required reviewer (the editor), so a pushed tag still waits for a person.

[`.github/workflows/release.yml`](.github/workflows/release.yml) publishes on a version tag. It checks the tag matches the package version, runs every suite and the quickstart, runs `shokai demo` from the packed file in an empty folder, then removes `"private"` and runs `npm publish --provenance --access public` (the dist-tag from `publishConfig`). A version that is already on npm (such as 0.3.0, when its tag is pushed) is skipped, so pushing `v0.3.0` publishes nothing. It needs Node 22 and npm 11.5.1 or later for trusted publishing.

```bash
git tag v0.3.1 && git push origin v0.3.1      # for example; then approve the npm-publish environment in GitHub
```

**A CI build may not hash the same as a local one.** The workflow builds the package again (`prepack` wipes `dist/` and compiles); with another npm or compression library the tarball's bytes can differ even when its contents don't. Compare the file list and contents (`npm pack --dry-run`, or unpack both and diff), not only the hash.

## Check after publishing

```bash
cd "$(mktemp -d)" && npx @kigenka/shokai@0.3.0 --version && npx @kigenka/shokai demo && npm view @kigenka/shokai dist-tags
```
