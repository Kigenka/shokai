# Use-cases film storyboard

**Title:** One Shōkai visitor card, many doors  
**Length:** about 40–45 seconds, 7 shots (plus a short title hold)  
**Style:** same as the Watch films (part one / part two): 1280×720, 25 fps, dark navy stage on the left, opaque event-stream panel on the right, gold step label and pale caption bar, Inter + JetBrains Mono, footer credit line. Event-stream type is near-white / pale mint on a solid dark panel, current line highlighted, older lines kept readable. **No matrix rain** (the Watch films now keep it only as a faint layer; this short film omits it so the log stays legible).  
**Pipeline:** a standalone page in `drafts/use-cases/film/`, recorded the same way as part one (`window.__seek(t)` in headless Chrome, ffmpeg, then the Watch mix: "A World in Your Hands" ducked 12 dB under each line). It does **not** edit `demo1-host` or `demo2-host` (another executor is aligning those films).  
**Voice:** ElevenLabs "Monique" (`gYGXjks6FzTWwNQ6X7hC`), `eleven_multilingual_v2`, one take per line, never time-stretched, loudness-matched to −18 LUFS. Cost reported with the preview.  
**Music / credits:** “A World in Your Hands” by YSY, CC BY 4.0. Narration voice: ElevenLabs. © 2026 Yu Sung Yeh. All people and places are fictional.  
**Honesty:** only 0.5 core behaviours are shown as real. The customer link is in 0.5 (§5.4). The bank's ID check is captioned **outside the protocol**. No vouching, no introducer, no Gatherings. No "only / first" claim. "Never" is not used for these honest visits. First mention of the visitor is "agent representative".

## Characters and places (fictional)

- **Kiran Vale**, owner (already used on the site with Harborlight Bank)
- **Nia**, Kiran's agent representative (new, short name in the Watch-film style)
- **Willowfen Tea Shop** — open door: any valid Shōkai visitor card
- **Ashmere Clinic**, booking desk — curated: also requires a customer link, made in the clinic's own app
- **Harborlight Bank** — requires a stronger identity proof, completed by Kiran with an identity service (outside the protocol), then the representative returns and is admitted

## Shots

Times below are a plan; they will be retimed to the recorded narration so a line is never sped up. Target total: 40–45 s.

### Shot 1 — At home: the Shōkai visitor card (~0:00–0:06)

- **Picture:** Kiran at home. A passkey prompt. She signs. Nia, her agent representative, receives a Shōkai visitor card.
- **Caption:** `STEP 1 · THE SHŌKAI VISITOR CARD` — Kiran Vale signs a Shōkai visitor card for Nia, her agent representative, with a passkey.
- **Narration:** "Kiran Vale signs a Shōkai visitor card for her agent representative."
- **Event stream:** `owner_sign` · Shōkai visitor card · signed by Kiran · passkey
- **What's real:** core 0.5 (owner passkey signs the Shōkai visitor card).

### Shot 2 — Willowfen Tea Shop, an open door (~0:06–0:13)

- **Picture:** Nia knocks. The door checks both cards (visitor + host) and Nia steps into the entryway. The host welcomes her. She says why she came. A pass appears. A short report home to Kiran.
- **Caption:** `STEP 2 · AN OPEN TEA SHOP` — Any valid Shōkai visitor card is enough. The door checks who is there, the host welcomes Nia, and a pass admits her.
- **Narration:** "At an open tea shop, that is enough, and a pass admits it."
- **Event stream (compressed eight-step beat):** `arrival` · valid Shōkai visitor card → `card_checked` + host card + possession proof → `welcome` → `purpose` + signed limits → `decision: yes` → `pass` · policy ∩ mandate ∩ request → `report_home`
- **What's real:** core 0.5. Admission is the pass, not the card check. The listing would be open on the doorstep; this short film starts at the knock.

### Shot 3 — Ashmere Clinic, a curated door (~0:13–0:20)

- **Picture:** The same Shōkai visitor card at a different door. The door also asks for a customer link. Nia presents the link Kiran already made in the clinic's own app. A pass. Report home.
- **Caption:** `STEP 3 · A CURATED CLINIC DESK` — The same Shōkai visitor card isn't enough on its own. The door also asks for a customer link, made with Kiran in the clinic's own app.
- **Narration:** "At a clinic, the door also asks for a customer link, made in its own app."
- **Event stream:** `arrival` · Shōkai visitor card → `customer_link` · co-signed in the clinic's app → `pass` → `report_home`
- **What's real:** customer link is in 0.5, §5.4 (`ext-institutions`). Shown as a signed fact the door can check, not as a password or session. Caption does not call it "core" in a way that hides the extension class; the storyboard labels it honestly. If on-screen space is tight, a small "0.5 · customer link" tag is enough.

### Shot 4 — Harborlight Bank, first visit (~0:20–0:27)

- **Picture:** Nia knocks at Harborlight. The door checks the Shōkai visitor card, then answers **not now**, with a reason. Nia returns to Kiran with care: what happened, what's needed, whether to try again. This is not a rejection and not `never`.
- **Caption:** `STEP 4 · A BANK SAYS NOT NOW` — Harborlight Bank asks for a stronger identity proof. The door says not now, with a reason, and Nia comes home with care.
- **Narration:** "Harborlight Bank wants a stronger identity proof, so the door says not now, with a reason."
- **Event stream:** `arrival` · Shōkai visitor card → `decision: not_now` · reason: stronger identity proof needed → `report_home` · what happened, what's needed, try again
- **What's real:** `not_now` with a reason and a way to try again is core 0.5. The requirement itself (government ID / face) is **outside the protocol** — said clearly in shot 5, and previewed here so the turn-away is not mysterious.

### Shot 5 — The identity service, outside the protocol (~0:27–0:34)

- **Picture:** Kiran, not Nia, at the bank's chosen identity service. A clear label: "Outside the protocol". No document or face is drawn onto the Shōkai visitor card. The card stays as it was.
- **Caption:** `STEP 5 · OUTSIDE THE PROTOCOL` — Kiran finishes the check herself, with the bank's identity service. Nothing from it is written on the Shōkai visitor card.
- **Narration:** "Kiran finishes that check with an identity service. Nothing is written on the Shōkai visitor card."
- **Event stream:** no invented Shōkai wire type for an ID check. A note only: `outside_protocol` · identity service · owner completes it · nothing on the Shōkai visitor card
- **What's real:** this is the intended pattern in `docs/real-identities.md`, **not** a 0.5 feature. The caption must say so. No brand logo for a real identity vendor.

### Shot 6 — Return to the bank, admitted (~0:34–0:40)

- **Picture:** Nia knocks again with the same Shōkai visitor card. The door checks a signed result or reference from the service (not the document). A pass. Report home.
- **Caption:** `STEP 6 · RETURN, THEN A PASS` — Kiran sends her representative back. The door checks the signed result, and admits Nia with a pass.
- **Narration:** "She sends her representative back, and a pass admits it. One Shōkai visitor card, many doors."
  (If this line runs long, the closing sentence can sit on shot 7 only.)
- **Event stream:** `arrival` · same Shōkai visitor card → `signed_result` · reference only (not the document) → `pass` → `report_home`
- **What's real:** the return, the pass, and the report home are core 0.5. The signed result from an identity service is the *intended* outside pattern, not a specified 0.5 field — keep the "outside the protocol" tag visible on this beat if the result is shown.

### Shot 7 — Close (~0:40–0:45)

- **Picture:** Three doors in a row (tea shop open, clinic curated, bank after the check), one Shōkai visitor card in front. Title: "One Shōkai visitor card, many doors. Each place chooses how open its door is."
- **Caption:** `SHŌKAI` — One Shōkai visitor card, many doors. Each place chooses how open its door is.
- **Narration:** If not already spoken at the end of shot 6: "One Shōkai visitor card, many doors. Each place chooses how open its door is."
- **Credits (footer, always on):** Willowfen Tea Shop, Ashmere Clinic, Harborlight Bank, Kiran Vale and Nia are fictional. No money moves. Music: “A World in Your Hands” by YSY, CC BY 4.0. Narration voice: ElevenLabs. © 2026 Yu Sung Yeh.

## Production path

1. Write a standalone Watch-style page (`drafts/use-cases/film/`), copying typography, colors, caption bar, event-stream panel, and footer — not the demo1-host sources, which another executor is editing.
2. Generate six Monique takes (one per line), strip tags, match to −18 LUFS, same as the Watch films.
3. Build a timeline that lengthens a shot when its line runs long; never time-stretch the voice. Hold about 0.3 s after each caption before the line starts.
4. Record 1280×720 at 25 fps through headless Chrome (`__seek` / `__duration`), mix with the theme (`musicDb: -8`, `duckDb: -12`, 300 ms ramps, fade in 1.5 s, fade out 3 s).
5. Write an English captions track (`.en.vtt`) from the on-screen captions, and a poster still (shot 7, or shot 2 if that frame is clearer).
6. Publish on the site at `/story/films/use-cases.mp4`, `-poster.jpg`, `.en.vtt`, and replace the use-cases placeholder. Leave part one and part two films untouched.

## Still-image fallback

If the film is not ready, or for a no-autoplay / reduced-motion poster:

- A single 1280×720 still of shot 7: three doors, one Shōkai visitor card, the title line, and a small "Outside the protocol" tag under the bank door.
- Alt text: "Diagram: one Shōkai visitor card carried to three fictional doors — an open tea shop, a clinic that asks for a customer link, and a bank that sends the owner to an identity service first, outside the protocol."
- The page can show this still in the same gold-bordered film frame, with the same figcaption, until the mp4 is in place.

## What this film will not show

- Vouching, an introducer, or "introduced by someone known here"
- Gatherings or a room of agents meeting
- P23 social-profile binding
- A real bank, a real clinic, a real identity vendor, or a real person's face
- Legal identity proved by the Shōkai visitor card
- A `never` answer for these honest visits
- A shared reputation score
