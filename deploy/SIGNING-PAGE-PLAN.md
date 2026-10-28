<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Plan: a live signing page at sign.kigenka.com

*Status, updated 2026-10-28. Shōkai v0.3.0-rc4.*

- **sign.kigenka.com is live, in its first form.** A Vercel project (`kigenka-sign`) serves `sign.kigenka.com` (one CNAME at the registrar). Between sessions it shows only an inert page ("No signing session is open"); during a 30-minute session, opened by a single-use tokened link, it relays `/p/<token>/*` to a short-lived backend (the "relay" option below).
- **The first real-phone session ran on October 27, 2026, 12:05–12:06 AM PDT** (field-test report, test 7, a draft): YSY made a passkey on his phone at `sign.kigenka.com` and signed four items (a card and a Willowfold mandate each for two representatives). All four verified afterwards against his new owner DID, the `rp_id` and the digests frozen before signing; the page then went back to inert.
- **What the live page is not yet.** It runs the session tooling prepared on October 26 (a copy of the rc3-era page), not the current reference page. So it predates the test-stage notice, the summaries built from machine fields and the spending-items-get-their-own-tap rule (CHANGELOG, Unreleased). Moving it onto the current reference page is a redeploy of the live project and needs YSY's OK; nothing in this repository deploys or changes it. The front for that redeploy is prepared in [deploy/sign-front](sign-front/README.md) (inert page, `/about` notice, and a relay that also forwards the rc4 page's `/about` and one-tap batch routes), with the exact commands, a smoke check and the rollback.
- **Serverless mode replaces relay mode (live since October 28, 2026, 11:14 AM PDT).** On October 28 the steward's box could no longer open a tunnel: its network lets out only web traffic, so a session backend there can't be reached. The page now runs entirely on Vercel Functions with a small store: [deploy/sign-serverless](sign-serverless/README.md). It is the same rc4 page and the same rules, and it needs no machine on during a session. YSY approved the three steps to go live: adding Upstash for Redis to the project (store `kigenka-sign-store`, free plan, `iad1`, Production), one env var (`SIGN_ADMIN_SECRET`), and the production deployment. The relay front's inert deployment is the rollback target.
- **The second real-phone session ran on October 28, 2026, 11:14–11:27 AM PDT** (field-test report, test 8, a draft), on the serverless page. YSY signed four new items in three taps with his passkey from October 27, with no new registration: one tap for both cards, then one for each mandate. All four verified against his owner DID and `rp_id`, with the reference crypto and again with the SDK. The session was then closed, and its link answers 404.
- Going further (an always-on page, other owners) is still a release gate that needs YSY's explicit OK.

## What a "live signing page" is, in plain words

Every representative needs an owner who signs for it. A person signs with a **passkey**: the Face ID or fingerprint prompt their phone already uses for websites. The **signing page** is the one web page where that happens. It shows the owner, in plain words, exactly what they are about to sign (this agent's card, what it may do, the limits, the expiry), and asks for one Face ID per item. The owner's private key never leaves the phone; the page only receives the signature.

"Live" means reachable from a real phone over the internet at a fixed https address. The reference page ([reference/signing-page](../reference/signing-page/README.md)) listens only on a computer's loopback address, which a phone can't reach and WebAuthn won't accept, so it needs an https front. The test suites use a software authenticator. Before October 27, the only real-phone passkey was made on a temporary tunnel address (October 25) and can never sign again now that the tunnel is gone. Since October 27, `sign.kigenka.com` has been that front, in relay mode, for one session so far (status above).

Without a live page, a person can't become an owner on their own phone. That is why an always-on page is still a launch gate.

## Why the address matters more than the hosting

A passkey is bound forever to one hostname, its relying party ID (`rp_id`). Every owner signature carries it (`webauthn.rp_id`), and every card names it (`owner_binding.rp_id`, SPEC §2.1, Appendix A.1). If the hostname goes away, every passkey made on it can never sign again: its owners must make new passkeys, which means new owner identities (SIGNING.md §1).

So the address is chosen once:

- **`sign.kigenka.com`, exactly.** One small, single-purpose host under a domain the steward keeps. The origin must be exactly `https://sign.kigenka.com` (no port, no path in the origin, no other subdomain; Appendix A.1, C195).
- **Not the apex `kigenka.com`.** With the apex as `rp_id`, any kigenka.com subdomain could ask for owners' signatures.
- **Never a tunnel or preview hostname.** Those change, and owners would lose their identity with them.

## Hosting

| Part | Where | Why |
|---|---|---|
| The page and its small API | A separate Vercel project used only for this host, with `sign.kigenka.com` as its only production domain | Static page plus a few functions; no shared cookies or scripts with any other site |
| DNS | One CNAME `sign` at the registrar, pointing to Vercel | Nothing else in the zone changes |
| Session state | Short-lived, per session: the registered public credential, the frozen items, and the signed outputs | Only public data: public keys, digests, signatures |
| Private keys | **None**, anywhere on the server | The passkey stays on the owner's phone; representative keys stay with the representative |

Two ways to run the server side, in order of effort:

1. **Relay (first launch, October 26–27).** The Vercel project serves the page and rewrites `/p/<token>/*` to the reference server running on the steward's own machine for the length of one session. The phone sees one https origin. It needs a tunnel from that machine, which the steward's box can no longer open (October 28).
2. **Serverless (replaces relay, prepared October 28).** The reference server's routes run as Vercel Functions ([deploy/sign-serverless](sign-serverless/README.md)). What the server kept in memory and files (challenges, frozen items, decisions, signed outputs, the signature counter) is in Upstash Redis, reached over its REST API. The steward opens a session with an admin call that needs a secret held in a Sensitive env var. The call mints a one-time token for at most 30 minutes; only the token's SHA-256 is stored. No machine has to be on during a session.

## Requirement: tell owners it's a test, and what happens if the address moves

*Added 2026-10-27 at YSY's request (omotenashi: answer the question before someone has to ask it). This is a launch requirement: the page doesn't go live without it.*

The notice is Kigenka's, not the protocol's, so it belongs in this deployment's page copy, not in the reference signing page that anyone runs on their own domain.

**Where it appears.** On the first screen of every session, before "Create my passkey", as a short box the owner can expand; again, one line, on the done screen; and in full on a plain `/about` page on the same host. Nothing is signed until the owner has seen the short form.

**The text (plain words, short form):**

> **This signing page is an early, test-stage convenience.** Shōkai is still a draft, and Kigenka runs this page while it's being tested.
>
> Your passkey stays on your phone or computer. Kigenka never sees it and can't sign for you.
>
> A passkey works only on the web address it was made on, here `sign.kigenka.com`. We plan to keep this address. If it ever has to change, we'll tell you at least 90 days in advance. A way to sign a move to a new key with the passkey you have now, so the places that know your representative can keep recognizing it, is planned (proposal P24, for v0.4) but doesn't exist yet; we won't move the address before it does.
>
> Everything you've already signed stays valid either way.
>
> You don't have to use this page. Anyone can sign with their own signing page or their own key; see "Signing on your own" below.

**The text (one line, done screen):** "Signed. Your passkey stays with you. This is a test-stage page; if its address ever changes, you'll hear from us first."

**FAQ entry** (the same words for the `/about` page, the docs FAQ and the site):

> **What if the signing page's address changes?**
> sign.kigenka.com is an early, test-stage convenience run by Kigenka while Shōkai is a draft. A passkey works only on the web address it was made on, so we intend to keep this address. If it ever has to move, owners will be told at least 90 days in advance, on this page, on the Shōkai site and in the repository, and given a way to move to a new key, signed with their current one, before the old address closes, so places that know them can keep recognizing them. That move is planned as proposal P24 for v0.4 and doesn't exist yet; Kigenka won't move the address before it does. Signatures already made stay valid. If an old key is lost before it can sign a move, the owner starts with a new identity and rebuilds through vouches and the places' own relationship with them. And no one has to use this page: experts can always sign with their own signing page on their own domain, a passkey there, or an organization key under their own domain (`did:web`). See SIGNING.md.

**Signing on your own (for experts).** Run the reference signing page on your own domain (SIGNING.md §7) and register your passkey there, or, for an organization, sign with a key published at `https://<your-domain>/.well-known/did.json` (`did:web`, SPEC §2.1). Places verify every owner signature the same way whatever page made it; Kigenka's page gets no special treatment.

**What "notified in advance" means, concretely** (90 days is the default; YSY can change it before launch):
- **How:** a banner on `sign.kigenka.com` itself, a notice on the Shōkai site and in the repository, and a signed notice that representatives' setup tools check (the SDK can read a small JSON file at `https://sign.kigenka.com/.well-known/shokai-notices.json`; proposed, not built). There are no accounts, so there is no mailing list unless owners choose to leave a contact (an open question for YSY).
- **When:** at least 90 days before the old address stops signing (the default in the notice; YSY can lengthen it, never shorten it once published), and the old address keeps serving a "this page has moved" notice, never anything else, for as long as the domain is kept.
- **What owners do:** open the old address once more, sign the move with their current passkey, then make a passkey on the new address (proposal P24); or, if browsers allow it by then, keep their passkey through WebAuthn related origins (P24, route 2).

**Never promised:** an uptime, a date, or that a move needs no action from the owner. The copy says "test-stage" until YSY decides otherwise.

## Steps (each needs YSY's OK where marked)

Where each step stands on 2026-10-28: **2, 3 and 6 are done** in the relay form (October 26–27). **1** was done for the session tooling, not for a tagged reference commit. **4**: the live front sets HSTS, `X-Frame-Options: DENY`, CSP `default-src 'none'` with `'self'` scripts and `frame-ancestors 'none'`, `no-store`, `noindex` and `no-referrer`; CAA records, hardware-key two-factor sign-in and registrar lock are not recorded here and need YSY to confirm. **5**: no separate dry run with a throwaway owner was recorded; the first session was YSY's real one. **7** is still to do. The remaining step is new: move the live page onto the current reference page (with `NOTICE=test-stage`), with YSY's OK.


1. **Freeze the code.** Tag the reference signing page at the commit that passes `node reference/signing-page/test/e2e.mjs`, and review the page copy (plain words first, action codes and amounts from machine fields), including the test-stage notice above.
2. **Create the project** (YSY's OK): a new Vercel project, production domain `sign.kigenka.com` only, no preview domains used for signing, deployment protection off for that one domain only.
3. **DNS** (YSY adds one CNAME record at the registrar).
4. **Harden** before the first real signature: HSTS, `frame-ancestors 'none'` and `X-Frame-Options: DENY`, CSP `default-src 'none'` with `'self'` scripts only, `no-store`, `noindex`, `Referrer-Policy: no-referrer`; CAA records naming only the TLS authorities Vercel uses; hardware-key two-factor sign-in on the registrar, DNS and hosting accounts; the domain on auto-renew with registrar lock (SIGNING.md §7).
5. **Dry run with a test phone** and a throwaway owner: create a passkey, sign a card and a mandate, verify both with `@kigenka/shokai` `verifySigned`, and run one visit at a local test door.
6. **First real session** (YSY's OK): YSY makes his owner passkey on `sign.kigenka.com` and signs his representatives' cards. The link is private, tokened, and closes itself after 30 minutes.
7. **Write it down:** the `rp_id`, the date, the deployed commit, and how to roll back, in RELEASING.md.

## Look-only preview (prepared 2026-10-28, NOT deployed)

**No signing ever happens on a preview deployment.** A passkey is bound to the hostname it was made on, so a passkey made on a `*.vercel.app` preview address would be a throwaway identity; the earlier idea of a signing session on a Vercel preview is dropped. Real signing happens only at `sign.kigenka.com`.

What stays is a look-only copy, for YSY to review the new page copy (the test-stage notice) on a real phone: its own Vercel project, `shokai-sign-preview`, preview deployments only, no custom domain, no production deployment. It is **not** the signing page: it has no script and no API, and its headers switch the browser's passkey feature off (`Permissions-Policy: publickey-credentials-create=(), publickey-credentials-get=()`), so no passkey can be made or used on the preview's `*.vercel.app` address. A passkey made on a preview address could never sign at `sign.kigenka.com`, which is why the copy says so in a red banner at the top.

**What's in it.** `deploy/sign-preview/site/`, generated by `node deploy/sign-preview/build.mjs` from `reference/signing-page/public/` with `NOTICE=test-stage` wording, `sign.kigenka.com` named as the intended address and 90 days as the notice period: the first screen with the short test-stage notice above "Create my passkey" (button disabled), and `/about` with the full text and FAQ. `vercel.json` sets the step-4 hardening headers (CSP `default-src 'none'` with styles from self only and no scripts at all, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store`, `noindex`, `Referrer-Policy: no-referrer`, HSTS, `nosniff`); `robots.txt` disallows everything. `tools/run-all-suites.sh` fails if the copy drifts from the reference page (`build.mjs --check`). Checked locally on 2026-10-28: the notice shows above the button on a 390 px phone and on desktop, the 90-day line and the address are there, no scripts load, and the passkey feature reports as not allowed.

**The exact commands (each run by YSY or with YSY's OK; nothing here has been run).** From the repository root, signed in to the Vercel CLI as the account YSY chooses, with `<team>` replaced by that team's slug:

```sh
node deploy/sign-preview/build.mjs --check                                   # the copy matches the reference page
cd deploy/sign-preview/site
vercel project create shokai-sign-preview --scope <team>                     # 1. create the project (YSY's OK)
vercel link --yes --project shokai-sign-preview --scope <team>               # 2. link this folder only (writes .vercel/ here)
vercel project inspect --non-interactive                                     # 3. confirm owner and project before deploying
vercel deploy --yes --scope <team>                                           # 4. PREVIEW deployment (YSY's OK); prints its URL
```

Never add `--prod`, never run `vercel domains add` or `vercel alias` for this project, and leave Vercel Authentication (deployment protection) on, so only signed-in team members can open the preview; open it signed in, or read it with `vercel curl <url>`.

**Teardown (when the review is done, or at any time):**

```sh
cd deploy/sign-preview/site
vercel remove <deployment-url> --yes --scope <team>                          # removes the one preview deployment
vercel project rm shokai-sign-preview --scope <team>                         # removes the project and any other deployments
rm -rf .vercel                                                               # the local link
```

Nothing else depends on this project: no DNS record points at it, and it holds no secrets or environment variables.

**What YSY needs to approve, one by one:** (1) creating the Vercel project `shokai-sign-preview` under a named account or team; (2) the one preview deployment; (3) keeping deployment protection on (the default) rather than making the preview public; (4) separately, moving the live `sign.kigenka.com` onto the current reference page, a redeploy of the live `kigenka-sign` project that this preview doesn't touch.

## Risks

- **Losing the hostname loses every owner's ability to sign.** Mitigations: a steward-held domain, auto-renew, registrar lock, two-factor everywhere. Signatures already made stay verifiable without the page; only new signing stops.
- **A hijacked page could show one thing and sign another.** The page never signs a challenge it didn't compute from an item it showed, and verifiers re-check digests, but a malicious deploy could still mislead an owner. Mitigations: deploy only tagged commits, hardware-key sign-in on the hosting account, and a published hash of the page's script files.
- **A leaked session link.** Someone else could open it first and register their own passkey. The page then shows "already set up" instead of "Create my passkey"; the owner stops and tells us. Links are single-use, 32+ random characters, and expire in 30 minutes.
- **Logs.** Vercel (and, in relay mode, the backend link) see the token URL and the public payloads. Nothing private is on the path, but what was signed is visible to the host.
- **Stored state (serverless).** The store holds only public data: the public owner credential and its counter, the frozen items, decisions, signed outputs, and challenge records. It never holds a private key or the session token. Signed outputs are kept 7 days, so the steward can collect them.
  - Someone with the store's token could change a frozen item. Every read re-checks each item's digest against its payload, and its summary against what the page's describer says about that payload now; an item that doesn't match is refused, so nothing is signed for it.
  - They could also replace an item with a different, self-consistent one. The owner would then see that item's true summary before signing, which is the same exposure as a hijacked deploy.
  - Swapping the stored credential can't produce signatures under the owner's DID: the DID is the passkey's own public key.
  - The store token lives only in the project's env vars, set by the integration.
- **Token handling (serverless).** The session token is 24 random bytes in the link path. The server stores only its SHA-256, and a session lasts at most 30 minutes, ending 2 minutes after the last decision; the steward can close it at once. The token does appear in Vercel's request logs, as in relay mode.
  - The admin route answers 404 to a missing or wrong secret, and locks for 10 minutes after 20 failures.
  - The admin secret is a Sensitive env var, read by the steward's CLI from a 0600 file and never printed.
- **Replay (serverless).** Function instances share nothing in memory:
  - each challenge is stored for 5 minutes and taken once (GETDEL), so the same assertion can't be used twice, even at the same moment on two instances (tested);
  - each decision is written once (SET NX);
  - a one-tap challenge is the digest of the exact items shown, in order;
  - the signature counter is kept in the store and must go up;
  - at most 32 challenges may be open per session (then 429), and bodies over 100 kB get 413.
- **Store outage (serverless).** If Upstash is unreachable, the page answers with an error and nothing is signed. If no store is configured, the page answers 503; it never falls back to per-instance memory.
- **First real Safari or Android run** may surface quirks the software authenticator didn't. Every step has "try again", and nothing is signed on an error.
- **A passkey proves possession, not a particular device** (SPEC §13 item 17).

## Rollback

- **Take the page down:** remove the production domain from the Vercel project (or pause the project). No one can sign new items; every signature already made keeps verifying, because verifiers check only the signature, its `rp_id` and origin, never the live page.
- **Never reuse the hostname for anything else.** Point it at a static "signing is paused" page instead. Keeping the name is what keeps owners' passkeys usable later.
- **Serverless back to the inert front:** Vercel Instant Rollback to the inert front deployment (`<inert-front-deployment-id>`), then, if wanted, remove `SIGN_ADMIN_SECRET` and disconnect the store; collect results first with `admin.mjs results`.
- **A bad deploy:** roll back to the previous tagged deployment in Vercel; owners re-sign any item signed during the bad window, and the steward publishes card revocations for anything doubtful (SPEC §2.6: a revocation also ends every open seat the card holds, C198).
- **Abandoning `sign.kigenka.com` entirely** is the one irreversible failure: owners would need new passkeys and new owner identities on a new hostname. The plan avoids it by keeping the domain. If a move is ever unavoidable, follow the notice above: announce it in advance, keep the old address signing until owners have signed their moves (proposal [P24](../proposals/P24-owner-key-move.md)), and only then stop.

## What is not in this plan

Publishing the npm package, deploying the website, and any message to anyone outside the project are separate gates.
