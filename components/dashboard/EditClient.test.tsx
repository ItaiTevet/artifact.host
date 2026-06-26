// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock('@/lib/web/supabase-browser', () => ({ getAccessToken, signIn: vi.fn() }));

import { EditClient } from './EditClient';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('EditClient', () => {
  it('loads the artifact content into the editor', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
      { slug: 'a3f9', title: 'Q3', content: '<h1>old</h1>', visibility: 'public', allowlist: [], comments_enabled: false, expires_at: '2099-01-01T00:00:00Z' })));
    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect((screen.getByLabelText(/html/i) as HTMLTextAreaElement).value).toBe('<h1>old</h1>'));
  });

  it('saves edited content with a PATCH carrying the Bearer token', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', title: 'Q3', content: '<h1>old</h1>', visibility: 'public', allowlist: [], comments_enabled: false, expires_at: '2099-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', url: 'https://artifact.host/a/a3f9', expires_at: '2099-01-01T00:00:00Z' }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect(screen.getByLabelText(/html/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/html/i), { target: { value: '<h1>new</h1>' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/artifacts/a3f9');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer good-token');
    expect(JSON.parse(init.body as string)).toEqual({ content: '<h1>new</h1>' });
  });

  it('shows a not-found message when the artifact is missing', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'not_found', message: 'x' }, 404)));
    render(<EditClient slug="gone" />);
    await waitFor(() => expect(screen.getByText(/gone or has expired/i)).toBeTruthy());
  });

  it('persists a public→password change with a second visibility PATCH', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', title: 'Q3', content: '<h1>hi</h1>', visibility: 'public', allowlist: [], comments_enabled: false, expires_at: '2099-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', url: 'u', expires_at: '2099-01-01T00:00:00Z' })) // content PATCH
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // visibility PATCH
    vi.stubGlobal('fetch', fetchMock);

    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect(screen.getByLabelText(/html/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^password$/i }));
    fireEvent.change(screen.getByPlaceholderText(/password for viewers/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ visibility: 'password', password: 'pw' });
  });

  it('persists a password→public change (the previously-broken direction)', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', title: 'Q3', content: '<h1>hi</h1>', visibility: 'password', allowlist: [], comments_enabled: false, expires_at: '2099-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', url: 'u', expires_at: '2099-01-01T00:00:00Z' })) // content PATCH
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // visibility PATCH
    vi.stubGlobal('fetch', fetchMock);

    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect(screen.getByLabelText(/html/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^public$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());
    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({ visibility: 'public' });
  });

  it('loads a restricted artifact and renders principals from the ShareRoleEditor', async () => {
    getAccessToken.mockResolvedValue('good-token');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      slug: 'r1x2',
      title: 'Restricted',
      content: '<p>secret</p>',
      visibility: 'restricted',
      allowlist: [{ value: 'alice@example.com', type: 'email', role: 'view' }],
      comments_enabled: false,
      expires_at: '2099-01-01T00:00:00Z',
    })));
    render(<EditClient slug="r1x2" />);
    await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
  });

  it('sends a comments_enabled PATCH when the Allow comments toggle is turned on', async () => {
    getAccessToken.mockResolvedValue('good-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', title: 'Q3', content: '<h1>hi</h1>', visibility: 'public', allowlist: [], comments_enabled: false, expires_at: '2099-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(jsonResponse({ slug: 'a3f9', url: 'u', expires_at: '2099-01-01T00:00:00Z' })) // content PATCH
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // comments_enabled PATCH
    vi.stubGlobal('fetch', fetchMock);

    render(<EditClient slug="a3f9" />);
    await waitFor(() => expect(screen.getByLabelText(/allow comments/i)).toBeTruthy());

    const checkbox = screen.getByLabelText(/allow comments/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeTruthy());

    // 3 calls: GET load, content PATCH, comments_enabled PATCH
    expect(fetchMock.mock.calls).toHaveLength(3);
    const [commentsUrl, commentsInit] = fetchMock.mock.calls[2];
    expect(commentsUrl).toBe('/api/artifacts/a3f9');
    expect(commentsInit.method).toBe('PATCH');
    expect(JSON.parse(commentsInit.body as string)).toEqual({ comments_enabled: true });
  });
});
