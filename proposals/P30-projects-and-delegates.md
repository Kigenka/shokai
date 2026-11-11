# Projects inside a place, and several people behind one host (P30)

**Status (v0.5.0): Proposed, not in the core.** Shipped with the package for review.

*Drafted 2026-10-30 to 2026-10-31 for the editor's review; the drafting history is kept by the editors.*

---

## Part 1. Projects inside a place

### 1.1 What it is

One place, such as a collaborative studio, can host several **projects**, each with its own members. The Shōkai visitor card admits a visiting representative to the **place**. It says nothing about projects, and it shouldn't: a card is the owner's statement about their own representative (§2.3), and which projects someone belongs to is the **place's** fact, not the visitor's claim.

So each project has a **member list (`ProjectRoster`)** signed by its project lead or by the place's owner and kept in the place's signed records. The door checks it deterministically, the same way it checks everything else (§6.4). A member of projects A, B and C sees all three; a member of A only sees only A, and can't tell that B and C exist.

### 1.2 Rules

**Membership is the place's record, never the card's.**
- A Shōkai visitor card MUST NOT be read as granting project membership, whatever its `role` or claims say (claims are claims, §2.5, C199).
- The door decides membership from the current `ProjectRoster` alone. A roster names members by **principal** (the owner DID used at this place, §2.8), not by representative key. An owner who changes agents keeps their projects, as records are kept per principal (§9.1).
- A roster is valid only if signed by the place's principal, or by a project lead under a delegation that covers `manage_roster` for that project (Part 2). It is durable state (§3.6): a door that can't read its rosters admits no one to any project and answers `not_now`, never `never`.

**What a pass covers.**
- The pass (seat, §7.1) stays least-privilege. *Proposed:* a seat's limits carry `projects`, the intersection of the visitor's memberships and what its mandate and the request name. Every project act carries `project_id`, and an act for a project not in the seat is refused like any tool outside the allowlist (`not_a_fit` / `SEAT_SCOPE_EXCEEDED`, §7.2).
- **No existence leak.** A request or act naming a project the visitor isn't a member of MUST get exactly the same answer as one naming a project that doesn't exist. Project ids are random, never guessable from names.
- Projects are **not** listed in the place listing. The listing is open to any reader (§3.1, D20), and a project's name and members are private by default.

**Joining.**
- **By invitation (reuses the Shōkai invitation card).** A project invitation is a named Shōkai invitation card (`for` = the invited owner's principal) with a new member `scope: { project_id }` (`INVITATION-CARD-DESIGN.md` §4: named, counted uses, withdrawal). It is signed by the place's principal, or *(proposed)* by the project lead under a delegation that covers `invite` for that project. That answers the design note's open question about delegated invitation keys for this one case.
- **Accepting.** The invited owner accepts the project's house rules with a passkey: `accept_house_rules` over the project rules' digest (reused from Gatherings, where it's a passkey action, §8.1). The lead then signs a new roster version with the new member.
- **By request.** A visiting representative already admitted to the place may ask to join a project. That is a request beyond its pass, so it goes `considering`, routed to the project's lead (§6.8; `routed_to.kind: "role"` already exists).

**Leaving and removal.**
- **A member leaves** by revoking their `accept_house_rules` consent with a signed `ConsentRevocation` (§8.1, reused). The place MUST then drop them from the roster.
- **The lead removes a member** by signing a new roster version without them.
- Either way, the place MUST end every open seat that includes that project at once, as a re-signed Gathering unseats someone no longer on its list (Gatherings) and as a revoked card ends its seats (§2.6, C198). What the member already saw is governed by the project's house rules: `post_seat_leakage` (§9.3) still applies.

**What the host representative may share across projects: nothing by default.**
- The host representative MUST keep each project's material, conversations and decisions apart. It MUST NOT tell a member of A anything about B, including that B exists, who is in it or what it's doing, even when the same person belongs to both.
- *Proposed:* the place's owner MAY allow named exchanges in the signed house config (for example "the B lead may see A's final storyboards"). Each allowance is one direction, one pair of projects and named material, and it's covered by `house_digest` (§2.3). Changing it is a change of house (§3.1).
- A member who is in both projects may of course carry their own knowledge between them. The rule binds the host representative, not people.

**What comes home: Return with care, per project.**
- A visiting representative's summary SHOULD group by project, label every item with the project's name, and keep "Return with care"'s limit of **at most three decisions in total**, most urgent first, across all projects. A project with nothing that needs the owner gets one line or none.
- The host representative's summary to the place's owner (or to a project lead, for that project only) follows the same rule. A lead sees only their own projects.

### 1.3 Wire shape (proposal: reuse first)

```ts
type ProjectRoster = {
  roster_id: string; protocol: "shokai/0.3"; kind: "project_roster";
  place: { principal_id: string; entry: string };          // as on the Shōkai host card (§2.3)
  project: { project_id: string; display_name: string };   // project_id random; display_name shown to members only
  version: number; supersedes?: Digest;                     // each change is a new signed version
  members: {
    principal_id: string;                                   // the owner DID used at this place (§2.8)
    role: "lead" | "member" | "viewer";
    actions: string[];                                      // within the place's listed actions
    rules_consent_digest?: Digest;                          // their accept_house_rules over rules_digest
  }[];
  rules_digest: Digest;                                     // the project's house rules
  delegation_ref?: string;                                  // when a lead signs under Part 2
  issued_at: Timestamp;
};
// Signed<ProjectRoster>: by the place principal, or by a lead under a Delegation covering manage_roster.
```

- **Reused:** the named Shōkai invitation card (plus `scope.project_id`), `accept_house_rules`, `ConsentRevocation`, `considering` routed to a role, seat ending (C198), `post_seat_leakage`.
- **New:** `ProjectRoster`; seat limit `projects`; act argument `project_id`; the cross-project allowance in the house config.

### 1.4 Worked example (fictional)

**Kiln & Reel Studio** is a collaborative studio owned by Clara Benn. It hosts three projects:

| Project | Lead | Members |
|---|---|---|
| **Tidewater** (a short film) | Clara Benn | Marcus Hale, Ines Kato |
| **Paper Lanterns** (a picture book) | Marcus Hale | Ines Kato |
| **Saltmarsh** (a sound album) | Theo Varga | Ines Kato |

1. **Ines** is in all three. Her representative agent is admitted to the studio and gets a pass with `projects: [Tidewater, Paper Lanterns, Saltmarsh]`. Her summary:
   > Kiln & Reel: one thing needs you. *Paper Lanterns:* Marcus asks whether page 12 should be night or dusk; answer by Thursday. *Tidewater:* two new storyboard notes, kept. *Saltmarsh:* nothing new.
2. **Theo** is in Saltmarsh only. His pass covers Saltmarsh. When his representative agent asks about "the film project", the door gives the same answer it would give for a project that doesn't exist, and the host representative says nothing about Tidewater.
3. **Marcus** invites a new illustrator, Ren Aldo, to Paper Lanterns: a named Shōkai invitation card scoped to that project, signed under his lead delegation. Ren's owner signs the project rules with a passkey; Marcus signs roster version 4.
4. **Theo leaves Saltmarsh** for a month to tour. His representative agent sends his `ConsentRevocation`; his open seat ends at once, and the roster drops him. Rejoining is a new invitation.
5. **Clara allows one exchange:** the Paper Lanterns lead may see Tidewater's final color palette. She signs the house change with her passkey. Nothing else crosses.

---

## Part 2. Several people behind one host

### 2.1 The recommendation

**One owner, one Shōkai host card, one host representative per place.** The owner signs **delegations** to the other people in the business (a manager, assistants). Each delegate signs with **their own passkey**, within a **scoped role**. Every decision the host side makes records **who approved it**.

### 2.2 Why not several Shōkai host cards

v0.4.0 already points this way. A Shōkai host card's `place.principal_id` MUST equal the card's own principal, and a door MUST hold an active Shōkai host card signed by the place's principal (§2.3). So a manager signing "their own" host card for the same place would be a **different principal**, which is a different place. Beyond the rule, several host cards would blur accountability:
- **Who answers?** Misconduct notices are signed by the host principal's key (§9.3), and visitors' records are kept by principal (§9.1). Two principals at one door means two answers to "who is responsible here".
- **Which house?** Each card carries one `house_digest`, and a door serving a house its card doesn't name answers nothing (§3.1). Two cards mean two houses competing for one door.
- **Leaving doesn't stop it.** Withdrawing one card leaves the other working. A manager who left would keep a live host card until it expired.
- **Visitors can't tell.** A visiting representative checks that the place's card is a Shōkai host card for that place and house (§3.1, §12.1). Several valid cards from several people would make that check meaningless.

One principal per place keeps one answer. Delegations add people without adding principals.

**Organizations already work this way.** An organization's Shōkai host card is signed by the organization's own key and records the person who approved it in `org_approval` (§2.3). P30 extends the same idea: **every decision, not only the card, names who approved it.** A business with staff SHOULD consider an organization principal (`did:web`). Delegations work the same for a person's place and an organization's place.

### 2.3 Delegations

- **Signed by the owner only.** A `Delegation` is signed by the place's principal (the owner's passkey, or an organization's key with its approval record). Delegates MUST NOT sub-delegate.
- **The delegate signs as themselves.** The delegate's own passkey identity is named in the delegation; the delegate never uses the owner's key. When the delegate approves something, the approval is an `OwnerConsent`-shaped consent (§8.1) signed by the delegate's passkey, carrying `delegation_ref`.
- **Scoped powers** (each optional, each limited):

| Power | What it allows | Spec hook |
|---|---|---|
| `answer_questions` | Answer `owner.ask` questions for the place | `DESIGN-QUESTIONS-DRAFT.md` A1 (proposed) |
| `approve_commitment` (up to an amount) | Decide `considering` requests routed to a role, within `max_amount` | §6.8 (`routed_to.kind: "role"`), §8.1 |
| `approve_refund` (up to an amount) | Approve refunds under the place's terms | P27 §6.5 (`terms_url`) |
| `edit_notes` | Change house manners, the leaflet's wording and seasonal greetings | See 2.5 |
| `invite` (optionally per project) | Sign Shōkai invitation cards, or project invitations | `INVITATION-CARD-DESIGN.md`; Part 1 |
| `manage_roster` (per project) | Sign a project's roster | Part 1 |

- **Never delegable:** signing the Shōkai host card; the policy, including trust requirements, prices, caps and actions (P27 §4.1, all under `house_digest`); issuing or revoking delegations; withdrawing the place; transferring it. These stay the owner's, because they decide what the place *is*.
- **Changes a MUST.** Today a passkey consent MUST be signed by the key resolved from the card's `owner_binding.owner_id` (§8.1), and a commitment routed to a personal principal needs that owner's `approve_commitment` (§6.8). P30 needs one amendment: *a consent signed by a delegate's passkey is valid when it carries a `Delegation` signed by the place's principal that covers the action, the amount and the time, and that isn't revoked.* Receivers verify the delegation the same way as any signed artifact (§2.6).
- **One host representative.** Every delegate talks to the same host representative, which knows who is speaking and keeps a decision record: what was decided, by whom, under which delegation, and when. Visitors learn only the decision, plus *(proposed)* a role label such as "approved by the manager", never the delegate's identity unless the place chooses to show it.

### 2.4 Revocation

- The owner revokes a delegation through the place's revocation list, the same list and format used to withdraw the Shōkai host card (§2.6). Revocation takes effect at once.
- **Done stays done:** decisions already approved under it remain valid, as completed acts survive a consent revocation (§8.1).
- **Pending items go back to the owner:** `considering` items routed to that delegate re-route to the owner, with the same `response_by` or a new `considering` that extends it (§6.8).
- A delegation has an `expires_at` (*proposed:* at most 400 days, as an owner link, §2.8). Staff changes are routine, so short lifetimes are the default.

### 2.5 Set up through conversation, with several delegates

- Everyone sets things up by talking with the **same** host representative ("Set up through conversation"). The host representative tells each person only what their role covers, in plain words.
- **Only the owner signs house config changes.** A delegate's idea that changes the policy becomes a draft for the owner, explained in one sentence in the owner's next summary: "Dev suggests free day-old bread for neighbors after 5 PM. It changes who gets something free, so it needs you."
- **The notes problem (proposed fix).** House manners and the leaflet's wording are part of the house config today (§2.3, the leaflet text still pending P26 sign-off), so even a typo fix needs the owner's signature. *Proposed:* split out an optional **`HouseNotes`** document (manners, leaflet wording, seasonal greeting) that the owner, or a delegate with `edit_notes`, signs separately. The Shōkai host card names which delegations may sign notes. Trust requirements, prices and actions stay under `house_digest` and the owner's signature. Visitors still see who signed the notes they read. This is an open question (Q6).
- The owner's summary includes a short **"changed by others"** line: what delegates changed or approved since the last summary, kept in "Return with care" style.

### 2.6 When the owner leaves or the business changes hands (*hikitsugi*)

- **Organization principal:** nothing changes for visitors. The organization's key keeps signing; `org_approval` names the new approver (§2.3); delegations are reviewed and reissued.
- **A person's place sold or handed on:** the place's principal changes, and a place is its key. *Proposed:* a **`PlaceHandover`** modelled on P24's `KeyMove`:
  - signed by both the outgoing and incoming owners' passkeys;
  - naming the place and an `effective_at`;
  - published on the place's revocation list next to the outgoing owner's withdrawal of the old Shōkai host card.
  
  The new owner signs a new Shōkai host card.
- **Ceremony:** as in P20's *hikitsugi* (§5.3 there), the host representative greets returning visitors with a short farewell note from the outgoing owner, approved by them, introducing the new owner. The note is courtesy, never a gate input.
- **What carries over, honestly:**
  - Relationship records and findings carry over only if the outgoing owner hands them over, and visitors SHOULD be told the place changed hands (in the greeting and the leaflet).
  - Delegations end at handover.
  - `TrustReceipt`s issued by the old principal (P27 §6) are honoured only if the new owner says so in the listing.
  - A handover can only carry; it never clears a finding (as P24 and §2.8 owner links).

### 2.7 Wire shape (proposal)

```ts
type Delegation = {
  delegation_id: string; protocol: "shokai/0.3"; kind: "delegation";
  place: { principal_id: string; entry: string };
  delegate: { principal_id: string; display_name: string; role_label: string };  // the delegate's own passkey DID
  powers: ("answer_questions" | "approve_commitment" | "approve_refund" | "edit_notes" | "invite" | "manage_roster")[];
  limits?: { max_amount?: Money; projects?: string[] };
  issued_at: Timestamp; expires_at: Timestamp;            // at most 400 days (proposed)
  shown_to_owner: { text: string; locale: Locale };        // what the owner read, inside the signature
};
// Signed<Delegation>: by the place principal. Revoked through the place's revocation list (§2.6).
// A delegate's approval: an OwnerConsent (§8.1) signed by the delegate's passkey, plus delegation_ref.
```

### 2.8 Worked example (fictional)

**Sorrel & Rye Bakery** is owned by Lucía Prado. Dev Anand is the manager; Hana Mori and Sam Ortiz are assistants.

1. **Delegations, by conversation.** Lucía tells her host representative what each person handles. It proposes, and she signs:
   - Dev: `approve_commitment` up to $300 (wholesale orders from cafés), `answer_questions`, `edit_notes`;
   - Hana and Sam: `answer_questions` only, for 90 days.
2. **A café's representative agent** asks for a standing order of $240 a week. The request goes `considering`, routed to the manager role. Dev approves it with his own passkey; the outcome records "approved by the manager". Lucía's summary: "Dev approved a $240 weekly order from Harbour Café; nothing needs you."
3. **A $600 catering request** is above Dev's limit, so it goes to Lucía.
4. **Sam leaves the bakery.** Lucía revokes his delegation in one sentence to her host representative and a passkey tap. A question routed to Sam re-routes to Dev.
5. **Years later, Lucía sells to Dev.** They both sign a `PlaceHandover`; Dev signs a new Shōkai host card. Regulars' representative agents hear Lucía's farewell note and meet Dev.

---

## Open questions

1. Should a project's existence ever be visible to non-members (a "members only" sign), or always hidden? Proposed: always hidden.
2. Viewer roles in a roster: can a viewer's representative agent take anything home beyond what the project's house rules allow?
3. Cross-project allowances: one-directional pairs only (proposed), or groups of projects?
4. Should a visitor see a delegate's identity on decisions, or only a role label (proposed: role label, unless the place chooses)?
5. The amendment to §8.1 and §6.8 for delegated consents: is a role-routed `considering` decided by a delegate enough, or should some actions always need the owner?
6. `HouseNotes` split: is a separately signed notes document worth the extra object, or should every manners change stay a house change under the owner's signature?
7. Handover of records: should visitors be able to opt out of having their record carried to a new owner?
8. Owner incapacity (illness, death) with no outgoing signature: a standby handover named in advance, as P18 proposes for keys?
9. Maximum delegation lifetime (proposed 400 days) and whether delegations must be renewed when the Shōkai host card is renewed.

## Sign-off items for the editor

1. **Projects as the place's record:** membership never on the Shōkai visitor card; a signed `ProjectRoster` per project, checked deterministically by principal.
2. **No existence leak** and projects kept out of the public listing.
3. **Joining by a named Shōkai invitation card scoped to a project**, accepted with `accept_house_rules`; joining by request as `considering` routed to the lead.
4. **Leaving by `ConsentRevocation`, removal by a new roster version**, with open seats ending at once.
5. **Nothing shared across projects by default**; owner-signed, one-direction exceptions only.
6. **Return with care per project**, with at most three decisions in total.
7. **One owner, one Shōkai host card, one host representative per place**, with the reasons in 2.2.
8. **Delegations** signed by the owner, each delegate signing with their own passkey, with the power list and the never-delegable list; every decision records who approved it.
9. **The flagged amendment** to §8.1 and §6.8 for delegated consents.
10. **Revocation** through the place's revocation list; pending items go back to the owner.
11. **Set up through conversation with delegates:** only the owner signs house config changes; the optional `HouseNotes` split (Q6).
12. **Handover (*hikitsugi*)**: `PlaceHandover` modelled on P24, the farewell note from P20, and honest limits on what carries over.
13. The two worked examples (Kiln & Reel Studio, Sorrel & Rye Bakery), and answers to questions 1–9 or a go with the proposed defaults.

---

*Copy check: "Shōkai visitor card", "Shōkai host card", "Shōkai invitation card" in full; "representative agent", "host representative", "visiting representative"; "conversation"; no banned words; fictional names only; wire identifiers quoted as code. Section numbers checked against `SPEC.md` v0.4.0 and the cited proposals.*


---

## Addendum, Fri 2026-10-30 about 6:52 PM PT

**Approved:** the delegate design (one owner, one Shōkai host card, signed delegates each with their own passkey, role and limits; the owner's passkey still approves anything by default; delegation is optional). This is the editor's yes to sign-off item 9. Projects get no new door and no new Shōkai visitor card; a Shōkai invitation card names the project.

**Added: project invitation allowance.**
- The project lead (by default the owner) MAY grant a member an invitation allowance in the ProjectRoster entry: `invite_allowance: { project, max_invitations }` (example: 3).
- Within the allowance, the member's passkey signs Shōkai invitation cards for that project only. Each card records the member as the one who vouches, and the place counts claims the same way P28 counts `max_claims`.
- With no allowance, the member's representative sends the host representative a signed `MemberInviteRequest` naming the person and the project; the lead decides.
- A member can never invite into a project they are not in, and an allowance never covers place-wide rights.

**Open question, later: co-owners.** First thought: co-owners are named together at setup with a signed decision rule for non-delegable actions (either may approve, or both must). Not designed for 0.5.0.

---

## Addendum (Fri 2026-10-30, 9:17 PM PT, from the editor): Joint opening (quorum of signers)
Pending the editor sign-off. Like the bank's two-key safe deposit box, or multi-sig in crypto.
- A place MAY mark a resource as `joint` with `{ signers: [card ids], threshold: k, window_minutes }`. The signer list is signed by the owner in advance.
- Access requires k distinct valid signatures from the named cardholders, each signed with their own passkey, inside the window. The door counts the signatures in code, with no model involved.
- Unknown cards never count toward the threshold, so a card farm cannot meet it.
- Each signature is single-use and bound to the specific request (resource, action, nonce), so it cannot be replayed.
- Co-owners: non-delegable actions can use joint opening with threshold 1 (either owner) or 2 (both).

**APPROVED (Fri 2026-10-30, 9:58 PM PT, the editor):** all P30 sign-off items 1–13, the project invitation allowance and `InvitationRequest`, joint opening, and the proposed defaults for open questions 1–9. Co-owners are handled through joint opening (threshold 1 or 2 for non-delegable actions).

**Rename (Fri 2026-10-30, 10:07 PM PT):** the member's request is now `MemberInviteRequest`, to avoid a clash with v0.4.0's `InvitationRequest` (§5.3). The meaning is unchanged.
