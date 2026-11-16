import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

/** Open a Settings page by its card title, e.g. "Household". */
async function openSettings(page: Page, title: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('./');
  await expect(page.getByTestId('limiting')).toBeVisible();
});

test('shopping list gathers shortfalls, purchases and needs, and can be shared', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await expect(page.getByTestId('shopping-card')).toContainText('82 things to buy');
  await page.getByTestId('shopping-card').click();
  await expect(page.getByRole('heading', { name: 'Lists', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Shopping list/, pressed: true })).toBeVisible();
  await expect(page.getByText('42 L more')).toBeVisible();

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  // No share sheet in a desktop browser: the list is copied instead.
  await expect(page.getByRole('status').filter({ hasText: 'Shopping list copied.' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('- Water: 42 L more');
  expect(text).toContain('On the shopping list:');
});

test('"Purchased" on a list adds the item to the inventory', async ({ page }) => {
  await page.goto('./#/shopping'); // the old address opens the Lists tab
  await page.getByRole('button', { name: 'Purchased Rolled porridge oats' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await expect(sheet.getByLabel('Name')).toHaveValue('Rolled porridge oats');
  await expect(sheet.getByRole('combobox', { name: /^Category/ })).toHaveValue('category:food-mains');
  await expect(sheet.getByTestId('item-subcategory')).toHaveValue('Breakfast');
  await sheet.getByLabel('No date').check();
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('Bought (1)')).toBeVisible();
  await page.goto('./#/inventory');
  await expect(page.getByTestId('item-item:rolled-porridge-oats')).toBeVisible();
});

test('rotation lists the oldest first and "Use now" takes one', async ({ page }) => {
  await page.goto('./#/rotation');
  const first = page.locator('[data-testid^="rot-"]').first();
  await expect(first).toContainText('Treacle Pudding');
  await expect(first).toContainText('25 Aug 1996 · 1 pack');
  await page.getByRole('button', { name: /Use one Treacle Pudding dated 25 Aug 1996/ }).click();
  await expect(page.getByTestId('rot-batch:treacle-pudding:1996-08-25')).toHaveCount(0);
});

test('due checks can be ticked off from the dashboard', async ({ page }) => {
  const due = page.getByRole('region', { name: 'Checks due' });
  await expect(due.getByRole('listitem')).toHaveCount(5);
  await due.getByRole('button', { name: 'First aid kit checked today' }).click();
  await expect(due.getByRole('listitem')).toHaveCount(4);
});

test('inventory CSV export', async ({ page }) => {
  await openSettings(page, 'Backup and data');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export inventory (CSV)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^prepapp-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('Item,Category,Sub-category,Location,Best before');
  expect(csv).toContain('Hot Chocolate,Food – Drinks');
  expect(csv).not.toContain('Medicines and doses');
});

test('iPad landscape: item details open beside the list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad');
  await page.setViewportSize({ width: 1180, height: 820 });
  await nav(page, 'Inventory');
  await page.getByTestId('item-item:just-nuts').locator('.row-main').click();
  const pane = page.getByRole('dialog', { name: 'Just Nuts' });
  await expect(pane).toBeVisible();
  // The list is still usable while the pane is open.
  await page.getByRole('button', { name: 'Use one Hot Chocolate' }).click();
  await expect(page.getByTestId('item-item:hot-chocolate')).toContainText('8 packs');
  await expect(pane).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious accessibility problems on the main screens (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const screens = [
      './#/dashboard',
      './#/inventory',
      './#/checklist',
      './#/info',
      './#/info?s=contacts',
      './#/info?s=guides',
      './#/settings',
      './#/settings?s=store',
      './#/settings?s=household',
      './#/settings?s=categories',
      './#/settings?s=sync',
      './#/settings?s=data',
      './#/method',
      './#/lists',
      './#/rotation',
    ];
    for (const url of screens) {
      await page.goto(url);
      await expect(page.locator('main h1')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${url}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
      expect(serious).toEqual([]);
    }
  });
}

test('release 1.1: scenarios, goal and medicine essentials on the dashboard', async ({ page }) => {
  await expect(page.getByTestId('tile-medicine')).toContainText('0 of 4');
  await expect(page.getByText('14 days to your 14-day goal')).toBeVisible();

  // Power (lighting) counts at home; there is no separate power-cut scenario.
  await expect(page.getByTestId('bar-light_days')).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Scenario' }).getByRole('button', { name: 'Power cut' }),
  ).toHaveCount(0);

  // Go bag: nothing in the grab bags yet, judged against 3 days, no cooking fuel.
  await page.getByRole('group', { name: 'Scenario' }).getByRole('button', { name: 'Go bag' }).click();
  await expect(page.getByRole('heading', { name: /Your go bag lasts/ })).toBeVisible();
  await expect(page.getByTestId('bar-fuel_g')).toHaveCount(0);
  await expect(page.getByTestId('bar-kcal')).toContainText('Have 0 kcal');

  // The choice is remembered on this device.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Your go bag lasts/ })).toBeVisible();
});

test('release 1.1: the long-term goal sets the ruler', async ({ page }) => {
  await page.goto('./#/settings?s=store');
  await page.getByRole('group', { name: 'Long-term goal' }).getByRole('button', { name: '30 days' }).click();
  await page.goto('./#/dashboard');
  await expect(page.getByText('30 days to your 30-day goal')).toBeVisible();
});
