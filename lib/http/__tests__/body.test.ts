import { describe, it, expect } from 'vitest';
import { readLimitedText, readLimitedJson } from '@/lib/http/body';
import { ServiceError } from '@/lib/artifacts/errors';

describe('readLimitedText', () => {
  it('returns the body when under the limit', async () => {
    const req = new Request('http://x', { method: 'POST', body: 'hello' });
    expect(await readLimitedText(req, 1024)).toBe('hello');
  });

  it('rejects when the declared content-length exceeds the limit', async () => {
    const req = new Request('http://x', {
      method: 'POST', body: 'x'.repeat(100), headers: { 'content-length': '100' },
    });
    await expect(readLimitedText(req, 10)).rejects.toMatchObject({ code: 'too_large' });
  });

  it('rejects mid-stream when the body exceeds the limit (no content-length trust)', async () => {
    // Chunked stream with no content-length header — must still be capped while reading.
    const stream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(50))); c.close(); },
    });
    const req = new Request('http://x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readLimitedText(req, 10)).rejects.toBeInstanceOf(ServiceError);
  });

  it('readLimitedJson parses a within-limit JSON body', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(await readLimitedJson<{ a: number }>(req, 1024)).toEqual({ a: 1 });
  });
});
