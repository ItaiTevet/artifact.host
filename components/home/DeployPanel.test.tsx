// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DeployPanel } from './DeployPanel';

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

  it('blocks submit with no HTML', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Paste some HTML first/i)).toBeTruthy();
  });
});
