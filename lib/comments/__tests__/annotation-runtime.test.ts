import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    expect(buildAnnotationScript('abc-123')).toContain('"abc-123"');
  });
  it('emits the full message protocol incl. edit-comment', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    for (const t of ['render-comments', 'create-comment', 'resolve-comment', 'delete-comment', 'edit-comment', 'set-mode', 'auth-state', 'request-signin', 'card']) {
      expect(s).toContain(t);
    }
  });
  it('anchors pins to an element path/context (no x,y) and re-finds highlight quotes', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain("kind:'pin',path:");
    expect(s).toContain('context:');
    expect(s).toContain('createTreeWalker');
    expect(s).not.toContain("kind:'pin',x:");
  });
  it('shows an element outline in comment mode and a Comment button for highlights', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('elementFromPoint');
    expect(s).toContain('outline');
    expect(s).toContain('💬 Comment');
  });
  it('uses a shadow root, tags markers, and cannot break out of <script>', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('attachShadow');
    expect(s).toContain('data-ah-pin');
    expect(s.toLowerCase()).not.toContain('</script>');
  });
});
