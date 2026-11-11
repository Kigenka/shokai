#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Run-it-yourself verification: every suite (includes trace-lint and the enforcement cases),
# then the attack harness. Loopback only, fictional people, fresh in-memory keys. No API keys.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd); cd "$ROOT"; OUT=${OUT:-/tmp/shokai-verify}; mkdir -p "$OUT"; rc=0
echo "### 1/3 full suite (core, SDK, conformance, trace-lint, schema, enforcement cases)"
OUT="$OUT/suites" bash tools/run-all-suites.sh > "$OUT/suites.txt" 2>&1 || rc=1
grep -E "^==|passed|failed|✓|✗|total|claim shop" "$OUT/suites.txt" | tail -70
npm --prefix packages/shokai test > "$OUT/sdk.txt" 2>&1 || rc=1; echo "SDK: $(tail -3 "$OUT/sdk.txt" | tr '\n' ' ')"
echo "### 2/3 build the reference host for the attack harness"
(cd reference/engawa && node node_modules/typescript/bin/tsc -p .) || rc=1
echo "### fuzz (tools/fuzz: seeded property-based fuzz of message handling)"
node tools/fuzz/fuzz.mjs 2000 > "$OUT/fuzz.txt" 2>&1 || rc=1; tail -1 "$OUT/fuzz.txt"
echo "### 3/3 attack harness (tools/attack-harness; spec-level findings are accepted, see THREAT-MODEL.md)"
(cd tools/attack-harness && RT_OUT="$OUT/attacks" node main.mjs verify > "$OUT/attacks.txt" 2>&1) || rc=1
tail -1 "$OUT/attacks.txt"
echo; echo "raw outputs: $OUT"; [ $rc = 0 ] && echo "VERIFY: ALL GREEN" || echo "VERIFY: SOMETHING FAILED (rc=$rc)"; exit $rc
