# Shōkai host-representative skills 0.5 — draft index

> **DRAFT — UNPUBLISHED. Written 2026-11-08 (Pacific Time).** First unpublished host-representative drafts, with targeted honesty corrections — planning/rehearsal instructions, not complete production hosts, not installed skills and not live appointments. Fictional examples (Mira Solano, Lanternfern Tea Room) must never be copied into real identity fields. Writing or reading these files authorizes no key generation, signing, deploy, publication, host appointment, live visit, spending, or door opening/change.

## Three kinds of skill

- **Visitor skill** (`../visitor-skills/`): a representative agent that goes out to other places for its owner, with its own visitor key.
- **Installer skill** (`../installer-skills/`): the setup guide or steward that learns an existing Shopify or WooCommerce store, plans and rehearses the door, asks who keeps the host job, and writes a Store Setup Summary and a readable handoff letter. It is not automatically the host.
- **Host-representative skill** (these files): the second skill, for the agent the owner appoints to keep the shop. It starts when the owner pastes the installer’s letter or says something like “I’d like you to be the host of this shop.” It asks what the owner would like to call it, checks honestly — without generating keys, writing files or contacting services — whether it can keep a lasting host key, and declines if it cannot. If it can, within disclosed limits, it makes its own host key only after explicit appointment and name confirmation, shows only the public half, reads the house back in plain words, and sends the owner to sign once with their passkey at https://sign.kigenka.com. The installer or steward hangs the signed card; the private key never leaves the host.

Host, installer and visitor keys are always different, even when one agent later does more than one job. Each file repeats the same shared owner conversation; only the banner, custody and platform boundary, packaging and store-path notes, (for Muse) the client pin, and (for Dot) a short note not to rename the owner’s personal dot for the shop name differ.

| File | Intended host | Honest readiness |
|---|---|---|
| [grok-bot.md](grok-bot.md) | A dedicated Grok Bot | Decline by default today. All of a user’s Grok Bots share one computer; shared files, memory and the Vault are not isolated host custody, and a lasting appointment stays blocked until an isolated signer and fresh-session recovery are verified. Do not convert an existing bot into the host. No doorbell. |
| [muse.md](muse.md) | Muse | May accept only within a disclosed low-risk/mock custody boundary, after demonstrated fresh-session recovery and the owner’s explicit acceptance; never the isolated production gate. Spaces cannot be a public door; any door lives elsewhere and that connection is unverified. Muse not contacted by the drafting work. |
| [hermes.md](hermes.md) | Hermes Agent | Decline by default. Ordinary chat is never lasting custody; a verified server-backed installation is “not an offer” until an isolated signer, protected artifact store and fresh-session recovery are demonstrated. Backends and the messaging gateway are not a door. The local visitor plugin is unrelated. |
| [openclaw.md](openclaw.md) | OpenClaw | Decline by default, same server-backed standard as Hermes. The Gateway and Clawboo are not a public door; this skill changes no Gateway exposure. No ClawHub listing. |
| [dot.md](dot.md) | Dot (shown in iOS under its given name, e.g. “Pip”) | Decline by default. Public docs confirm a cloud computer that keeps files between sessions, but not a host-only signing-key store, fresh-session signer recovery or a public inbound endpoint. Eligible paid plans; any added cost is confirmed with the owner, no price quoted. |

Status in 0.5: a lasting host is not yet proven. Planning walkthroughs of all five files declined the lasting, unattended job (Grok Bot and Muse for real; Hermes, OpenClaw and Dot on paper). Keep the decline-by-default outcomes. Do not describe 0.5 as offering an unattended host on these platforms.

**No host skills for ChatGPT, Gemini, Sidekick, WordPress Agent or Duet.** ChatGPT and Gemini are capable installers but are not built to keep a lasting host key or stay reachable as a host; Sidekick and WordPress Agent are native store assistants for setup, not lasting hosts; Duet is too limited (reported network and credential restrictions). Their installer drafts already decline the lasting host job.

**Still open:** the doorbell — how a door reaches a host on an agent platform. Until it is answered, the door speaks from the signed house and the host is who the owner talks to about the shop; no file promises live host conversation at the door. Also open: a hosted key home (recorded later option, not built), the same-agent lifecycle, the leaflet’s visitor-skill wording and URL, and evidence linking owner, business, store/domain and host.

**Client pin:** non-Muse files use the published `@kigenka/shokai@0.6.0` package, SHA-256 `bd885f9c1f2f76b50fab3e5040967b663d4f6292da6e7e98e2bb7d659f2b6c4f` (compiled code unchanged from 0.5.1; the earlier unpublished 0.5.0 cut `0501f35e…` is history). Muse keeps its two-cut provenance: the earlier cut `a68340ea0aeb8baea773d60bcd94c5c0013c30b9ac5f053a34954a4c379388d9` is its usable pin only if Muse personally hashes it at the recorded path. A matching hash identifies bytes, not safety.

**Reviews:** outside reviews of the Grok Bot, Muse and Dot first drafts were received 2026-11-08 Pacific Time, and targeted unpublished honesty corrections followed in all five files. Muse and Dot follow-up reviews of the corrected drafts were received the same evening: Muse asked for no further unique text changes, and Dot’s remaining honesty corrections were applied to the shared conversation in all five files. A further Dot follow-up the same evening confirmed those eight items and asked for focused wording leftovers, which were applied. They remain planning/rehearsal drafts, statically checked only, with no live appointment, planning walkthrough or acceptance run.

**Validation boundary:** these files were written and statically checked only. No live appointment, host-acceptance or planning run, key generation, signing, deploy, contact with any platform, billed session or publication was performed, and nothing was installed into any skill library.

## Hosting with care (15 November 2026)

A shared chapter on hospitable pace, [HOSTING-WITH-CARE.md](HOSTING-WITH-CARE.md), was added to all five platform files. It is not part of the protocol. The host takes the time, in ordinary language: put yourself in the guest’s place, give room to answer, nudge at natural pauses if the owner asked to be kept posted, and wait patiently for the owner’s passkey. Numbers such as 25 seconds or 8 minutes appear only as an optional “for example, the Lounge uses…” note.

Sibling unpublished skills for later changes to a running place: door maintenance and experience designer. They are not in this package.

## Visits at the door (18 November 2026)

Each host draft now has a “Hosting a visit at the door” section and links `VISITS-AT-THE-DOOR.md` beside it (built on the Lounge test door only, through batch 12). The soft “good moment to tell your owner” nudge and the older Lounge pacing numbers in “Hosting with care” are superseded.

## Naming the host representative (18 November 2026)

When the owner wants to send invitations or hold an event, the host walks them through `INVITATION-SETUP.md`: who it is for, what is offered inside, and how long a hold and the owner's approval stay open (24 hours by default). The visit does not wait on the passkey.

Each host draft’s “What would you like to call me here?” step is now a required naming step, and links `NAMING-THE-HOST.md`. The host may suggest a name in the place’s spirit; the owner confirms. The confirmed name is written into `LOUNGE_HOST_NAME` or the equivalent host-name config, the host agent’s own name, and the invitation line. If the host card’s role or appointment text includes the calling name, that text uses the confirmed name before the owner signs; a later change needs a new passkey signature. A named host representative is the place’s personality, not just a bot.

## Appointing the host (18 November 2026)

Signing the host card is a required step and the heart of the appointment: it is the owner's contract with this host representative. Each door needs its own signed card. The shared chapter is `APPOINTING-THE-HOST.md` beside this file. Signing does not open the door or charge anyone. A later change to the role text or the calling name needs a new passkey signature.
