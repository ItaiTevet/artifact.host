import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseTokenRepository } from '@/lib/db/token-repository';
import { requireOwner } from '@/lib/http/request-auth';
import { ServiceError } from '@/lib/artifacts/errors';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// Revoke one of the signed-in owner's API tokens.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await requireOwner(req);
    const repo = new SupabaseTokenRepository(getServiceClient());
    const ok = await repo.revoke(id, ownerId);
    if (!ok) throw new ServiceError('not_found', 'Token not found');
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
