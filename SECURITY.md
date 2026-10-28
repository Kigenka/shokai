# Security policy

Shōkai is at **v0.3.0**, not 1.0. Its reference implementations and SDK are not yet production software. Even so, we want to hear about weaknesses in the specification, the SDK, the conformance runner or the reference code.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately in one of two ways:

1. **Preferred: GitHub private vulnerability reporting.** On the repository, open the **Security** tab and click **Report a vulnerability** ([direct link](https://github.com/Kigenka/shokai/security/advisories/new)). The report stays private between you and the maintainers.
2. **Email:** **security@kigenka.com**, if you'd rather not use GitHub.

Include what you found, the affected section of `SPEC.md` or file, the steps to reproduce, and the impact as you understand it. We aim to acknowledge reports within 5 working days and to agree on a disclosure date with you. Unless we agree otherwise, we'll publish a fix or a specification change and credit you (if you wish) within 90 days.

## Supported versions

| Version | Security fixes |
|---|---|
| 0.3.x (specification v0.3.0, `@kigenka/shokai` 0.3.x) | Yes |
| 0.3.0 release candidates (rc1 to rc4) and 0.2.x | No: please move to 0.3.x |

Before 1.0, a fix may need a specification change; it then ships as a new 0.3.x (or 0.4) release with a changelog entry.

## What happens after you report

1. We acknowledge the report within 5 working days and tell you who is handling it.
2. We confirm the problem (or explain why we think it isn't one), and agree a disclosure date with you.
3. We fix it in private (a GitHub security advisory), publish the fix and the advisory together, and credit you if you wish.

## Scope

- The specification (`SPEC.md`, `extensions/`), including design-level issues where the specification allows harmful behaviour.
- The SDK and conformance runner (`packages/shokai/`).
- The reference implementations (`reference/engawa/`, `reference/prototype/`) and the tools in `tools/`.
- Test vectors and golden traces that would lead implementers to an insecure result.

Out of scope: denial of service by sheer volume against a local test server, and issues in third-party dependencies (please report those upstream).

## Intended behaviour, not vulnerabilities

Some things Shōkai does on purpose. Reports about them are welcome as design discussion (a specification issue), but they aren't vulnerabilities:

- **A signature shows that the owner's key signed, not who held the key** (SPEC §2.1). A stolen passkey signs like the real one; revocation (§2.6) is the remedy.
- **Names are claims, never identity** (C199). A card may say any display name; a place decides on keys, signed facts and vouches, never on a name.
- **Anyone may read a place's agent front** (its listing and lobby) without saying who they are. That is the point of "look before you join".
- **The leaflet answers everyone**, including an agent with no card: it says what the place is and what it needs, and never seats it.
- **Conduct records are local to each place.** There is no global score, so a representative refused at one door may be welcome at another.
- **Limits are counted per place.** A door counts a mandate's operations and amounts across its own seats (C175); a budget across many places is kept by the representative itself (C176).
- **The public test keys** in the test vectors, golden traces and `developmentPasskey()` are public on purpose (below).

## Known limits

Shōkai makes fakes **costly and traceable, not impossible**. Known open issues are published on purpose:

- [THREAT-MODEL.md](./THREAT-MODEL.md), including the risks accepted by design;
- SPEC §12 (security considerations) and §13 (known gaps);
- [`security/redteam/`](./security/redteam/): two adversarial rounds, including the attacks that still succeed.

## Test material

`conformance/test-vectors.json`, SPEC Appendix B and the SDK's `developmentPasskey()` use **public test keys** derived from published seed labels. They're public on purpose. Never trust them outside a test run.
