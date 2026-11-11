// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, red team SHK-06 (provisional, C287): free principals (SPEC §4.1, §11.1). Many fresh principals guessing one card's code
// hit the per-card suspension; failed guesses add a growing backoff per principal and source; codes need 40 bits; seats are capped
// per visitor card and per source, and idle seats are evicted; signed traffic from principals with no history counts per source.
// Fictional people.
import { ClaimGuard, SeatCaps, NewcomerBudget, codeEntropyBits, hasMinimumCodeEntropy } from "../src/free-principals.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

function main() {
  console.log("SDK free principals (C287)");
  let t = 1_000_000_000;
  const now = () => t;

  // Entropy floor.
  check(codeEntropyBits("a3f09c1b") === 32 && !hasMinimumCodeEntropy("a3f09c1b"), "a 32-bit code (8 hex digits) fails the 40-bit check");
  check(codeEntropyBits("a3f09c1b7e2d") === 48 && hasMinimumCodeEntropy("a3f09c1b7e2d"), "a 48-bit code (12 hex digits) passes");
  check(!hasMinimumCodeEntropy("aaaaaaaaaaaaaaaaaaaa"), "a code of one repeated character carries no entropy");
  check(!hasMinimumCodeEntropy("482913"), "a 6-digit code fails the check");

  // N fresh principals guessing one card's code.
  const suspendedCards: string[] = [];
  const g = new ClaimGuard({ now, onSuspend: (c) => suspendedCards.push(c) });
  const card = "intro-card-noriko";
  let allAllowed = true;
  for (let i = 0; i < 10; i++) {
    const principal = `did:key:zFresh${i}`, source = `192.0.2.${i + 1}`;
    if (!g.allowed(card, principal, source).ok) allAllowed = false;
    g.recordFailure(card, principal, source);
  }
  check(allAllowed, "ten fresh principals from ten sources each get one try (no per-principal limit hides them)");
  const v = g.allowed(card, "did:key:zFresh99", "198.51.100.42");
  check(!v.ok && v.why === "suspended" && v.answer === "not_now", "the eleventh fresh principal finds the card suspended: not_now");
  const holder = g.allowed(card, "did:key:zRealHolder", "203.0.113.5");
  check(!holder.ok && holder.why === "suspended", "while suspended, even a real holder's claim is refused (nothing granted)");
  check(suspendedCards.length === 1 && suspendedCards[0] === card, "the introducer is notified once");
  check(g.allowed("intro-card-other", "did:key:zRealHolder", "203.0.113.5").ok, "another card is unaffected");
  t += 86400 * 1000 + 1;
  check(g.allowed(card, "did:key:zRealHolder", "203.0.113.5").ok, "after the 24-hour window the card takes claims again");

  // Growing backoff for a principal and its source.
  const b = new ClaimGuard({ now, perCardCap: 1000 });
  const P = "did:key:zGuesser", S = "203.0.113.77";
  const waits: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = b.recordFailure("card-b", P, S);
    waits.push(r.retryAfterS);
    const blocked = b.allowed("card-b", P, S);
    if (blocked.ok || blocked.why !== "backoff") waits.push(-1);
    t += r.retryAfterS * 1000 + 1;
  }
  check(waits.every((w, i) => i === 0 || w > (waits[i - 1] ?? 0)), "backoff grows with each failure: " + waits.join(", "));
  b.recordFailure("card-b", P, S);
  const sameSource = b.allowed("card-c", "did:key:zAnotherFresh", S);
  check(!sameSource.ok && sameSource.why === "backoff", "a fresh principal from the same source shares the source's backoff");
  check(b.allowed("card-c", "did:key:zElsewhere", "198.51.100.3").ok, "a different principal and source carry no backoff");

  // Seat caps.
  const seats = new SeatCaps({ now });
  const s1 = seats.tryOpen("visitor-card-haru", "192.0.2.10");
  const s2 = seats.tryOpen("visitor-card-haru", "192.0.2.11");
  const s3 = seats.tryOpen("visitor-card-haru", "192.0.2.12");
  check(s1.ok && s2.ok && !s3.ok && s3.which === "card" && s3.answer === "not_now", "two seats per visitor card; the third is not_now");
  if (s1.ok) seats.close(s1.seatId);
  check(seats.tryOpen("visitor-card-haru", "192.0.2.12").ok, "closing a seat frees the card's slot");

  const src = new SeatCaps({ now });
  const per: boolean[] = [];
  for (let i = 0; i < 16; i++) per.push(src.tryOpen(`visitor-card-${i}`, "198.51.100.200").ok);
  const fifth = src.tryOpen("visitor-card-16", "198.51.100.200");
  check(per.every(Boolean) && !fifth.ok && fifth.which === "source", "sixteen seats per source (a coarse fallback for shared egress, RR-08); the next from that source is refused");
  check(src.tryOpen("visitor-card-17", "198.51.100.201").ok, "another source still gets a seat");

  // Idle eviction.
  const idle = new SeatCaps({ now });
  const a = idle.tryOpen("visitor-card-sora", "192.0.2.50");
  const c = idle.tryOpen("visitor-card-sora", "192.0.2.51");
  check(!idle.tryOpen("visitor-card-sora", "192.0.2.52").ok, "the card is full");
  t += 600 * 1000;
  if (c.ok) idle.touch(c.seatId);
  t += 301 * 1000;
  const evicted = idle.evictIdle();
  check(a.ok && evicted.length === 1 && evicted[0] === a.seatId, "a seat idle beyond 900 s is evicted; a touched one stays");
  check(idle.tryOpen("visitor-card-sora", "192.0.2.52").ok, "after eviction the card can open a seat again");

  // Newcomer budget (RR-08): keyed by principal first, the source only a coarse fallback, no total cap by default.
  const nb = new NewcomerBudget({ perPrincipal: 2, perSource: 5, now });
  const ok2 = [nb.take("did:key:zA", "203.0.113.9", false), nb.take("did:key:zA", "203.0.113.9", false)];
  check(ok2.every((w) => w === 0) && nb.take("did:key:zA", "203.0.113.9", false) === 60, "a free principal: 2 signed messages, then retry-after 60");
  check(nb.take("did:key:zB", "203.0.113.9", false) === 0, "another principal behind the same shared egress still gets in");
  check(nb.take("did:key:zA", "203.0.113.9", true) === 0, "a principal with history isn't counted");
  for (const p of ["zC", "zD"]) nb.take("did:key:" + p, "203.0.113.9", false);
  check(nb.take("did:key:zE", "203.0.113.9", false) === 60, "the source is a coarse fallback: past its cap, fresh principals from it wait");
  const flood = new NewcomerBudget({ perPrincipal: 60, perSource: 60, now });
  for (let i = 0; i < 11; i++) for (let j = 0; j < 60; j++) flood.take(`did:key:zF${i}-${j}`, `198.51.100.${i}`, false);
  check(flood.take("did:key:zGenuine", "192.0.2.77", false) === 0, "no total cap by default: 660 newcomer messages from 11 addresses don't lock out a genuine newcomer");
  const capped = new NewcomerBudget({ total: 3, now });
  for (let i = 0; i < 3; i++) capped.take(`did:key:zT${i}`, `192.0.2.${i}`, false);
  check(capped.take("did:key:zT9", "192.0.2.9", false) === 60, "a place may still state a total cap (SHOULD, operator guidance)");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
try { main(); } catch (e) { console.error(e); process.exitCode = 1; }
