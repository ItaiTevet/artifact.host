import { describe, it, expect } from 'vitest';
import { extractTitle } from '@/lib/artifacts/html-meta';

describe('extractTitle', () => {
  it('pulls the <title> text', () => {
    expect(extractTitle('<html><head><title>My Page</title></head></html>')).toBe('My Page');
  });
  it('is case-insensitive and trims whitespace', () => {
    expect(extractTitle('<TITLE>  Spaced  </TITLE>')).toBe('Spaced');
  });
  it('returns null when there is no title', () => {
    expect(extractTitle('<html><body>hi</body></html>')).toBeNull();
  });
  it('caps very long titles at 200 chars', () => {
    const long = 'a'.repeat(500);
    expect(extractTitle(`<title>${long}</title>`)).toHaveLength(200);
  });
});
