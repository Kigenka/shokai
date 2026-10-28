/** Simulated clock so transcripts are reproducible. All times are UTC on the wire. */
export class Clock {
  private t: number;
  constructor(startIso: string) { this.t = Date.parse(startIso); }
  now(): string { return new Date(this.t).toISOString().replace(".000Z", "Z"); }
  advance(minutes: number): string { this.t += minutes * 60_000; return this.now(); }
  plusDays(days: number): string { return new Date(this.t + days * 86_400_000).toISOString().replace(".000Z", "Z"); }
}
