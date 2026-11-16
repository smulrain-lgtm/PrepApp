/**
 * Barcode numbers and the Open Food Facts lookup that fills in a scanned
 * product's name, pack size and nutrition. The lookup needs the internet;
 * everything else in the app works without it.
 */
import type { Nutrition, PackSize } from './model/types';
import { cleanNutrition, num, parsePackSize } from './nutrition';

/** Digits only, from a scanned or typed code. */
export function cleanBarcode(text: string): string {
  return text.replace(/\D/g, '');
}

/** EAN-8, UPC-A (12), EAN-13 or GTIN-14 with a correct check digit. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export interface ProductInfo {
  barcode: string;
  name: string;
  brand?: string;
  packSize?: PackSize;
  nutrition?: Nutrition;
  /** Inventory category the product most likely belongs in. */
  categoryId: string;
}

/** The fields asked of Open Food Facts (keeps the reply small). */
const FIELDS = [
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'nutriments',
  'categories_tags',
].join(',');

export function lookupUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  nutriments?: Record<string, unknown>;
  categories_tags?: string[];
}

/** Category tag fragments → inventory category, checked in this order. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/pet-food|dog-food|cat-food/, 'category:pet-food'],
  [/(^|\s)en:waters(\s|$)|spring-water|mineral-water/, 'category:water'],
  // Drinks before snacks: hot chocolate is tagged with chocolates too.
  [/beverages|drinks|coffees|teas|hot-chocolate|juices|milks/, 'category:food-drinks'],
  [/desserts|puddings|custards|rice-puddings/, 'category:food-desserts'],
  [
    /snacks|biscuits|chocolates|confectioner|crisps|cereal-bars|nuts|dried-fruits|sweets/,
    'category:food-snacks',
  ],
  [/side-dishes|instant-noodles|instant-mash|baked-beans/, 'category:food-sides'],
  [/meals|soups|ready-|breakfast-cereals|porridge/, 'category:food-mains'],
];

/** Best guess at the inventory category from Open Food Facts category tags. */
export function guessCategory(tags: string[] | undefined): string {
  const joined = (tags ?? []).join(' ');
  for (const [pattern, id] of CATEGORY_RULES) if (pattern.test(joined)) return id;
  return 'category:food-ingredients';
}

function nutritionFrom(n: Record<string, unknown> | undefined): Nutrition | undefined {
  if (!n) return undefined;
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  let salt = num(n['salt_100g']);
  if (salt === undefined) {
    const sodium = num(n['sodium_100g']);
    if (sodium !== undefined) salt = sodium * 2.5;
  }
  return cleanNutrition({
    kcal,
    protein: n['proteins_100g'],
    fat: n['fat_100g'],
    carbs: n['carbohydrates_100g'],
    salt,
  });
}

function packSizeFrom(p: OffProduct): PackSize | undefined {
  const amount = num(p.product_quantity);
  const unit = p.product_quantity_unit?.toLowerCase();
  if (amount && (unit === 'g' || unit === 'ml')) return { amount, unit };
  return parsePackSize(p.quantity) ?? undefined;
}

/** Turn an Open Food Facts reply into product details, or null when not found. */
export function parseProduct(code: string, reply: unknown): ProductInfo | null {
  const r = reply as { status?: number; product?: OffProduct } | null;
  if (!r || r.status !== 1 || !r.product) return null;
  const p = r.product;
  const brand = p.brands?.split(',')[0]?.trim() || undefined;
  let name = (p.product_name_en || p.product_name || p.generic_name || '').trim();
  if (brand && name && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
  if (!name) name = brand ?? '';
  return {
    barcode: code,
    name,
    brand,
    packSize: packSizeFrom(p),
    nutrition: nutritionFrom(p.nutriments),
    categoryId: guessCategory(p.categories_tags),
  };
}

export type LookupResult =
  | { status: 'found'; product: ProductInfo }
  | { status: 'not_found' }
  | { status: 'offline'; message: string };

/** Ask Open Food Facts about a barcode. Never throws. */
export async function lookupBarcode(
  code: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000,
): Promise<LookupResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(lookupUrl(code), { signal: controller.signal });
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'offline', message: `Open Food Facts replied ${res.status}.` };
    const product = parseProduct(code, await res.json());
    return product ? { status: 'found', product } : { status: 'not_found' };
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    return {
      status: 'offline',
      message: aborted ? 'Open Food Facts did not answer in time.' : 'Could not reach Open Food Facts.',
    };
  } finally {
    clearTimeout(timer);
  }
}
