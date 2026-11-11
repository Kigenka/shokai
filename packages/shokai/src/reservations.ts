// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.5.0 §7.4: reservations. The place's own service decides availability (§0); the protocol checks the booking against the visitor's
// errand by code, and the place signs a BookingConfirmation under its Shōkai host card. CalendarStandIn is a labelled local JSON file
// standing in for an owner's calendar: the service reads free or busy only, never the owner's own events.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import type * as S from "./core/shapes.js";

export type CalendarFile = {
  /** Always says what it is, e.g. "Pia's calendar (stand-in)". */
  label: string; time_zone: string;
  /** The owner's own events: only their times are ever read (busy). Their titles never leave this file. */
  events: { start: string; end: string; title?: string }[];
  /** Bookings the place made through its door. */
  bookings: { confirmation_id: string; start: string; end: string; party_size: number; name_as_given?: string; for_principal: string; status: "confirmed" | "cancelled" }[];
  /** Opening hours for bookings, per weekday (0 = Sunday), local "HH:MM" in time_zone. Absent day = closed. */
  hours?: Record<string, { open: string; close: string }>;
};
export const CALENDAR_STAND_IN_NOTE = "A local file standing in for the owner's calendar. The door reads free or busy only.";

/** A calendar stand-in: a local JSON file, labelled as such. */
export class CalendarStandIn {
  constructor(readonly path: string) { if (!existsSync(path)) throw new Error(`calendar stand-in not found: ${path}`); const c = this.read(); if (!/stand-in/i.test(c.label)) throw new Error("a calendar stand-in's label must say it is a stand-in"); }
  read(): CalendarFile { return JSON.parse(readFileSync(this.path, "utf8")); }
  private write(c: CalendarFile) { writeFileSync(this.path + ".tmp", JSON.stringify(c, null, 2) + "\n"); renameSync(this.path + ".tmp", this.path); }
  get label() { return this.read().label; }
  get timeZone() { return this.read().time_zone; }
  /** Busy intervals between two instants: times only, no titles, no names (§7.4, host guard 1). */
  freeBusy(from: string, to: string): { start: string; end: string }[] {
    const c = this.read(); const a = Date.parse(from), b = Date.parse(to);
    return [...c.events.map((e) => ({ start: e.start, end: e.end })), ...c.bookings.filter((x) => x.status === "confirmed").map((x) => ({ start: x.start, end: x.end }))]
      .filter((x) => Date.parse(x.end) > a && Date.parse(x.start) < b).sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  }
  isFree(start: string, end: string): boolean { return this.freeBusy(start, end).length === 0; }
  /** Whether [start, end) is inside the opening hours for bookings (when the file states them). */
  withinHours(start: string, end: string): boolean {
    const c = this.read(); if (!c.hours) return true;
    const parts = (t: string) => { const f = new Intl.DateTimeFormat("en-US", { timeZone: c.time_zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(t));
      const g = (k: string) => f.find((p) => p.type === k)?.value ?? ""; return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")), hm: `${g("hour").replace("24", "00")}:${g("minute")}` }; };
    const s = parts(start), e = parts(end); const h = c.hours[String(s.day)];
    return !!h && s.day === e.day && s.hm >= h.open && e.hm <= h.close;
  }
  add(b: CalendarFile["bookings"][number]) { const c = this.read(); c.bookings.push(b); this.write(c); }
  update(id: string, f: (b: CalendarFile["bookings"][number]) => void) { const c = this.read(); const b = c.bookings.find((x) => x.confirmation_id === id); if (b) { f(b); this.write(c); } return !!b; }
  find(id: string) { return this.read().bookings.find((x) => x.confirmation_id === id); }
}

/** §7.4: the arguments of reservation.make / reservation.change. `booking` is what the door checks against the booking limits. */
export type ReservationArgs = { booking: { start: string; end?: string; time_zone?: string; party_size: number }; name_as_given?: string; note?: string; confirmation_id?: string };
/** A booking reference from the local date and time: <prefix>-MMDD-HHMM (e.g. LM-1112-1230), with a suffix if it is taken. */
export function bookingRef(prefix: string, start: string, tz: string, taken: (id: string) => boolean): string {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(start));
  const g = (k: string) => f.find((p) => p.type === k)?.value ?? "00";
  const base = `${prefix}-${g("month")}${g("day")}-${g("hour").replace("24", "00")}${g("minute")}`;
  if (!taken(base)) return base; for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
}
/** §7.4: what a BookingConfirmation must say for the booking a visitor asked for. */
export function confirmationMatches(c: S.BookingConfirmation, asked: ReservationArgs["booking"]): boolean {
  const end = asked.end ?? c.booking.end;
  return Date.parse(c.booking.start) === Date.parse(asked.start) && Date.parse(c.booking.end) === Date.parse(end) && c.booking.party_size === asked.party_size;
}
