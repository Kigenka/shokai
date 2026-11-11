#!/usr/bin/env bash
# Renders every docs/diagrams/src/*.mmd to svg/ and png/ (PNG at 2x, 1600 px wide viewport).
# Needs mermaid-cli (mmdc) and a Chrome at $CHROME (default /usr/bin/google-chrome).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# Prefer an explicit MMDC, then the site package, then PATH.
mmdc="${MMDC:-}"
if [ -z "$mmdc" ]; then
  for cand in \
    "$here/../../../site/shokai-site/node_modules/.bin/mmdc" \
    "$here/../../site/shokai-site/node_modules/.bin/mmdc" \
    "$here/../../site/docs-site/node_modules/.bin/mmdc"; do
    if [ -x "$cand" ]; then mmdc="$cand"; break; fi
  done
fi
mmdc="${mmdc:-mmdc}"
chrome="${CHROME:-/usr/bin/google-chrome}"
pp="$(mktemp)"; printf '{"executablePath":"%s","args":["--no-sandbox"]}' "$chrome" > "$pp"
css="$here/mermaid-fonts.css"
cfg="$here/mermaid-config.json"
for f in "$here"/src/*.mmd; do
  n="$(basename "$f" .mmd)"
  "$mmdc" -q -p "$pp" -c "$cfg" -C "$css" -b '#fbf9f4' -i "$f" -o "$here/svg/$n.svg"
  "$mmdc" -q -p "$pp" -c "$cfg" -C "$css" -b '#fbf9f4' -w 1600 -s 2 -i "$f" -o "$here/png/$n.png"
  echo "rendered $n"
done
rm -f "$pp"
