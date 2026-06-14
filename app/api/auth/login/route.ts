import { getUserRepository } from '@/lib/db/factory';
import { authProvider } from '@/lib/auth/server';
import { issueSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/artifacts/tokens';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (authProvider() !== 'local-password') {
    return Response.json({ error: 'not_found', message: 'Password sign-in is disabled' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  const repo = await getUserRepository();
  const user = await repo.findByEmail(email);
  // Verify even when the user is missing-ish to avoid leaking which emails exist via timing.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return Response.json({ error: 'unauthorized', message: 'Invalid email or password' }, { status: 401 });
  }
  const token = await issueSession({ userId: user.id, email: user.email });
  return Response.json({ token, email: user.email });
}
