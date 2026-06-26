import { describe, it, expect } from 'vitest';
import { extractTitle, extractDescription } from '@/lib/artifacts/html-meta';

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

describe('extractDescription', () => {
  it('pulls the meta description content', () => {
    expect(extractDescription('<meta name="description" content="A live chart">')).toBe('A live chart');
  });
  it('handles content appearing before name', () => {
    expect(extractDescription('<meta content="Reversed order" name="description">')).toBe('Reversed order');
  });
  it('is case-insensitive and trims', () => {
    expect(extractDescription('<META NAME="description" CONTENT="  Spaced  ">')).toBe('Spaced');
  });
  it('returns null when there is no description meta', () => {
    expect(extractDescription('<meta name="keywords" content="x">')).toBeNull();
  });
  it('caps very long descriptions at 300 chars', () => {
    const long = 'a'.repeat(600);
    expect(extractDescription(`<meta name="description" content="${long}">`)).toHaveLength(300);
  });
});
