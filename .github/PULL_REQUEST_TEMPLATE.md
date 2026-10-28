## What this changes

<!-- One topic per pull request. Link the issue or proposal: "Fixes #123", "Proposal P26". -->

## Kind

- [ ] Normative spec change (proposal: P__)
- [ ] Editorial spec or docs change
- [ ] SDK / conformance runner
- [ ] Reference implementation
- [ ] Tests, tools or CI

## Checklist

- [ ] Every commit is signed off (`git commit -s`, see [CONTRIBUTING.md](../CONTRIBUTING.md))
- [ ] `npm test` passes at the repository root
- [ ] New MUST/SHOULD text carries a scenario, trace or check tag, and `npm run trace-lint` reports 0 gaps
- [ ] If `protocol-shapes.ts` changed: `npm run schema` regenerated `schema/`, and `npm run check-schema` passes
- [ ] `CHANGELOG.md` has an entry under "Unreleased"
- [ ] Examples and tests use fictional people, businesses and places, and no keys, tokens or personal data

## AI assistance

<!-- If AI tools wrote a substantial part of this change, say which parts (for example "tests drafted with an AI assistant,
     reviewed and run by me"). You stay accountable for all of it; see CONTRIBUTING.md. Write "none" otherwise. -->
