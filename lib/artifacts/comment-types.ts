/** Where a comment attaches. Pins bind to an element (child-index path from <body>); highlights
 *  bind to the quoted text (re-found at render). No page coordinates — anchors track content
 *  across reflow. `context` is a human/agent-readable description of a pin's target element. */
export type Anchor =
  | { kind: 'pin'; path: number[]; context: string }
  | { kind: 'highlight'; quote: string };

export interface CommentRecord {
  id: string;
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;   // null when authored via a PAT (no email available)
  body: string;
  anchor: Anchor;
  resolved: boolean;
  createdAt: Date;
}

export interface NewComment {
  artifactSlug: string;
  authorId: string;
  authorEmail: string | null;
  body: string;
  anchor: Anchor;
}

/** Serialize an anchor for a text column. */
export function serializeAnchor(a: Anchor): string {
  return JSON.stringify(a);
}

/** Parse a stored anchor; tolerant — legacy/malformed rows become an unresolvable pin sentinel
 *  (path [-1]) that the runtime skips, never throwing. */
export function parseAnchor(raw: string | null | undefined): Anchor {
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && v.kind === 'highlight' && typeof v.quote === 'string') {
        return { kind: 'highlight', quote: v.quote };
      }
      if (v && v.kind === 'pin' && Array.isArray(v.path)
        && v.path.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0)) {
        return { kind: 'pin', path: v.path as number[], context: String(v.context ?? '') };
      }
    } catch { /* fall through */ }
  }
  return { kind: 'pin', path: [-1], context: '' };
}

/** Validate/normalize an untrusted anchor (from an HTTP body) into a real Anchor, or null. */
export function coerceAnchor(raw: unknown): Anchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (v.kind === 'pin') {
    if (!Array.isArray(v.path) || v.path.length > 60) return null;
    const path: number[] = [];
    for (const n of v.path) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
      path.push(n);
    }
    return { kind: 'pin', path, context: String(v.context ?? '').slice(0, 160) };
  }
  if (v.kind === 'highlight') {
    const quote = String(v.quote ?? '').slice(0, 280);
    if (!quote.trim()) return null;
    return { kind: 'highlight', quote };
  }
  return null;
}
