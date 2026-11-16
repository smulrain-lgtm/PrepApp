/**
 * The shopping list: what to buy to reach the target, gathered from three places.
 * 1. Readiness shortfalls (e.g. 42 L of water, 9,700 kcal of food).
 * 2. Checklist lines marked Need (and Check, listed separately).
 * 3. Planned purchases from the household's Shopping List sheet.
 */
import { targetText } from './checklist-view';
import { formatAmount } from './format';
import { formatDate } from './model/dates';
import type { ChecklistItem, IsoDate, Purchase, Snapshot } from './model/types';
import type { ReadinessResult } from './readiness';
import { listIdOf } from './lists';
import { SHOPPING_LIST_ID } from './model/constants';
import { mealCounts, resolveChecklist } from './stock-links';

export interface ShoppingList {
  shortfalls: { label: string; amount: string }[];
  /** Meal types short of the Food box target, e.g. "Breakfasts: 5 more". */
  meals: { label: string; more: number }[];
  need: { line: ChecklistItem; target: string; section: string }[];
  check: { line: ChecklistItem; target: string; section: string }[];
  toBuy: Purchase[];
  bought: Purchase[];
}

export function buildShoppingList(
  snap: Snapshot,
  readiness: ReadinessResult,
  today: IsoDate = new Date().toISOString().slice(0, 10),
): ShoppingList {
  const sections = new Map(snap.checklistSections.map((s) => [s._id, s.name]));
  const { lines } = resolveChecklist(snap);
  const withTarget = (line: ChecklistItem) => ({
    line,
    target: targetText(line, snap.settings),
    section: sections.get(line.sectionId) ?? '',
  });
  const purchases = snap.purchases.filter((p) => !p.deleted && listIdOf(p) === SHOPPING_LIST_ID);
  return {
    shortfalls: readiness.metrics
      .filter((m) => m.critical && m.shortfall > 0)
      .map((m) => ({ label: m.label, amount: formatAmount(m.metric, m.shortfall) })),
    meals: mealCounts(snap, snap.settings, today)
      .filter((m) => m.count < m.target)
      .map((m) => ({ label: m.label, more: m.target - m.count })),
    need: lines.filter((l) => l.status === 'need').map(withTarget),
    check: lines.filter((l) => l.status === 'check').map(withTarget),
    toBuy: purchases.filter((p) => p.status === 'to_buy'),
    bought: purchases.filter((p) => p.status === 'bought'),
  };
}

export function shoppingCount(list: ShoppingList): number {
  return list.shortfalls.length + list.meals.length + list.need.length + list.toBuy.length;
}

/** Plain text for the share sheet (Messages, Notes, email). */
export function shoppingText(list: ShoppingList, today: IsoDate, targetDays: number): string {
  const out: string[] = [`PrepApp shopping list – ${formatDate(today)}`];
  if (list.shortfalls.length) {
    out.push('', `To reach ${targetDays} days:`);
    for (const s of list.shortfalls) out.push(`- ${s.label}: ${s.amount} more`);
  }
  if (list.meals.length) {
    out.push('', 'Meals to reach the target:');
    for (const m of list.meals) out.push(`- ${m.label}: ${m.more} more`);
  }
  if (list.toBuy.length) {
    out.push('', 'On the shopping list:');
    for (const p of list.toBuy) out.push(`- ${p.name} – ${p.quantity}`);
  }
  if (list.need.length) {
    out.push('', 'Equipment and supplies needed:');
    for (const n of list.need) out.push(`- ${n.line.name} – ${n.target}`);
  }
  if (list.check.length) {
    out.push('', 'To check at home:');
    for (const c of list.check) out.push(`- ${c.line.name}`);
  }
  if (out.length === 1) out.push('', 'Nothing to buy. Everything is at target.');
  return out.join('\n');
}
