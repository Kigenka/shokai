# Testing Shōkai yourself

Shōkai v0.5.0. This page lets anyone repeat the project's own tests on their own computer. Everything runs on `127.0.0.1` with fictional people and places and fresh keys made in memory for each run. No AI model is called, no API key is needed, and nothing is sent, published or paid.

## What you need

- Node.js 22 or later (22 recommended), npm, bash, git.
- About 2 GB of free disk and a few minutes.

## Steps

```bash
git clone <this repository> shokai && cd shokai
npm run setup                          # installs the reference, SDK and schema tool dependencies
SHOKAI_SKIP_QUICKSTART=1 npm run verify
```

`npm run verify` runs, in order:

1. **The full suite** (`tools/run-all-suites.sh`, the same as `npm test`): the reference host's vectors, golden traces and scenarios; the reference conformance run; **trace-lint** (every spec requirement tag traced to a scenario and a golden trace); trace-typecheck; the JSON Schema check; the signing-page tests; the agent-install harness (scripted, no model); the drop-in snippets; the SDK pack-and-install test; and the **enforcement cases** (`tools/enforce`: a real door on loopback, attacked case by case); then the SDK's own tests.
2. **A build** of the reference host.
3. **A seeded property-based fuzz** (`tools/fuzz/fuzz.mjs`, 2,200 cases): malformed, unsigned and tampered messages and out-of-order ritual steps; the host must never throw and never grant.
4. **The attack harness** (`tools/attack-harness`): 47 attacks (injection, lookalikes, swarms, replay, oversize bodies, lobby floods and more) against the reference build, in-process and over loopback HTTP.

It ends with `VERIFY: ALL GREEN` or `VERIFY: SOMETHING FAILED`, and leaves raw outputs in `/tmp/shokai-verify` (set `OUT=` to change it).

Leave out `SHOKAI_SKIP_QUICKSTART=1` to also run the QUICKSTART walk-through, which needs the network for a fresh `npm install`.

## Running parts on their own

```bash
npm test               # full suite only
npm run enforce        # enforcement cases only (about seven seconds)
npm run trace-lint     # requirement tracing only
npm run attacks        # attack harness only (build reference/engawa first)
npm run fuzz           # fuzz only; add a run count and seed: node tools/fuzz/fuzz.mjs 20000 42
```

## Reading the results

- Every suite prints a pass count; any failure fails the run.
- The enforcement cases each say which rule the door kept and are built so they can fail: `tools/enforce/mutate.mjs` breaks the door on purpose to show a case catches it.
- The attack harness marks each attack `held` or `BROKE`, with a defense level: `code` (the reference enforces it), `spec` (a protocol decision still open) or `judgment` (left to the agent or owner). **Only a code-level break fails the run.** The spec-level breaks S1, S2 and S4 (one owner with many agents, a passkey farm, a low-and-slow return) are known open items, recorded in the red team report.

## Fictional data

The people (Pia, Jun, Wren, Suzu, Kiran Vale, Noor Halloran, Ines Calder and others) and places (the Lanternmoss Tea House, Fernwood Goods, Harborlight Savings & Trust) are invented. Never point these tools at a real door, a real key folder or a real person.

## Method

How these tests map to protocol-audit practice (threats, invariants, state machine, parsing, vectors, interoperability, normative language), and where the gaps are: [AUDIT-METHOD.md](AUDIT-METHOD.md).

## Limits

These are the project's own tests, run by the project. They are not an audit or a certification. Independent implementations and outside review are still needed; if you run this kit, please report what you find (see [SECURITY.md](SECURITY.md) for weaknesses).
