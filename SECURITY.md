# Security policy

The latest release of Shōkai is **package 0.5.1** (specification v0.5.0), published 11 November 2026. It is not 1.0. Its reference implementations and SDK are not yet production software. Even so, we want to hear about weaknesses in the specification, the SDK, the conformance runner or the reference code.

## Reporting a vulnerability

Please don't open a public issue, and please don't test any live Kigenka or demo system (including the hosted test shop, Kettle & Leaf) unless it is later listed as in scope below.

Please report a security problem in either of these ways:

1. **GitHub private vulnerability reporting** on the public [Kigenka/shokai](https://github.com/Kigenka/shokai) repository (the repository's **Security** tab, **Report a vulnerability**).
2. **Email [security@kigenka.com](mailto:security@kigenka.com).**

Include what you found, the affected section of `docs/SPEC-DETAIL.md` (the normative text) or file, the steps to reproduce, and the impact as you understand it. Unless we agree otherwise, we'll publish a fix or a specification change and credit you (if you wish) within 90 days.

## Removed workshop keys

Earlier private development history held unlabeled workshop/test key files (`workshop/desk/*.json`). They were test material for local demos, never production owner keys and never used by a published release; they were removed from the tree, are gitignored, and must not appear in the published history (RELEASING.md, publish-day step 3). If you ever find key material in a published Shōkai history, report it as above.

## Supported versions

| Version | State | Security fixes |
|---|---|---|
| 0.5.x (specification v0.5.0, `@kigenka/shokai` 0.5.x) | Current, supported | Yes |
| 0.3.x (specification v0.3.0, `@kigenka/shokai` 0.3.x) | Superseded | No code backports — not even for security fixes. Please upgrade to 0.5.x. How 0.5.x treats the earlier wire tag is in the [changelog](./CHANGELOG.md) and on the documentation site's compatibility page. |
| 0.4.x | Draft, never released | No |
| The 0.3.0 release candidates and 0.2.x | Superseded | No: please move to 0.5.x |

**Old messages.** For 90 days 0.5.x keeps accepting `shokai/0.3` wire messages (SPEC §11.1). A security problem in how 0.5.x handles those messages is in scope and gets fixed in 0.5.x. This is a wire-compatibility promise about 0.5.x; it is separate from maintaining the 0.3.x SDK. See the [changelog](./CHANGELOG.md).

**0.3.x after v0.5.0 (same as the table).** The 0.3.x SDK gets **no code backports** — not even for security fixes — and users should upgrade to 0.5.x promptly. The 90-day acceptance of `shokai/0.3` messages above is **wire compatibility inside 0.5.x only**, not maintenance of the 0.3.x package. 0.4.x was never released and gets no fixes.

Before 1.0, a fix may need a specification change; it then ships as a new 0.5.x (or 0.6) release with a changelog entry.

## What a signature proves, and what Shōkai doesn't do

*A legal boundary, stated so that nobody relies on more than the protocol gives. Details: [SIGNING.md §10](./SIGNING.md).*

- **Credential verification is not legal identity or authority.** A WebAuthn signature proves that a credential was used over the signed data. It does not prove who the person is, their legal capacity, or their authority over an account.
- **Delegated authority** (a Shōkai visitor card, mandate or allowance) records what the owner allowed their representative agent to do; whether an act binds the owner is a question for the applicable law.
- **Financial authorization and payment execution** belong to the bank or payment provider and its rules. Shōkai is not a payment rail and moves no money.
- **Place-enforced limits** are enforced by each place for its own passes. **Aggregate budgets across places** are managed by the representative (or a service the owner adds); Shōkai does not provide a universally enforced cross-place ledger.
- **Real-money integrations are a separate, higher-risk launch category**, with their own legal and security review. v0.5.0 and its demos use fictional money only.

## What happens after you report

1. We confirm the problem (or explain why we think it isn't one), and agree a disclosure date with you.
2. We fix it in private (a GitHub security advisory), publish the fix and the advisory together, and credit you if you wish.

## Scope

- The specification (`docs/SPEC-DETAIL.md`, the normative text; `SPEC.md`, its short core; `extensions/`), including design-level issues where the specification allows harmful behavior.
- The SDK and conformance runner (`packages/shokai/`).
- The reference implementations (`reference/engawa/`, `reference/prototype/`) and the tools in `tools/`.
- Test vectors and golden traces that would lead implementers to an insecure result.

Out of scope: denial of service by sheer volume against a local test server, and issues in third-party dependencies (please report those upstream).

**Reporting is not permission to test.** You may report a design issue you found in any implementation, including someone else's. That doesn't authorize testing anyone's live systems: test only the open-source reference code, run locally on your own machine. No live Kigenka or demo systems — including the hosted test shop, Kettle & Leaf — are in scope until listed here.

## Safe harbor

A good-faith research safe-harbor policy is drafted but **not in force**: it waits for counsel's approval, so it is kept as a proposal ([proposals/P34-security-safe-harbor.md](proposals/P34-security-safe-harbor.md)) and not published here as policy. Until it is approved, nothing in this file authorizes testing any system.

## Intended behavior, not vulnerabilities

Some things Shōkai does on purpose. Reports about them are welcome as design discussion (a specification issue), but they aren't vulnerabilities:

- **A signature shows that the owner's key signed, not who held the key** (SPEC §2.1). A stolen passkey signs like the real one; revocation (§2.6) is the remedy.
- **Names are claims, never identity** (C199). A Shōkai card may say any display name; a place decides on keys, signed facts and vouches, never on a name.
- **Anyone may read a place's agent front** (its listing and lobby) without saying who they are. That is the point of "look before you join".
- **The leaflet answers everyone**, including an agent with no Shōkai card: it says what the place is and what it needs, and never admits it.
- **Conduct records are local to each place.** There is no global score, so a representative refused at one door may be welcome at another.
- **Limits are counted per place.** A door counts a mandate's operations and amounts across its own passes (C175); a budget across many places is kept by the representative itself (C176) or by a service the owner adds. There is no universally enforced ledger across places: a compromised or faulty representative can exceed an aggregate budget even though each place enforces its own limit.
- **The public test keys** in the test vectors, golden traces and `developmentPasskey()` are public on purpose (below).

## Known limits

Shōkai makes fakes **costly and traceable, not impossible**. Known open issues are published on purpose:

- [THREAT-MODEL.md](./THREAT-MODEL.md), including the risks accepted by design;
- SPEC §12 (security considerations) and §13 (known gaps);
- [`security/redteam/`](./security/redteam/): two adversarial rounds, including the attacks that still succeed.

## Test material

`conformance/test-vectors.json`, SPEC Appendix B and the SDK's `developmentPasskey()` use **public test keys** derived from published seed labels. They're public on purpose. Never trust them outside a test run.
