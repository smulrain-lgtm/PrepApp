import type { IsoDate } from './types';

/** Today's date in local time as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parts(date: IsoDate): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function fromParts(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Add calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return fromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UK display format: 15 Nov 2026. */
export function formatDate(date: IsoDate | null | undefined): string {
  if (!date) return 'No date';
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}
