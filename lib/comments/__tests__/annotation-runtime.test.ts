import { describe, it, expect } from 'vitest';
import { buildAnnotationScript } from '@/lib/comments/annotation-runtime';

describe('buildAnnotationScript', () => {
  it('embeds the nonce as a JSON string literal', () => {
    const s = buildAnnotationScript('abc-123');
    expect(s).toContain('"abc-123"');
  });
  it('is a self-invoking IIFE and references the message protocol', () => {
    const s = buildAnnotationScript('n');
    expect(s.trim().startsWith('(function')).toBe(true);
    expect(s).toContain('render-pins');
    expect(s).toContain('anchor-proposed');
    expect(s).toContain('pin-activated');
  });
  it('does not contain a closing script tag (cannot break out of the host <script>)', () => {
    expect(buildAnnotationScript('n').toLowerCase()).not.toContain('</script>');
  });
});
