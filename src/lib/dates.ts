/**
 * Local-calendar day helpers. `Date#toISOString()` renders UTC, which is the
 * wrong calendar day for evening/morning hours outside UTC — these format in
 * the device's timezone.
 */

/** YYYY-MM-DD for the given date in LOCAL time. */
export function localDayIso(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
