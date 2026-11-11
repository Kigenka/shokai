#!/usr/bin/env node
// Runs every SDK test file in sequence, streams output, and prints one grand total.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const names = [
  'sdk', 'visit', 'mandate', 'mcp-gate', 'gate-release', 'fetch-policy', 'extras',
  'state', 'owner', 'restart', 'claims', 'doorcard', 'twocard', 'v050', 'dropin',
  'instances', 'prune', 'adapters', 'site', 'demo2', 'host-budget',
  'context-requests', 'house', 'setup', 'demo', 'runner', 'bidi', 'redteam-fixes', 'redteam-highs', 'h4-checks', 'context-reask', 'budget-shared', 'anon-rate',
  'presigned-runner', 'conformance-exit', 'digest-actions', 'no-revocation-url-seat', 'must-understand', 'allowance-cap', 'canonical-json', 'graduated-penalties', 'free-principals', 'ssrf-normative', 'r8-overlimit-ceiling', 'flood', 'card-kind', 'round2-guards', 'conformance-0.5', 'redteam-round3',
];
// Pre-release review (round 2): a suite listed twice would be counted twice.
{ const dup = names.filter((n, i) => names.indexOf(n) !== i); if (dup.length) { console.error(`test-total: duplicate suite name(s): ${dup.join(', ')}`); process.exit(2); } }

const steps = [
  ...names.map((n) => ({ label: `${n}.test`, args: [`dist/test/${n}.test.js`] })),
  { label: 'university trace', args: ['../../examples/traces/university.mjs', '--check'] },
  { label: 'conformance self-test', args: ['dist/src/conformance/cli.js', '--self-test'] },
];

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

function parse(raw) {
  const text = raw.replace(ANSI, '');
  const lines = text.split(/\r?\n/);

  // 1. "N ... pass[ed], M ... fail[ed]" summary lines (summed per file)
  const re = /(\d+)\s+(?:[^\n,]*?\s)?pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?\b/;
  const hits = lines.map((l) => re.exec(l)).filter(Boolean);
  if (hits.length) {
    return { passed: sum(hits.map((m) => +m[1])), failed: sum(hits.map((m) => +m[2])) };
  }

  // 2. node:test TAP-ish summary
  const tp = /^#\s*pass\s+(\d+)/m.exec(text);
  const tf = /^#\s*fail\s+(\d+)/m.exec(text);
  if (tp) return { passed: +tp[1], failed: tf ? +tf[1] : 0 };

  // 3. loose "N ... passed" / "N ... failed" lines
  const lp = /(\d+)\s+(?:[^\n,]*?\s)?pass(?:ed)?\b/;
  const lf = /(\d+)\s+(?:[^\n,]*?\s)?(?:failed|fail|failures?)\b/;
  const p = lines.map((l) => lp.exec(l)).filter(Boolean);
  if (p.length) {
    const f = lines.map((l) => lf.exec(l)).filter(Boolean);
    return { passed: sum(p.map((m) => +m[1])), failed: sum(f.map((m) => +m[1])) };
  }

  // 4. "N/N" ratio lines
  const ratios = lines.map((l) => /\b(\d+)\/(\d+)\b/.exec(l)).filter(Boolean);
  if (ratios.length) {
    const ok = sum(ratios.map((m) => +m[1]));
    const all = sum(ratios.map((m) => +m[2]));
    return { passed: ok, failed: Math.max(0, all - ok) };
  }

  // 5. per-check lines
  const okLines = lines.filter((l) => /^\s*(?:PASS|ok|✓|✔|√)\b/.test(l)).length;
  const badLines = lines.filter((l) => /^\s*(?:FAIL|not ok|✗|✘|×)\b/.test(l)).length;
  if (okLines || badLines) return { passed: okLines, failed: badLines };

  return null;
}

function run(step) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(process.execPath, step.args, { cwd: pkgDir, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { chunks.push(d); process.stdout.write(d); });
    child.stderr.on('data', (d) => { chunks.push(d); process.stderr.write(d); });
    child.on('error', (e) => {
      process.stderr.write(`${step.label}: failed to start: ${e.message}\n`);
      resolve({ code: 1, out: Buffer.concat(chunks).toString('utf8') });
    });
    child.on('close', (code, signal) => {
      resolve({ code: code ?? (signal ? 1 : 0), out: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

let passed = 0;
let failed = 0;
const badFiles = [];
const unparsed = [];

for (const step of steps) {
  const { code, out } = await run(step);
  const c = parse(out);
  if (c) {
    passed += c.passed;
    failed += c.failed;
  } else {
    unparsed.push(step.label);
  }
  if (code !== 0 || (c && c.failed > 0)) badFiles.push(step.label);
}

console.log(`\nSDK checks: ${passed} passed, ${failed} failed across ${steps.length} files`);
if (unparsed.length) console.log(`(no counts parsed from: ${unparsed.join(', ')})`);
if (badFiles.length) {
  console.error(`FAILED: ${badFiles.join(', ')}`);
  process.exit(1);
}
