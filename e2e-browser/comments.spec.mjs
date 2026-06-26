import { test, expect } from '@playwright/test';

const PASSWORD = 'browser-e2e-pass-123';

test('comments: enable on deploy → drop a pin → post → persists on reload', async ({ page }) => {
  const email = `e2e-cmt-${Date.now()}@browser.test`;

  // Sign up via the dashboard gate (same pattern as core.spec).
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy from the home page with comments enabled.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>commentable artifact</h1>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href');
  expect(url).toMatch(/\/a\/\w+/);

  // Open the artifact — the comment sidebar + the artifact iframe should be present.
  await page.goto(url);
  await expect(page.getByRole('button', { name: /add comment/i })).toBeVisible();
  await expect(page.frameLocator('iframe').getByText('commentable artifact')).toBeVisible();

  // Enter comment mode, then click inside the artifact to drop a pin. Retry the click until
  // the composer opens (the set-mode postMessage to the iframe settles asynchronously).
  // Note: Playwright cannot click `body` by position inside a null-origin sandboxed srcdoc
  // iframe (Chromium reports `<html>` intercepts at that coordinate), so we click the h1
  // element directly — the annotation runtime's capture-phase click handler fires regardless
  // of which element is the click target.
  await expect(async () => {
    await page.getByRole('button', { name: /add comment/i }).click();
    await page.frameLocator('iframe').locator('h1').click();
    await expect(page.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // Compose + post.
  await page.getByPlaceholder(/add a comment/i).fill('looks great');
  await page.getByRole('button', { name: /^post$/i }).click();

  // Appears in the sidebar.
  await expect(page.getByText('looks great')).toBeVisible();

  // Persists after reload, with a numbered pin marker rendered inside the iframe.
  await page.reload();
  await expect(page.getByText('looks great')).toBeVisible();
  await expect(page.frameLocator('iframe').locator('[data-ah-layer] button').first()).toBeVisible();
});
