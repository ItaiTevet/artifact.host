import { verifySession } from '@/lib/auth/session';

export const runtime = 'nodejs';

// Returns the identity behind a first-party session token (local-password / oidc browser client).
export async function GET(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const bearer = /^bearer /i.test(header) ? header.slice(7).trim() : undefined;
  const id = await verifySession(bearer);
  if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json({ userId: id.userId, email: id.email ?? null });
}
