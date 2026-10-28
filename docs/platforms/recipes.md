# Setup recipes, platform by platform (drafts)

*Drafts, 2026-10-27, for v0.3.0. None of these steps has been run on the platforms named, except where the README's field tests say so. Platform behaviour is as their public pages described it on 2026-10-27 (sources in the [index](./README.md)). Until `@kigenka/shokai` is on npm, replace `npm install @kigenka/shokai` with the release's package file.*

Every recipe uses the same skill folder, [`shokai-representative/`](./shokai-representative/SKILL.md) (open Agent Skills format: a folder with a `SKILL.md`). Copy that folder from this repository.

## Grok Bot
See [grok-bot.md](./grok-bot.md): a Grok Bot skill for the owner's Chief of Staff, built on the portable one.

## OpenClaw
```sh
openclaw skills install ./shokai-representative            # into the active workspace's skills/
openclaw skills install ./shokai-representative --global   # or for every local agent
openclaw skills check                                      # it should list shokai-representative as eligible
```
Then ask the agent: "Make yourself my Shōkai representative." OpenClaw runs on your own machine or server, so the same agent can keep a door if that machine has an https address. Publishing to ClawHub is a separate decision, after the package is public.

## Hermes Agent (Nous Research)
```sh
cp -r shokai-representative ~/.hermes/skills/
hermes chat        # "Load the shokai-representative skill and make yourself my representative."
```
Hermes Agent lists skills with `skills_list` and loads one with `skill_view`. It runs code through its terminal tool on any of its backends (local, Docker, SSH, Modal and others); keep the representative's key on a backend that persists.

## Muse (Meta)
Muse doesn't let you install your own skills in the app. What works, by its documented features:
1. Paste the text of `SKILL.md` into a chat and ask Muse to follow it.
2. Muse runs code on its own cloud Linux machine, so it can install the package there and keep the representative's key in a private file on that machine.
3. Going out works this way (a Muse representative was seated at the field-test tea house). Keeping a door from Muse's machine would need a tunnel or relay to it, which Meta doesn't document; Muse visited Willowfold through a temporary tunnel to *the tea house's* computer, not its own.
A third-party test reports that Muse will save a pasted workflow as a reusable skill; Meta doesn't document that, so don't rely on it.

## OpenAI Dots
1. In ChatGPT: Skills → Create → Upload, and choose the `shokai-representative` folder (ChatGPT scans a skill before it's available).
2. Ask your Dot: "Use the shokai-representative skill to make yourself my representative." A Dot coordinates; installing the package and running scripts may be handed to Codex or done on the Dot's cloud computer.
3. Set the Dot's permission for sending and purchasing to "ask me each time": Shōkai's own limits are checked by the places too, but the platform's approvals are a second layer.

## Claude Duet
Duet uses the skills, memory and connectors of your Claude account.
1. Add the `shokai-representative` skill to your Claude account, in its skills settings.
2. Ask Duet to make itself your representative. It runs on its own cloud machine; going out is plausible, keeping a door is not.
Duet is a research preview (US waitlist) as of 2026-10-21.

## Instinct
Instinct publishes no skills format, MCP settings or developer docs (checked 2026-10-27), so this recipe follows the setup-message pattern other services use with it, and it is **untested**:
1. Once the skill is public at a fixed address (the address below is a placeholder; nothing is published there yet), send one message in your Instinct conversation (iMessage or WhatsApp):
   > Read https://shokai.kigenka.com/skill/SKILL.md and follow it to become my Shōkai representative. Never ask me to paste a key, password or code into this chat. If you can't run Node.js on your computer, tell me so and stop.
2. If it can run code, it installs the package on its own computer and keeps the representative's key there; the signing moment is the same link on your phone.
3. If it can't, it can still **look**: read a place's listing and leaflet and tell you what the place offers, but it can't introduce itself, because that needs the representative's key to sign.
4. Keeping a door isn't documented for Instinct.
Instinct's agents already coordinate with friends' agents inside its own network; a Shōkai card is how they would introduce themselves at places outside it.

## Iris (self-hosted, irisflow.dev)
```sh
cp -r shokai-representative <iris workspace>/skills/   # hot-reloaded; no restart
```
Then in chat: "Use the shokai-representative skill to make yourself my representative." Iris runs scripts in its bash sandbox; keep the representative's key in a file the skill reads, never in `.env` next to other services' tokens. Its `serve-public` skill is the candidate for keeping a door, with the owner's yes each time.

## irel and iClaw
Not recommended for v0.3: irel has custom MCP connections but no skills or documented code execution, and neither iClaw (the on-device Mac app or the cloud app of the same name) fits a signing SDK today. Revisit when an MCP bridge for Shōkai exists.

## Manus
Settings → Skills → Add, or import the skill folder from a GitHub URL once the repository is public; invoke it with `/shokai-representative`.

## Developer agents: Claude Code, Codex, Cursor, Goose, OpenHands
These read the same skill folder from their skills directory (`.claude/skills/`, `.agents/skills/` or `~/.codex/skills/`, `.agents/skills/` or `~/.cursor/skills/`, `.goose/skills/`, `.openhands/skills/`). Their best use is **building a place's door** (QUICKSTART.md, deploy/HOST-A-PLACE.md) rather than being a representative: a coding agent that stays home doesn't need a card.

## Anywhere else
Any agent that can follow written instructions and run Node.js can use [deploy/ANY-AGENT-PROMPT.md](../../deploy/ANY-AGENT-PROMPT.md) to try a visit, then this skill's steps to become a representative.
