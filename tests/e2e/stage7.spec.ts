import { expect, test, type Page } from '@playwright/test';

// 1.3: Lists and Rotation tabs, lists, Recently used, collapsible groups, +10,
// checklist Add per section and links to the inventory, people and medicines.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();

test.beforeEach(({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
});

/** Add an undated item with `quantity` units in a category, using +10 where it helps. */
async function addItem(page: Page, category: string, name: string, quantity: number) {
  await page.goto('./#/inventory');
  await page.getByRole('button', { name: `Add item to ${category}` }).click();
  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await sheet.getByLabel('Name').fill(name);
  await sheet.getByLabel('No date').check();
  for (let n = 1; n + 10 <= quantity; n += 10)
    await sheet.getByRole('button', { name: 'Add 10 to the quantity' }).click();
  for (let n = 1 + Math.floor((quantity - 1) / 10) * 10; n < quantity; n++)
    await sheet.getByRole('button', { name: 'Increase Quantity' }).click();
  await sheet.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('Use now on Rotation goes on Recently used; Purchased restocks it', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Rotation');
  await expect(page.getByRole('heading', { name: 'Rotation', level: 1 })).toBeVisible();
  const first = page.locator('[data-testid^="rot-"]').first();
  const name = (await first.locator('strong').textContent())!.trim();
  await first.getByRole('button', { name: /Use one/ }).click();
  await expect(page.getByText(/Added to Recently used/)).toBeVisible();

  await nav(page, 'Lists');
  await page.getByRole('button', { name: /^Recently used/ }).click();
  await page.getByRole('button', { name: `Purchased ${name}` }).click();
  const sheet = page.getByRole('dialog', { name });
  await sheet.getByLabel('No date').check();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(`Bought ${name}: 1 added to the inventory.`)).toBeVisible();
  await expect(page.getByText('Bought (1)')).toBeVisible();
});

test('rotation switches between food and all items, and three views', async ({ page }) => {
  await addItem(page, 'Power & light', 'Head torch', 3);
  await page.goto('./#/rotation');
  const count = page.getByTestId('rotation-count');
  await page.getByRole('button', { name: 'Everything' }).click();
  await expect(count).toContainText('Showing 38 batches');
  await page.getByRole('button', { name: 'All items' }).click();
  await expect(count).toContainText('Showing 39 batches');
  await expect(page.locator('li strong', { hasText: 'Head torch' })).toBeVisible();
  await page.getByRole('button', { name: 'All batches' }).click();
  await expect(page.locator('li strong', { hasText: 'Head torch' })).toHaveCount(0); // no date
  await page.getByRole('button', { name: 'Due' }).click();
  await expect(count).toContainText('expired and use soon');
});

test('lists can be made, filled, edited, renamed and deleted', async ({ page }) => {
  await page.goto('./#/lists');
  await page.getByRole('button', { name: '+ New list' }).click();
  await page.getByTestId('list-name').fill('Camping');
  await page.getByRole('button', { name: 'Add list' }).click();
  await expect(page.getByRole('button', { name: /^Camping/, pressed: true })).toBeVisible();

  await page.getByRole('button', { name: '+ Add to Camping' }).click();
  let sheet = page.getByRole('dialog', { name: 'Add to list' });
  await sheet.getByTestId('entry-name').fill('Gas canisters');
  await sheet.getByTestId('entry-quantity').fill('4');
  await sheet.getByTestId('entry-category').fill('Cooking & fuel');
  await sheet.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.getByRole('heading', { name: 'Cooking & fuel' })).toBeVisible();

  // Add from the group heading: starts in that category.
  await page.getByRole('button', { name: 'Add to Cooking & fuel' }).click();
  sheet = page.getByRole('dialog', { name: 'Add to list' });
  await expect(sheet.getByTestId('entry-category')).toHaveValue('Cooking & fuel');
  await sheet.getByTestId('entry-name').fill('Matches');
  await sheet.getByRole('button', { name: 'Add to list' }).click();

  // Amend and remove.
  await page.getByRole('button', { name: /^Gas canisters/ }).click();
  sheet = page.getByRole('dialog', { name: 'Gas canisters' });
  await sheet.getByTestId('entry-quantity').fill('6');
  await sheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('6', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Matches/ }).click();
  await page.getByRole('dialog', { name: 'Matches' }).getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: /^Matches/ })).toHaveCount(0);

  // Show / hide the group.
  await page.getByRole('button', { name: 'Hide Cooking & fuel' }).click();
  await expect(page.getByRole('button', { name: /^Gas canisters/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Cooking & fuel' }).click();

  // Rename, then delete.
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByTestId('list-name').fill('Car kit');
  await page.locator('form.naming').getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('button', { name: /^Car kit/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await expect(page.getByRole('button', { name: /^Car kit/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Shopping list/, pressed: true })).toBeVisible();
});

test('inventory categories show and hide, remembered after a reload; +10 adds ten', async ({ page }) => {
  await addItem(page, 'Water', 'Water bottle 2 L', 12);
  await expect(page.getByTestId('item-item:water-bottle-2-l')).toContainText('12 bottles');

  const mains = page.getByTestId('item-item:pasta-bolognaise');
  await expect(mains).toBeVisible();
  await page.getByRole('button', { name: 'Hide Food – Main meals' }).click();
  await expect(mains).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show Food – Main meals' })).toBeVisible();
  await expect(mains).toHaveCount(0);
  // A search shows every match, hidden or not.
  await page.getByPlaceholder('Search items').fill('bolognaise');
  await expect(mains).toBeVisible();
});

test('checklist: Add per section, show / hide, and a line linked to inventory stock', async ({ page }) => {
  await addItem(page, 'Safety & first aid', 'CO alarm', 1);
  await page.goto('./#/checklist');

  // Add from a section opens the form in that section.
  await page.getByRole('button', { name: 'Add line to Power & light' }).click();
  const add = page.getByRole('dialog', { name: 'Add checklist line' });
  await expect(add.getByRole('combobox', { name: 'Section' })).toHaveValue('section:power-light');
  await add.getByRole('button', { name: 'Done' }).click();

  // Link the CO alarm line (target 2) to the inventory: 1 in stock → Check.
  const line = page.getByRole('button', { name: /^Battery carbon monoxide alarm/ }).first();
  await line.click();
  const sheet = page.getByRole('dialog', { name: 'Battery carbon monoxide alarm' });
  await sheet.getByText('Have', { exact: true }).click();
  await sheet.getByTestId('link-pick').selectOption({ label: 'CO alarm' });
  await expect(sheet.getByTestId('link-status')).toContainText('Check');
  await sheet.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('button', { name: 'Battery carbon monoxide alarm: Check. Set by inventory' }),
  ).toBeVisible();

  // One more alarm in the inventory → Have.
  await page.goto('./#/inventory');
  await page.getByRole('button', { name: 'Add one CO alarm' }).click();
  await page.goto('./#/checklist');
  await expect(
    page.getByRole('button', { name: 'Battery carbon monoxide alarm: Have. Set by inventory' }),
  ).toBeVisible();

  // Sections show and hide.
  await page.getByRole('button', { name: 'Hide Water' }).click();
  await expect(page.getByTestId('line-checklist:01-drinking-cooking-water')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Water' }).click();
  await expect(page.getByTestId('line-checklist:01-drinking-cooking-water')).toBeVisible();
});

test('household: named people with a medicine shown on the dashboard', async ({ page }) => {
  await addItem(page, 'Safety & first aid', 'Levothyroxine', 20);
  await page.goto('./#/settings?s=household');
  const headings = page.locator('main h2');
  await expect(headings).toHaveText(['People', 'Daily needs per person', 'Meals per person per day', 'Pets']);
  await page.getByRole('button', { name: '+ Add person' }).click();
  const person = page.getByTestId('person-0');
  await person.getByLabel('Name').fill('Sam');
  await person.getByLabel('Name').blur();
  await person.getByLabel('Age').fill('42');
  await person.getByLabel('Age').blur();
  await page.getByRole('button', { name: '+ Add a medicine for Sam' }).click();
  await person.getByLabel('Medicine', { exact: true }).fill('Levothyroxine 50 mcg');
  await person.getByLabel('Medicine', { exact: true }).blur();
  await person.getByLabel(/doses a day/).fill('1');
  await person.getByLabel(/doses a day/).blur();
  await person.getByLabel(/inventory item/).selectOption({ label: 'Levothyroxine' });

  await page.goto('./#/dashboard');
  await expect(page.getByTestId('med-cover')).toContainText('Sam: Levothyroxine 50 mcg – 20 packs, 20 days');
});
