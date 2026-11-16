/**
 * CSV export of the inventory: one row per batch in stock, plus one row for
 * each item with none in stock. Opens in Numbers or Excel. Holds no medical
 * or contact data (those live in the JSON backup only).
 */
import { buildItemRows, STATUS_LABEL } from './inventory-view';
import { LOCATIONS, METRIC_INFO } from './model/constants';
import type { IsoDate, Snapshot } from './model/types';

export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  'Item',
  'Category',
  'Sub-category',
  'Location',
  'Best before',
  'Status',
  'Quantity',
  'Unit',
  'Counts as',
  'Per unit',
  'Supplier',
  'Notes',
];

export function inventoryCsv(snap: Snapshot, today: IsoDate): string {
  const rows: (string | number | null | undefined)[][] = [HEADER];
  const items = buildItemRows(snap, today).sort(
    (a, b) => (a.category?.order ?? 99) - (b.category?.order ?? 99) || a.item.name.localeCompare(b.item.name),
  );
  for (const row of items) {
    const { item } = row;
    const metric = METRIC_INFO.find((m) => m.id === item.perUnit.metric);
    const base = [
      item.name,
      row.category?.name,
      item.subCategory,
      LOCATIONS.find((l) => l.id === item.location)?.name,
    ];
    const tail = [
      item.unit,
      metric ? metric.label : 'Equipment',
      metric ? `${item.perUnit.amount} ${metric.unit}` : '',
      item.supplier,
      item.notes,
    ];
    if (!row.batches.length) {
      rows.push([...base, '', STATUS_LABEL.empty, 0, ...tail]);
      continue;
    }
    for (const b of row.batches) {
      rows.push([...base, b.batch.bestBefore ?? '', STATUS_LABEL[b.status], b.quantity, ...tail]);
    }
  }
  // CRLF and a BOM so Excel reads the £ and en dashes correctly.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvFileName(today: IsoDate): string {
  return `prepapp-inventory-${today}.csv`;
}
