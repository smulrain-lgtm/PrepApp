/**
 * Categories and sub-categories: the lists offered in the item sheet and the
 * inventory filter, and the edits made in Settings → Categories.
 */
import { DEFAULT_SUBCATEGORIES, DEFAULT_UNITS, FALLBACK_UNITS } from './model/constants';
import type { Category, Item } from './model/types';
import { slug } from '../seed/csv';

/** The category's own list: as edited, else the defaults for it. */
export function listedSubCategories(category: Category): string[] {
  return category.subCategories ?? DEFAULT_SUBCATEGORIES[category._id] ?? [];
}

/**
 * Sub-categories to offer for a category: its list, then any other names its
 * items use (A–Z), so no item's sub-category is ever hidden.
 */
export function subCategoriesOf(category: Category, items: Item[]): string[] {
  const listed = listedSubCategories(category);
  const known = new Set(listed);
  const extra = new Set<string>();
  for (const item of items) {
    if (item.deleted || item.categoryId !== category._id) continue;
    const name = item.subCategory?.trim();
    if (name && !known.has(name)) extra.add(name);
  }
  return [...listed, ...[...extra].sort((a, b) => a.localeCompare(b))];
}

/** The category's "One unit is a…" choices: as edited, else the defaults. */
export function listedUnits(category: Category): string[] {
  return category.units ?? DEFAULT_UNITS[category._id] ?? FALLBACK_UNITS;
}

/** Units to offer for a category: its list, then any others its items use. */
export function unitsOf(category: Category, items: Item[]): string[] {
  const listed = listedUnits(category);
  const extra = new Set<string>();
  for (const item of items) {
    if (item.deleted || item.categoryId !== category._id) continue;
    const unit = item.unit?.trim();
    if (unit && !listed.includes(unit)) extra.add(unit);
  }
  return [...listed, ...[...extra].sort((a, b) => a.localeCompare(b))];
}

/** Every sub-category name across the live categories, A–Z, once each. */
export function allSubCategories(categories: Category[], items: Item[]): string[] {
  const names = new Set<string>();
  for (const c of categories) if (!c.deleted) for (const n of subCategoriesOf(c, items)) names.add(n);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Live items in a category. */
export function itemsIn(categoryId: string, items: Item[]): Item[] {
  return items.filter((i) => !i.deleted && i.categoryId === categoryId);
}

/** A new, unused id for a category name. */
export function newCategoryId(name: string, categories: Category[]): string {
  const base = `category:${slug(name) || 'category'}`;
  const ids = new Set(categories.map((c) => c._id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** One line of the sub-category editor: its name when opened (null if new) and now. */
export interface SubCategoryEdit {
  original: string | null;
  name: string;
}

export interface SubCategoryPlan {
  /** The category's new list. */
  list: string[];
  /** Items whose sub-category changes (renamed, or cleared when removed). */
  items: Item[];
  /** Names removed while items still use them. */
  removedInUse: { name: string; count: number }[];
  /** Problems that stop the save. */
  errors: string[];
}

/**
 * Work out what saving the sub-category editor changes: the new list, and the
 * items to rename (or clear) so they follow their sub-category.
 */
export function planSubCategories(
  categoryId: string,
  edits: SubCategoryEdit[],
  items: Item[],
): SubCategoryPlan {
  return planNames(categoryId, edits, items, 'subCategory');
}

/**
 * The same for the units list. Renamed units follow through to the items;
 * a removed unit stays on the items that use it (every item needs a unit).
 */
export function planUnits(categoryId: string, edits: SubCategoryEdit[], items: Item[]): SubCategoryPlan {
  return planNames(categoryId, edits, items, 'unit');
}

function planNames(
  categoryId: string,
  edits: SubCategoryEdit[],
  items: Item[],
  field: 'subCategory' | 'unit',
): SubCategoryPlan {
  const errors: string[] = [];
  const list: string[] = [];
  const seen = new Set<string>();
  const rename = new Map<string, string>();
  for (const edit of edits) {
    const name = edit.name.trim();
    if (!name) {
      if (edit.original === null) continue; // a blank new line is ignored
      errors.push(`Give “${edit.original}” a name, or remove it.`);
      continue;
    }
    if (seen.has(name.toLowerCase())) {
      errors.push(`“${name}” is listed twice.`);
      continue;
    }
    seen.add(name.toLowerCase());
    list.push(name);
    if (edit.original !== null && edit.original !== name) rename.set(edit.original, name);
  }

  const inCategory = itemsIn(categoryId, items);
  const kept = new Set(edits.filter((e) => e.original !== null).map((e) => e.original!));
  const changed: Item[] = [];
  const removedCount = new Map<string, number>();
  for (const item of inCategory) {
    const current = item[field]?.trim();
    if (!current) continue;
    if (rename.has(current)) {
      changed.push({ ...item, [field]: rename.get(current) });
    } else if (field === 'subCategory' && !kept.has(current) && !list.includes(current)) {
      changed.push({ ...item, subCategory: undefined });
      removedCount.set(current, (removedCount.get(current) ?? 0) + 1);
    }
  }
  return {
    list,
    items: changed,
    removedInUse: [...removedCount].map(([name, count]) => ({ name, count })),
    errors,
  };
}

/**
 * New `order` values after moving one category up or down. Returns only the
 * categories whose order changes.
 */
export function moveCategory(categories: Category[], id: string, direction: -1 | 1): Category[] {
  const live = categories.filter((c) => !c.deleted).sort((a, b) => a.order - b.order);
  const from = live.findIndex((c) => c._id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= live.length) return [];
  [live[from], live[to]] = [live[to], live[from]];
  return live.flatMap((c, order) => (c.order === order ? [] : [{ ...c, order }]));
}
