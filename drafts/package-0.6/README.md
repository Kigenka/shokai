# Package drafts (0.6)

Draft conversations an existing agent can have about Shōkai: installer, host, visitor, and invitation setup. They follow the live Shōkai Lounge door. They are labeled drafts: they are not installed natively from the `@kigenka/shokai` package, they are not a protocol role, and a lasting unattended host is not proven.

0.6.0 does not change the SDK's compiled code from 0.5.1. The specification version and wire tag stay v0.5.0 / `shokai/0.5`.

- `installer-spec.md` — installer design
- `visitor-skill-spec.md` — visitor-skill design
- `installer-skills/` — per-agent installer drafts and shared chapters (naming the host, appointing the host, visits at the door, invitation setup, hosting with care)
- `host-skills/` — host-representative drafts for Grok Bot, Muse, Hermes, OpenClaw, and Dot
- `visitor-skills/` — paste-ready visitor drafts for those same agents; `duet.md` is annotation only
- `how-this-was-reviewed.md` — how these drafts were reviewed
- `setting-up-a-place.md` — owner-facing story of standing up fictional Kettle & Leaf

The usual skill order is: door installer, host setup, visitor card and leaflet, then invitation setup. The installer must ask the owner to name the host; the calling name comes from one installer-written setting and is never hardcoded.

See also the [skills index](../../docs/skills/index.md).

Examples are fictional. Byline: YSY. American spelling.
