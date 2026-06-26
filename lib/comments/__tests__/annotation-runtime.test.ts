import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    expect(buildAnnotationScript('abc-123')).toContain('"abc-123"');
  });
  it('is a self-invoking IIFE referencing the full message protocol', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    for (const t of ['render-comments', 'create-comment', 'resolve-comment', 'delete-comment', 'set-mode', 'auth-state', 'request-signin', 'card']) {
      expect(s).toContain(t);
    }
  });
  it('uses a shadow root and tags markers with data-ah-pin', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('attachShadow');
    expect(s).toContain('data-ah-pin');
  });
  it('captures highlights via selection (not mouseup) with a Comment button', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('selectionchange');
    expect(s).toContain('💬 Comment');
    expect(s).not.toContain("addEventListener('mouseup'");
  });
  it('supports a mobile bottom sheet that tracks the keyboard, with a touch hit area', () => {
    const s = buildAnnotationScript('n');
    expect(s).toContain('sheet');
    expect(s).toContain('visualViewport');
    expect(s).toContain('inset:-13px');
  });
  it('cannot break out of the host <script>', () => {
    expect(buildAnnotationScript('n').toLowerCase()).not.toContain('</script>');
  });
});
