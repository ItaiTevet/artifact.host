// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CommentableArtifact } from './CommentableArtifact';
import { getAccessToken } from '@/lib/web/auth';

vi.mock('@/lib/web/auth', () => ({ getAccessToken: vi.fn(async () => 'tok') }));

const comment = { id: 'c1', body: 'first note', anchor: { kind: 'pin', x: 0.5, y: 0.5 }, author_name: 'alice', resolved: false, created_at: '2026-06-26T00:00:00.000Z' };

beforeEach(() => { vi.mocked(getAccessToken).mockResolvedValue('tok'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CommentableArtifact sidebar', () => {
  it('lists existing comments fetched from the API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ comments: [comment] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByText('first note')).toBeTruthy());
    expect(screen.getByText(/alice/)).toBeTruthy();
  });

  it('posts a new comment (POST then refetch) once an anchor is pending', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ comment: { ...comment, id: 'c2', body: 'added' } }), { status: 201, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /add comment/i })).toBeTruthy());
    const host = screen.getByTestId('ca-root');
    const nonce = host.getAttribute('data-nonce')!;
    window.postMessage({ type: 'anchor-proposed', nonce, anchor: { kind: 'pin', x: 0.2, y: 0.2 } }, '*');
    const ta = await screen.findByPlaceholderText(/add a comment/i);
    fireEvent.change(ta, { target: { value: 'added' } });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === 'POST')).toBe(true));
  });
});
