# Use-cases page audit against Shōkai 0.5

Source audited: `site/shokai-site/pages/use-cases.md` (the VitePress page at `/use-cases`), as shown on the protected preview. No site files were changed by this audit itself. Linked area pages (`/commerce`, `/financial`, `/learning`, `/communities`) were read for consistency but are out of scope except where they explain a claim on this page.

Approved 0.5 concepts applied: a Shōkai visitor card signed by the owner with a passkey; a Shōkai host card and door rules signed by the place owner; the door decides on signed facts; the eight-step visit (doorstep listing open to any agent, a cardless agent gets the leaflet; the door checks who is there; the host welcomes; the visitor says why it came and shows its owner's limits; the door decides; the pass is admission; the visit is completed; report home / return with care, local record); one Shōkai visitor card, many doors, each place chooses how open its door is; identity proof levels (domain and customer link in 0.5; social-profile binding is draft P23; ID or face check is outside the protocol, via an identity service, nothing on the Shōkai visitor card); representatives grow with the context of each errand. Fictional people and places only.

Status tags used below: **core 0.5**, **extension**, **draft / proposal**, **outside the protocol**, **example / annotated story** (written or runnable, not a live shop door), **direction** (not an example yet).

## Findings (issue → fix)

1. **Placeholder film does not show the value across industries.** The `VisualSoon` block says "Coming soon: existing agents, as representatives, visiting a place and meeting safely inside." That is close to the visitor-card / Watch films already on the site, not a use-cases film. YSY asked for something that shows Shōkai serving more than one kind of place. → Replace the placeholder with the new ~30–45 s film (and a still poster): one Shōkai visitor card, carried by the same agent representative to three fictional doors of different openness. Caption must say the bank's identity check is outside the protocol.

2. **First mention is "agent", not "agent representative".** The opening sentence says "let agents in" and "sends an agent out". → At first mention, use "agent representative". Keep "agent" later once the role is named.

3. **The page never states the 0.5 frame: one Shōkai visitor card, many doors.** Nothing on the page says each place chooses how open its door is, or that identity proof levels differ by place (domain and customer link in 0.5; social-profile draft P23; ID / face check outside the protocol). → Add a short framing sentence in the introduction, and let the film carry it.

4. **Marketplace row says "turned away at first".** In 0.5 a setup failure or an unprepared visitor is `not_now` plus a leaflet or a reason, never a rejection, and "never" is reserved for misconduct. "Turned away" is the old leaflet wording YSY already asked to drop. → Say the representative goes home with a sentence its owner can act on, and comes back prepared.

5. **The shop row's leaflet line is almost right, slightly sharp.** "An anonymous visitor with no Shōkai card gets the leaflet and a kind 'not now'." Accurate, but "anonymous visitor" is fuzzy (a name on a card is only a claim), and the leaflet is an ask to come prepared, not a soft rejection. → "An agent with no Shōkai visitor card gets the leaflet from the door: not a rejection, an ask to come prepared."

6. **University row uses "never" for an honest student's pass, and "warm introduction" in intro copy.** "Never another student's records" reads like the door's `never` disposition, which 0.5 keeps for misconduct. "A study room with a classmate's warm introduction" is 0.3 vouching / introducer language in a use-case blurb; meeting inside a place is the optional Gatherings extension. → "…a pass for materials, submissions, their own grades and office hours, not another student's records. Inside, representatives the campus admitted can meet in a study room (optional Gatherings extension)."

7. **Fan community row presents a signed vouch as the normal path, unlabelled.** Vouching is optional core §4, and YSY asked to keep "introduced by someone known here" out of intro copy for now (later social-graph work). The use case can stay if it is labeled as a place that may ask for a vouch, and if it says the member signs it, not their representative. → Reword and label it optional.

8. **"A community or a gathering" presents the room as core.** The Read column already links the Gatherings extension; the "What Shōkai adds" column does not say it is optional. → Label it an optional extension in that column too.

9. **Bank row overclaims identity.** "Today Shōkai proves who is knocking: whose representative, what it's there to do, and until when" is easy to read as legal identity. A Shōkai visitor card proves authorization by the owner's passkey, not a legal identity (C199, `docs/real-identities.md`). A bank that already knows the customer can ask for a customer link (§5.4 / `ext-institutions`, in 0.5). A government ID or face check is done by the owner with an identity service, outside the protocol; nothing from it goes on the Shōkai visitor card. "No bank uses Shōkai today" is correct and should stay. → Rewrite the row along those lines. Keep Harborlight Bank and Kiran Vale, already the site's fictional pair.

10. **Heritage watchmaker row can be read as a live, built feature.** "Received as a collector, not a reseller" is place policy in an annotated story, not a live house door and not a taste-profile feature shipping in core 0.5. → Label it an annotated story, and say admission follows the house's own signed rules.

11. **Company internal tools: "role vouched for by the company".** Vouching language in intro copy. What 0.5 actually adds is a Shōkai visitor card the company (or employee owner) signed, plus narrower signed limits, and a local record. Single sign-on is outside the protocol. The linked page is an annotated / runnable example, not a live company door. → Reword; say SSO is outside the protocol; the door adds purpose, limits, and a local record.

12. **"A friend introduces a brand" is a vouching use case in intro copy.** It is a valid optional path (core §4, inbound door §10): the friend signs the vouch herself, scoped, revocable, with declared interest. YSY asked to keep the social-graph idea for later and not lead with it. → Keep the row, lower in "More places", clearly labeled optional.

13. **"On agent platforms today" is behind the approved test record.** It lists only Grok Bot, Muse, Hermes Agent and OpenClaw as admitted, and says "it just needs its Shōkai card." The approved audit also has live visits by Dot and a Claude.ai chat; installer and host skills rehearsed, not run at a live shop door; ChatGPT and Gemini installer-only; Duet never reached the door. "Just needs its Shōkai card" skips the skill. → Align with that record, or point to the homepage tested section and the field-tests page without an incomplete list.

14. **"Seats" in reader copy is already fixed on this page.** The working tree changed the university row from "is seated" to "gets a pass". No other "seat" remains on `/use-cases`. No fix needed here. (Linked examples and area pages may still say "seat"; out of scope except as a follow-up.)

15. **"Introduction" meaning visitor card is not used on this page**, except the leftover "warm introduction" / "friend introduces" vouching sense in findings 6, 7 and 12. The tea-house and shop rows are already in visitor-card language. Good.

16. **No "only / first" marketing claims** on this page. Keep it that way. (The financial area page's "can't get any other way" is a related risk, not on this page.)

17. **"Never" for honest visitors** appears only in the university row (finding 6) and in the safety section's "never obeyed" (hidden text), which is about not following injected text, not the door's `never` disposition. The safety line can stay, tightened to "is not obeyed" if we want to avoid the word.

18. **Games row is already honest** ("a direction, not an example yet"). Keep it.

19. **Tea house row is already in good 0.5 shape** after the uncommitted fix (Lanternmoss story walkthrough; Kettle & Leaf for the local trial). Keep it.

20. **"Browsing before joining" is accurate** (the listing is open; no Shōkai visitor card is needed to read it). Keep it; optionally mention the leaflet if the visitor then knocks unprepared.

21. **"Keeping a door and going out" (dual role)** is a runnable example: one representative, a Shōkai card for each role. Keep, and say "a Shōkai visitor card and a Shōkai host card".

22. **Safety section is in the right spirit** (not a use case of its own; built into every visit). Keep the links. No need to invent a shared score; the page already doesn't.

23. **Representatives grow with the context of each errand** is missing. → One short sentence in the intro or under the film: the same Shōkai visitor card is carried to each door, and the representative arrives with the context and signed limits of that errand.

24. **Linked examples may still carry 0.3 wording** ("introduction", "seat", older bank identity claims, P21 labeled only as a proposal, etc.). Follow-up, not this page's copy. The harborlight annotated visit still leans on a customer link for some beats and should not be contradicted by the use-cases row.

25. **Fictional-people disclaimer is already present.** Keep it. Use Kiran Vale, Harborlight Bank, and other established fictional names in the film; do not use real people or real banks as characters.

## What is in 0.5, what is not (for this page)

| Claim or use case | Status |
|---|---|
| Listing / leaflet at the doorstep; cardless agent gets the leaflet, `not_now`, not a rejection | core 0.5 |
| Shōkai visitor card (owner passkey) and Shōkai host card (place owner); possession proof; door decides on signed facts; pass is admission | core 0.5 |
| Owner-signed mandate / limits; report home; local record, no shared score | core 0.5 |
| Customer link for an existing customer (clinic, bank, etc.) | in 0.5, §5.4 (`ext-institutions`) |
| Organization / place tied to a domain (`did:web`) | core 0.5 |
| Optional vouch, signed by the introducer (not their representative) | optional core §4; do not lead intro copy with it |
| Gatherings / meeting in the place's room | stable extension, not core |
| Social-profile binding (e.g. a post from a real account) | draft proposal P23 |
| Government ID, face, or liveness check | outside the protocol, via an identity service; nothing on the Shōkai visitor card |
| Trust receipts / introduction cards (P27, P28) | mentioned on area pages; not claimed on this use-cases page (keep it that way) |
| Live shop / bank / campus / community doors | not claimed; examples are fictional, annotated, or runnable |
| Shopify or WordPress live integration | not on this page; still unrun |
| Games | direction only |
