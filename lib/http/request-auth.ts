import { ServiceError } from '@/lib/artifacts/errors';
import { verifySupabaseToken } from '@/lib/auth/supabase-token';

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

export const { ownerIdFromRequest, requireOwner } = makeOwnerAuth({ verify: verifySupabaseToken });
