<!-- SPDX-License-Identifier: Apache-2.0 -->
# Releasing `@kigenka/shokai`

Status: **v0.5.1 is packed and not yet published** (`release/kigenka-shokai-0.5.1.tgz`, sha256 `e8a407fc2431464103eae23fc14eae64da1ffe6c704c300259a3fd538255dfa4`, 195 files; specification v0.5.0, wire tag `shokai/0.5`). It waits for the editor's go; see the 0.5.1 checklist below. **v0.5.0 is published** (`@kigenka/shokai@0.5.0`, dist-tag `latest`, 2026-11-11T03:26:30.293Z / 7:26:30 PM PT on 10 November 2026, America/Los_Angeles), by the editor from a laptop, without provenance (`--provenance=false --tag latest`). Its tarball: sha256 `259b414dfe78beb5a50a5b87a5c66c505dca73e2f34d6889622600904c22143b`, npm shasum `5575c9588a5144442e8f53b2fad74e2890d86e26`. **v0.3.0** remains on the registry (published October 28, 2026, 11:59 AM PDT; sha256 `f4b12f8dc722db2fcaf9110ab9eb372478311b5c5e3f4086d6ae883ebfc0d515`). Every publish is taken only with the editor's explicit approval.

## The package

- `packages/shokai/package.json`: name `@kigenka/shokai`, version `0.5.1` (packed, not yet published; `0.5.0` is `latest` on npm until 0.5.1 is published), author the editor, Apache-2.0. `files`: `dist/src`, `src` (the TypeScript sources ship), `dist/examples`, `conformance-data`, `agent-install` (the agent install guide and manifest ship), `spec`, `README.md`, `LICENSE`, `NOTICE`. Bins: `shokai` (`demo`, `visit`, `conformance`, `detect`, `house`, `init`, `host-card`, `--version`) and `shokai-conformance`. `publishConfig`: `{ access: public, provenance: true, tag: latest }`.
- **One source of truth for publish-day facts:** [`release/release-status.json`](release/release-status.json) holds the version, wire tag, dist-tag, npm status (`unpublished` or `published`), the latest version on npm and the tarball's sha256. `tools/pack-release.sh` writes the version and sha256; the site build reads the file for its status strings and digest; `tools/check-links-versions.mjs` (CI and the release job) fails if any repository Markdown file, the package README, the agent install guide, the site pages (when the site is checked out; `SHOKAI_REQUIRE_SITE=1` makes their absence a failure), the sidecar `.sha256`, `publishConfig.tag` or the CHANGELOG disagree with it.
- `repository`, `homepage` and `bugs` point to `github.com/Kigenka/shokai`. npm compares `repository.url` with the publishing workflow's repository, case-sensitively: keep `Kigenka` capitalized.
- Markdown links in the package's `spec/` that point at repository files the package doesn't ship are rewritten by `scripts/sync-core.mjs` to the same file at this version's tag (`https://github.com/Kigenka/shokai/blob/v<version>/…`). Push the tag with the release.
- `"private": true` stays in the repository's `package.json` as the safety catch. **`tools/pack-release.sh` removes it** (and the `prepack` script) in a temporary copy before `npm pack`; the release job never edits `package.json`, it only **asserts** that the tarball it publishes has no `private` and the right version.
- `prepack` (in the repository copy) checks the core is in sync with the reference and builds.
- `npm test` in `packages/shokai` runs only inside this repository: `scripts/sync-core.mjs` reads `reference/engawa/src`, and `scripts/test-total.mjs` runs `examples/traces/university.mjs`. From the installed package, run `npx --no-install shokai-conformance --self-test` instead.
- `tools/pack-release.sh` gives 195 files (0.5.1) (TypeScript sources included), with no dependencies (the MCP SDK is an optional peer). The packed file installs in an empty folder and `npx --no-install shokai demo` runs in about two seconds.

## The first publish (done): from a laptop, without provenance

The repository was private, and npm provenance needs a public repository and a cloud CI runner, so the first publish of v0.3.0 was made by the editor from a laptop with `--provenance=false`. `publishConfig.provenance` stays `true` for later publishes from CI. Kept here as the record, and as the fallback if CI is unavailable.

1. Confirm the npm scope `@kigenka` belongs to Kigenka (The editor's account owns the organization), with two-factor auth on every owner account.
2. `npm login` (The editor, in their own terminal; npm asks for the second factor).
3. From a clean checkout of the release commit:

```bash
cd packages/shokai
npm ci && npm test                       # sync check, typecheck, every SDK test, conformance self-test
npm pkg delete private                   # the safety catch, in this working copy only; don't commit it
npm publish --provenance=false --access public --tag latest   # npm asks for the one-time code
git checkout package.json                # put the safety catch back
```

## Later publishes: from CI, with provenance

1. **The repository `github.com/Kigenka/shokai` is public.** npm provenance is only generated for packages published from a public repository, by a cloud-hosted CI runner. The v0.5.0 package was published from a laptop without provenance; later publishes can use CI.
2. The release job publishes the committed tarball, which `tools/pack-release.sh` already packed without `"private"`; the job only asserts that (it never edits `package.json`).
3. Confirm the npm scope `@kigenka` belongs to Kigenka, with two-factor auth on every owner account.
4. `repository`, `homepage` and `bugs` are in `package.json` (done).
5. On npm, add a trusted publisher for the package: GitHub Actions, organization `Kigenka`, repository `shokai`, workflow `release.yml`, environment `npm-publish`.
6. In the repository settings, create the `npm-publish` environment with a required reviewer (The editor), so a pushed tag still waits for a person.

[`.github/workflows/release.yml`](.github/workflows/release.yml) publishes on a version tag. It checks the tag matches the package version, runs every suite and the quickstart, runs `shokai demo` from the packed file in an empty folder, then checks that `release/kigenka-shokai-<version>.tgz` matches its committed `.sha256` (the same file the site hosts), runs `shokai demo` from it, runs `tools/check-links-versions.mjs`, and publishes **that exact file** with `npm publish <tgz> --provenance --access public --tag <dist-tag>`. The dist-tag is `dist_tag` in `release/release-status.json` (`latest` for 0.5.0), or the `dist_tag` input when the workflow is run by hand on a tag; the job refuses anything but `latest`, `next`, `beta` or `rc`. A version that is already on npm (such as 0.5.0, when its tag is pushed) is skipped, so pushing `v0.5.0` after the laptop publish republishes nothing. It needs Node 22 and npm 11.5.1 or later for trusted publishing.

```bash
git tag v0.3.1 && git push origin v0.3.1      # for example; then approve the npm-publish environment in GitHub
```

**One artefact.** The release tarball is packed once, by `tools/pack-release.sh` (a copy of the package without `"private"`), committed under `release/` with its sha256, and hosted unchanged on the site. CI never repacks it for publishing, so the npm tarball and the site tarball are byte-identical. Provenance therefore attests *who published it and from which commit*, not that CI built it; the build itself is checked by the full test run and the demo from that file; `npm view @kigenka/shokai@<v> dist.integrity` can be checked against the file.

## Check after publishing

```bash
cd "$(mktemp -d)" && npm install @kigenka/shokai@0.5.0 && npx --no-install shokai --version && npx --no-install shokai demo && npm view @kigenka/shokai dist-tags   # expect latest: 0.5.0
```

## Publish-day checklist for 0.5.0 (run only when the editor says go)

1. Editor decisions H1–H3 are accepted (CHANGELOG). Record the 0.5.0 release date; the `shokai/0.3` window runs at least 90 days from it and is never shortened (H2).
2. `bash tools/pack-release.sh` once more if anything in the package changed; commit `release/` (tarball, `.sha256`, `release-status.json`). `npm test`, `SHOKAI_QUICKSTART_TGZ=release/kigenka-shokai-0.5.0.tgz bash tools/verify-quickstart.sh` (the walkthrough against the committed file) and, with the site checked out and built, `SHOKAI_REQUIRE_SITE=1 node tools/check-links-versions.mjs` pass. The release job runs the walkthrough against the committed tarball too, but it has no site checkout: site identity is checked by the site build's tarball gate and by this local run, not by the release job.
3. **Publish a clean history, never the private one as-is.** The private history contains unlabeled workshop/test key files (`workshop/desk/*.json`, PKCS#8) that were later removed from the tree and gitignored; publishing that history unchanged would ship them. Before the repository is made public, either push a fresh history (`git checkout --orphan public-v0.5.0 && git add -A && git commit`, or a fresh `git init` of the release tree) or rewrite it (`git filter-repo --path workshop --path-glob '**/desk/*.json' --path-glob '*.pkcs8' --invert-paths`). Then check the history you will push is clean, and stop if either command prints anything:

   ```bash
   git log --all --name-only --format= | grep -E '(^|/)workshop/|/desk/[^/]*\.json$|\.pkcs8$' | sort -u
   git grep -nE 'BEGIN (ENCRYPTED )?PRIVATE KEY|"pkcs8"|privateKeyPkcs8' $(git rev-list --all) -- . | head
   ```

4. Dist-tag: `release-status.json` says `"dist_tag": "latest"`. v0.5.0 was published from a laptop under that tag. Make the public repository match this tree (from the clean history of step 3), then tag `v0.5.0` for the GitHub Release; the release workflow will skip republishing a version that is already on npm.
5. Check the registry has the same bytes: `curl -fsSL "$(npm view @kigenka/shokai@0.5.0 dist.tarball)" | sha256sum` must print `release-status.json`'s sha256; record it and `npm view @kigenka/shokai@0.5.0 dist.integrity` on the Releases page. Read the release date from `npm view @kigenka/shokai time.0.5.0` (authoritative, H2) and mirror it, with the window's end date (+90 days), in CHANGELOG.md, the GitHub Release notes and the Releases page.
6. **Flip the status in one place:** set `"npm_status": "published"` in `release/release-status.json`, rebuild the site (its nav, hero and release pages read the file) and run `node tools/check-links-versions.mjs`: it fails on any repository Markdown file (CHANGELOG.md and docs/review-history.md, the history, aside), package doc or site page still saying 0.5.0 is pending.
7. **Run the Quickstart from the public path** on a clean machine (Linux and macOS): `npm install @kigenka/shokai@0.5.0`, then `QUICKSTART.md` steps 1–6 as written, and `bash tools/verify-quickstart.sh` online. This is the first run from the public path (v0.5.0's earlier runs used the package file); record the result on the Releases page.
8. 0.5.0 was published directly under `latest` (`"latest_on_npm": "0.5.0"`, `"dist_tag": "latest"`). For a later 0.5.x, keep `publishConfig.tag` in agreement with `release-status.json`.

## Publish-day checklist for 0.5.1 (run only when the editor says go)

0.5.1 is a package patch release. The specification stays v0.5.0: `spec_ref.version` is still `"0.5.0"`, the wire tag is still `shokai/0.5`, and the JSON Schema keeps its id. The package adds the optional `retry.until` and `retry.appeal` members on a binding `never`, and one MUST rule (SPEC-DETAIL §6.12). See CHANGELOG.md, v0.5.1.

1. `bash tools/pack-release.sh` once more if anything in the package changed, and commit `release/` (tarball, `.sha256`, `release-status.json`). Run `bash tools/verify.sh`, `SHOKAI_QUICKSTART_TGZ=release/kigenka-shokai-0.5.1.tgz bash tools/verify-quickstart.sh` and, with the site built, `SHOKAI_REQUIRE_SITE=1 node tools/check-links-versions.mjs`.
2. **Publish from the laptop first**, the same way as 0.5.0: `npm publish release/kigenka-shokai-0.5.1.tgz --provenance=false --access public --tag latest` (npm asks for the one-time code). This publishes the committed file, byte for byte.
3. Check the registry has the same bytes: `curl -fsSL "$(npm view @kigenka/shokai@0.5.1 dist.tarball)" | sha256sum` must print `release-status.json`'s sha256, and `npm view @kigenka/shokai@0.5.1 dist.integrity` must match the file. Read the publish time from `npm view @kigenka/shokai time.0.5.1`.
4. **Flip the status in one place:** in `release/release-status.json` set `"npm_status": "published"`, `"latest_on_npm": "0.5.1"` and `"published_at"`, then run `node tools/check-links-versions.mjs`.
5. Push `main` to the public repository (a new commit, never a force push), then push the tag `v0.5.1`. The release workflow skips a version that is already on npm, so the tag only anchors the GitHub Release and the `blob/v0.5.1/…` links in the package's `spec/`. Attach the tarball and its `.sha256` to the GitHub Release.
6. Deploy the site, which hosts both `kigenka-shokai-0.5.1.tgz` and the earlier `kigenka-shokai-0.5.0.tgz` (sha256 `259b414d…`), and check the hosted files' sha256.
7. Run the Quickstart from the public path: `npm install @kigenka/shokai@0.5.1` in an empty folder, then `QUICKSTART.md` as written.

