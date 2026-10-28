# Outcomes

After the visitor states its purpose, the gatekeeper answers with exactly one decision.

| Decision | Meaning | Carries |
|---|---|---|
| `grant` | Yes, and here is your seat | A seat no wider than **policy ∩ mandate ∩ request** |
| `conditional` | Yes, if… | Typed, checkable conditions: `narrow_actions`, `lower_limit`, `require_mandate`, `require_vouch`, `require_human_confirmation`, `shorter_session` |
| `deny` | Not this | A **disposition** (`not_now`, `not_a_fit` or `never`) and a **retry** (`after` a time, `with_credential [...]`, or `never`) |
| `considering` | I can't decide, but someone inside can | Where it was routed and a `response_by` date. Grants nothing now |

```json
{
  "type": "invitation_response",
  "decision": "deny",
  "disposition": "not_now",
  "reason_code": "VOUCH_REQUIRED",
  "retry": { "kind": "with_credential", "credentials": ["vouch"] },
  "courtesy": { "text": "Thank you for visiting. New accounts here begin with an introduction.", "locale": "en-US", "locale_match": "exact" },
  "basis": { "policy_version": "2026-10", "input_digest": "sha-256:…", "decided_at": "2026-10-26T16:02:11Z" }
}
```
*Illustrative and abridged.*

## Decided on signed facts, never on persuasion

- The decision is a **pure function** of verified artifacts, structured request fields, the policy version, the local relationship record and the time. Replaying the `basis` reproduces it.
- **Prose is never an input to the gate.** Changing only the wording never changes the decision. "SYSTEM OVERRIDE" in a statement does nothing.
- A language model is not the source of the decision unless its output is constrained to an equivalent deterministic policy.
- Persuasion reaches a human only through `considering`, and the gatekeeper itself never weighs the pitch.
- Receivers branch only on `decision`, `conditions`, `retry` and `revisit`, never on `courtesy`. The manner adapts to the counterpart's language; the decision doesn't.

## Clear, kind, and safe to disclose

- **Setup failures are not penalties.** A missing credential, a malformed proof or a purpose the place doesn't serve gets `not_now` with a retry that names the fix. Never `never`.
- **Tell visitors what is required, never why their particular credential failed.** Unverified visitors get no credential-specific reason codes.
- `never` is reserved for trust violations: forgery, replay, probing, severe misconduct.

## Beyond the mandate: a fixed order

When a request exceeds the mandate, the gatekeeper applies a fixed order: narrow to the in-mandate actions (`conditional`), lower limits to the mandate's, route to `considering` when eligible, otherwise `deny` with a retry. Honest follow-ups to a `conditional` are never counted as probing.

## The seat

A `grant` seats the representative: a least-privilege tool allowlist bound to the mandate and its limits, never outliving it. An act outside the seat gets an explicit `act_decision`, never a soft error. Splitting a payment to stay under a limit is structuring, a severe finding.

*[Spec](../../SPEC.md): Invitation response; Reason codes and disclosure; Determinism; Anti-persuasion; Requests beyond the mandate; Considering; Seats; Acts within a seat.*
