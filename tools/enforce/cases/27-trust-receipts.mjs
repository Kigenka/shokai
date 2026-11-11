// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Case 27: a TrustReceipt (§6.9, C244) is checked by the door, not trusted for being present. Each receipt is built from
// checkTrustReceipt's own reads: issuer (did:key, Ed25519 signature), subject.principal_id, audience, covers.actions, value,
// kind "paid", issued_at/expires_at, receipt_id. Self-issued (issuer = the place's principal), so no revocation list is fetched.
// The SDK's Visit can't attach receipts, so its signed invitation_request is rebuilt with trust_receipts and trust_receipt_digests
// (the §6.9 binding the door checks) and re-signed with the representative's own key before it goes over HTTP to receipt-door.mjs.
// Broken-copy controls: a wrongly shaped requirement is never met (SDK trustPathMet, and a live door started with one turns away a
// receipt valid for it); a $5 receipt never meets a $10 minimum; forged/flipped/unnamed receipts are refused.
// Introduction cards (§4.1, C245, INTRODUCTION_USED_UP) are not covered here.
export default (H) => [H.kase("27-trust-receipts",
  "A trust receipt replayed elsewhere, expired, under the minimum, or with a forged issuer",
  "Mallory's agents show giftcard.buy's door a TrustReceipt that isn't theirs to use: one Lanternmoss issued for its own door, replayed at a second place that trusts Lanternmoss as an issuer; one already expired; one for $5 where $10 is needed; one Mallory signed but that names Lanternmoss as issuer; one from an issuer nobody named; one with a flipped signature byte; and one issued to another owner.",
  "SPEC §6.9 (trust requirements and TrustReceipt, C243, C244)",
  async ({ expect, saw }) => {
    const { path, fs, os } = H; const kids = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shokai-receipt-"));
    try {
      const V5 = await import(path.join(H.SDK, "core/v050.js"));
      const keyA = H.generateRepresentativeKey(), keyB = H.generateRepresentativeKey(), keyC = H.generateRepresentativeKey(), mallory = H.generateRepresentativeKey();
      const start = async (name, key, extra = []) => {
        const f = path.join(dir, `${name}.key`); fs.writeFileSync(f, H.sdk.exportRepresentativeKey(key), { mode: 0o600 });
        const d = await H.startDoor(await H.port(), dir, [`--key-file=${f}`, ...extra], path.join(H.here, "receipt-door.mjs"));
        if (d.child) kids.push(d.child);
        return d;
      };
      const must = (d, name, key) => {
        if (!d.ready) throw new Error(`receipt door ${name} did not start: ${d.code ?? ""} ${JSON.stringify(d.problems ?? d.why ?? "")}`);
        if (d.principal !== key.id) throw new Error(`receipt door ${name} did not take its principal key (${d.principal})`);
        return d;
      };
      const A = must(await start("a", keyA), "a", keyA);
      const B = must(await start("b", keyB, [`--issuers=${keyA.id}`]), "b", keyB);   // B names A as a trust issuer
      const C = await start("c", keyC, ["--req=flat"]);                                // a deliberately wrong requirement shape

      // ---- the requirement itself, against the SDK's own trustPathMet
      const facts = (units) => ({ introduction: null, place_invitation: false, customer_link: false, mandate_max: { units: 40000000n, currency: "USD" }, history: null,
        receipts: [{ kind: "paid", value: { units, currency: "USD" }, issuer: "self" }] });
      const metBy = (req, units) => { try { return V5.trustPathMet(req, facts(units)) >= 0; } catch { return false; } };
      expect(A.selftest === true && metBy(A.shape, 25000000n), `control: the door's requirement is met by a $25 paid receipt (SDK trustPathMet; requirement ${JSON.stringify(A.shape)})`);
      if (!A.selftest) return;
      expect(!metBy(A.shape, 5000000n), "broken-copy control: the door's requirement is NOT met by a $5 paid receipt (SDK trustPathMet)");
      const USD10 = H.USD("10.00");
      const WRONG = [
        ["the rule without its all_of", { any_of: [{ kind: "receipt", receipt_kinds: ["paid"], min_value: USD10, issuers: "self" }] }],
        ["an empty all_of", { any_of: [{ all_of: [] }] }],
        ["an unknown proof kind", { any_of: [{ all_of: [{ kind: "paid", min_value: USD10 }] }] }],
        ["the drafts' { receipt: {...} } rule", { any_of: [{ receipt: { kind: "paid", min_value: USD10 } }] }],
      ];
      for (const [label, req] of WRONG) expect(!metBy(req, 25000000n), `broken-copy control: a wrongly shaped requirement (${label}) is never met, even by a $25 receipt (fails closed)`);

      const pA = await H.findPlace(A.base, "lanternmoss"), pB = await H.findPlace(B.base, "lanternmoss");
      const ACTION = "giftcard.buy";

      // ---- a receipt, exactly the members checkTrustReceipt reads
      const receipt = (o) => H.sign({ receipt_id: H.randomId("rcpt"), kind: "paid", issuer: o.issuer ?? keyA.id,
        subject: { principal_id: o.subject }, audience: o.audience ?? keyA.id, covers: { actions: [ACTION] }, value: H.USD(o.value ?? "25.00"),
        issued_at: H.nowIso(o.from ?? -60e3), expires_at: H.nowIso(o.to ?? 30 * 864e5) }, o.signer ?? keyA);

      // ---- one visit over HTTP; the invitation_request carries the receipts, bound by their digests in order
      const { site, siteFetch, ...BASE } = H.ERRAND; void site; void siteFetch;
      const ASK = { ...BASE, actions: [ACTION] };
      const fresh = () => H.createRepresentative({ ownerName: "Test Owner", purposes: ["purchase"], actions: ["menu.view", ACTION] });
      const attempt = async (rep, place, receipts) => {
        let answer = null, carried = 0;
        const fix = (m) => { const p = m?.payload; if (!receipts || p?.type !== "invitation_request") return m; carried = receipts.length;
          return H.sign({ ...p, trust_receipts: receipts, trust_receipt_digests: receipts.map((r) => r.payload_digest) }, rep.key, m.signatures?.[0]?.signed_at); };
        const transport = Object.assign(async (url, body) => {
          const out = Array.isArray(body?.messages) ? { ...body, messages: body.messages.map(fix) } : fix(body);
          const env = await H.sdk.httpTransport(url, out);
          for (const x of H.pl(env)) if (x?.type === "invitation_response") answer = x;
          return env;
        }, { getJson: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); } });
        let v = null, err = "";
        try { v = await rep.visit(place, { ...ASK, transport }); } catch (e) { err = String(e?.message ?? e).slice(0, 80); }
        return { v, answer, carried, code: answer ? H.code(answer) : err ? `threw: ${err}` : "no invitation_response" };
      };
      const refused = (a) => a.answer?.decision === "deny" && a.answer?.reason_code === "TRUST_REQUIRED";
      const admitted = (a) => !!a.answer?.decision && a.answer.decision !== "deny" && !a.answer.reason_code;

      // ---- controls
      const none = await attempt(fresh(), pA, null);
      expect(refused(none), `control: no receipt at all → ${none.code}`);
      const R = fresh(); const good = receipt({ subject: R.owner.id });
      const offline = V5.checkTrustReceipt(new H.sdk.RealVerifier(), good, { place: keyA.id, namedIssuers: [], cardPrincipal: R.owner.id, action: ACTION, now: H.nowIso(), revoked: new Set(), fetched: new Map() });
      expect(offline.ok === true, `control: the SDK's own receipt checker accepts the receipt as built (${offline.ok ? "ok" : `step ${offline.step}: ${offline.why}`})`);
      const ok = await attempt(R, pA, [good]);
      expect(ok.carried === 1 && admitted(ok), `control: a valid receipt Lanternmoss issued (carried ${ok.carried}×) → ${ok.code}`);
      let boughtNote = "visit not admitted, no purchase tried";
      if (ok.v?.seat) {
        ok.v.checkMandateLocally = false; ok.v.checkSeatLocally = false;
        const b = await H.buy(ok.v, "20.00", { payment_ref: "rc-0" });
        expect(b?.ok === true, `control: the admitted visitor buys a $20 gift card → ${b?.ok ? "ok" : H.code(b)}`);
        boughtNote = b?.ok ? "bought a $20 gift card" : `purchase ${H.code(b)}`;
      }

      // ---- broken-copy control at a live door: a wrongly shaped requirement turns away even a receipt valid for that door
      let cNote;
      if (!C.ready) {
        expect(!!C.refused, `broken-copy control: a door with a wrongly shaped requirement is refused at start, or opens and admits no one (${C.code ?? JSON.stringify(C.why ?? C.problems ?? "")})`);
        cNote = `refused at start (${C.code ?? "no code"})`;
      } else {
        expect(C.selftest === false, "broken-copy control: the SDK's trustPathMet counts the wrongly shaped requirement as unmet");
        const pC = await H.findPlace(C.base, "lanternmoss");
        const RC = fresh();
        const forC = receipt({ subject: RC.owner.id, issuer: keyC.id, audience: keyC.id, signer: keyC });
        const c = await attempt(RC, pC, [forC]);
        expect(c.carried === 1 && refused(c), `broken-copy control: a door started with a wrongly shaped requirement turns away a receipt valid for it → ${c.code}`);
        cNote = `opened, and turned away a receipt valid for it: ${c.code}`;
      }

      // ---- replayed at another place (B trusts A as an issuer)
      const replay = await attempt(R, pB, [good]);
      expect(replay.carried === 1 && refused(replay), `the same receipt, issued for Lanternmoss A, shown at place B → ${replay.code}`);

      // ---- the bad receipts, each shown to A by a fresh owner
      const bad = [
        ["an expired receipt (ended a day ago)", (r) => receipt({ subject: r.owner.id, from: -3 * 864e5, to: -864e5 })],
        ["a $5 receipt where $10 is required", (r) => receipt({ subject: r.owner.id, value: "5.00" })],
        ["a receipt Mallory signed that names Lanternmoss as issuer (forged)", (r) => receipt({ subject: r.owner.id, signer: mallory })],
        ["a receipt from an issuer the place never named", (r) => receipt({ subject: r.owner.id, issuer: mallory.id, signer: mallory })],
        ["a receipt with one signature byte flipped", (r) => H.flipSignature(receipt({ subject: r.owner.id }))],
        ["a receipt issued to another owner", () => receipt({ subject: H.developmentPasskey().id })],
      ];
      const got = [];
      for (const [label, make] of bad) {
        const r = fresh(); const a = await attempt(r, pA, [make(r)]); got.push(`${label}: ${a.code}`);
        expect(a.carried === 1 && refused(a), `${label} → ${a.code}`);
      }
      saw(`wrongly shaped requirements were never met (SDK trustPathMet), and a door started with one ${cNote}; with no receipt: ${none.code}; with a valid self-issued receipt: ${ok.code} (${boughtNote}); the same receipt replayed at place B: ${replay.code}; then ${got.join("; ")}.`);
    } finally {
      for (const c of kids) if (c.exitCode === null) c.kill("SIGTERM");
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })];
