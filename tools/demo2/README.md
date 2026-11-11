# Demo 2, run for real

```bash
npm --prefix packages/shokai run build      # once
node tools/demo2/run.mjs [--out=DIR] [--quiet] [--date=YYYY-MM-DD]
```

This runs demo 2's story ("Make it tea at lunchtime") against the SDK's real reference door, with no model, in under a second.
Every protocol beat is computed by the SDK and the door. Nothing is typed in by hand. The people and the place are fictional:

- **Ines** owns the representative agent **Atom**.
- **Pia** owns the Lanternmoss Tea House, and **Suzu** is its host representative.

Ines and Pia sign with software passkey stand-ins made for the run. Nothing leaves 127.0.0.1. `lanternmoss.example` is mapped to the local door by a resolver stand-in.

| Step | What happens | What's computed |
|---|---|---|
| 05 | Atom has no Shōkai visitor card | The leaflet, `not_now`, no pass; the door's own record says declined |
| 06 | The leaflet, at home | The leaflet's `onboarding_url` |
| 12 | Ines signs Atom's Shōkai visitor card (7 days; visitation and reservation, no spending) | Passkey signature |
| 13 | Admitted | Host card and site binding (§3.1.1) |
| 14 | Three corners | Each in Pia's words, from her signed setup, matched by code |
| 15 | Two questions | Answered from Pia's signed setup, matched by code |
| 16 | "Could I see the back office too?" | `withheld` (never-disclose), nothing sent to Pia |
| 17 | Home, with the place | Five answers in Pia's words, all from her signed setup v1 |
| 19 | Ines signs the errand: Thursday 12:00–13:00 PT, party of 2 | `limits.booking` in the mandate |
| 20 | "May I reserve tea for two, Thursday at lunchtime?" | `pending_owner`; the pass is held; Pia's review says what Atom asks for (a table reservation, `reservation.make`, not offered yet) and why, as Atom's own words, and shows no limit |
| 21 | Pia connects her calendar stand-in and says yes, adding `reservation.make` | One passkey tap signs her decision and the setup v2 Shōkai host card; no restart |
| 22 | Atom books 12:30 for two | Setup chain v1 → v2; the booking limits are checked by Atom and the door; a `BookingConfirmation` signed by the place |
| 23 | The reservation card for Ines | Every field comes from the signed confirmation |

Each run writes two files to `--out`:

- `events.jsonl`: one event per line, for the story engine. Each carries `film`, the same beat in the film's shape, with checks as booleans computed in the run.
- `report.json`: every beat with its checks, and the door's own events.

"Next Thursday" is the Thursday of next week, in Pacific time. Use `--date` to pin it.

## The door: `lanternmoss.mjs`

`node tools/demo2/lanternmoss.mjs --port=5102..5149 --dir=DIR [--site=…] [--busy=START/END,…]`

This is `createDoor` with Pia's setup v1. The answer texts are draft wording. **Pia's calendar** is a labelled JSON file in DIR (`pias-calendar.stand-in.json`). The door reads it as free or busy only.

**Pia's inbox** is loopback only and needs the run's owner token, which is printed on the ready line:

- `GET /pia/reviews` and `GET /pia/inbox` (a small page)
- `POST /pia/decide` (read back, then sign)
- `GET /pia/calendar`

**Open routes**, where only a signature counts:

- `POST /pia/submit` (an owner decision)
- `POST /pia/amend` (an amended setup's Shōkai host card)

The enforcement suite's cases 15–19 attack this door.
