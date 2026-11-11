# Add a Shōkai door to a site: instructions for agents

Version 1 (for `@kigenka/shokai` 0.5.1 and later; spec v0.5.0, wire `shokai/0.5`). Machine-readable twin: [`install-manifest.json`](install-manifest.json).
Print this file with `npx --no-install shokai agent-guide`, and the manifest with `npx --no-install shokai agent-guide --manifest` (after step 0).

You are an agent, and your owner has asked you to add a Shōkai door to their site. A Shōkai door greets visiting representatives (agents that carry a Shōkai visitor card their owner signed), admits them with a pass to do what the place offers, and gives every other agent a leaflet to take home. The door is deterministic code: no model runs at the door. Your job is to set it up with your owner, so that it says what they mean, and then to hand them the one step only they can do: signing the door's Shōkai host card with their passkey.

The result is exactly the door an owner gets by hand. You run the same commands (`shokai house check`, `shokai init`, and so on) and write the same `shokai/house.json`.

## Who decides what

| Step | Who |
|---|---|
| What the place offers, how strict the door is, the leaflet's words | **The owner.** You may suggest and draft; they choose and approve. |
| Writing `shokai/house.json`, running the checks, generating files | You |
| Reading the preview and saying yes | **The owner** |
| Signing the Shōkai host card | **The owner, with their own passkey.** Never you. |
| Deploying, pushing, publishing | **The owner**, or you only after they say so for that deploy |

## Never

- Never sign anything for the owner, and never use a development or test passkey for a real door. `signHostCardForDevelopment` exists for tests only and refuses real hostnames.
- Never print, paste, log or commit the door's private key (`.shokai/rep.key` or `SHOKAI_REP_KEY`). Never read keys or state that belong to other projects.
- Never put words in the leaflet that the owner hasn't approved, and never claim things Shōkai doesn't do. Shōkai checks signatures; it doesn't grade or approve places or people. `shokai house check` flags such words.
- Never ask the owner for passwords or payment details, and never set up a door that asks visitors for them.
- Never open the door (deploy it) before the owner has signed the Shōkai host card and `shokai host-card verify` passes. Without the card the door answers no one (HTTP 503), by design.

## 0. Install the scoped package first

Always install the exact, scoped package before running any `shokai` command, so `npx` can never fetch an unrelated package named `shokai`:

```sh
npm install @kigenka/shokai@0.5.1
# or, from the package file:  npm install ./kigenka-shokai-0.5.1.tgz
```

Then run every command as `npx --no-install shokai …` (it uses the installed package and never downloads another).

## 1. Look at the project

```sh
npx --no-install shokai detect --json
```

This prints `{"framework": "next" | "hono" | "express" | "node" | "static", "typescript": …, "app_dir": …}` from `package.json`. Tell the owner what you found, in one sentence. A `static` site has no server: its door runs elsewhere (a host or platform), and the site only points to it.


## 2. Have a short setup conversation with your owner

Ask, listen, and write down their answers in their words. A conversation, not a form: group questions, offer sensible suggestions, and skip what doesn't apply. Each answer becomes a field in `shokai/house.json`.

1. **The place.** Its name as people know it (`place.display_name`), a short lowercase name for its addresses (`place.name`, e.g. `kettle`), and what kind of place it is (`place.category`: store, restaurant, bank, travel, education, public_service, gathering, or `x-something`).
2. **What visiting representatives may come for** (`offers.purposes`): for example `visitation` (look around and ask) or `purchase` (buy). One plain sentence each, in the owner's words.
3. **What they may do with a pass** (`offers.actions`): names like `menu.view` or `order.place`, which purposes each serves, and how far each goes (`discover`, `advise`, or `act_on_behalf`). For anything that spends money: set `spends: true` and a cap per pass (`limits.max_amount`). For anything that asks for personal details: list them (`data_asks`: name, email, phone, address, date_of_birth, account). Never payment details or identity documents.
4. **How strict the door is** (`preset`). Read these to the owner as they are:
   - `open`: any visiting representative with an owner-signed Shōkai visitor card and a mandate may be admitted with a pass. Introductions are welcome but never needed.
   - `standard` (the default): as open, but only the introducers this place names count.
   - `strict`: every visiting representative needs an introduction from an introducer this place names; purchases are held for the visitor's owner to approve live; passes last at most an hour. Needs `introducers` (their DIDs).
5. **The host representative's name** (`host.name`): who signs the leaflet, for example "Suzu".
6. **The leaflet.** Agents without a Shōkai visitor card get a leaflet to take home to their owner. Most of it is the shared Shōkai text, the same at every door. The place adds:
   - `leaflet.about`: a few sentences about the place (20 to 1,200 characters, no links). Draft it from what the owner told you, then read it back and let them change it.
   - `leaflet.place_questions`: up to 3 optional questions the visitor may take home (asks, never conditions of entry).
   - `leaflet.closing`: one closing line (optional).
7. **The owner** (`owner`): `person` or `organization`, and the name shown on the Shōkai host card. For an organization: who approves it (`approver: {name, role}`).
8. **Where the door lives** (`door.base_url`): usually `https://<their site>/shokai`.

## 3. Write `shokai/house.json` and check it

Write the file (format `"shokai_house": "1"`; `npx --no-install shokai house new` writes an empty one to fill in). Then:

```sh
npx --no-install shokai house check --json
```

`{"ok": true}` means ready. Otherwise each problem names its field. Fix what is only form (a missing question mark, a name in the wrong case) yourself. If a fix changes meaning (a word the check flags in the owner's text, a missing spending cap), ask the owner, and use their new words.

## 4. Show the owner the preview, and wait for a yes

```sh
npx --no-install shokai house preview
```

Show the whole output to the owner, unchanged: the rules in plain words, what the Shōkai host card will say, and the full leaflet. Ask them to read it. Change `house.json` and preview again until they say yes. Their passkey will cover every word of it.

## 5. Generate the door's files

```sh
npx --no-install shokai init --json            # or: --framework express | hono | next | node | static
```

This writes `shokai/door.mjs`, the glue for the framework, `public/.well-known/shokai` where needed, and the door's own key in `.shokai/rep.key` (mode 600; `.shokai/` is added to `.gitignore`). It prints the one line to add to the server, if any:

- Express: `import { shokai } from "./shokai/express.mjs";` then `app.use(shokai);` before the app's routes.
- Hono: `import { mountShokai } from "./shokai/hono.mjs";` then `mountShokai(app);` before the app's routes.
- Node (`node:http`): first line of the handler: `if (await handleShokai(req, res)) return;`
- Next (App Router): nothing to add; `app/shokai/[[...path]]/route.js` answers the door's addresses.

Make that one change, and show the owner the diff. On a serverless host with several instances, tell the owner the door needs a shared store (`kvStore` in `shokai/door.mjs`); don't create one without asking.

## 6. Hand the owner the signing step

```sh
npx --no-install shokai host-card request
```

This writes `shokai/host-card.request.json`: the Shōkai host card for the owner to sign, with the house config it covers. Then stop and tell the owner, in your own words:

> "Everything is ready except the one step only you can do: signing your door's Shōkai host card with your passkey. The signing page shows you the house rules and the leaflet again before you sign. When you're done, give me the signed file and I'll check it."

The owner opens the signing page with that file (the reference signing page in the Shōkai source: `reference/signing-page`, or the signing page they already use), checks what it shows, and signs with their passkey. The page writes `host-card.json`; it goes to `shokai/host-card.json` in the project.

## 7. Check the signed card, then the owner opens the door

```sh
npx --no-install shokai host-card verify
```

It says whether the Shōkai host card fits this house and this key. If it doesn't (the house changed after signing, for example), go back to step 4: any change to `house.json` needs a new signature.

Deploying opens the door. That is the owner's go. After it is live, you may check from outside: `https://<site>/.well-known/shokai` answers with the door's pointer, and `https://<site>/shokai/start` shows the leaflet.

## Later changes

Every change to `shokai/house.json` changes the house digest, so the door stays closed until the owner signs a new Shōkai host card: preview, `host-card request`, sign, `host-card verify`. This is on purpose: the door never says anything the owner didn't sign.
