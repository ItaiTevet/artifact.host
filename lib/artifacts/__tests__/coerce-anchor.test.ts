import { describe, it, expect } from 'vitest';
import { coerceAnchor, parseAnchor, serializeAnchor } from '@/lib/artifacts/comment-types';

describe('coerceAnchor', () => {
  it('accepts a pin with a path + context', () => {
    expect(coerceAnchor({ kind: 'pin', path: [2, 0, 3], context: 'Hello' }))
      .toEqual({ kind: 'pin', path: [2, 0, 3], context: 'Hello' });
  });
  it('accepts an empty path (body) and caps context', () => {
    const a = coerceAnchor({ kind: 'pin', path: [], context: 'x'.repeat(500) });
    expect(a?.kind).toBe('pin');
    expect(a && a.kind === 'pin' && a.path).toEqual([]);
    expect(a && a.kind === 'pin' && a.context.length).toBe(160);
  });
  it('rejects a pin with a non-array / negative / non-integer path', () => {
    expect(coerceAnchor({ kind: 'pin', path: 'nope', context: '' })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', path: [-1], context: '' })).toBeNull();
    expect(coerceAnchor({ kind: 'pin', path: [1.5], context: '' })).toBeNull();
  });
  it('accepts a highlight with a quote (capped) and rejects an empty one', () => {
    expect(coerceAnchor({ kind: 'highlight', quote: 'the text' }))
      .toEqual({ kind: 'highlight', quote: 'the text' });
    expect(coerceAnchor({ kind: 'highlight', quote: '   ' })).toBeNull();
    const big = coerceAnchor({ kind: 'highlight', quote: 'q'.repeat(500) });
    expect(big && big.kind === 'highlight' && big.quote.length).toBe(280);
  });
  it('rejects unknown / non-object input', () => {
    expect(coerceAnchor(null)).toBeNull();
    expect(coerceAnchor({ kind: 'blob' })).toBeNull();
  });
});

describe('parseAnchor', () => {
  it('round-trips a pin', () => {
    expect(parseAnchor(serializeAnchor({ kind: 'pin', path: [1, 2], context: 'hi' })))
      .toEqual({ kind: 'pin', path: [1, 2], context: 'hi' });
  });
  it('round-trips a highlight', () => {
    expect(parseAnchor(serializeAnchor({ kind: 'highlight', quote: 'q' })))
      .toEqual({ kind: 'highlight', quote: 'q' });
  });
  it('maps legacy x,y-only pins to an unresolvable sentinel (no throw)', () => {
    expect(parseAnchor('{"kind":"pin","x":0.5,"y":0.7}')).toEqual({ kind: 'pin', path: [-1], context: '' });
  });
  it('maps malformed/empty input to the sentinel', () => {
    expect(parseAnchor('not json')).toEqual({ kind: 'pin', path: [-1], context: '' });
    expect(parseAnchor(null)).toEqual({ kind: 'pin', path: [-1], context: '' });
  });
  it('maps an over-length path (>60) to the sentinel', () => {
    const long = JSON.stringify({ kind: 'pin', path: Array.from({ length: 61 }, (_, i) => i), context: 'x' });
    expect(parseAnchor(long)).toEqual({ kind: 'pin', path: [-1], context: '' });
  });
});
