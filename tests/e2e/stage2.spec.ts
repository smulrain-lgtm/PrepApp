import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Every test starts with a fresh browser profile, so the app seeds itself from
// the household workbook data. Today's date in the app is the real date, so
// figures that depend on expiry are compared before/after rather than fixed.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

/** Open a Settings page by its card title, e.g. "Household". */
async function openSettings(page: Page, title: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).click();
}

async function openDashboard(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('limiting')).toBeVisible();
}

test.beforeEach(({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});

test('names Water as the limiting category with 0 L of water (criterion 6)', async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByTestId('limiting')).toHaveText('Water runs out first.');
  const water = page.getByTestId('bar-water_l');
  await expect(water).toContainText('Limiting');
  await expect(water).toContainText('Have 0 L');
  await expect(page.getByRole('img', { name: /Readiness 0 of 3 days/ })).toBeVisible();
});

test('changing people and days updates shortfalls immediately (criterion 2)', async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByTestId('bar-water_l')).toContainText('short 42 L'); // (3 × 4 + 2) × 3

  await openSettings(page, 'Household');
  await page.getByRole('button', { name: 'Increase People' }).click();
  await page.getByRole('button', { name: 'Increase People' }).click();
  await expect(page.getByRole('group', { name: 'People' })).toContainText('5');
  await nav(page, 'Dashboard');
  await expect(page.getByTestId('bar-water_l')).toContainText('short 66 L'); // (5 × 4 + 2) × 3
  await expect(page.getByTestId('scenario')).toContainText('5 people');

  await openSettings(page, 'Your store');
  await page.getByRole('group', { name: 'Quick target' }).getByRole('button', { name: '5 days' }).click();
  await nav(page, 'Dashboard');
  await expect(page.getByTestId('bar-water_l')).toContainText('short 110 L'); // 22 × 5
  await expect(page.getByRole('img', { name: /of 5 days/ })).toBeVisible();
});

test('counting food past its best-before raises food days (criterion 3)', async ({ page }) => {
  await openDashboard(page);
  const food = page.getByTestId('bar-kcal');
  const daysOf = async () => Number((await food.locator('.value strong').textContent())!.trim());
  const before = await daysOf();

  await openSettings(page, 'Your store');
  await page.getByText('Still counted', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Still counted' })).toBeChecked();
  await nav(page, 'Dashboard');
  await expect(page.getByTestId('scenario')).toContainText('past-date food counted');
  await expect.poll(daysOf).toBeGreaterThan(before);
});

test('each category has an Add button that opens the form in that category', async ({ page }) => {
  await openDashboard(page);
  await nav(page, 'Inventory');
  await page.getByRole('button', { name: 'Add item to Food – Snacks' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await expect(sheet.getByRole('combobox', { name: /^Category/ })).toHaveValue('category:food-snacks');
  await expect(sheet.getByRole('combobox', { name: /^Counts as/ })).toHaveValue('kcal');
  await sheet.getByRole('button', { name: 'Done' }).click();

  // While filtering, only matching categories (and their Add buttons) show.
  await page.getByPlaceholder('Search items').fill('nuts');
  await expect(page.getByRole('button', { name: /^Add item to/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add item to Food – Snacks' })).toBeVisible();
});

test('quick actions write stock changes and the dashboard follows', async ({ page }) => {
  await openDashboard(page);
  const expired = page.locator('a.tile', { hasText: 'Expired' }).locator('.count');
  const before = Number(await expired.textContent());

  await nav(page, 'Inventory');
  // −1 takes the soonest-dated batch: the hot chocolate dated 01 Oct 2026.
  await page.getByRole('button', { name: 'Use one Hot Chocolate' }).click();
  await expect(page.getByTestId('item-item:hot-chocolate')).toContainText('8 packs');

  await nav(page, 'Dashboard');
  await expect(expired).toHaveText(String(before - 1));
});

test('adds a new item with a batch, and it counts', async ({ page }) => {
  await openDashboard(page);
  await nav(page, 'Inventory');
  // Water has no items yet, but still shows with its own Add button.
  await expect(page.getByRole('heading', { name: 'Water', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add item to Water' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  // The category and its measure are already chosen.
  await expect(sheet.getByRole('combobox', { name: /^Category/ })).toHaveValue('category:water');
  await expect(sheet.getByRole('combobox', { name: /^Counts as/ })).toHaveValue('water_l');
  await sheet.getByLabel('Name').fill('Bottled water 2 L');
  await sheet.getByText('Indoors', { exact: true }).click();
  await sheet.getByLabel('Per unit').fill('2');
  await sheet.getByLabel('Best before').fill('2030-06-01');
  await sheet.getByRole('button', { name: 'Increase Quantity' }).click(); // 2 bottles
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await expect(page.getByTestId('item-item:bottled-water-2-l')).toContainText('2 bottles');
  await nav(page, 'Dashboard');
  await expect(page.getByTestId('bar-water_l')).toContainText('Have 4 L');
});

test('JSON export re-imports to an identical dashboard', async ({ page }) => {
  await openDashboard(page);
  await nav(page, 'Inventory');
  await page.getByRole('button', { name: 'Use one Pasta Bolognaise' }).click();
  await expect(page.getByTestId('item-item:pasta-bolognaise')).toContainText('0 packs');
  await nav(page, 'Dashboard');
  // The dashboard's text, without the online badges and the transient pop-up notice.
  const snapshot = () =>
    page.locator('main').evaluate((main) => {
      const copy = main.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.toast, header.status').forEach((el) => el.remove());
      return copy.innerText;
    });
  const original = await snapshot();

  await openSettings(page, 'Backup and data');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup (JSON)' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^prepapp-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path!, 'utf8'));
  expect(backup.app).toBe('prepapp');

  // Change things after the backup...
  await openSettings(page, 'Household');
  await page.getByRole('button', { name: 'Increase People' }).click();
  await nav(page, 'Inventory');
  await page.getByRole('button', { name: 'Use one Hot Chocolate' }).click();
  await nav(page, 'Dashboard');
  expect(await snapshot()).not.toEqual(original);

  // ...then restore it.
  await openSettings(page, 'Backup and data');
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByRole('status').filter({ hasText: 'Restored the backup' })).toBeVisible();
  await nav(page, 'Dashboard');
  await expect.poll(snapshot).toEqual(original);
});

test('the data survives a reload and works offline', async ({ page, context }) => {
  await openDashboard(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await nav(page, 'Inventory');
  await page.getByRole('button', { name: 'Use one Just Nuts' }).click();
  await expect(page.getByTestId('item-item:just-nuts')).toContainText('1 pack');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('item-item:just-nuts')).toContainText('1 pack');
  await nav(page, 'Dashboard');
  await expect(page.getByTestId('limiting')).toHaveText('Water runs out first.');
  await nav(page, 'Inventory');
  await expect(page.getByTestId('item-item:just-nuts')).toContainText('1 pack');
});

test('quick repeated taps each count and never go below zero', async ({ page }) => {
  await openDashboard(page);
  await nav(page, 'Inventory');
  // Just Nuts: 2 packs. Tap −1 three times as fast as possible.
  // Three clicks in the same instant, before the app can re-render or disable the button.
  await page
    .getByRole('button', { name: 'Use one Just Nuts' })
    .evaluate((button: HTMLButtonElement) => [1, 2, 3].forEach(() => button.click()));
  await expect(page.getByTestId('item-item:just-nuts')).toContainText('0 packs');
  await page.getByTestId('item-item:just-nuts').locator('.row-main').click();
  await expect(page.getByRole('dialog', { name: 'Just Nuts' })).toContainText('In stock: 0 packs');
});
