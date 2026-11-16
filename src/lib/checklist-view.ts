/** View model for the Checklist screen. */
import { addDays } from './model/dates';
import type {
  ChecklistItem,
  ChecklistSection,
  ChecklistStatus,
  IsoDate,
  ScaleBy,
  Settings,
} from './model/types';
import { scaledTarget } from './readiness';
import { formatNumber } from './format';

export const STATUS_WORD: Record<ChecklistStatus, string> = { have: 'Have', check: 'Check', need: 'Need' };

export const SCALE_LABEL: Record<ScaleBy, string> = {
  fixed: 'Fixed amount',
  people: 'Per person',
  pets: 'Per pet',
  days: 'Per day',
  people_days: 'Per person per day',
  water: 'Drinking water for everyone (from daily needs)',
  pet_food: 'Pet food for every pet (from pet settings)',
};

export const CHECK_INTERVALS: { days: number | null; label: string }[] = [
  { days: null, label: 'No recurring check' },
  { days: 30, label: 'Monthly' },
  { days: 91, label: 'Every 3 months' },
  { days: 182, label: 'Every 6 months' },
  { days: 365, label: 'Yearly' },
];

/** "42 L" for the current scenario. */
export function targetText(line: ChecklistItem, settings: Settings): string {
  const value = scaledTarget(line, settings);
  const unit = line.target.unit;
  if (line.target.scaleBy === 'pet_food' && value >= 1000) return `${formatNumber(value / 1000)} kg dry food`;
  if (unit.startsWith('×') || unit === '£')
    return unit === '£' ? `£${formatNumber(value)}` : `${formatNumber(value)} ${unit}`;
  return `${formatNumber(value)} ${unit}`;
}

/** How the target was worked out, e.g. "2 per person per day × 3 people × 3 days". */
export function targetBasis(line: ChecklistItem, settings: Settings): string {
  const { amount, scaleBy } = line.target;
  const p = settings.people;
  const n = settings.pets.length;
  const d = settings.targetDays;
  switch (scaleBy) {
    case 'fixed':
      return '';
    case 'people':
      return `${formatNumber(amount)} × ${p} ${p === 1 ? 'person' : 'people'}`;
    case 'pets':
      return `${formatNumber(amount)} × ${n} ${n === 1 ? 'pet' : 'pets'}`;
    case 'days':
      return `${formatNumber(amount)} × ${d} days`;
    case 'people_days':
      return `${formatNumber(amount)} × ${p} people × ${d} days`;
    case 'water': {
      const petWater = settings.pets.reduce((s, x) => s + x.waterLPerDay, 0);
      return `(${p} × ${formatNumber(settings.dailyNeeds.waterLPerPerson)} L${petWater ? ` + ${formatNumber(petWater)} L for pets` : ''}) × ${d} days`;
    }
    case 'pet_food': {
      const g = settings.pets.reduce((s, x) => s + x.foodGPerDay, 0);
      return `${formatNumber(g)} g a day × ${d} days`;
    }
  }
}

export function nextCheckDue(line: ChecklistItem): IsoDate | null {
  if (line.checkIntervalDays == null) return null;
  if (!line.lastChecked) return null; // never checked: due now
  return addDays(line.lastChecked, line.checkIntervalDays);
}

export function isCheckDue(line: ChecklistItem, today: IsoDate): boolean {
  if (line.checkIntervalDays == null) return false;
  const next = nextCheckDue(line);
  return next === null || next <= today;
}

export type ChecklistFilter = 'all' | ChecklistStatus | 'due';

export function matchesChecklistFilter(
  line: ChecklistItem,
  filter: ChecklistFilter,
  today: IsoDate,
): boolean {
  if (line.deleted) return false;
  if (filter === 'all') return true;
  if (filter === 'due') return isCheckDue(line, today);
  return line.status === filter;
}

export interface ChecklistGroup {
  section: ChecklistSection;
  lines: ChecklistItem[];
  have: number;
  total: number;
}

export function groupChecklist(
  sections: ChecklistSection[],
  lines: ChecklistItem[],
  filter: ChecklistFilter,
  today: IsoDate,
): ChecklistGroup[] {
  return sections
    .filter((s) => !s.deleted)
    .map((section) => {
      const inSection = lines.filter((l) => l.sectionId === section._id && !l.deleted);
      return {
        section,
        lines: inSection.filter((l) => matchesChecklistFilter(l, filter, today)),
        have: inSection.filter((l) => l.status === 'have').length,
        total: inSection.length,
      };
    })
    .filter((g) => g.lines.length > 0);
}
