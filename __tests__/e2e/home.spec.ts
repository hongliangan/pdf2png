import { test, expect } from '@playwright/test';

test('home page renders the upload prompt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /PDF 路网编辑器/i })).toBeVisible();
});