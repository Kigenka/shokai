# Outcomes

After the visiting representative states its purpose, the host representative answers with exactly one decision. In plain words, a `grant` admits the visiting representative with a **pass** (the specification's *seat*), which it later takes home with its report as proof of the visit ([Report home](./report-home.md#coming-home-with-a-keepsake)).

| Decision | Meaning | Carries |
|---|---|---|
| `grant` | Yes, and here is your pass | A pass no wider than **policy ∩ mandate ∩ request** |
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
- Persuasion reaches a human only through `considering`, and the host representative itself never weighs the pitch.
- Receivers branch only on `decision`, `conditions`, `retry` and `revisit`, never on `courtesy`. The manner adapts to the counterpart's language; the decision doesn't.

## Clear, kind, and safe to disclose

- **Setup failures are not penalties.** A missing credential, a malformed proof or a purpose the place doesn't serve gets `not_now` with a retry that names the fix. Never `never`.
- **Tell visiting representatives what is required, never why their particular credential failed.** Unverified visiting representatives get no credential-specific reason codes.
- `never` is reserved for trust violations: forgery, replay, probing, severe misconduct.

## Beyond the mandate: a fixed order

When a request exceeds the mandate, the host representative applies a fixed order: narrow to the in-mandate actions (`conditional`), lower limits to the mandate's, route to `considering` when eligible, otherwise `deny` with a retry. Honest follow-ups to a `conditional` are never counted as probing.


## Probing and `never`

`never` is reserved for trust violations: forgery, replay, probing, or severe misconduct. It is not how a door turns away someone who is merely unprepared (that is a leaflet and `not_now`).

When a visitor tries **counted probing shapes** — distinct requests that sit wholly outside the mandate, each refused as §6.7 requires — the third such shape is answered `deny` / `never` (no reason code). That binding sticks to the **principal** at this place for **180 days**: later requests from that owner, under any of their representatives, are answered `never` until it expires. Official Kettle runs exercised this rule.

What does *not* count toward probing: a setup failure, a malformed `crit` member the door does not implement (`UNSUPPORTED_CRITICAL`; C289), or an honest follow-up to a `conditional`. Those are `not_now`, not a ban.


## An unusual order is still `considering`

`considering` is not a fifth kind of decision invented for odd shopping. It is the existing decision: the door grants nothing, says someone inside will look, and names a `response_by`. A host representative that meets an unusual order — say a quantity or a combination that is listed for consideration, after a clerk-like clarifying question still leaves it abnormal — may take that ask to a person *before any pass*. The tea-house films show a different pattern (an owner-ask to add an ability). The 0.5 host-skill drafts use `considering` for the unusual-order path.

## The pass

A `grant` gives a pass to the visiting representative: a least-privilege tool allowlist bound to the mandate and its limits, never outliving it. An act outside the pass gets an explicit `act_decision`, never a soft error. Splitting a payment to stay under a limit is structuring, a severe finding.

*[Spec](../../SPEC.md): Invitation response; Reason codes and disclosure; Determinism; Anti-persuasion; Requests beyond the mandate; Considering; Seats; Acts within a pass.*
