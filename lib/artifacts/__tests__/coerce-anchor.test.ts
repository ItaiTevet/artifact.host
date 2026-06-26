import { describe, it, expect } from 'vitest';
import { coerceAnchor } from '@/lib/artifacts/comment-types';

describe('coerceAnchor', () => {
  it('accepts a pin', () => {
    expect(coerceAnchor({ kind: 'pin', x: 0.5, y: 0.25 })).toEqual({ kind: 'pin', x: 0.5, y: 0.25 });
  });
  it('accepts a highlight and coerces quote to string', () => {
    expect(coerceAnchor({ kind: 'highlight', x: 0.1, y: 0.2, quote: 'hi' })).toEqual({ kind: 'highlight', x: 0.1, y: 0.2, quote: 'hi' });
    expect(coerceAnchor({ kind: 'highlight', x: 0, y: 0 })).toEqual({ kind: 'highlight', x: 0, y: 0, quote: '' });
  });
  it('drops extra fields (keeps only the known shape)', () => {
    expect(coerceAnchor({ kind: 'pin', x: 0.5, y: 0.5, evil: 'x' })).toEqual({ kind: 'pin', x: 0.5, y: 0.5 });
  });
  it('rejects malformed anchors → null', () => {
    expect(coerceAnchor(null)).toBeNull();
    expect(coerceAnchor('pin')).toBeNull();
    expect(coerceAnchor({ kind: 'circle', x: 0, y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', x: 'a', y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', x: Infinity, y: 0 })).toBeNull();
    expect(coerceAnchor({ kind: 'pin' })).toBeNull();
  });
});
