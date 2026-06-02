import { describe, it, expect } from 'vitest';
import { makeOwnerAuth } from '@/lib/http/request-auth';
import { ServiceError } from '@/lib/artifacts/errors';

// Fake verifier: treats "good-token" as user "owner-1", everything else as invalid.
const verify = async (bearer?: string) => (bearer === 'good-token' ? 'owner-1' : undefined);
const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify });

function reqWith(auth?: string): Request {
  return new Request('https://artifact.host/api/artifacts', auth ? { headers: { authorization: auth } } : {});
}

describe('ownerIdFromRequest', () => {
  it('returns the owner id for a valid Bearer token', async () => {
    expect(await ownerIdFromRequest(reqWith('Bearer good-token'))).toBe('owner-1');
  });
  it('is case-insensitive on the Bearer scheme', async () => {
    expect(await ownerIdFromRequest(reqWith('bearer good-token'))).toBe('owner-1');
  });
  it('returns null when the header is missing or the token is invalid', async () => {
    expect(await ownerIdFromRequest(reqWith())).toBeNull();
    expect(await ownerIdFromRequest(reqWith('Bearer nope'))).toBeNull();
    expect(await ownerIdFromRequest(reqWith('good-token'))).toBeNull(); // no scheme
  });
});

describe('requireOwner', () => {
  it('returns the owner id when present', async () => {
    expect(await requireOwner(reqWith('Bearer good-token'))).toBe('owner-1');
  });
  it('throws ServiceError unauthorized when absent', async () => {
    await expect(requireOwner(reqWith())).rejects.toMatchObject({ code: 'unauthorized' });
    expect(ServiceError).toBeDefined();
  });
});
