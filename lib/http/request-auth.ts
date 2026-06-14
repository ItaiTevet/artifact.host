import { ServiceError } from '@/lib/artifacts/errors';
import { verifyOwnerSession } from '@/lib/auth/server';
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
