import { getTokenRepository } from '@/lib/db/factory';
import { requireOwner } from '@/lib/http/request-auth';
import { generatePersonalToken, hashPersonalToken } from '@/lib/auth/personal-token';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// List the signed-in owner's API tokens (metadata only; never the secret).
export async function GET(req: Request) {
  try {
    const ownerId = await requireOwner(req);
    const repo = await getTokenRepository();
    const tokens = await repo.listByOwner(ownerId);
    return Response.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        created_at: t.createdAt.toISOString(),
        last_used_at: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        expires_at: t.expiresAt ? t.expiresAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// Mint a new token. The plaintext is returned exactly once, here.
export async function POST(req: Request) {
  try {
    const ownerId = await requireOwner(req);
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : 'API token';
    const token = generatePersonalToken();
    const repo = await getTokenRepository();
    const rec = await repo.create({ ownerId, name, tokenHash: hashPersonalToken(token), expiresAt: null });
    return Response.json({
      id: rec.id,
      name: rec.name,
      token, // shown once
      created_at: rec.createdAt.toISOString(),
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
