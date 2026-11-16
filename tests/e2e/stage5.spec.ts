import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

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
  await expect(page.getByTestId('shopping-card')).toContainText('81 things to buy');
  await page.getByTestId('shopping-card').click();
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
  await expect(page.getByText('42 L more')).toBeVisible();

  await page.getByRole('button', { name: 'Share list' }).click();
  // No share sheet in a desktop browser: the list is copied instead.
  await expect(page.getByRole('status').filter({ hasText: 'Shopping list copied.' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('- Water: 42 L more');
  expect(text).toContain('Planned food:');
});

test('a bought purchase can be added to the inventory', async ({ page }) => {
  await page.goto('./#/shopping');
  await page.getByRole('checkbox', { name: /Rolled porridge oats/ }).check();
  await expect(page.getByText('Bought (1)')).toBeVisible();
  await page.getByText('Bought (1)').click();
  await page.getByRole('link', { name: 'Add to inventory' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await expect(sheet.getByLabel('Name')).toHaveValue('Rolled porridge oats');
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
  await nav(page, 'Settings');
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
      './#/shopping',
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
