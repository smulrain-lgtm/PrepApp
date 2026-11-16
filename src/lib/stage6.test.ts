/** 1.2: barcode lookup, label nutrition, categories and sub-categories. */
import PouchDB from 'pouchdb-core';
import memory from 'pouchdb-adapter-memory';
import { describe, expect, it, vi } from 'vitest';
import seedJson from '../seed/seed.json';
import {
  cleanBarcode,
  guessCategory,
  isValidBarcode,
  lookupBarcode,
  lookupUrl,
  parseProduct,
} from './barcode';
import {
  allSubCategories,
  moveCategory,
  newCategoryId,
  planSubCategories,
  subCategoriesOf,
} from './categories';
import { Repository } from './db/repository';
import { buildItemRows, EMPTY_FILTER, isFiltered, matchesFilter } from './inventory-view';
import { ADDED_CATEGORIES, INGREDIENTS_CATEGORY } from './model/constants';
import { snapshotFromDocs } from './model/snapshot';
import type { AnyDoc, Category, Item } from './model/types';
import { caloriesFromLabel, cleanNutrition, formatPackSize, kcalPerUnit, parsePackSize } from './nutrition';
import { computeReadiness } from './readiness';

PouchDB.plugin(memory);

const snap = snapshotFromDocs(seedJson as AnyDoc[]);
const cat = (id: string) => snap.categories.find((c) => c._id === id)!;

describe('barcodes', () => {
  it('checks the check digit', () => {
    expect(isValidBarcode('5000157024671')).toBe(true); // EAN-13
    expect(isValidBarcode('5000157024672')).toBe(false);
    expect(isValidBarcode('96385074')).toBe(true); // EAN-8
    expect(isValidBarcode('036000291452')).toBe(true); // UPC-A
    expect(isValidBarcode('12345')).toBe(false);
    expect(cleanBarcode(' 5 000157-024671 ')).toBe('5000157024671');
  });

  it('reads an Open Food Facts product', () => {
    const p = parseProduct('5000157024671', {
      status: 1,
      product: {
        product_name: 'Baked Beanz',
        brands: 'Heinz, Kraft Heinz',
        product_quantity: '415',
        product_quantity_unit: 'g',
        nutriments: {
          'energy-kcal_100g': 78,
          proteins_100g: 4.7,
          fat_100g: 0.2,
          carbohydrates_100g: 12.5,
          salt_100g: 0.6,
        },
        categories_tags: ['en:plant-based-foods', 'en:canned-foods', 'en:baked-beans'],
      },
    })!;
    expect(p).toEqual({
      barcode: '5000157024671',
      name: 'Heinz Baked Beanz',
      brand: 'Heinz',
      packSize: { amount: 415, unit: 'g' },
      nutrition: { kcal: 78, protein: 4.7, fat: 0.2, carbs: 12.5, salt: 0.6 },
      categoryId: 'category:food-sides',
    });
    expect(kcalPerUnit(p.packSize, p.nutrition)).toBe(324);
  });

  it('falls back to kJ, sodium and the printed quantity', () => {
    const p = parseProduct('1', {
      status: 1,
      product: {
        product_name: 'Plain flour',
        quantity: '1.5 kg',
        nutriments: { energy_100g: 1464, sodium_100g: 0.004 },
        categories_tags: ['en:flours'],
      },
    })!;
    expect(p.packSize).toEqual({ amount: 1500, unit: 'g' });
    expect(p.nutrition).toEqual({ kcal: 350, salt: 0 });
    expect(p.categoryId).toBe('category:food-ingredients');
  });

  it('treats an unknown product as not found', () => {
    expect(parseProduct('1', { status: 0, status_verbose: 'product not found' })).toBeNull();
  });

  it('guesses the category from the tags', () => {
    expect(guessCategory(['en:beverages', 'en:hot-chocolates'])).toBe('category:food-drinks');
    expect(guessCategory(['en:snacks', 'en:sweet-snacks', 'en:biscuits'])).toBe('category:food-snacks');
    expect(guessCategory(['en:meals', 'en:prepared-meals'])).toBe('category:food-mains');
    expect(guessCategory(['en:waters', 'en:spring-waters'])).toBe('category:water');
    expect(guessCategory(['en:pastas'])).toBe('category:food-ingredients');
    expect(guessCategory(undefined)).toBe('category:food-ingredients');
  });

  it('looks up without throwing, offline or not found', async () => {
    const reply = (status: number, body: unknown) =>
      vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const found = await lookupBarcode('1', reply(200, { status: 1, product: { product_name: 'Oats' } }));
    expect(found).toMatchObject({ status: 'found', product: { name: 'Oats' } });
    expect(await lookupBarcode('1', reply(404, { status: 0 }))).toEqual({ status: 'not_found' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await lookupBarcode('1', offline)).toMatchObject({ status: 'offline' });
    expect(lookupUrl('123')).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/123\.json\?fields=/,
    );
  });
});

describe('label nutrition', () => {
  it('reads printed pack sizes', () => {
    expect(parsePackSize('400 g')).toEqual({ amount: 400, unit: 'g' });
    expect(parsePackSize('1,5kg')).toEqual({ amount: 1500, unit: 'g' });
    expect(parsePackSize('4 x 125 g')).toEqual({ amount: 500, unit: 'g' });
    expect(parsePackSize('33cl')).toEqual({ amount: 330, unit: 'ml' });
    expect(parsePackSize('2 L')).toEqual({ amount: 2000, unit: 'ml' });
    expect(parsePackSize('a bag')).toBeNull();
    expect(formatPackSize({ amount: 1500, unit: 'g' })).toBe('1.5 kg');
    expect(formatPackSize({ amount: 330, unit: 'ml' })).toBe('330 ml');
  });

  it('cleans form values', () => {
    expect(cleanNutrition({ kcal: '364.4', protein: '', fat: null, carbs: 76.04, salt: '0,01' })).toEqual({
      kcal: 364,
      carbs: 76,
      salt: 0,
    });
    expect(cleanNutrition({ kcal: '' })).toBeUndefined();
  });

  it('counts an item’s calories from its label', () => {
    const flour: Item = {
      _id: 'item:flour',
      type: 'item',
      updatedAt: '',
      name: 'Plain flour',
      categoryId: INGREDIENTS_CATEGORY._id,
      unit: 'bag',
      perUnit: { metric: 'kcal', amount: 5460 },
      location: 'garage',
      countsTowardReadiness: true,
      freezeSensitive: false,
      packSize: { amount: 1500, unit: 'g' },
      nutrition: { kcal: 364 },
    };
    expect(caloriesFromLabel(flour)).toBe(true);
    const before = computeReadiness(snap, '2026-11-15').metrics.find((m) => m.metric === 'kcal')!.stock;
    const withFlour = snapshotFromDocs([
      ...(seedJson as AnyDoc[]),
      flour,
      {
        _id: 'batch:flour:2027-06-01',
        type: 'batch',
        itemId: flour._id,
        bestBefore: '2027-06-01',
        addedAt: '',
        updatedAt: '',
      },
      {
        _id: 'movement:x',
        type: 'movement',
        batchId: 'batch:flour:2027-06-01',
        delta: 1,
        reason: 'added',
        at: '',
        by: 't',
        updatedAt: '',
      },
    ]);
    const after = computeReadiness(withFlour, '2026-11-15').metrics.find((m) => m.metric === 'kcal')!.stock;
    expect(after - before).toBe(5460);
  });
});

describe('categories', () => {
  it('includes Food – Ingredients, between Drinks and Pet food', () => {
    const names = snap.categories.map((c) => c.name);
    expect(names.indexOf('Food – Ingredients')).toBe(names.indexOf('Food – Drinks') + 1);
    expect(names.indexOf('Pet food')).toBe(names.indexOf('Food – Ingredients') + 1);
    expect(cat('category:food-ingredients').defaultMetric).toBe('kcal');
  });

  it('adds the new category to a device set up before it, once, and never back after a delete', async () => {
    const db = new PouchDB<AnyDoc>(`t-${Math.random()}`, { adapter: 'memory' });
    const repo = new Repository(db, { deviceName: 'test' });
    const old = (seedJson as AnyDoc[]).filter((d) => d._id !== INGREDIENTS_CATEGORY._id);
    await repo.importDocs(old);
    expect(await repo.ensureDocs(ADDED_CATEGORIES)).toBe(1);
    expect(await repo.ensureDocs(ADDED_CATEGORIES)).toBe(0);
    await repo.softDelete(INGREDIENTS_CATEGORY._id);
    expect(await repo.ensureDocs(ADDED_CATEGORIES)).toBe(0);
    await db.destroy();
  });

  it('offers the default sub-categories plus any in use', () => {
    const mains = cat('category:food-mains');
    expect(subCategoriesOf(mains, snap.items)).toEqual(['Main meal', 'Breakfast']);
    const odd = { ...snap.items[0], subCategory: 'Curries' } as Item;
    expect(subCategoriesOf(mains, [odd])).toEqual(['Main meal', 'Breakfast', 'Curries']);
    const edited: Category = { ...mains, subCategories: ['Pouches'] };
    expect(subCategoriesOf(edited, [])).toEqual(['Pouches']);
    expect(allSubCategories(snap.categories, snap.items)).toContain('Flour & baking');
  });

  it('renames and removes sub-categories on the items that use them', () => {
    const plan = planSubCategories(
      'category:food-mains',
      [
        { original: 'Main meal', name: 'Dinner' },
        { original: null, name: 'Soup' },
        { original: null, name: '  ' },
      ],
      snap.items,
    );
    expect(plan.errors).toEqual([]);
    expect(plan.list).toEqual(['Dinner', 'Soup']);
    expect(plan.items).toHaveLength(10);
    expect(plan.items.every((i) => i.subCategory === 'Dinner')).toBe(true);

    const removed = planSubCategories('category:food-sides', [], snap.items);
    expect(removed.removedInUse).toEqual([{ name: 'Side', count: 7 }]);
    expect(removed.items.every((i) => i.subCategory === undefined)).toBe(true);

    const dup = planSubCategories(
      'category:food-mains',
      [
        { original: 'Main meal', name: 'Breakfast' },
        { original: 'Breakfast', name: 'breakfast' },
      ],
      snap.items,
    );
    expect(dup.errors).toHaveLength(1);
  });

  it('reorders and names new categories', () => {
    const changed = moveCategory(snap.categories, 'category:food-ingredients', -1);
    const orders = Object.fromEntries(changed.map((c) => [c._id, c.order]));
    expect(orders['category:food-ingredients']).toBe(5);
    expect(orders['category:food-drinks']).toBe(6);
    expect(orders['category:garage-storage']).toBe(14);
    expect(orders['category:water']).toBeUndefined(); // unchanged records are not rewritten
    expect(moveCategory(snap.categories, 'category:water', -1)).toEqual([]);
    expect(newCategoryId('Water', snap.categories)).toBe('category:water-2');
    expect(newCategoryId('Tools', snap.categories)).toBe('category:tools');
  });
});

describe('sub-category filter', () => {
  const rows = buildItemRows(snap, '2026-11-15');
  it('filters by sub-category', () => {
    const f = { ...EMPTY_FILTER, subCategory: 'Dessert' };
    expect(isFiltered(f)).toBe(true);
    expect(rows.filter((r) => matchesFilter(r, f))).toHaveLength(4);
    expect(rows.filter((r) => matchesFilter(r, { ...f, categoryId: 'category:food-mains' }))).toHaveLength(0);
  });
});
