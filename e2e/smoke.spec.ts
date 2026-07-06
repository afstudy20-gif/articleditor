import { test, expect } from '@playwright/test';

// Core product promise: paste a manuscript with numbered citations and a
// bibliography → citations are detected and linked → editor opens with a
// working reference library.

const SAMPLE = `The role of statins in heart failure remains debated [1]. Recent
trials have shown mixed outcomes [2]. Combination therapy may help selected
patients [1,2].

References
1. Smith J, Doe A. Statin therapy in chronic heart failure. J Cardiol. 2020;12(3):45-67.
2. Brown K, White L. Outcomes of lipid lowering in HFrEF. Eur Heart J. 2019;40(8):112-119.`;

test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ARTED/i);
});

test('empty project opens the manuscript editor via the workspace hub', async ({ page }) => {
  await page.goto('/edit');
  await page.getByRole('button', { name: /empty project|boş proje/i }).click();
  // Project workspace hub → open the manuscript editor.
  await page.getByRole('button', { name: /open editor|editörü aç/i }).click();
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 15_000 });
});

test('pasted manuscript detects citations and bibliography', async ({ page }) => {
  await page.goto('/edit');
  await page.getByRole('button', { name: /^paste$|yapıştır/i }).first().click();
  const box = page.locator('textarea').first();
  await expect(box).toBeVisible();
  await box.fill(SAMPLE);
  await page.getByRole('button', { name: /detect & preview|algıla/i }).first().click();
  // Import preview modal: both bibliography entries and both markers detected.
  const summary = page.getByText(/citation markers found|atıf işareti bulundu/i);
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText(/^2\s+(references|referans)/i);
  await expect(page.getByText(/Statin therapy in chronic heart failure/).first()).toBeVisible();
  await expect(page.getByText(/Outcomes of lipid lowering/).first()).toBeVisible();
});
