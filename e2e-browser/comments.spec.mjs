import { test, expect } from '@playwright/test';

test('comments: full-bleed artifact, pin + hover tooltip, post + resolve', async ({ page }) => {
  const email = `e2e-cmt-${Date.now()}@browser.test`;
  const PASSWORD = 'browser-e2e-pass-123';

  // Sign up via the dashboard gate.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy with comments enabled.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>commentable artifact</h1>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href');
  expect(url).toMatch(/\/a\/\w+/);

  // Open it. No sidebar — the artifact iframe + the floating pill are present.
  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('commentable artifact')).toBeVisible();
  // The pill button toggles comment mode and shows the open-comment count.
  // On the artifact page (/a/...) the only comment-related button is the pill, so
  // /comment/i is safe here (the "allow comments" button only appears on the deploy form).
  const pill = page.getByRole('button', { name: /💬/ });
  await expect(pill).toBeVisible();

  // Enter comment mode, click the page → in-iframe composer appears. Retry: set-mode is async.
  await expect(async () => {
    await pill.click();
    await frame.locator('h1').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // Compose + post (composer is inside the iframe shadow root; Playwright pierces it).
  await frame.getByPlaceholder(/add a comment/i).fill('looks great');
  await frame.getByRole('button', { name: /^post$/i }).click();

  // A pin marker appears in the iframe.
  const pin = frame.locator('[data-ah-pin]');
  await expect(pin.first()).toBeVisible();

  // Hover the pin → the tooltip shows the body.
  await pin.first().hover();
  await expect(frame.getByText('looks great')).toBeVisible();

  // Persists after reload.
  await page.reload();
  await expect(frame.locator('[data-ah-pin]').first()).toBeVisible();

  // Resolve hides the pin in-page. Click the pin to pin the tooltip open, then Resolve.
  await frame.locator('[data-ah-pin]').first().click();
  await frame.getByRole('button', { name: /^resolve$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(0);
});

test('comments: pin survives a width change, and author can edit', async ({ page }) => {
  const email = `e2e-xw-${Date.now()}@browser.test`;
  await page.setViewportSize({ width: 1024, height: 800 });

  // Sign up.
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill('browser-e2e-pass-123');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  // Deploy a comment-enabled artifact with a clear element to anchor to.
  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1 id="t">anchor target</h1><p>filler one</p><p>filler two</p>');
  await page.getByRole('button', { name: /allow comments/i }).click();
  await page.getByRole('button', { name: /deploy artifact/i }).click();
  const url = await page.getByRole('link', { name: /view artifact/i }).getAttribute('href');

  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('anchor target')).toBeVisible();

  // Create a pin on the H1 (desktop width). Retry: set-mode is async.
  await expect(async () => {
    await page.getByRole('button', { name: /💬/ }).click();
    await frame.locator('#t').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await frame.getByPlaceholder(/add a comment/i).fill('on the heading');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);

  // The marker should sit near the H1's top (element-anchored, not page-fraction).
  async function topsClose() {
    const h1 = await frame.locator('#t').boundingBox();
    const pin = await frame.locator('[data-ah-pin]').boundingBox();
    return Math.abs(pin.y - h1.y) < 60;
  }
  expect(await topsClose()).toBe(true);

  // Shrink to a mobile width and reload — the pin must still resolve onto the H1 (the bug fix).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);
  expect(await topsClose()).toBe(true);

  // Author edits the comment (desktop width for the popover path).
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.reload();
  await frame.locator('[data-ah-pin]').click();
  await frame.getByRole('button', { name: /^edit$/i }).click();
  const ta = frame.getByRole('textbox');
  await ta.fill('edited body');
  await frame.getByRole('button', { name: /^save$/i }).click();
  await frame.locator('[data-ah-pin]').click();
  await expect(frame.getByText('edited body')).toBeVisible();
});
