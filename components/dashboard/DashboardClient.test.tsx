// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { getAccessToken, signIn } = vi.hoisted(() => ({ getAccessToken: vi.fn(), signIn: vi.fn() }));
vi.mock('@/lib/web/supabase-browser', () => ({ getAccessToken, signIn }));

import { DashboardClient } from './DashboardClient';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DashboardClient', () => {
  it('shows the sign-in gate when there is no session', async () => {
    getAccessToken.mockResolvedValue(null);
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Google/i })).toBeTruthy());
  });

  it('renders the list of artifacts for a signed-in user', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ artifacts: [
      { slug: 'a3f9', title: 'Q3 Revenue', visibility: 'public', created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 142 },
    ] })));
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy());
  });

  it('shows an empty state when the user has no artifacts', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ artifacts: [] })));
    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText(/nothing here yet/i)).toBeTruthy());
  });

  it('removes a row after a successful delete', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ artifacts: [
        { slug: 'a3f9', title: 'Q3 Revenue', visibility: 'public', created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 1 },
      ] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByText('Q3 Revenue')).toBeNull());

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
  });

  it('restores the row when the delete fails (optimistic removal is resynced)', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const artifact = { slug: 'a3f9', title: 'Q3 Revenue', visibility: 'public', created_at: '2026-06-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', view_count: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ artifacts: [artifact] })) // initial load
      .mockResolvedValueOnce(jsonResponse({ error: 'internal', message: 'x' }, 500)) // failed DELETE
      .mockResolvedValueOnce(jsonResponse({ artifacts: [artifact] })); // resync load restores the row
    vi.stubGlobal('fetch', fetchMock);

    render(<DashboardClient />);
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // load → DELETE(500) → resync load
    await waitFor(() => expect(screen.getByText('Q3 Revenue')).toBeTruthy()); // row restored
  });
});
