import { describe, it, expect } from 'vitest';
import { safeReturnPath } from '@/lib/http/safe-redirect';

const ORIGIN = 'https://artifact.host';

describe('safeReturnPath', () => {
  it('allows same-origin relative paths', () => {
    expect(safeReturnPath('/dashboard', ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('/cli/auth?port=5&state=x', ORIGIN)).toBe('/cli/auth?port=5&state=x');
  });

  it('defaults to /dashboard for missing/empty', () => {
    expect(safeReturnPath(null, ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath(undefined, ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('', ORIGIN)).toBe('/dashboard');
  });

  it('blocks open-redirect vectors (incl. the backslash bypass)', () => {
    expect(safeReturnPath('//evil.com', ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('/\\evil.com', ORIGIN)).toBe('/dashboard'); // normalizes to //evil.com
    expect(safeReturnPath('https://evil.com', ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('https://evil.com/a/b', ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('javascript:alert(1)', ORIGIN)).toBe('/dashboard');
    expect(safeReturnPath('http://artifact.host/x', ORIGIN)).toBe('/dashboard'); // scheme mismatch
  });
});
