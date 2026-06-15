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

  it('blocks submit with no HTML', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Paste some HTML first/i)).toBeTruthy();
  });
});
