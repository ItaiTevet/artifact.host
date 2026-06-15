import { test, expect } from '@playwright/test';

const PASSWORD = 'browser-e2e-pass-123';

// The core user journey, driven through the real UI — this is the level that catches
// integration bugs the API-level e2e can't (e.g. "the deploy form doesn't send the token").
test('sign up → deploy from the home page → artifact appears in the dashboard (owned)', async ({ page }) => {
  const email = `e2e-${Date.now()}@browser.test`;

  // Sign up via the dashboard gate.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy from the home page while signed in.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible(); // confirms signed-in panel
  await page.getByPlaceholder(/paste your html/i).fill('<title>Browser E2E Artifact</title><h1>hello</h1>');
  await page.getByRole('button', { name: /deploy artifact/i }).click();
  await expect(page.getByRole('link', { name: /view artifact/i })).toBeVisible(); // result card

  // The owned artifact must now be in the dashboard (the regression we're guarding).
  await page.goto('/dashboard');
  await expect(page.getByText('Browser E2E Artifact')).toBeVisible();
});

test('anonymous deploy from the home page renders at a live URL', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/paste your html/i).fill('<h1>anon hello world</h1>');
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href'); // the real deployed URL (not the showcase example)
  expect(url).toMatch(/\/a\/\w+/);

  await page.goto(url);
  await expect(page.frameLocator('iframe').getByText('anon hello world')).toBeVisible();
});
