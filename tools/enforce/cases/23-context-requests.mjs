// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Case 23: context requests (§6.12, provisional, C263). A door that asks "request before entry" must seat nobody on a missing, forged,
// replayed, expired or malformed answer, never turns that into a ban, and keeps a declined field from becoming a mark. The doors run
// in this process on 127.0.0.1 (the SDK's createDoor behind a Node http server); every key is made for this run; no model.
import http from "node:http";

export default (H) => [H.kase("23-context-requests",
  "Entering a door that asks for context before entry, with the wrong or no answer",
  "Wren's agent arrives at a door that asks for context before entry: with no answer; with an answer signed by the representative's key, not the owner's; with the owner's answer replayed (second pass, another owner, another place, after it expired); with extra, oversized, duplicate, missing or oddly named fields; against a door that said a card is enough; and when the owner declines a required field.",
  "SPEC §6.12 (context requests, provisional), C263, C267; §6.10",
  async ({ expect, saw }) => {
    const { createDoor, signContextResponse, contextRequestFor, contextRequestProblems } = H.sdk;
    const NEED = { mode: "before_entry", retention_days: 0, fields: [
      { name: "adult_confirmed", what: "That you are 18 or older", why: "The open table is for adults only.", required: true },
      { name: "favorite_food", what: "A food you love", why: "To pair tastes at the table." }] };
    const house = (name, cr) => ({ approvedBy: { name: "Kai", role: "Owner" }, name, displayName: "The Taste Blend table", category: "store",
      purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
      // This case sends many fresh visitors from one loopback socket; test context semantics, not C278.
      anonRatePerAddr: 1000, testProfile: true, policy: { context_requirements: cr } });
    const servers = [];
    async function serve(name, cr) {
      const port = await H.port(); const base = `http://127.0.0.1:${port}/shokai`;
      const door = createDoor({ ...house(name, cr), baseUrl: base });
      const srv = http.createServer(async (rq, rs) => { try { if (!(await door.handleHttp(rq, rs))) { rs.writeHead(404); rs.end(); } } catch { rs.writeHead(500); rs.end(); } });
      await new Promise((r) => srv.listen(port, "127.0.0.1", r)); servers.push(srv);
      return { door, base, place: await H.findPlace(base, name) };
    }
    const ASK = { purpose: "inquiry", actions: ["concierge.talk"], mandate: { fresh: true } };
    const mk = (n = "Mio") => H.createRepresentative({ ownerName: n, purposes: ["inquiry"], actions: ["concierge.talk"] });
    const rc = (v) => v.response?.reason_code;
    const sentResp = (v) => v.transcript.some((t) => t.dir === "out" && JSON.stringify(t.message).includes('"context_response"'));
    const ADULT = { name: "adult_confirmed", value: "Yes, I'm 18 or older." };
    const optional = (q) => q.fields.filter((f) => !f.required).map((f) => f.name);
    const yes = (rep, q) => signContextResponse(rep.owner, q, { answers: [ADULT], declined: optional(q) });
    const probs = (...a) => { try { return contextRequestProblems(...a); } catch (e) { return ["threw:" + e.message]; } };
    const RealDate = Date;
    try {
      const A = await serve("taste-blend", NEED), B = await serve("other-table", NEED), C = await serve("card-table", { mode: "card_enough" });

      // ---- (i) no answer, and the honest path (control) ----
      const mio = mk(); const v1 = await mio.visit(A.place, ASK); const cq = v1.contextRequest;
      expect(!v1.seated && v1.response?.disposition === "not_now" && rc(v1) === "CREDENTIAL_REQUIRED" && JSON.stringify(v1.response?.retry) === JSON.stringify({ kind: "with_credential", credentials: ["context_response"] }),
        `(i) no answer yet: not_now / ${rc(v1)}, retry with a context response, not a ban`);
      expect(!!cq && cq.fields.map((f) => f.name).join() === "adult_confirmed,favorite_food" && probs(cq, NEED, "taste-blend").length === 0,
        `control: the request carries only the declared fields (${cq?.fields.map((f) => f.name).join()})`);
      const good = yes(mio, cq); const v2 = await mio.visit(A.place, { ...ASK, contextResponse: good });
      expect(v2.seated, `control: the same visitor, owner-signed answer on the retry: seated (${v2.decision})`);
      const kept = v2.seat ? A.door.host.contextAnswers(v2.seat.seat_id) : null;
      expect(!!kept && kept.answers.length === 1 && kept.answers[0].value === ADULT.value && kept.declined.join() === "favorite_food", `the door keeps exactly what she answered (${kept?.answers.length} answered)`);

      // ---- (ii)(iii)(iv) attacks: each is "no answer" to the door, and an honest retry afterwards still works ----
      async function attack(build, o = {}) {
        const from = o.from ?? A, to = o.to ?? from; const owner = mk("Mio"); const visitor = o.visitor ? o.visitor() : owner;
        const q = (await owner.visit(from.place, ASK)).contextRequest;
        const v = await visitor.visit(to.place, { ...ASK, contextResponse: build(owner, q) });
        const again = v.contextRequest ? await visitor.visit(to.place, { ...ASK, contextResponse: yes(visitor, v.contextRequest) }) : null;
        return { seated: v.seated, code: rc(v), reached: sentResp(v), recovered: !!again?.seated };
      }
      const names = (q) => q.fields.map((f) => f.name);
      const V = [
        ["(ii) signed by the representative's key, not the owner's", (o, q) => signContextResponse(o.key, q, { answers: [ADULT], declined: optional(q) })],
        ["(iii) the owner's answer shown by another owner's agent", (o, q) => yes(o, q), { visitor: () => mk("Mallory") }],
        ["(iii) an answer to another place's request, shown at this one", (o, q) => yes(o, q), { from: B, to: A }],
        ["(iv) an extra field the door never asked for", (o, q) => signContextResponse(o.owner, q, { answers: [ADULT, { name: "home_city", value: "Osaka" }], declined: optional(q) })],
        ["(iv) a field name that isn't a short id", (o, q) => signContextResponse(o.owner, q, { answers: [{ name: "Home Address; DROP", value: "x" }, ADULT], declined: optional(q) })],
        ["(iv) a value over 500 characters", (o, q) => signContextResponse(o.owner, q, { answers: [{ ...ADULT, value: "x".repeat(501) }], declined: optional(q) })],
        ["(iv) an empty value", (o, q) => signContextResponse(o.owner, q, { answers: [{ ...ADULT, value: "" }], declined: optional(q) })],
        ["(iv) the same field answered twice", (o, q) => signContextResponse(o.owner, q, { answers: [ADULT, ADULT], declined: optional(q) })],
        ["(iv) a requested field neither answered nor declined", (o, q) => signContextResponse(o.owner, q, { answers: [ADULT], declined: [] })],
        ["(iv) answers changed after the owner signed", (o, q) => ({ ...signContextResponse(o.owner, q, { answers: [{ ...ADULT, value: "No" }], declined: optional(q) }), answers: [ADULT] })],
      ];
      const got = [];
      for (const [label, build, o] of V) { const r = await attack(build, o); got.push(r); expect(!r.seated && r.code === "CREDENTIAL_REQUIRED", `${label}: seated=${r.seated}, ${r.code}`); }
      expect(got.every((r) => r.reached), `every one of those answers really reached the door (${got.filter((r) => r.reached).length}/${got.length})`);
      expect(got.every((r) => r.recovered), `after each refusal an honest answer is seated: never a ban (${got.filter((r) => r.recovered).length}/${got.length})`);

      // (iii) replay of an answer the door already relied on (another pass)
      const v3 = await mio.visit(A.place, { ...ASK, contextResponse: good });
      expect(!v3.seated && rc(v3) === "CREDENTIAL_REQUIRED" && !!v3.contextRequest && v3.contextRequest.request_id !== cq.request_id,
        `(iii) the same signed answer on a second pass: seated=${v3.seated}, ${rc(v3)}, a fresh request instead`);
      const v3b = v3.contextRequest ? await mio.visit(A.place, { ...ASK, contextResponse: yes(mio, v3.contextRequest) }) : null;
      expect(!!v3b?.seated, "control: after the replay was refused, a newly signed answer is seated");
      // control at the other place: the owner's honest answer seats there too
      const bo = mk(); const bq = (await bo.visit(B.place, ASK)).contextRequest; const bv = await bo.visit(B.place, { ...ASK, contextResponse: yes(bo, bq) });
      expect(bv.seated && bq.place === "other-table", `control: the other place's own request, answered, seats (${bq?.place})`);

      // ---- (v) card is enough ----
      let st; try { createDoor({ ...house("liar", { mode: "card_enough", fields: NEED.fields }), baseUrl: "http://127.0.0.1:1/shokai" }); st = "started"; } catch (e) { st = `${e.code}:${(e.problems ?? []).join(",")}`; }
      expect(st.startsWith("SHOKAI_HOUSE_CONFIG_INVALID:") && st.includes("context_requirements"), `(v) "card is enough" with fields to ask: the door won't start (${st})`);
      const cm = mk(); const unsolicited = signContextResponse(cm.owner, contextRequestFor("card-table", NEED, ["adult_confirmed"], { request_id: "cr-x", expires_at: new RealDate(RealDate.now() + 36e5).toISOString().replace(/\.\d+Z$/, "Z") }), { answers: [ADULT], declined: [] });
      const cv = await cm.visit(C.place, { ...ASK, contextResponse: unsolicited });
      expect(cv.seated && !cv.contextRequest && (!cv.seat || C.door.host.contextAnswers(cv.seat.seat_id) === null), `(v) a card-enough door seats, never asks, and keeps no unsolicited answer (request: ${!!cv.contextRequest})`);
      // ---- (vi) a field the house never declared: the sending side builds and accepts nothing ----
      const okReq = contextRequestFor("taste-blend", NEED, ["adult_confirmed"], { request_id: "cr-8", expires_at: "2099-01-01T00:00:00Z" });
      expect(contextRequestFor("taste-blend", NEED, ["where_you_live"], { request_id: "cr-9", expires_at: "2099-01-01T00:00:00Z" }) === null, "(vi) no request can be made for a field the house never declared");
      const sneaky = { ...okReq, fields: [...okReq.fields, { name: "home_address", what: "Where you live", why: "to be friendly" }] };
      expect(probs(sneaky, NEED, "taste-blend").length > 0 && probs(okReq, { mode: "card_enough" }, "taste-blend").length > 0 && probs(okReq, NEED, "taste-blend").length === 0,
        `(vi) a request with an undeclared field, or from a card-enough door, is flagged (${probs(sneaky, NEED, "taste-blend").join()}); the honest one isn't`);

      // ---- (vii) the owner declines the required field ----
      const dr = mk("Dee"); const dq = (await dr.visit(A.place, ASK)).contextRequest;
      const dv = await dr.visit(A.place, { ...ASK, contextResponse: signContextResponse(dr.owner, dq, { answers: [], declined: names(dq) }) });
      expect(!dv.seated && dv.response?.disposition === "not_now" && rc(dv) === "POLICY_DENY" && dv.contextRequest?.request_id === dq.request_id,
        `(vii) declining the required field: not_now / ${rc(dv)}, the same request returned so she may reconsider`);
      const dv2 = await dr.visit(A.place, { ...ASK, contextResponse: yes(dr, dq) });
      expect(dv2.seated, "(vii) she reconsiders and signs yes: seated, the decline held nothing against her");
      const marks = [A, B].flatMap((p) => [...p.door.host.records.values()].filter((r) => (r?.misconduct ?? []).length));
      expect(marks.length === 0, `no refusal, replay or decline was recorded as misconduct (${marks.length} records with marks)`);

      // ---- (iii) after expiry: both sides' clocks move two hours (the request lives one hour) ----
      const eo = mk(); const eq = (await eo.visit(A.place, ASK)).contextRequest; const stale = yes(eo, eq);
      let ve, vf, off = 0;
      globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); } static now() { return RealDate.now() + off; } };
      try {
        off = 2 * 3600e3;
        ve = await eo.visit(A.place, { ...ASK, contextResponse: stale });
        vf = ve.contextRequest ? await eo.visit(A.place, { ...ASK, contextResponse: yes(eo, ve.contextRequest) }) : null;
      } finally { globalThis.Date = RealDate; }
      expect(!ve.seated && rc(ve) === "CREDENTIAL_REQUIRED", `(iii) a signed answer two hours after the request: seated=${ve.seated}, ${rc(ve)}`);
      expect(!!vf?.seated, "control: at that later time, a fresh request answered in time is seated");
      saw(`asked for context before entry: seated nobody on no answer, a representative-signed answer, a replayed, borrowed, cross-place or expired answer, or any of ${V.length} malformed ones (${got.filter((r) => r.recovered).length} honest retries seated), refused a card-enough door that asks for fields, and let a declined required field be reconsidered with no mark.`);
    } finally {
      globalThis.Date = RealDate;
      for (const s of servers) { s.closeAllConnections?.(); s.close(); }
    }
  })];
