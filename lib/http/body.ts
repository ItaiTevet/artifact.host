import { ServiceError } from '@/lib/artifacts/errors';

/**
 * Read a request body as text, aborting once it exceeds `limit` bytes.
 *
 * `req.json()` buffers the entire body into memory with no cap, so an attacker can exhaust
 * memory by POSTing a huge (or chunked, content-length-less) body. This streams the body and
 * stops early. Vercel already enforces a 4.5MB platform limit; this protects self-host too.
 *
 * Throws ServiceError('too_large') (mapped to HTTP 413 by errorResponse) when the cap is hit.
 */
export async function readLimitedText(req: Request, limit: number): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    throw new ServiceError('too_large', `Request body exceeds ${limit} bytes`);
  }
  if (!req.body) return '';

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ServiceError('too_large', `Request body exceeds ${limit} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Like readLimitedText, but JSON-parses the (size-capped) body. */
export async function readLimitedJson<T = unknown>(req: Request, limit: number): Promise<T> {
  return JSON.parse(await readLimitedText(req, limit)) as T;
}
