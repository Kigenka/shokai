#!/usr/bin/env bash
# Renders every docs/diagrams/src/*.mmd to svg/ and png/ (PNG at 2x, 1600 px wide viewport).
# Needs the devDependencies in site/docs-site (npm install there first) and a Chrome at $CHROME (default /usr/bin/google-chrome).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
site="$here/../../site/docs-site"
mmdc="$site/node_modules/.bin/mmdc"
chrome="${CHROME:-/usr/bin/google-chrome}"
pp="$(mktemp)"; printf '{"executablePath":"%s","args":["--no-sandbox"]}' "$chrome" > "$pp"
for f in "$here"/src/*.mmd; do
  n="$(basename "$f" .mmd)"
  "$mmdc" -q -p "$pp" -c "$here/mermaid-config.json" -b '#fbf9f4' -i "$f" -o "$here/svg/$n.svg"
  "$mmdc" -q -p "$pp" -c "$here/mermaid-config.json" -b '#fbf9f4' -w 1600 -s 2 -i "$f" -o "$here/png/$n.png"
  echo "rendered $n"
done
rm -f "$pp"
