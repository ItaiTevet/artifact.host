import { describe, it, expect } from 'vitest';
import { validateUploadFile } from '@/lib/web/upload';
import { MAX_BYTES } from '@/lib/artifacts/validate';

describe('validateUploadFile', () => {
  it('accepts .html by extension', () => {
    expect(validateUploadFile({ name: 'index.html', size: 100, type: '' })).toEqual({ ok: true });
  });
  it('accepts .htm by extension', () => {
    expect(validateUploadFile({ name: 'page.HTM', size: 100, type: '' })).toEqual({ ok: true });
  });
  it('accepts text/html by MIME even with an odd name', () => {
    expect(validateUploadFile({ name: 'download', size: 100, type: 'text/html' })).toEqual({ ok: true });
  });
  it('rejects a non-HTML extension/MIME', () => {
    const r = validateUploadFile({ name: 'photo.png', size: 100, type: 'image/png' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/html file/i);
  });
  it('accepts a file exactly at the cap', () => {
    expect(validateUploadFile({ name: 'a.html', size: MAX_BYTES, type: '' })).toEqual({ ok: true });
  });
  it('rejects a file over the cap', () => {
    const r = validateUploadFile({ name: 'a.html', size: MAX_BYTES + 1, type: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/4\.5\s?MB|too large/i);
  });
});
