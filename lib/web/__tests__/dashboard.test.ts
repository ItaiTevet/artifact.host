import { describe, it, expect } from 'vitest';
import { validateEditInput, editErrorMessage, MAX_CONTENT_BYTES } from '@/lib/web/dashboard';

describe('validateEditInput', () => {
  it('rejects empty content', () => {
    expect(validateEditInput({ content: '   ', visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'The artifact can’t be empty.' });
  });
  it('rejects password visibility with no password', () => {
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'password', password: '' }))
      .toEqual({ ok: false, error: 'Enter a password, or switch to public.' });
  });
  it('rejects content over the size cap', () => {
    const big = 'a'.repeat(MAX_CONTENT_BYTES + 1);
    expect(validateEditInput({ content: big, visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'That’s over the 5 MB limit.' });
  });
  it('accepts valid content', () => {
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'public', password: '' })).toEqual({ ok: true });
    expect(validateEditInput({ content: '<h1>x</h1>', visibility: 'password', password: 'pw' })).toEqual({ ok: true });
  });
});

describe('editErrorMessage', () => {
  it('maps known codes and falls back', () => {
    expect(editErrorMessage('too_large')).toMatch(/5 MB/);
    expect(editErrorMessage('forbidden')).toMatch(/isn’t yours/i);
    expect(editErrorMessage('not_found')).toMatch(/gone|expired/i);
    expect(editErrorMessage('unauthorized')).toMatch(/sign in/i);
    expect(editErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});
