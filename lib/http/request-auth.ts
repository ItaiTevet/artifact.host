import { ServiceError } from '@/lib/artifacts/errors';
import { verifyOwnerSession, verifyIdentity, type SessionIdentity } from '@/lib/auth/server';
import { getTokenRepository } from '@/lib/db/factory';
import { isPersonalToken, hashPersonalToken } from '@/lib/auth/personal-token';

export interface OwnerAuthDeps {
  verify: (bearerToken?: string) => Promise<string | undefined>;
}

function bearerFrom(req: Request): string | undefined {
  const header = req.headers.get('authorization') ?? '';
  return /^bearer /i.test(header) ? header.slice(7).trim() : undefined;
}

export function makeOwnerAuth({ verify }: OwnerAuthDeps) {
  /** Owner id from a valid Bearer session token, or null (not signed in / invalid). */
  async function ownerIdFromRequest(req: Request): Promise<string | null> {
    return (await verify(bearerFrom(req))) ?? null;
  }
  /** Owner id, or throws ServiceError('unauthorized') when not signed in. */
  async function requireOwner(req: Request): Promise<string> {
    const id = await ownerIdFromRequest(req);
    if (!id) throw new ServiceError('unauthorized', 'Sign in required');
    return id;
  }
  return { ownerIdFromRequest, requireOwner };
}

/** Resolve a Personal API Token to its owner via the configured token repository. */
async function verifyPersonalToken(bearerToken?: string): Promise<string | undefined> {
  if (!isPersonalToken(bearerToken)) return undefined; // cheap pre-check before touching the DB
  const repo = await getTokenRepository();
  return (await repo.resolveOwner(hashPersonalToken(bearerToken), new Date())) ?? undefined;
}

/** A bearer is accepted if it's a valid session token OR a valid Personal API Token. */
async function verifyOwner(bearerToken?: string): Promise<string | undefined> {
  return (await verifyOwnerSession(bearerToken)) ?? (await verifyPersonalToken(bearerToken));
}

export const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify: verifyOwner });

// ── Viewer auth (for 'restricted' artifacts) ──────────────────────────────────
// Restricted access is decided two ways: an allowlisted *email* (needs a verified session
// identity) or the *owner* bypass (just an owner id). A Personal API Token carries no email,
// but it does resolve to its owner — so an owner can always view their own restricted artifact
// via a PAT, matching every other owner endpoint.

export interface Viewer { ownerId: string; email?: string | null }

export interface ViewerAuthDeps {
  identify: (bearerToken?: string) => Promise<SessionIdentity | undefined>;
  resolvePat: (bearerToken?: string) => Promise<string | undefined>;
}

export function makeViewerAuth({ identify, resolvePat }: ViewerAuthDeps) {
  /** Resolve the caller to a viewer: session identity (with email) or PAT owner (no email). */
  async function viewerFromRequest(req: Request): Promise<Viewer | null> {
    const bearer = bearerFrom(req);
    const id = await identify(bearer);
    if (id) return { ownerId: id.userId, email: id.email ?? null };
    const ownerId = await resolvePat(bearer);
    return ownerId ? { ownerId, email: null } : null;
  }
  return { viewerFromRequest };
}

export const { viewerFromRequest } = makeViewerAuth({
  identify: verifyIdentity,
  resolvePat: verifyPersonalToken,
});
