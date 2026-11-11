<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# The owner signing profile

*Part of Shōkai v0.5.0 (§1–§6 unchanged since v0.3.0; §7 states the reference page's supported languages; §8, §9 and §10 are new in v0.5.0). The verifier's rules are normative in [docs/SPEC-DETAIL.md](./docs/SPEC-DETAIL.md) Appendix A.1 (C51, C195); this document adds the rules for the page an owner signs on. Where the two seem to disagree, SPEC-DETAIL wins. Keywords as in BCP 14 (RFC 2119, RFC 8174).*

An owner (a person) signs their representative's Shōkai visitor card, mandates, allowance and consents with a passkey. The **signing page** is the web page where that happens, on the owner's own device. The representative never visits it; it only supplies its public DID and the unsigned items. Shōkai requires no particular signing page: a business can host one for its customers, a platform can build one into its app, and anyone can run their own. While Shōkai is a draft, Kigenka opens sign.kigenka.com for guided signing sessions; it is not an always-on service, it is outside the specification, and it comes with no uptime promise. The reference signing page (§7) lets anyone run their own: it is part of the open reference implementation, under Apache-2.0 like the rest of the reference code. A hosted signing service (such as sign.kigenka.com) is separate: it is Kigenka's commercial offering, not part of the specification or the reference implementation, and nobody needs it to use Shōkai.

## 1. The address

- A passkey belongs to one WebAuthn relying party (RP ID), normally the page's hostname. The page MUST be served over HTTPS at exactly `https://<rp_id>`: no port, no path prefix in the origin, no other subdomain.
- The RP ID is part of every signature (`webauthn.rp_id`) and of the Shōkai visitor card (`owner_binding.rp_id`, SPEC §2.1). If the hostname goes away, the owner's passkeys can never sign again there, so use a hostname you control and intend to keep (for example `sign.<your-domain>`), never a temporary tunnel or preview address.

## 2. What the page MUST do

1. **Run the ceremony itself.** Call WebAuthn from the top-level page. A verifier refuses an assertion whose `clientDataJSON.crossOrigin` is `true` or that carries a `topOrigin` (SPEC Appendix A.1, C195), so a page embedded in another site can't collect owner signatures. The page SHOULD also refuse to be framed (`Content-Security-Policy: frame-ancestors 'none'`).
2. **Require user verification** (`userVerification: "required"`) for registration and every assertion. Attestation isn't needed (`none` is fine).
3. **Show before signing.** Show the owner, in plain words and in their language, exactly what each item does: who it is for, what it allows, the limits and the expiry. Build what is shown from the item's machine fields (purposes, actions, amounts, counterparties or the lack of them, expiry, keys), never from a summary someone else supplied, and show it ahead of any free text; show free text written by someone else (including a supplied summary) only as a marked quote. A field the page can't put in words is shown as it is, not left out, at any depth; that includes anything signed by digest that the page is given (an allowance's grants, door rules' private part). A page that can't show a signed field faithfully, or that gets an item carrying fields of more than one kind, MUST NOT offer it for signing. (Clarification, 2026-10-28.)
4. **Build the challenge from the item.** The challenge is the 32 raw bytes of the item's payload digest (SHA-256 over JCS of the payload), base64url without padding, as SPEC Appendix A.1 says. Never sign a challenge the page didn't compute from an item it showed.
5. **Return the signature in the Appendix A.1 shape**: `webauthn` = `{authenticator_data, client_data_json, credential_id, rp_id}`, `value` the DER ECDSA signature, `signer` the owner's `did:jwk`.

## 3. One tap for several items (optional)

To approve, say, a Shōkai visitor card and a place's house rules at once, the page MAY sign 2 to 16 distinct items with one assertion (SPEC Appendix A.1, D23):
- the challenge is base64url of the raw digest bytes of JCS(`{"batch": [d1, …, dn]}`), with the items' payload digests in the order shown;
- each item gets its own copy of the signature with `webauthn.batch` = that list and `webauthn.batch_index` = its position;
- the page MUST show every item in the batch, on one screen or in a sequence the owner steps through, before the passkey prompt, and MUST NOT batch an item the owner didn't see.
- the page SHOULD NOT put an item that can spend money (a mandate with `max_amount`, an allowance with a spend budget) in a batch with anything else: each such item gets its own tap, so one biometric approval never covers a spending limit the owner read alongside other things (clarification, 2026-10-28).

A verifier checks each item on its own, so one item of a batch can be presented without the others; the others' digests are visible, but not their content.

## 4. What the page MUST NOT do

- Hold, receive, generate or log a private key. Passkeys stay on the owner's device; representative keys stay with the representative.
- Sign anything without the owner present and verified, or reuse one assertion for an item that wasn't in its batch.
- Ask the representative to visit, sign in or authenticate.

## 5. Per-place owner identities

To keep an owner unlinkable across places (SPEC §2.8), the page registers a separate passkey for each place under the same RP ID, each with its own WebAuthn `user.id`, and labels each one with the place's name so the owner can tell them apart in their passkey list. To link two identities for one place, the page shows the `OwnerLink` and has the owner sign it with both passkeys, one after the other.

## 6. When a passkey is lost

When a Shōkai visitor card is issued, the page can offer a standby revocation (`CardRevocation` with `standby: true`), signed by the same passkey, for the owner to keep or hand to someone they trust (SPEC §2.6). After a loss it can be delivered to places or added to the card's `revocation_url`. An owner with no passkey left starts over with a new passkey and new cards.

## 7. Running your own: checklist

The [reference signing page](https://github.com/Kigenka/shokai/blob/v0.5.0/reference/signing-page/README.md) is a small, dependency-free server that does §2–§4 as its README lists them (since 2026-10-28 it builds every summary from the item's machine fields). Run it on your own domain.

**Supported languages: English and Japanese.** The reference page words every item in English or Japanese, so it meets §2 item 3 only for owners who read one of them. It is not a conformant signing page for an owner in any other language, and it MUST NOT be described as meeting §2 item 3 for other languages. It doesn't fall back silently:
- an items file may name the owner's language (`owner_language`, a BCP 47 tag; English when absent). `en` and `ja` tags (such as `en-US` or `ja-JP`) are accepted; for any other language the page refuses to start and says why;
- the layout is the same in both languages and decision first: a one-purchase raise opens with the question and the purchase amount, then why approval is needed, the four figures, what it approves and what it doesn't, the seller (its name marked unverified), the deadline and the text that is signed; the technical identifiers (Shōkai visitor card, mandate, keys, hold, act digest, issued time, fingerprint) are under a collapsed Details section on the same page, never left out;
- in Japanese, every line is worded in Japanese from the same machine fields, in plain です/ます, with the same figures and the same checks, including the one-purchase raise and its refusals (§8). Amounts in yen are written 4,000円 in sentences and ¥4,000 in table cells, with no decimals unless the signed figure has them; other currencies by the Japanese number format with the currency's name; every time with its weekday and time zone (2026年11月2日（月）午前9:15（日本時間）); the raise's `shown_to_owner` is the Japanese text, locale `ja-JP`;
- when none of the browser's languages is the page's language, the page shows a warning at the top, before anything is offered for signing, telling the owner not to sign what they can't read.

Test: `reference/signing-page/test/language.mjs`, including a figures-equivalence check (the English and Japanese screens for the same items show the same amounts, times and identifiers, the same checks and the same one-tap behaviour). A signing page for other languages must word every item in that language itself, from the machine fields (§2 item 3).

- [ ] A stable hostname; the domain on auto-renew with registrar lock.
- [ ] Hardware-key two-factor sign-in on your registrar, DNS and hosting accounts.
- [ ] HTTPS only; HSTS; `frame-ancestors 'none'`; consider DNSSEC and CAA records.
- [ ] Sessions open only behind an unguessable, expiring link, closed otherwise.
- [ ] Logs hold only public keys, digests and decisions.
- [ ] User verification required on every ceremony; `crossOrigin` and `topOrigin` checked on your own server too.
- [ ] Owners told how to leave: create a passkey elsewhere and sign fresh Shōkai visitor cards.
- [ ] The signature counter and the owner registry (SPEC-DETAIL Appendix A.1, C240): if your page keeps state for an owner's credential, a nonzero stored or presented `signCount` must go up on every assertion (refuse one that doesn't; both zero, as with synced passkeys, is accepted and proves nothing), and a registration is never overwritten: a new passkey is a new registration.

*Informative (Kigenka's hosted page).* Kigenka's own signing page (sign.kigenka.com) opens private sessions only today. Offering it as a guided signing service for outside users is a trigger to revisit incorporating Kigenka before it is offered, as real money is; it is not offered until then.

## 8. A one-purchase raise (v0.5.0)

When a place holds a purchase above the owner's limit (SPEC §7.3), the representative brings home a `LimitRequest` and the owner may approve that one purchase with a superseding mandate (SPEC §5.1). The page offering it MUST:

1. **Show the place by its verified identifier**: its principal DID, or for `did:web` its domain (SPEC §2.1). A display name may follow only as "claims to be …".
2. **Check the figures before showing them**: `limit` against the owner's signed mandate (its `max_amount`, or the seat's when that is lower), `current` against the representative's own ledger for that binding ceiling, `seat` and `mandate` against the per-visit and whole-mandate ledgers when present, and `proposed` minus `current` against the `amount` of the held act. On any mismatch it MUST refuse: it offers nothing to sign and says that the place's figures didn't match (SPEC §7.3).
3. **Show the figures from the machine fields**: the binding ceiling (`limit`), what already counts against it (`current`), the one purchase (`proposed` minus `current`), the total (`proposed`), and when present both per-visit and whole-mandate ceilings and currents (`seat`, `mandate`).
4. **Say it is for this one purchase only**, in so many words: it doesn't raise the limit for anything else, at this place or elsewhere, and it ends with the hold.
5. **Show the deadline**: the hold's `expires_at`, in the owner's time zone, and say that doing nothing declines.
6. **Build the mandate from the hold, not from free text**: `max_amount` equal to `proposed` exactly, `expires_at` no later than the hold's, `supersedes.hold` = `{hold_id, act_digest}` from the `LimitRequest` and the hold, the same Shōkai visitor card, no `under_allowance`. It MUST NOT offer an amount above `proposed` or a longer expiry, even if asked.
7. **Write `shown_to_owner`** from what it showed under items 1 and 3–5, so the signed text is what the owner read. A door checks only that it is there (SPEC §5.1); its truth is this page's duty.
8. **Sign it alone**: never in a batch (§3), even with the act's own consent.

Example of what an owner reads (fictional): "Linden & Pike Teas (lindenpike.example) is holding one purchase: Buy a tin of tea, 40.00 USD. You allowed 30.00 USD for this errand; 20.00 USD is already spent, so this purchase brings it to 60.00 USD. Approve this one purchase only. It doesn't raise your limit for anything else. If you do nothing by 4:15 PM, it is declined."

## 9. A place's house config (v0.5.0)

When an owner signs a Shōkai host card, its `house_digest` covers the house config (SPEC §2.3). The page offering it MUST, before the passkey prompt:

1. **Show the lobby text in full**: `policy.lobby`'s `about` and `how` text and its `onboarding_url` by origin, since these are the words the door gives every agent that arrives without a Shōkai visitor card.
2. **Show the house summary** (`policy.summary`) as visitors will read it, and the conduct rules.
3. **Show each named outside service** (`policy.third_party_classifiers`, and `policy.model_providers` for an outside service that runs the host's model, SPEC §6.10): its name, purpose, the countries where it processes visitor content, how long it keeps it, and its role; and the place's own `retention_days` (default 30).
4. **Show the limits it enforces**: `limit_calls` and `hold_grace_s`, `repeat_caps`, `message_cap`, trust requirements and hold policies, in plain words.

It SHOULD refuse to offer a house config that a door must refuse to start with (SPEC §2.3, "A valid house config"): an unregistered conduct code or empty rule text, an incomplete classifier entry or the name `"*"`, a retention over 90 days, more than three door questions, `limit_calls` without purchase holds, or a summary that disagrees with the policy. (This section moves P26's "show the leaflet before signing" from a proposal into the profile.)

## 10. What a signature does and doesn't establish (v0.5.0)

*Informative: a boundary for implementers, places and anyone describing Shōkai. It is not legal advice and changes no rule above.*

Four different things are easy to run together. Shōkai provides the first two; it doesn't provide the last two.

1. **Credential verification.** A valid owner signature shows that a WebAuthn credential registered for that RP ID was used, with user verification, over exactly that signed data (SPEC Appendix A.1). It does not, by itself, establish the signer's legal identity, legal capacity or voluntariness, or that the signer has authority over any account (SPEC §2.1: a signature shows that the key signed, not who held it).
2. **Delegated authority.** A signed Shōkai visitor card, mandate or allowance records what the owner delegated to their representative agent: purposes, actions, counterparties, limits and expiry. Whether a particular act is legally attributable to the owner is decided by the law that applies to it, not by the signature alone.
3. **Financial authorization.** Permission to move money from an account is given under that account's own rules, by the bank, card network or payment provider, with its own authentication, consent evidence and consumer protections. A Shōkai mandate's `max_amount` is a limit the owner set for the representative; it is not that authorization, and it doesn't remove protections the owner has by law.
4. **Payment execution.** Shōkai is not a payment rail. Money moves only through a separate payment service, under its terms.

**Limits: where they are enforced.**
- **Place-enforced limits.** A place counts a mandate's operations and amounts across its own seats and refuses what goes over (C175). That is the only limit a single place can enforce and vouch for.
- **Representative-managed budgets across places.** A budget that spans several places is kept by the visiting representative itself (C176) or by an extra enforcement service the owner chooses. Shōkai has no shared ledger that every place checks, so a compromised or faulty representative can exceed an aggregate budget across places even though each place keeps its own limit. Nothing in Shōkai should be described as a universally enforced spending ceiling.

**Real money is a separate launch category.** Connecting Shōkai to real payments, bank accounts or financial credentials is a separate, higher-risk launch, with its own review of authority and attribution, consumer-protection rules, payment-provider obligations, shared spending controls and contracts. It is outside v0.5.0 and outside the fictional demos.
