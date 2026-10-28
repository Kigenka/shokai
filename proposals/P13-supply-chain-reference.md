# P13. Supply chain of the reference code

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Proposal only; SPEC.md untouched. Drafted 2026-10-26 (PT) from red-team round 2 (C1–C5, H1).*

## Findings
1. **s5** `engawa/node_modules` was a symlink into `s3/work/01-host/node_modules`, and `typescript` was a caret range with no lockfile (C1/C2).
2. **pilot-server** always loaded place keys from the local key directory, so a test harness that spawned it risked reading real key material (C3).
3. No `eval` / `Function` / remote `import()` sinks in `engawa/src` (C4 held).

## What we fixed in s6
- Real `node_modules` directory (no cross-stage symlink).
- `typescript` pinned to exact `5.9.3`.
- `--ephemeral-keys=true` makes fresh in-memory place keys (H1 held; red-team never reads the local key directory).
- Build scripts call `node node_modules/typescript/bin/tsc` (no `npx`, no `.bin` shim).

## Proposal
1. Every published reference stage MUST ship a lockfile (or npm shrinkwrap) and MUST NOT symlink `node_modules` across stages.
2. Test / red-team / dry-run entrypoints MUST support ephemeral keys and MUST document that they never read the local key directory or `state/` of a live run.
3. Record a content hash of `dist/src/host.js` (and `crypto.js`, `trust.js`) in the release notes so a swapped build is obvious (C5 canary).

## Open questions
- Publish s6 as the next reference stage, or fold these hygiene fixes back into s5 under a new tag?
- Require cosign/sigstore later, or is a lockfile + hash enough for v0.3?
