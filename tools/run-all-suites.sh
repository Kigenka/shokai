#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Yu Sung Yeh
# run every suite once, save raw outputs to $OUT (default /tmp/shokai-suites), then split the counts core vs extension
# with scripts/suite-split.mjs. Local only: loopback HTTP on a free port, a throwaway state dir, nothing sent or deployed.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd); OUT=${OUT:-/tmp/shokai-suites}; rm -rf "$OUT"; mkdir -p "$OUT"; rc=0
echo "== engawa npm test (vectors, golden, scenarios, v0.2.8, v0.2.9 brand door, v0.2.10)"
(cd "$ROOT/reference/engawa" && SHOKAI_CHECK_LOG="$OUT/checks.jsonl" npm test > "$OUT/engawa.txt" 2>&1) || rc=1; tail -1 "$OUT/engawa.txt"
echo "== reference conformance (prototype)"
(cd "$ROOT/reference/prototype" && npm run conformance > "$OUT/reference.txt" 2>&1) || rc=1; tail -1 "$OUT/reference.txt"
echo "== trace-lint (core + extensions)"; node "$ROOT/tools/trace-lint.mjs" > "$OUT/trace-lint.txt" 2>&1 || rc=1; tail -1 "$OUT/trace-lint.txt"
echo "== trace-typecheck"; node "$ROOT/tools/trace-typecheck.mjs" > "$OUT/trace-typecheck.txt" 2>&1 || rc=1; tail -1 "$OUT/trace-typecheck.txt"
echo "== reference signing page (software authenticator, loopback)"; node "$ROOT/reference/signing-page/test/e2e.mjs" > "$OUT/signing-page.txt" 2>&1 || rc=1; tail -1 "$OUT/signing-page.txt"
echo "== signing-page preview copy (deploy/sign-preview)"; node "$ROOT/deploy/sign-preview/build.mjs" --check || rc=1
echo "== sign.kigenka.com front, relay mode (deploy/sign-front, loopback only)"; ( node "$ROOT/deploy/sign-front/build.mjs" --check && node "$ROOT/deploy/sign-front/test.mjs" ) > "$OUT/sign-front.txt" 2>&1 || rc=1; tail -1 "$OUT/sign-front.txt"
echo "== sign.kigenka.com serverless (deploy/sign-serverless: its own tests, and the signing page e2e run against it, loopback only)"; ( node "$ROOT/deploy/sign-serverless/build.mjs" --check && node "$ROOT/deploy/sign-serverless/test.mjs" && cd "$ROOT" && SIGNING_SERVER=deploy/sign-serverless/local.mjs node reference/signing-page/test/e2e.mjs ) > "$OUT/sign-serverless.txt" 2>&1 || rc=1; grep -E "^(sign-serverless|signing page):" "$OUT/sign-serverless.txt"
echo "== SDK package and demo place (npm pack, install the packed file, local door only)"; ( T=$(mktemp -d) && cd "$ROOT/packages/shokai" && npm pack --silent --pack-destination "$T" >/dev/null && cd "$ROOT/deploy/demo-place" && npm install --no-save --no-audit --no-fund --silent "$T"/kigenka-shokai-*.tgz && node test.mjs ) > "$OUT/demo-place.txt" 2>&1 || rc=1; tail -1 "$OUT/demo-place.txt"
echo "== P20 sketch (draft proposal, not normative)"; node "$ROOT/tools/p20-sketch.mjs" > "$OUT/p20.txt" 2>&1 || rc=1; tail -1 "$OUT/p20.txt"
echo "== links and version strings (v0.3.0)"; node "$ROOT/tools/check-links-versions.mjs" > "$OUT/check-links-versions.txt" 2>&1 || rc=1; tail -1 "$OUT/check-links-versions.txt"
echo "== QUICKSTART.md as written (tools/verify-quickstart.sh: npm pack, fresh install, every expected output compared exactly)"; bash "$ROOT/tools/verify-quickstart.sh" > "$OUT/quickstart.txt" 2>&1 || { rc=1; echo "  quickstart: FAILED (see $OUT/quickstart.txt)"; }; tail -1 "$OUT/quickstart.txt"
echo "== HTTP end to end (loopback, free port, throwaway state)"
PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
ST=$(mktemp -d); (cd "$ROOT/reference/engawa" && exec node dist/src/server.js --port=$PORT --state="$ST/state" --wire="$ST/wire" > "$OUT/server.txt" 2>&1) & SRV=$!; sleep 1.5
for t in http-e2e http-press http-msgid; do
  (cd "$ROOT/reference/engawa" && node dist/test/$t.js $PORT > "$OUT/$t.txt" 2>&1) || rc=1; echo "  $t: $(grep -c '^  PASS' "$OUT/$t.txt") pass, $(grep -c '^  FAIL' "$OUT/$t.txt") fail"
done
kill "$SRV" 2>/dev/null || true; wait "$SRV" 2>/dev/null; rm -rf "$ST"   # only the server this script started, by its pid
echo; node "$ROOT/tools/suite-split.mjs" "$OUT" || rc=1
exit $rc
