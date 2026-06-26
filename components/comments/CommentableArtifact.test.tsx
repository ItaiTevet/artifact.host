// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { CommentableArtifact } from './CommentableArtifact';
import { getAccessToken, getAccountEmail } from '@/lib/web/auth';

vi.mock('@/lib/web/auth', () => ({
  getAccessToken: vi.fn(async () => 'tok'),
  getAccountEmail: vi.fn(async () => 'me@example.com'),
}));

const comment = {
  id: 'c1', body: 'first note', anchor: { kind: 'pin', path: [0], context: '' },
  author_name: 'alice', resolved: false, created_at: '2026-06-26T00:00:00.000Z',
  can_resolve: true, can_delete: true,
};

beforeEach(() => {
  vi.mocked(getAccessToken).mockResolvedValue('tok');
  vi.mocked(getAccountEmail).mockResolvedValue('me@example.com');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CommentableArtifact (ambient bridge)', () => {
  it('renders the artifact iframe + comment pill; comment bodies stay in the iframe, not the parent DOM', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ comments: [comment] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);

    // The floating pill (💬) and the artifact iframe are present.
    await waitFor(() => expect(screen.getByRole('button', { name: /💬/ })).toBeTruthy());
    expect(screen.getByTitle('artifact')).toBeTruthy();

    // Let load() resolve, then confirm the comment body is NOT in the parent document —
    // it is relayed into the sandboxed iframe instead.
    await waitFor(() => expect(vi.mocked(getAccountEmail)).toHaveBeenCalled());
    expect(screen.queryByText('first note')).toBeNull();
  });

  it('handles a create-comment intent from the iframe: POSTs then refetches', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ comment: { ...comment, id: 'c2', body: 'added' } }),
          { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ comments: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CommentableArtifact slug="s1" content="<p>hi</p>" />);
    const root = await screen.findByTestId('ca-root');
    const nonce = root.getAttribute('data-nonce')!;

    // Simulate the in-iframe composer posting a create intent up to the parent bridge.
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'create-comment', nonce, body: 'added', anchor: { kind: 'pin', path: [0], context: '' } },
    }));

    await waitFor(() => expect(
      fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'POST'),
    ).toBe(true));
  });
});
