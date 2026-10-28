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
( cd "$ROOT/packages/shokai" && npm pack --silent --pack-destination "$TMP" >/dev/null )
TGZ="$(ls "$TMP"/kigenka-shokai-*.tgz)"
cd "$TMP" && mkdir shokai-quickstart && cd shokai-quickstart
npm init -y >/dev/null && npm pkg set type=module
npm install --no-audit --no-fund --silent "$TGZ" @modelcontextprotocol/sdk zod
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
  BASE="http://127.0.0.1:$PORT" node "$f" | tee "$f.out"
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
