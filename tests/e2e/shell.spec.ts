import { expect, test } from '@playwright/test';

test('shows the five areas and switches between them', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const label of ['Dashboard', 'Inventory', 'Checklist', 'Info', 'Settings']) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible();
  }
  await nav.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page).toHaveURL(/#\/settings$/);
});

test('serves a valid web app manifest', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/PrepApp/');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
});

test('launches and works with the network off once installed', async ({ page, context }) => {
  await page.goto('./');
  // Wait until the service worker has installed and precached the app.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('Works offline', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('connection test explains an unreachable server', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByLabel('Sync address').fill('https://127.0.0.1:9');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Not connected' })).toBeVisible({ timeout: 15000 });
});
