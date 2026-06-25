/** Where a comment attaches. x,y are normalized 0..1 of the document's scroll size. */
export type Anchor =
  | { kind: 'pin'; x: number; y: number }
  | { kind: 'highlight'; x: number; y: number; quote: string };

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

/** Parse a stored anchor; tolerant — falls back to a top-left pin if the blob is malformed. */
export function parseAnchor(raw: string | null | undefined): Anchor {
  if (raw) {
    try {
      const v = JSON.parse(raw);
      if (v && (v.kind === 'pin' || v.kind === 'highlight') && typeof v.x === 'number' && typeof v.y === 'number') {
        return v.kind === 'highlight'
          ? { kind: 'highlight', x: v.x, y: v.y, quote: String(v.quote ?? '') }
          : { kind: 'pin', x: v.x, y: v.y };
      }
    } catch { /* fall through */ }
  }
  return { kind: 'pin', x: 0, y: 0 };
}
