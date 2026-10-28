# Security policy

Shōkai is at **v0.3.0**, not 1.0. Its reference implementations and SDK are not yet production software. Even so, we want to hear about weaknesses in the specification, the SDK, the conformance runner or the reference code.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately in one of two ways:

1. **Preferred: GitHub private vulnerability reporting.** On the repository, open the **Security** tab and click **Report a vulnerability**. The report stays private between you and the maintainers.
2. **Email:** **security@kigenka.com**, if you'd rather not use GitHub.

Include what you found, the affected section of `SPEC.md` or file, the steps to reproduce, and the impact as you understand it. We aim to acknowledge reports within 5 working days and to agree on a disclosure date with you. Unless we agree otherwise, we'll publish a fix or a specification change and credit you (if you wish) within 90 days.

## Scope

- The specification (`SPEC.md`, `extensions/`), including design-level issues where the specification allows harmful behaviour.
- The SDK and conformance runner (`packages/shokai/`).
- The reference implementations (`reference/engawa/`, `reference/prototype/`) and the tools in `tools/`.
- Test vectors and golden traces that would lead implementers to an insecure result.

Out of scope: denial of service by sheer volume against a local test server, and issues in third-party dependencies (please report those upstream).

## Known limits

Shōkai makes fakes **costly and traceable, not impossible**. Known open issues are published on purpose:

- [THREAT-MODEL.md](./THREAT-MODEL.md), including the risks accepted by design;
- SPEC §12 (security considerations) and §13 (known gaps);
- [`security/redteam/`](./security/redteam/): two adversarial rounds, including the attacks that still succeed.

## Test material

`conformance/test-vectors.json`, SPEC Appendix B and the SDK's `developmentPasskey()` use **public test keys** derived from published seed labels. They're public on purpose. Never trust them outside a test run.
