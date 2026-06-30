'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getAccessToken, getAccountEmail } from '@/lib/web/auth';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';
import { withArtifactCsp, ARTIFACT_SANDBOX } from '@/lib/artifacts/csp';
import type { Anchor } from '@/lib/artifacts/comment-types';
import styles from './CommentableArtifact.module.css';

interface Comment {
  id: string; body: string; anchor: Anchor; author_name: string; resolved: boolean;
  created_at: string; can_resolve?: boolean; can_delete?: boolean; can_edit?: boolean;
}

export function CommentableArtifact({ slug, content }: { slug: string; content: string }) {
  // useId() is stable across SSR + hydration, so the iframe's baked nonce matches this closure's.
  const rawId = useId();
  const nonce = rawId.replace(/[^a-z0-9]/gi, '') || 'n';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [mode, setMode] = useState<'idle' | 'commenting'>('idle');
  const [cardOpen, setCardOpen] = useState(false);
  const [mobile, setMobile] = useState(false);

  // The annotation runtime is an inline <script> (allowed by the artifact CSP's open script-src)
  // and talks to this parent via postMessage, which CSP's connect-src does not govern.
  const srcDoc = useMemo(
    () => withArtifactCsp(`${content}\n<script>${buildAnnotationScript(nonce)}</script>`),
    [content, nonce],
  );

  const toIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ ...msg, nonce }, '*');
  }, [nonce]);

  const pushComments = useCallback((list: Comment[]) => {
    toIframe({
      type: 'render-comments',
      comments: list.filter((c) => !c.resolved).map((c) => ({
        id: c.id, anchor: c.anchor, body: c.body, author_name: c.author_name,
        can_resolve: !!c.can_resolve, can_delete: !!c.can_delete, can_edit: !!c.can_edit,
      })),
    });
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

  const create = useCallback(async (body: string, anchor: Anchor) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST', headers: await authHeaders(true), body: JSON.stringify({ body, anchor }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  const resolve = useCallback(async (id: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ resolved: true }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'DELETE', headers: await authHeaders(),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  const edit = useCallback(async (id: string, body: string) => {
    const res = await fetch(`/api/artifacts/${encodeURIComponent(slug)}/comments/${id}`, {
      method: 'PATCH', headers: await authHeaders(true), body: JSON.stringify({ body }),
    });
    if (res.ok) await load();
  }, [slug, authHeaders, load]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px), (pointer: coarse)');
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => { getAccountEmail().then((e) => setCanPost(!!e)).catch(() => setCanPost(false)); }, []);
  useEffect(() => { pushComments(comments); }, [comments, pushComments]);
  useEffect(() => { toIframe({ type: 'auth-state', canPost }); }, [canPost, toIframe]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const d = ev.data as { type?: string; nonce?: string; body?: string; anchor?: Anchor; id?: string; open?: boolean } | null;
      if (!d || d.nonce !== nonce) return;
      // `ready` is intentionally not source-gated (nonce-filtered only) so tests can drive it via window.postMessage; a forged `ready` is harmless (it only re-sends state INTO the iframe).
      if (d.type === 'ready') { toIframe({ type: 'auth-state', canPost }); pushComments(comments); }
      else if (d.type === 'create-comment' && typeof d.body === 'string' && d.anchor) void create(d.body, d.anchor);
      else if (d.type === 'resolve-comment' && d.id) void resolve(d.id);
      else if (d.type === 'delete-comment' && d.id) void remove(d.id);
      else if (d.type === 'edit-comment' && d.id && typeof d.body === 'string') void edit(d.id, d.body);
      else if (d.type === 'request-signin') window.location.href = '/dashboard';
      else if (d.type === 'card' && typeof d.open === 'boolean') setCardOpen(d.open);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [nonce, canPost, comments, create, resolve, remove, edit, pushComments, toIframe]);

  function toggleMode() {
    const next = mode === 'commenting' ? 'idle' : 'commenting';
    setMode(next);
    toIframe({ type: 'set-mode', mode: next });
  }

  const openCount = comments.filter((c) => !c.resolved).length;
  const pillLabel = mode === 'commenting' ? 'Click the page to comment' : (openCount > 0 ? String(openCount) : 'Comment');

  return (
    <div className={styles.root} data-testid="ca-root" data-nonce={nonce}>
      <iframe
        ref={iframeRef}
        title="artifact"
        srcDoc={srcDoc}
        sandbox={ARTIFACT_SANDBOX}
        className={styles.frame}
      />
      {!(mobile && cardOpen) && (
        <button
          type="button"
          className={`${styles.pill} ${mode === 'commenting' ? styles.pillOn : ''}`}
          aria-pressed={mode === 'commenting'}
          onClick={toggleMode}
        >
          💬 {pillLabel}
        </button>
      )}
    </div>
  );
}
