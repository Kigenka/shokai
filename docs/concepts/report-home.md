# Report home

After every encounter the representative reports to its owner with a `VisitReport`: whom it met, who introduced whom, the outcome, what was shared, what the counterpart said (quoted and marked untrusted) and **exactly one next step**, which waits for the owner's approval.

```json
{
  "host": { "display_name": "Harborlight Bank", "principal_id": "did:web:harborlight.example" },
  "outcome": { "decision": "grant" },
  "outcome_rendered": { "text": "harborlight.example (claims to be \"Harborlight Bank\"; not verified) seated me for \"bank.read_balance\", no spending. I did 1 action; none were refused.", "locale": "en-US" },
  "spent": [],
  "shared": [{ "via": "card", "items": [{ "field": "display_name", "value": "Aya Linden" }] },
             { "via": "act", "tool": "bank.read_balance", "items": [{ "field": "account", "value": "checking" }] }],
  "taken_home": [{ "item_id": "t1", "what": { "text": "Send USD 900 to your landlord on Friday", "locale": "en-US" }, "needs": "approve_commitment", "response_by": "2026-10-30T00:00:00Z", "if_no_reply": "declined" }],
  "next_step": { "text": "Approve the USD 900 transfer with Face ID, or ignore this to let it lapse.", "requires_owner_approval": true }
}
```
*Illustrative and abridged.*

- **Written from machine fields**, in the owner's language and time zone, never from the host's courtesy text. With the SDK, `visit.report(locale, { timeZone })` takes the owner's time zone; times in the report (a deadline, when to try again) are shown in it, with its name.
- **Says what was spent and what was shared.** `spent` is the exact sum of the spending acts' amounts. `shared` lists what left the owner's side, and how: the card the representative presented, the mandate, and each act's arguments. A place's `data_asks` say what an action *will ask for*; `shared` says what *was* given.
- **Covers every visit under the mandate.** A representative reports every act done under a mandate (§8.2). When it visits again under the same mandate, its report says so and carries the whole errand (`under_mandate`: each visit and its acts, the mandate's totals and what's left), so an earlier visit is never dropped from the story because a later one replaced it. If you write your own report from SDK data, start from `report().under_mandate`, not only the last visit's acts.
- **When nothing is pending, says so.** The next step for a visit that is over is plainly that nothing is waiting for the owner's approval, and that nothing happens if they don't reply.
- **Says what happens if the owner says nothing.** Silence is no.
- **Lists what it brought back.** Signed things a place gave (a visit stamp, a receipt) are listed in `brought_back`, with the envelope or its digest, who signed it, and whether it verified against the place's listed `principal_id` (§8.2). The SDK fills this in from the tools' results; `visit.keep(envelope)` adds one by hand.
- **Lists what was taken home** (matters waiting on the owner's decision; never gifts) and the inducements declined under the duty of loyalty.
- **Nothing a report proposes happens before the owner approves it.** A binding action (a commitment, an introduction, a vouch, a share) needs the owner's passkey, asynchronously, never in the middle of a visit.
- At a person's door, the report also shows what was kept for later, any hidden text behind a marker, who introduced whom and with what declared interest, and what was reported.

*[Spec](../../SPEC.md): Visit reports; Owner consent.*
