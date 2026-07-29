/** One clock seam for schedules and review decisions. */
let clock: () => number = () => Date.now();

export function now(): number {
  return clock();
}

/** Test-only clock override. Production code always uses the system clock. */
export function setClockForTests(next?: () => number): void {
  clock = next ?? (() => Date.now());
}

export function todayKey(at = now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The next 09:00 in a user's IANA timezone, expressed as an epoch timestamp. */
export function nextNineAM(timeZone: string, at = now()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const value = (name: string) => parts.find((p) => p.type === name)?.value ?? "01";
  const localDay = `${value("year")}-${value("month")}-${value("day")}`;
  // Find the instant whose formatted local time is 09:00. This small bounded
  // search also handles daylight-saving offsets without assuming one offset.
  const start = at - (at % 3_600_000) - 14 * 3_600_000;
  for (let candidate = start; candidate <= at + 36 * 3_600_000; candidate += 60_000) {
    const rendered = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (name: string) => rendered.find((p) => p.type === name)?.value;
    if (`${get("year")}-${get("month")}-${get("day")}` >= localDay && get("hour") === "09" && get("minute") === "00" && candidate > at) return candidate;
  }
  return at + 24 * 3_600_000;
}
