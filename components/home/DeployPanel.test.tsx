// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DeployPanel } from './DeployPanel';
import { getAccountEmail, getAccessToken } from '@/lib/web/auth';

// Control the signed-in state per test. Defaults to signed-out so the existing
// anonymous-deploy assertions hold.
vi.mock('@/lib/web/auth', () => ({
  getAccountEmail: vi.fn(async () => null),
  getAccessToken: vi.fn(async () => null),
}));

beforeEach(() => {
  vi.mocked(getAccountEmail).mockResolvedValue(null);
  vi.mocked(getAccessToken).mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function typeHtml(html: string) {
  const ta = screen.getByPlaceholderText(/Paste your HTML/i);
  fireEvent.change(ta, { target: { value: html } });
}

describe('DeployPanel', () => {
  it('posts the right payload and swaps to the result card on success', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(
      JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok_abc', expires_at: '2099-01-01T00:00:00Z' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    render(<DeployPanel />);
    typeHtml('<h1>hi</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));

    await waitFor(() => expect(screen.getByText(/artifact\.host\/a\/x7k2/)).toBeTruthy());
    expect(screen.getByText(/tok_abc/)).toBeTruthy();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ content: '<h1>hi</h1>', ttl: '7d', visibility: 'public' });
  });

  it('shows a mapped inline error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'too_large', message: 'x' }), { status: 413, headers: { 'content-type': 'application/json' } },
    )));
    render(<DeployPanel />);
    typeHtml('<h1>big</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    await waitFor(() => expect(screen.getByText(/over the 5 MB limit/i)).toBeTruthy());
  });

  it('sends the session token (owned deploy) and offers restricted when signed in', async () => {
    // Regression guard: a signed-in home-page deploy must be owned, or it never reaches the
    // user's dashboard (the exact bug this covers).
    vi.mocked(getAccountEmail).mockResolvedValue('me@example.com');
    vi.mocked(getAccessToken).mockResolvedValue('sess-token-123');
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok', expires_at: '2099-01-01T00:00:00Z' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    render(<DeployPanel />);
    // restricted option only renders once we've confirmed the signed-in state
    await waitFor(() => expect(screen.getByRole('button', { name: /^restricted$/i })).toBeTruthy());
    expect(screen.getByText(/Saved to your dashboard/i)).toBeTruthy();

    typeHtml('<h1>hi</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0];
    const auth = (init.headers as Record<string, string>).authorization;
    expect(auth).toBe('Bearer sess-token-123');
  });

  it('requireAuth + signed out: shows a sign-in CTA and does not deploy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel requireAuth />);

    // Once the signed-out state is confirmed, the deploy button is replaced by a sign-in link.
    await waitFor(() => expect(screen.getByRole('link', { name: /Sign in to deploy/i })).toBeTruthy());
    expect(screen.getByRole('link', { name: /Sign in to deploy/i }).getAttribute('href')).toBe('/dashboard');
    expect(screen.getByText(/account is required/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Deploy artifact/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requireAuth + signed in: deploys normally', async () => {
    vi.mocked(getAccountEmail).mockResolvedValue('me@example.com');
    vi.mocked(getAccessToken).mockResolvedValue('sess-token');
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok', expires_at: '2099-01-01T00:00:00Z' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel requireAuth />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Deploy artifact/i })).toBeTruthy());
    typeHtml('<h1>hi</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('blocks submit with no HTML', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Paste some HTML first/i)).toBeTruthy();
  });

  it('loads a browsed .html file into the editor', async () => {
    render(<DeployPanel />);
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['<h1>hi</h1>'], 'page.html', { type: 'text/html' });
    fireEvent.change(input, { target: { files: [file] } });
    const ta = screen.getByPlaceholderText(/Paste your HTML/i) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toContain('<h1>hi</h1>'));
  });

  it('rejects a non-HTML file with an error and does not load it', async () => {
    render(<DeployPanel />);
    const input = screen.getByTestId('upload-input') as HTMLInputElement;
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/html file/i)).toBeTruthy());
    const ta = screen.getByPlaceholderText(/Paste your HTML/i) as HTMLTextAreaElement;
    expect(ta.value).toBe('');
  });

  it('signed-in: enabling comments + restricted roles sends comments_enabled and structured allowlist', async () => {
    vi.mocked(getAccountEmail).mockResolvedValue('me@example.com');
    vi.mocked(getAccessToken).mockResolvedValue('sess-token');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/deploy') {
        return new Response(JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok', expires_at: '2099-01-01T00:00:00Z' }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DeployPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^restricted$/i })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Paste your HTML/i), { target: { value: '<h1>hi</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: /allow comments/i }));
    fireEvent.click(screen.getByRole('button', { name: /^restricted$/i }));
    fireEvent.change(screen.getByPlaceholderText(/add email/i), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    fireEvent.click(screen.getByRole('button', { name: /^comment$/i })); // alice → comment role (exact; not the "allow comments" toggle)
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));

    await waitFor(() => expect(calls.some((c) => c.url.includes('/api/artifacts/'))).toBe(true));
    const patches = calls.filter((c) => c.url.includes('/api/artifacts/')).map((c) => JSON.parse(c.init.body as string));
    expect(patches).toContainEqual({ comments_enabled: true });
    expect(patches).toContainEqual({ visibility: 'restricted', allowlist: [{ value: 'alice@example.com', type: 'email', role: 'comment' }] });
  });
});
