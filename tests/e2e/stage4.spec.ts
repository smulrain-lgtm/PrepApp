import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Two separate browser profiles stand in for the iPhone and the iPad. They sync
// through an in-memory CouchDB stand-in (tests/couchsim) instead of the Pi.

const COUCH = 'http://localhost:5998';

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

async function newDevice(
  browser: Browser,
  baseURL: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto('./');
  await expect(page.getByTestId('limiting')).toBeVisible();
  return { context, page };
}

async function openSync(page: Page) {
  await nav(page, 'Settings');
  await page.getByRole('link', { name: /^Sync with the Pi/ }).click();
}

async function turnOnSync(page: Page, database: string) {
  await openSync(page);
  await page.getByLabel('Sync addresses').fill(COUCH);
  await page.getByLabel('Database').fill(database);
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.getByText('Sync this device').click();
  await expect(page.getByRole('link', { name: /Sync status: Synced/ })).toBeVisible({ timeout: 20_000 });
}

const stock = (page: Page, itemId: string) => page.getByTestId(`item-${itemId}`);

test.describe('sync between two devices', () => {
  let database: string;

  test.beforeEach(async ({ request }, testInfo) => {
    // Each test opens its own two devices, so run it once rather than per screen size.
    test.skip(testInfo.project.name !== 'iphone', 'runs once, with two devices');
    database = `prepapp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    expect((await request.put(`${COUCH}/${database}`)).ok()).toBe(true);
  });

  test('a change on one device appears on the other', async ({ browser, baseURL }) => {
    const iphone = await newDevice(browser, baseURL!);
    const ipad = await newDevice(browser, baseURL!);
    await turnOnSync(iphone.page, database);
    await turnOnSync(ipad.page, database);

    await nav(iphone.page, 'Inventory');
    await iphone.page.getByRole('button', { name: 'Use one Just Nuts' }).click();
    await expect(stock(iphone.page, 'item:just-nuts')).toContainText('1 pack');

    await nav(ipad.page, 'Inventory');
    await expect(stock(ipad.page, 'item:just-nuts')).toContainText('1 pack', { timeout: 15_000 });
    await expect(ipad.page.getByText('Edited on two devices')).toHaveCount(0);
  });

  test('criteria 4 and 5: offline changes on both devices merge without loss', async ({
    browser,
    baseURL,
  }) => {
    const iphone = await newDevice(browser, baseURL!);
    const ipad = await newDevice(browser, baseURL!);
    await turnOnSync(iphone.page, database);
    await turnOnSync(ipad.page, database);
    await nav(iphone.page, 'Inventory');
    await nav(ipad.page, 'Inventory');

    await iphone.context.setOffline(true);
    await ipad.context.setOffline(true);
    await expect(
      iphone.page.getByRole('link', { name: 'Sync status: Offline. Open sync settings' }),
    ).toBeVisible();

    // Same item on both (criterion 5) ...
    await iphone.page.getByRole('button', { name: 'Use one Hot Chocolate' }).click();
    await ipad.page.getByRole('button', { name: 'Use one Hot Chocolate' }).click();
    // ... and a different item on each (criterion 4).
    await iphone.page.getByRole('button', { name: 'Use one Biscuit Browns' }).click();
    await ipad.page.getByRole('button', { name: 'Use one Cheese Spread' }).click();

    await iphone.context.setOffline(false);
    await ipad.context.setOffline(false);
    // Bring each device round a second time so it collects the other's changes.
    for (const d of [iphone, ipad, iphone]) {
      await expect(d.page.getByRole('link', { name: /Sync status: Synced/ })).toBeVisible({
        timeout: 20_000,
      });
    }

    for (const d of [iphone, ipad]) {
      await expect(stock(d.page, 'item:hot-chocolate')).toContainText('7 packs', { timeout: 15_000 });
      await expect(stock(d.page, 'item:biscuit-browns')).toContainText('2 packs', { timeout: 15_000 });
      await expect(stock(d.page, 'item:cheese-spread')).toContainText('1 pack', { timeout: 15_000 });
    }
  });

  test('a wrong address shows Offline with a reason, not a crash', async ({ browser, baseURL }) => {
    const iphone = await newDevice(browser, baseURL!);
    await openSync(iphone.page);
    await iphone.page.getByLabel('Sync addresses').fill('http://localhost:9');
    await iphone.page.getByText('Sync this device').click();
    await expect(
      iphone.page.getByRole('link', { name: 'Sync status: Offline. Open sync settings' }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(iphone.page.getByTestId('sync-status')).toContainText('Could not reach');
  });
});
