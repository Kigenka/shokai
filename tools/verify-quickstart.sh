#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Yu Sung Yeh
# Runs QUICKSTART.md as written, in a fresh temp directory, and times it. The code is extracted from the document itself
# (blocks marked "file=<name>"), so the test is the document. The SDK is installed from a local `npm pack` (not published).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T0=$(date +%s.%N)
TMP="$(mktemp -d /tmp/shokai-quickstart-XXXXXX)"; PORT="${PORT:-$((20000 + RANDOM % 20000))}"
echo "quickstart in $TMP (port $PORT)"
# SHOKAI_QUICKSTART_TGZ=<file>: run the walkthrough against that exact file (release.yml passes the committed release tarball,
# the bytes it publishes); otherwise a fresh `npm pack` of the source tree.
if [ -n "${SHOKAI_QUICKSTART_TGZ:-}" ]; then cp "$SHOKAI_QUICKSTART_TGZ" "$TMP/"; echo "quickstart against $SHOKAI_QUICKSTART_TGZ ($(sha256sum "$SHOKAI_QUICKSTART_TGZ" | cut -c1-12)…)"
else ( cd "$ROOT/packages/shokai" && npm pack --silent --pack-destination "$TMP" >/dev/null ); fi
TGZ="$(ls "$TMP"/kigenka-shokai-*.tgz)"
cd "$TMP" && mkdir shokai-quickstart && cd shokai-quickstart
npm init -y >/dev/null && npm pkg set type=module
# The dependency pins come from QUICKSTART.md itself (its `npm install @kigenka/shokai@<package version> …` line). The test still installs a local package file so it does not need the registry:
# the test installs exactly what the reader is told to install, and fails if the document stops pinning them.
PKGV="$(node -p "require('$ROOT/packages/shokai/package.json').version")"
PINS="$(python3 - "$ROOT/QUICKSTART.md" "$PKGV" <<'PY'
import re,sys
doc=open(sys.argv[1]).read(); v=sys.argv[2]
m=re.search(r"^npm install @kigenka/shokai@" + re.escape(v) + r" ((?:\S+@\d\S*\s*)+)$", doc, re.M)
assert m, f"QUICKSTART.md: no pinned `npm install @kigenka/shokai@{v} <deps@version>` line"
pins=m.group(1).split()
need={"@modelcontextprotocol/sdk","zod"}
have={p.rsplit("@",1)[0] for p in pins}
assert need<=have, f"QUICKSTART.md install line doesn't pin {need-have}"
for p in pins: assert re.search(r"@\d+\.\d+\.\d+$", p), f"not an exact pin: {p}"
print(" ".join(pins))
PY
)"
echo "quickstart pins (from QUICKSTART.md): $PINS"
npm install --no-audit --no-fund --silent --save-exact "$TGZ" $PINS
for P in $PINS; do N="${P%@*}"; V="${P##*@}"; GOT="$(node -p "JSON.parse(require('fs').readFileSync('node_modules/$N/package.json','utf8')).version")"; [ "$GOT" = "$V" ] || { echo "installed $N $GOT, QUICKSTART.md pins $V"; exit 1; }; done
T1=$(date +%s.%N)
python3 - "$ROOT/QUICKSTART.md" <<'PY'
import re,sys
doc=open(sys.argv[1]).read()
for name,body in re.findall(r"```js file=(\S+)\n(.*?)\n```", doc, re.S): open(name,"w").write(body+"\n"); print("wrote", name)
PY
PORT=$PORT node server.mjs > server.log 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
for i in $(seq 1 50); do grep -q "door:" server.log 2>/dev/null && break; sleep 0.1; done
# Every expected-output block is marked "```text output=<script>": run each script and compare, line for line.
for f in $(python3 -c "import re,sys;print(' '.join(re.findall(r'\\x60\\x60\\x60text output=(\\S+)', open(sys.argv[1]).read())))" "$ROOT/QUICKSTART.md"); do
  case "$f" in *.mjs) BASE="http://127.0.0.1:$PORT" node "$f" | tee "$f.out" ;; esac   # non-script blocks (conformance) are checked below
done
npx --no-install shokai-conformance "http://127.0.0.1:$PORT/shokai" --ext visit-receipts --vectors | tee conformance.out | tail -3
T2=$(date +%s.%N)
python3 - "$ROOT/QUICKSTART.md" <<'PY'
import re,sys
blocks=re.findall(r"```text output=(\S+)\n(.*?)\n```", open(sys.argv[1]).read(), re.S)
assert blocks, "no expected-output blocks in QUICKSTART.md"
# A report names a did:key place by the end of its key, which is new on every run: compare that part as <key>.
K=lambda t: re.sub(r"([Tt]he place with key) …[1-9A-HJ-NP-Za-km-z]{8}", r"\1 …<key>", t)   # keeps the case: a report starts "The place …"
for name, want in blocks:
    if name == "conformance":   # an abridged block: its lines must appear in this order in the real run (port shown as 3000)
        got=[re.sub(r"127\.0\.0\.1:\d+", "127.0.0.1:3000", l).rstrip() for l in open("conformance.out").read().splitlines()]
        i=0
        for line in [l.rstrip() for l in want.splitlines() if l.strip()]:
            same=lambda g: g == line or g.startswith(line + " ") or ("…" in line and g.startswith(line.split("…")[0].rstrip()))
            while i < len(got) and not same(got[i]): i+=1
            assert i < len(got), f"conformance: expected line not found in order: {line!r}"
            i+=1
        print("conformance: abridged output matches QUICKSTART.md"); continue
    got=K(open(name+".out").read()).splitlines()
    assert got==K(want).splitlines(), f"{name}: output differs from QUICKSTART.md:\n"+"\n".join(got)
    print(f"{name}: output matches QUICKSTART.md exactly")
PY
grep -q "Core: all core checks that ran passed" conformance.out
# HOST-A-PLACE.md: the same door made ready for a public host. Run its place.mjs as written, visit it with the quickstart's own
# scripts (same expected output), run the conformance checks, then the kill switch and a restart with the same identity.
kill $SRV 2>/dev/null || true
PORT2=$((PORT + 1)); mkdir -p place && cd place && ln -s ../node_modules node_modules && cp ../package.json . && cp "$ROOT/deploy/demo-place/keys.mjs" .
python3 - "$ROOT/deploy/HOST-A-PLACE.md" <<'PY'
import re,sys
for name,body in re.findall(r"```js file=(\S+)\n(.*?)\n```", open(sys.argv[1]).read(), re.S): open(name,"w").write(body+"\n"); print("wrote", name, "(HOST-A-PLACE.md)")
PY
cp ../visit.mjs ../spend.mjs .
# A full conformance run plus the quickstart visits can pass the default edge limit of 120 requests a minute; the test raises it.
startp() { RATE_PER_MIN=${RATE_PER_MIN:-240} PORT=$PORT2 DATA_DIR=./data KEY_DIR=./keys node place.mjs > place.log 2>&1 & PSRV=$!; for i in $(seq 1 50); do grep -q "door:" place.log 2>/dev/null && break; sleep 0.1; done; }
startp; trap 'kill $SRV $PSRV 2>/dev/null || true' EXIT
for f in visit.mjs spend.mjs; do BASE="http://127.0.0.1:$PORT2" node "$f" > "$f.place.out"; cmp -s <(sed -E 's/key …[1-9A-HJ-NP-Za-km-z]{8}/key …<key>/' "$f.place.out") <(sed -E 's/key …[1-9A-HJ-NP-Za-km-z]{8}/key …<key>/' "../$f.out") || { echo "place.mjs: $f output differs from the quickstart"; diff "$f.place.out" "../$f.out"; exit 1; }; done
npx --no-install shokai-conformance "http://127.0.0.1:$PORT2/shokai" --ext visit-receipts > place-conformance.out; grep -q "Core: all core checks that ran passed" place-conformance.out
ID1=$(curl -s "http://127.0.0.1:$PORT2/shokai/places" | python3 -c "import json,sys;print(json.load(sys.stdin)['places'][0]['representative_id'])")
touch data/CLOSED; [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT2/shokai/places")" = 503 ]; rm data/CLOSED
[ "$(stat -c %a keys/rep.pem)" = 600 ]
kill $PSRV; wait $PSRV 2>/dev/null || true; startp
ID2=$(curl -s "http://127.0.0.1:$PORT2/shokai/places" | python3 -c "import json,sys;print(json.load(sys.stdin)['places'][0]['representative_id'])")
[ "$ID1" = "$ID2" ] && [ -s data/door-state.json ]
echo "HOST-A-PLACE.md: place.mjs runs as written; quickstart visits give the same output; conformance passes; kill switch 503; keys 0600; same identity after a restart ($ID1)"
cd ..
python3 -c "import sys;a,b,c=map(float,sys.argv[1:]);print(f'install {b-a:.1f}s, run {c-b:.1f}s, total {c-a:.1f}s (machine time; reading and typing are extra)')" "$T0" "$T1" "$T2"
