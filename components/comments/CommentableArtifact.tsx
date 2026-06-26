'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/web/auth';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';
import type { Anchor } from '@/lib/artifacts/comment-types';
import styles from './CommentableArtifact.module.css';

interface Comment { id: string; body: string; anchor: Anchor; author_name: string; resolved: boolean; created_at: string; }

export function CommentableArtifact({ slug, content }: { slug: string; content: string }) {
  const [nonce] = useState(() => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'n-' + Date.now()));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [pending, setPending] = useState<Anchor | null>(null);
  const [draft, setDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const srcDoc = useMemo(() => `${content}\n<script>${buildAnnotationScript(nonce)}</script>`, [content, nonce]);

  const toIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ ...msg, nonce }, '*');
  }, [nonce]);

  const pushPins = useCallback((list: Comment[]) => {
    toIframe({ type: 'render-pins', pins: list.map((c) => ({ id: c.id, anchor: c.anchor, resolved: c.resolved })) });
  }, [toIframe]);

  const authHeaders = useCallback(async (json = false): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    const h: Record<string, string> = {};
    if (json) h['content-type'] = 'application/json';
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, { headers: await authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch { /* keep prior */ }
  }, [slug, authHeaders]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { pushPins(comments); }, [comments, pushPins]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const fromIframe = ev.source === iframeRef.current?.contentWindow;
      const d = ev.data as { type?: string; nonce?: string; anchor?: Anchor; id?: string } | null;
      if (!d || d.nonce !== nonce) return;
      if (d.type === 'ready' && fromIframe) pushPins(comments);
      else if (d.type === 'anchor-proposed' && d.anchor) setPending(d.anchor);
      else if (d.type === 'pin-activated' && d.id) setActiveId(d.id);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce, comments, pushPins]);

  function startCommenting() { toIframe({ type: 'set-mode', mode: 'commenting' }); }

  async function post() {
    if (!pending || !draft.trim()) return;
    const token = await getAccessToken();
    if (!token) { setError('Sign in to comment.'); return; }
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST', headers: await authHeaders(true), body: JSON.stringify({ body: draft, anchor: pending }),
    });
    if (!res.ok) { setError('Could not post that comment.'); return; }
    setDraft(''); setPending(null); setError(null);
    await load();
  }

  async function toggleResolved(c: Comment) {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${c.id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ resolved: !c.resolved }),
    });
    if (res.ok) await load();
  }

  async function remove(c: Comment) {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${c.id}`, {
      method: 'DELETE', headers: await authHeaders(),
    });
    if (res.ok) await load();
  }

  return (
    <div className={styles.root} data-testid="ca-root" data-nonce={nonce}>
      <iframe
        ref={iframeRef}
        title="artifact"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-forms"
        className={styles.frame}
      />
      <aside className={styles.sidebar}>
        <div className={styles.head}>
          <span className={styles.title}>Comments</span>
          <button type="button" className={styles.add} onClick={startCommenting}>+ Add comment</button>
        </div>

        {pending && (
          <div className={styles.composer}>
            <textarea
              className={styles.input}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className={styles.composerRow}>
              <button type="button" className={styles.ghost} onClick={() => { setPending(null); setDraft(''); }}>Cancel</button>
              <button type="button" className={styles.post} onClick={() => void post()}>Post</button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <ul className={styles.list}>
          {comments.length === 0 && <li className={styles.empty}>No comments yet. Click &ldquo;Add comment&rdquo;, then click on the page.</li>}
          {comments.map((c) => (
            <li key={c.id} className={`${styles.item} ${c.id === activeId ? styles.active : ''} ${c.resolved ? styles.resolved : ''}`}>
              <div className={styles.meta}><span className={styles.author}>{c.author_name}</span>{c.resolved && <span className={styles.badge}>resolved</span>}</div>
              {c.anchor.kind === 'highlight' && c.anchor.quote && <div className={styles.quote}>&ldquo;{c.anchor.quote}&rdquo;</div>}
              <div className={styles.body}>{c.body}</div>
              <div className={styles.actions}>
                <button type="button" onClick={() => void toggleResolved(c)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                <button type="button" onClick={() => void remove(c)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
