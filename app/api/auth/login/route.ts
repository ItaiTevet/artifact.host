import { getUserRepository } from '@/lib/db/factory';
import { authProvider } from '@/lib/auth/server';
import { issueSession } from '@/lib/auth/session';
import { verifyPassword } from '@/lib/artifacts/tokens';

export const runtime = 'nodejs';

// Valid salt:hash shape (values irrelevant) so verifyPassword runs scrypt for a missing user.
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

export async function POST(req: Request) {
  if (authProvider() !== 'local-password') {
    return Response.json({ error: 'not_found', message: 'Password sign-in is disabled' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  const repo = await getUserRepository();
  const user = await repo.findByEmail(email);
  // Always run scrypt (against a dummy hash when the user is missing) so the response timing
  // doesn't reveal which emails have accounts.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return Response.json({ error: 'unauthorized', message: 'Invalid email or password' }, { status: 401 });
  }
  const token = await issueSession({ userId: user.id, email: user.email });
  return Response.json({ token, email: user.email });
}
