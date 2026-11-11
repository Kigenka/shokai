<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Kettle operator notes

These notes are the operator inventory for the hosted fictional test shop, Kettle & Leaf (`https://kettle.shokaiprotocol.com`). They were moved here from the owner-facing [Setting up a place](../setting-up-a-place.md) page. No secret values are printed.

The shop is **deployed**. It is not **publicly open**, and it is not a proven lasting host. See also [Known gaps](../known-gaps.md) and, on the docs site, [Kettle on conf6](https://shokaiprotocol.com/docs/evidence/kettle-conf6).

## Build pin and official run

The public door runs the conf6 candidate tarball promoted on 9 November 2026 at about 11:51 PM Pacific Time (`kigenka-shokai-0.5.0-candidate-conf6.tgz`, sha-256 `c68c75e7548cd591d7fe7e47cd897a1dea547db08c13eb1d177f14e631518c13`, `dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq`); the previous conf5 deployment (`dpl_9H2iWykWyePEWHGQjp1v4PkTGms2`) is the rollback target.

The official paced HTTP run against that build, at 12:13 AM Pacific Time, 10 November 2026, measured **30 of 164** Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240)): 30 pass, 0 fail, 0 skip, 2 N/A (C241, a visiting representative's duty; C242, the templates aren't closed). **132 of 164** were unmeasured (not cited in this run; self-asserted or not URL-reachable). The claim HOLDS. Operators have used the nickname **conf6** for this build, and an older project convention called a holding official run **validated** for Core Door on that build. That shorthand means only that the claim held on the checks this run measured. It is not a public certification, and it does not mean the 132 unmeasured checks passed. Reader-facing pages state the numbers instead of that label. It is not **publicly open**. Pinned results are operator-held (not shipped in this preview). The previous conf5 HOLD remains historical.

The official runner presented pre-signed owner material signed by passkey; Group A in-process evidence is labeled implementer-provided. Host-side scoped compare-and-set clears of this principal's `never` binding and probing-window shapes were used both to set up the golden run's preconditions (store version 999→1000 at 10:21:05 PM Pacific Time) and to restore the door after it (store version 1153→1154 at 10:40:56 PM). Those clears used the production Upstash write credential; they are not place signing. Earlier official runs of the same build skipped or failed (leftover spend, leftover probing shapes, an inferred `never` binding, runner order, an already-revoked throwaway card) and were re-measured with fresh material.

## Who can use the host key and the state store

It runs unattended as a serverless function on Vercel (`https://kettle.shokaiprotocol.com`). At request time the function loads only the place representative (host/door) key (`KETTLE_REP_KEY`) from the project's production environment, plus the already-signed host card (`KETTLE_HOST_CARD_JSON`). The place principal key is not in the production environment; owner approvals already come from the owner's passkey at the signing page. Parties who can use the representative key are: the function at request time; the project operator; members of the Vercel team that owns the project; the hosting platform operator, Vercel; and anyone else with production environment access. An operator-machine 0600 copy of the principal key remains as an offline stand-in and is not in the function bundle.

The production door-state store is Upstash. Its write credential can rewrite `never` bindings, probing-window shapes, revocations and spend ledgers; it is not place signing, and the store does not hold the signing keys. Parties who can use that credential: the function; the project operator; members of the Vercel team that owns the project (the write credential is in the production environment, which that team can read); Vercel, which operates that environment; and Upstash as a second platform operator.

That arrangement lets the door stay up; it does not meet the lasting-host bar described in [Known gaps](../known-gaps.md). The remaining representative-key exposure is recorded in `THREAT-MODEL.md`. Suzu is the representative named on the hung host card; this package does not claim the status **appointed** for Suzu.


## Official-run setup notes (not for the public headline)

The official runs used a test principal on the door's `never` list and probing window. Scoped clears before and after the golden run removed that test principal from `never` and cleared its probing-window shapes. Earlier official attempts the same evening are in the operator's private log. Reader-facing pages describe this as a test principal and point here for the deployment identifiers (`dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq` / conf6, rollback `dpl_9H2iWykWyePEWHGQjp1v4PkTGms2` / conf5).
