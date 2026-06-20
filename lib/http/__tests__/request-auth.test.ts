import { describe, it, expect } from 'vitest';
import { makeOwnerAuth, makeViewerAuth } from '@/lib/http/request-auth';
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

describe('viewerFromRequest', () => {
  // A session bearer carries a verified email (used for allowlist matching); a Personal API
  // Token only resolves to its owner id (no email), which still lets owners view their own
  // restricted artifacts via the owner bypass.
  const identify = async (bearer?: string) =>
    bearer === 'session' ? { userId: 'owner-1', email: 'owner@a.test' } : undefined;
  const resolvePat = async (bearer?: string) => (bearer === 'ah_good' ? 'owner-1' : undefined);
  const { viewerFromRequest } = makeViewerAuth({ identify, resolvePat });

  it('resolves a session bearer to a viewer with email (for allowlist checks)', async () => {
    expect(await viewerFromRequest(reqWith('Bearer session'))).toEqual({
      ownerId: 'owner-1', email: 'owner@a.test',
    });
  });
  it('resolves a Personal API Token to the owner (no email) so owners can view their own restricted artifacts', async () => {
    expect(await viewerFromRequest(reqWith('Bearer ah_good'))).toEqual({
      ownerId: 'owner-1', email: null,
    });
  });
  it('returns null when neither a session nor a PAT is valid', async () => {
    expect(await viewerFromRequest(reqWith())).toBeNull();
    expect(await viewerFromRequest(reqWith('Bearer nope'))).toBeNull();
  });
});
