/**
 * "Why did my number go down?" The dashboard remembers what it last showed on
 * this device and, when the figure drops, says why in one line.
 */
import { formatDays } from './format';
import type { IsoDate, PastDateRule } from './model/types';

export interface SeenReadiness {
  date: IsoDate;
  days: number;
  people: number;
  pets: number;
  rule: PastDateRule;
  /** Units already past their date. */
  expiredUnits: number;
}

const KEY = 'prepapp.lastSeen';

export function changeNote(prev: SeenReadiness | null, now: SeenReadiness): string | null {
  if (!prev || now.days >= prev.days - 0.05) return null;
  const reasons: string[] = [];
  if (now.people > prev.people) reasons.push(`the household grew from ${prev.people} to ${now.people}`);
  if (now.pets > prev.pets) reasons.push(`a pet was added`);
  if (now.rule !== prev.rule) reasons.push('the rule for food past its date changed');
  const newlyExpired = now.expiredUnits - prev.expiredUnits;
  if (newlyExpired > 0) {
    reasons.push(`${newlyExpired} ${newlyExpired === 1 ? 'pack' : 'packs'} passed the best-before date`);
  }
  if (!reasons.length) reasons.push('stock was used or removed');
  const list = reasons.length === 1 ? reasons[0] : `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}`;
  return `Down from ${formatDays(prev.days)} to ${formatDays(now.days)} days: ${list}.`;
}

export function loadSeen(): SeenReadiness | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenReadiness) : null;
  } catch {
    return null;
  }
}

export function saveSeen(seen: SeenReadiness): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* per-device convenience only */
  }
}
