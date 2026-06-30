import { describe, it, expect } from 'vitest';
import { withArtifactCsp, ARTIFACT_CSP, ARTIFACT_SANDBOX } from '@/lib/artifacts/csp';

describe('ARTIFACT_CSP', () => {
  it('blocks the exfiltration channels', () => {
    expect(ARTIFACT_CSP).toContain("connect-src 'none'");
    expect(ARTIFACT_CSP).toContain("form-action 'none'");
    expect(ARTIFACT_CSP).toContain("base-uri 'none'");
  });
  it('leaves resource loading open (no allowlist to maintain)', () => {
    expect(ARTIFACT_CSP).toContain('default-src *');
    expect(ARTIFACT_CSP).toContain("'unsafe-inline'");
    expect(ARTIFACT_CSP).toContain("'unsafe-eval'");
  });
});

describe('ARTIFACT_SANDBOX', () => {
  it('drops allow-popups and allow-same-origin, keeps scripts + forms', () => {
    expect(ARTIFACT_SANDBOX).toContain('allow-scripts');
    expect(ARTIFACT_SANDBOX).toContain('allow-forms');
    expect(ARTIFACT_SANDBOX).not.toContain('allow-popups');
    expect(ARTIFACT_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('withArtifactCsp', () => {
  const meta = /<meta http-equiv="Content-Security-Policy"/i;

  it('inserts the CSP as the first child of an existing <head>', () => {
    const out = withArtifactCsp('<!doctype html><html><head><title>x</title></head><body>hi</body></html>');
    expect(out).toMatch(meta);
    // CSP meta must precede any other head content so it governs subsequent fetches.
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title>'));
    // Doctype stays at the very front (no quirks mode).
    expect(out.startsWith('<!doctype html>')).toBe(true);
  });

  it('handles <head> with attributes', () => {
    const out = withArtifactCsp('<html><head data-x="1"><meta charset="utf-8"></head></html>');
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('charset'));
  });

  it('creates a <head> when the document has only <html>', () => {
    const out = withArtifactCsp('<html><body>hi</body></html>');
    expect(out).toMatch(meta);
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<body>'));
  });

  it('prepends on a bare fragment', () => {
    const out = withArtifactCsp('<div>hi</div>');
    expect(out).toMatch(meta);
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<div>'));
  });

  it('is case-insensitive on the head tag', () => {
    const out = withArtifactCsp('<HTML><HEAD></HEAD></HTML>');
    expect(out).toMatch(meta);
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('</HEAD>'));
  });
});
