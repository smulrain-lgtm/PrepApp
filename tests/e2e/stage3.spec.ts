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

test('checklist targets scale with the scenario', async ({ page }) => {
  await nav(page, 'Checklist');
  const water = page.getByTestId('line-checklist:01-drinking-cooking-water');
  await expect(water).toContainText('Target 42 L');

  await openSettings(page, 'Household');
  await page.getByRole('button', { name: 'Increase People' }).click();
  await page.getByRole('button', { name: 'Increase People' }).click();
  await nav(page, 'Checklist');
  await expect(water).toContainText('Target 66 L');
  // Meals are counted from the inventory in the Food box: 5 people × 3 days × 2 main meals.
  await expect(page.getByTestId('meal-main')).toContainText('of 30');
  await expect(page.getByTestId('meal-breakfast')).toContainText('of 15');
});

test('status cycles Need → Check → Have and counts update', async ({ page }) => {
  await nav(page, 'Checklist');
  await expect(page.getByText('10 of 65 marked Have.')).toBeVisible();
  const status = page.getByRole('button', { name: /^Whistle: Need/ });
  await status.click();
  await expect(page.getByRole('button', { name: /^Whistle: Check/ })).toBeVisible();
  await page.getByRole('button', { name: /^Whistle: Check/ }).click();
  await expect(page.getByRole('button', { name: /^Whistle: Have/ })).toBeVisible();
  await expect(page.getByText('11 of 65 marked Have.')).toBeVisible();
});

test('recurring checks: "Checked today" clears the due flag', async ({ page }) => {
  await nav(page, 'Checklist');
  await page.getByRole('button', { name: 'Checks due' }).click();
  const solar = page.getByTestId('line-checklist:28-portable-solar-panels');
  await expect(solar).toContainText('Check due');
  await solar.locator('.main').click();
  await page.getByRole('button', { name: 'Checked today' }).click();
  await expect(page.getByRole('dialog')).toContainText('Next check:');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(solar).toBeHidden(); // no longer due
});

test('contacts: tap-to-call links and adding a contact', async ({ page }) => {
  await nav(page, 'Info');
  await page.getByRole('link', { name: /Contacts/ }).click();
  await expect(
    page.getByRole('link', { name: 'Call National Gas emergency on 0800 111 999' }),
  ).toHaveAttribute('href', 'tel:0800111999');
  await page.getByRole('button', { name: 'Add contact' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add contact' });
  await sheet.getByLabel('Name').fill('Next door');
  await sheet.getByLabel('Phone numbers').fill('07700 900123');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Text Next door' })).toHaveAttribute('href', 'sms:07700900123');
});

test('household plan appears on the printable sheet, medical list does not', async ({ page }) => {
  await nav(page, 'Info');
  await page.getByRole('link', { name: /Household plan/ }).click();
  await page.getByRole('button', { name: /Meeting point near home/ }).click();
  await page.getByRole('dialog').getByLabel('Details').fill('Post box at the end of the road');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Post box at the end of the road')).toBeVisible();

  await page.goto('./#/info?s=print');
  const sheet = page.locator('article.sheet');
  await expect(sheet).toContainText('Meeting point near home: Post box at the end of the road');
  await expect(sheet).toContainText('0800 111 999');
  await expect(sheet).not.toContainText('Medical');
});

test('shut-off photo is stored, shown and included in the backup', async ({ page }) => {
  await page.goto('./#/info?s=shutoffs');
  await page.getByRole('button', { name: /Water stopcock/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Details').fill('Under the kitchen sink');
  await dialog.getByLabel('Photo').setInputFiles('public/icons/icon-512.png');
  await expect(dialog.getByRole('img', { name: 'Photo: Water stopcock' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('img', { name: 'Photo: Water stopcock' })).toBeVisible();

  await openSettings(page, 'Backup and data');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup (JSON)' }).click();
  const backup = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
  const note = backup.docs.find((d: { _id: string }) => d._id === 'info:shutoffs:water');
  expect(note.hasPhoto).toBe(true);
  expect(note._attachments.photo.content_type).toBe('image/jpeg');
  expect(note._attachments.photo.data.length).toBeGreaterThan(1000);
});

test('medical list needs the PIN', async ({ page }) => {
  await page.goto('./#/info?s=medical');
  await page.getByLabel('New PIN (4–8 digits)').fill('2468');
  await page.getByLabel('Repeat the PIN').fill('2468');
  await page.getByRole('button', { name: 'Set PIN' }).click();

  await page.getByRole('button', { name: 'Add a person' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Person').fill('Alex');
  await expect(dialog.getByLabel('Details')).toHaveValue(/Medicines and doses:/);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Alex')).toBeVisible();

  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.getByText('Alex')).toBeHidden();
  await page.getByLabel('PIN', { exact: true }).fill('1111');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong PIN.');
  await page.getByLabel('PIN', { exact: true }).fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Alex')).toBeVisible();
});

test('quick guides work offline', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.goto('./#/info?s=guides');
  await page.getByText('Smell of gas or suspected gas leak').click();
  await expect(page.getByText('Open doors and windows.')).toBeVisible();
});
