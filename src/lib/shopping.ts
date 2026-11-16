/**
 * The shopping list: the household's own entries on the Shopping list, plus the
 * checklist lines marked Check (things to look at home before buying).
 * Since 1.3.1 it no longer lists readiness shortfalls or checklist Need lines:
 * the dashboard and the Checklist show those.
 */
import { targetText } from './checklist-view';
import { listIdOf } from './lists';
import { SHOPPING_LIST_ID } from './model/constants';
import { formatDate } from './model/dates';
import type { ChecklistItem, IsoDate, Purchase, Snapshot } from './model/types';
import { resolveChecklist } from './stock-links';

export interface ShoppingList {
  check: { line: ChecklistItem; target: string; section: string }[];
  toBuy: Purchase[];
  bought: Purchase[];
}

export function buildShoppingList(snap: Snapshot): ShoppingList {
  const sections = new Map(snap.checklistSections.map((s) => [s._id, s.name]));
  const { lines } = resolveChecklist(snap);
  const purchases = snap.purchases.filter((p) => !p.deleted && listIdOf(p) === SHOPPING_LIST_ID);
  return {
    check: lines
      .filter((l) => l.status === 'check')
      .map((line) => ({
        line,
        target: targetText(line, snap.settings),
        section: sections.get(line.sectionId) ?? '',
      })),
    toBuy: purchases.filter((p) => p.status === 'to_buy'),
    bought: purchases.filter((p) => p.status === 'bought'),
  };
}

/** Entries still to buy on the shopping list. */
export function shoppingCount(list: ShoppingList): number {
  return list.toBuy.length;
}

/** Plain text for the share sheet (Messages, Notes, email). */
export function shoppingText(list: ShoppingList, today: IsoDate): string {
  const out: string[] = [`PrepApp shopping list – ${formatDate(today)}`];
  if (list.toBuy.length) {
    out.push('', 'On the shopping list:');
    for (const p of list.toBuy) out.push(`- ${p.name}${p.quantity ? ` – ${p.quantity}` : ''}`);
  }
  if (list.check.length) {
    out.push('', 'To check at home:');
    for (const c of list.check) out.push(`- ${c.line.name}`);
  }
  if (out.length === 1) out.push('', 'Nothing on the shopping list.');
  return out.join('\n');
}
