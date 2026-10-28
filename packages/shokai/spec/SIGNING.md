<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# The owner signing profile

*Part of Shōkai v0.3.0. The verifier's rules are normative in [SPEC.md](./SPEC.md) Appendix A.1 (C51, C195); this document adds the rules for the page an owner signs on. Where the two seem to disagree, SPEC.md wins. Keywords as in BCP 14 (RFC 2119, RFC 8174).*

An owner (a person) signs their representative's card, mandates, allowance and consents with a passkey. The **signing page** is the web page where that happens, on the owner's own device. The representative never visits it; it only supplies its public DID and the unsigned items. Shōkai requires no particular signing page: a business can host one for its customers, a platform can build one into its app, and anyone can run their own. While Shōkai is a draft, Kigenka opens sign.kigenka.com for guided signing sessions; it is not an always-on service, it is outside the specification, and it comes with no uptime promise. The reference signing page (§7) lets anyone run their own.

## 1. The address

- A passkey belongs to one WebAuthn relying party (RP ID), normally the page's hostname. The page MUST be served over HTTPS at exactly `https://<rp_id>`: no port, no path prefix in the origin, no other subdomain.
- The RP ID is part of every signature (`webauthn.rp_id`) and of the card (`owner_binding.rp_id`, SPEC §2.1). If the hostname goes away, the owner's passkeys can never sign again there, so use a hostname you control and intend to keep (for example `sign.<your-domain>`), never a temporary tunnel or preview address.

## 2. What the page MUST do

1. **Run the ceremony itself.** Call WebAuthn from the top-level page. A verifier refuses an assertion whose `clientDataJSON.crossOrigin` is `true` or that carries a `topOrigin` (SPEC Appendix A.1, C195), so a page embedded in another site can't collect owner signatures. The page SHOULD also refuse to be framed (`Content-Security-Policy: frame-ancestors 'none'`).
2. **Require user verification** (`userVerification: "required"`) for registration and every assertion. Attestation isn't needed (`none` is fine).
3. **Show before signing.** Show the owner, in plain words and in their language, exactly what each item does: who it is for, what it allows, the limits and the expiry. Build what is shown from the item's machine fields (purposes, actions, amounts, counterparties or the lack of them, expiry, keys), never from a summary someone else supplied, and show it ahead of any free text; show free text written by someone else (including a supplied summary) only as a marked quote. A field the page can't put in words is shown as it is, not left out, at any depth; that includes anything signed by digest that the page is given (an allowance's grants, door rules' private part). A page that can't show a signed field faithfully, or that gets an item carrying fields of more than one kind, MUST NOT offer it for signing. (Clarification, 2026-10-28.)
4. **Build the challenge from the item.** The challenge is the 32 raw bytes of the item's payload digest (SHA-256 over JCS of the payload), base64url without padding, as SPEC Appendix A.1 says. Never sign a challenge the page didn't compute from an item it showed.
5. **Return the signature in the Appendix A.1 shape**: `webauthn` = `{authenticator_data, client_data_json, credential_id, rp_id}`, `value` the DER ECDSA signature, `signer` the owner's `did:jwk`.

## 3. One tap for several items (optional)

To approve, say, a card and a place's house rules at once, the page MAY sign 2 to 16 distinct items with one assertion (SPEC Appendix A.1, D23):
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

When a card is issued, the page can offer a standby revocation (`CardRevocation` with `standby: true`), signed by the same passkey, for the owner to keep or hand to someone they trust (SPEC §2.6). After a loss it can be delivered to places or added to the card's `revocation_url`. An owner with no passkey left starts over with a new passkey and new cards.

## 7. Running your own: checklist

The [reference signing page](./reference/signing-page/README.md) is a small, dependency-free server that does §2–§4 as its README lists them (since 2026-10-28 it builds every summary from the item's machine fields), with one gap: it shows them in English only, not yet in the owner's language (§2 item 3). Run it on your own domain.

- [ ] A stable hostname; the domain on auto-renew with registrar lock.
- [ ] Hardware-key two-factor sign-in on your registrar, DNS and hosting accounts.
- [ ] HTTPS only; HSTS; `frame-ancestors 'none'`; consider DNSSEC and CAA records.
- [ ] Sessions open only behind an unguessable, expiring link, closed otherwise.
- [ ] Logs hold only public keys, digests and decisions.
- [ ] User verification required on every ceremony; `crossOrigin` and `topOrigin` checked on your own server too.
- [ ] Owners told how to leave: create a passkey elsewhere and sign fresh cards.
