import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// 1.2: barcode lookup (Open Food Facts is mocked), label nutrition,
// Food – Ingredients, Settings → Categories and the sub-category filter.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

const FLOUR = '5000354904410';
const offReply = {
  status: 1,
  product: {
    product_name: 'Plain Flour',
    brands: 'Allinson',
    quantity: '1.5 kg',
    nutriments: {
      'energy-kcal_100g': 341,
      proteins_100g: 10,
      fat_100g: 1.3,
      carbohydrates_100g: 70,
      salt_100g: 0.01,
    },
    categories_tags: ['en:cereals-and-potatoes', 'en:flours'],
  },
};

async function openInventory(page: Page) {
  await page.goto('./#/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory', level: 1 })).toBeVisible();
}

async function typeBarcode(page: Page, code: string) {
  await page.getByTestId('scan-button').click();
  const scan = page.getByRole('dialog', { name: 'Scan a barcode' });
  await scan.getByTestId('barcode-input').fill(code);
  await scan.getByRole('button', { name: 'Look up' }).click();
}

test.beforeEach(({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});

test('a typed barcode fills in the product from Open Food Facts, with calories from the label', async ({
  page,
}) => {
  let lookups = 0;
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    lookups++;
    return route.fulfill({ json: offReply, headers: { 'access-control-allow-origin': '*' } });
  });
  await openInventory(page);
  await typeBarcode(page, FLOUR);

  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('Allinson Plain Flour');
  await expect(sheet.getByRole('combobox', { name: /^Category/ })).toHaveValue('category:food-ingredients');
  const label = sheet.getByTestId('label-fields');
  await expect(label.getByRole('textbox', { name: 'Barcode' })).toHaveValue(FLOUR);
  await expect(label.getByRole('spinbutton', { name: 'Pack size' })).toHaveValue('1500');
  await expect(label.getByRole('spinbutton', { name: 'Protein per 100 g' })).toHaveValue('10');
  await expect(label.getByRole('spinbutton', { name: 'Salt per 100 g' })).toHaveValue('0');
  await expect(sheet.getByTestId('label-kcal')).toContainText('5,115 kcal per pack');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  }

  await sheet.getByTestId('item-subcategory').selectOption('Flour & baking');
  await sheet.getByLabel('No date').check();
  await sheet.getByRole('button', { name: 'Add item' }).click();

  const group = page.locator('section', { has: page.getByRole('heading', { name: 'Food – Ingredients' }) });
  await expect(group.getByText('Allinson Plain Flour')).toBeVisible();
  await expect(group).toContainText('Flour & baking');
  await expect(group).toContainText('(1.5 kg)');

  // Scanning it again opens the item instead of looking it up.
  await typeBarcode(page, FLOUR);
  await expect(page.getByRole('dialog', { name: 'Allinson Plain Flour' })).toBeVisible();
  expect(lookups).toBe(1);
});

test('without the internet the barcode is kept and the details are typed in', async ({ page }) => {
  await page.route('https://world.openfoodfacts.org/**', (route) => route.abort('internetdisconnected'));
  await openInventory(page);
  await typeBarcode(page, FLOUR);
  await expect(page.getByText('Could not reach Open Food Facts.', { exact: false })).toBeVisible();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await expect(sheet.getByRole('textbox', { name: 'Barcode' })).toHaveValue(FLOUR);
  await expect(sheet.getByRole('textbox', { name: 'Name' })).toHaveValue('');
});

test('sub-categories are edited in Settings and filter the inventory', async ({ page }) => {
  await page.goto('./#/settings?s=categories');
  await expect(page.getByRole('heading', { name: 'Categories', level: 1 })).toBeVisible();
  await expect(page.getByTestId('category-list')).toContainText('Food – Ingredients');
  await page.getByRole('button', { name: 'Edit Food – Desserts' }).click();
  const sheet = page.getByRole('dialog', { name: 'Food – Desserts' });
  await sheet.getByTestId('sub-0').fill('Puddings');
  await sheet.getByTestId('new-sub').fill('Custard');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved Food – Desserts.')).toBeVisible();

  await nav(page, 'Inventory');
  await page.getByTestId('category-filter').selectOption({ label: 'Food – Desserts' });
  const sub = page.getByTestId('subcategory-filter');
  await expect(sub.locator('option')).toHaveText(['All sub-categories', 'Puddings', 'Custard']);
  await sub.selectOption('Puddings');
  await expect(page.getByText(/Showing 4 of \d+ items/)).toBeVisible();
  await sub.selectOption('Custard');
  await expect(page.getByText('No items match these filters.')).toBeVisible();
});

test('categories can be added, reordered and deleted when empty', async ({ page }) => {
  await page.goto('./#/settings?s=categories');
  await page.getByRole('button', { name: '+ Add category' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add category' });
  await sheet.getByTestId('category-name').fill('Tools');
  await sheet.getByRole('button', { name: 'Add category' }).click();
  const names = page.getByTestId('category-list').locator('.name');
  await expect(names.last()).toHaveText('Tools');

  await page.getByRole('button', { name: 'Move Tools up' }).click();
  await expect(names.nth(-2)).toHaveText('Tools');

  await page.getByRole('button', { name: 'Edit Tools' }).click();
  await page.getByRole('dialog', { name: 'Tools' }).getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByTestId('category-list')).not.toContainText('Tools');

  // A category with items cannot be deleted.
  await page.getByRole('button', { name: 'Edit Food – Snacks' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Food – Snacks' }).getByRole('button', { name: 'Delete category' }),
  ).toBeDisabled();
});
