import { test, expect } from '@playwright/test';

const PASSWORD = 'browser-e2e-pass-123';

test('mobile smoke: home renders and a public artifact deploys + renders full-width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /share what your ai built/i })).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>mobile smoke</h1>');
  await page.getByRole('button', { name: /deploy artifact/i }).click();

  const viewLink = page.getByRole('link', { name: /view artifact/i });
  await expect(viewLink).toBeVisible();
  const url = await viewLink.getAttribute('href');
  await page.goto(url);

  // Non-commentable artifacts use a plain <iframe> without title attribute.
  const frame = page.frameLocator('iframe');
  await expect(frame.getByText('mobile smoke')).toBeVisible();
  const box = await page.locator('iframe').boundingBox();
  expect(box.width).toBeGreaterThan(380);
});

test('mobile comments: pin sheet, composer sheet post, selection highlight, resolve', async ({ page }) => {
  const email = `e2e-m-${Date.now()}@browser.test`;

  await page.goto('/dashboard');
  await page.getByRole('button', { name: /create one/i }).click();
  await page.getByPlaceholder(/you@example\.com/i).fill(email);
  await page.getByPlaceholder(/^password$/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /your artifacts/i })).toBeVisible();

  await page.goto('/');
  await expect(page.getByText(/saved to your dashboard/i)).toBeVisible();
  await page.getByPlaceholder(/paste your html/i).fill('<h1>mobile comments</h1><p id="para">Fox.</p>');

  // On mobile, Playwright's touch hit-tester flags the react-simple-code-editor textarea
  // (position:absolute inside the .box) as an interceptor for buttons below .box, even
  // though document.elementFromPoint() correctly returns the target button. This is a
  // Playwright touch-simulation artifact: real devices dispatch touch events without the
  // same interception check. dispatchEvent bypasses the false hit-fail while still
  // exercising the React onClick handlers.
  await page.getByRole('button', { name: /allow comments/i }).dispatchEvent('click');
  await page.getByRole('button', { name: /deploy artifact/i }).dispatchEvent('click');
  const url = await page.getByRole('link', { name: /view artifact/i }).getAttribute('href');

  await page.goto(url);
  const frame = page.frameLocator('iframe[title="artifact"]');
  await expect(frame.getByText('mobile comments')).toBeVisible();
  const pill = page.getByRole('button', { name: /💬/ });
  await expect(pill).toBeVisible();

  // Enter comment mode, tap the page → composer sheet appears. Retry: set-mode is async.
  await expect(async () => {
    await pill.click();
    await frame.locator('h1').click();
    await expect(frame.getByPlaceholder(/add a comment/i)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await frame.getByPlaceholder(/add a comment/i).fill('pin via sheet');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);

  // Highlight: drive a real selection inside the iframe → the "Comment" button appears.
  await frame.locator('#para').evaluate((el) => {
    const d = el.ownerDocument, w = d.defaultView;
    const r = d.createRange(); r.selectNodeContents(el);
    const s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
    d.dispatchEvent(new w.Event('selectionchange'));
    d.dispatchEvent(new w.Event('pointerup'));
  });
  const commentBtn = frame.getByRole('button', { name: /💬 Comment/ });
  await expect(commentBtn).toBeVisible({ timeout: 5000 });
  await commentBtn.click();
  await frame.getByPlaceholder(/add a comment/i).fill('highlight via selection');
  await frame.getByRole('button', { name: /^post$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(2);

  // Tap a pin → the sheet shows the comment; resolve hides it (still in comment mode — guards
  // the onClick-vs-card-button bug).
  await frame.locator('[data-ah-pin]').first().click();
  await expect(frame.getByText('pin via sheet')).toBeVisible();
  await frame.getByRole('button', { name: /^resolve$/i }).click();
  await expect(frame.locator('[data-ah-pin]')).toHaveCount(1);
});
