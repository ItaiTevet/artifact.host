import { ServiceError } from '@/lib/artifacts/errors';
import { verifySupabaseToken } from '@/lib/auth/supabase-token';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseTokenRepository } from '@/lib/db/token-repository';
import { makeVerifyPersonalToken } from '@/lib/auth/personal-token-auth';

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

// PAT verifier is built lazily so importing this module never touches the DB client
// (keeps module load env-free; the service client is only constructed on first PAT check).
let verifyPat: ((bearerToken?: string) => Promise<string | undefined>) | null = null;
function getVerifyPat() {
  if (!verifyPat) {
    verifyPat = makeVerifyPersonalToken({ repo: new SupabaseTokenRepository(getServiceClient()) });
  }
  return verifyPat;
}

/** A bearer is accepted if it's a valid session JWT OR a valid Personal API Token. */
async function verifyOwner(bearerToken?: string): Promise<string | undefined> {
  return (await verifySupabaseToken(bearerToken)) ?? (await getVerifyPat()(bearerToken));
}

export const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify: verifyOwner });
