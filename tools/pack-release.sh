#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Pack the release tarball once: a copy of packages/shokai without "private" (the repo keeps private:true as a
# safety catch against accidental npm publish), into release/ with its sha256.
# This exact file is hosted on the site and published to npm by .github/workflows/release.yml (never repacked).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/packages/shokai"
v="$(node -p "require('./package.json').version")"
npm run sync --silent >/dev/null && npm run build --silent
tmp="$(mktemp -d)"
cp -r package.json README.md LICENSE LICENSE-docs NOTICE src dist conformance-data agent-install spec "$tmp"/
(cd "$tmp" && npm pkg delete private && npm pkg delete scripts.prepack && npm pack --pack-destination "$root/release" >/dev/null)
cd "$root/release" && sha256sum "kigenka-shokai-$v.tgz" > "kigenka-shokai-$v.sha256" && cat "kigenka-shokai-$v.sha256"
rm -rf "$tmp"
# release/release-status.json: the one source of truth for publish-day facts (version and digest written here).
node -e 'const fs=require("fs"),f=process.argv[1],j=JSON.parse(fs.readFileSync(f,"utf8"));j.version=process.argv[2];j.tarball="kigenka-shokai-"+process.argv[2]+".tgz";j.sha256=process.argv[3];fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$root/release/release-status.json" "$v" "$(cut -d' ' -f1 "$root/release/kigenka-shokai-$v.sha256")"
