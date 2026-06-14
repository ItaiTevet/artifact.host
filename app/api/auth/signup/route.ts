import { getUserRepository } from '@/lib/db/factory';
import { authProvider } from '@/lib/auth/server';
import { issueSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/artifacts/tokens';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  if (authProvider() !== 'local-password') {
    return Response.json({ error: 'not_found', message: 'Password sign-up is disabled' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid', message: 'A valid email is required' }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: 'invalid', message: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const repo = await getUserRepository();
  if (await repo.findByEmail(email)) {
    return Response.json({ error: 'exists', message: 'An account with that email already exists' }, { status: 409 });
  }
  const user = await repo.create(email, await hashPassword(password));
  const token = await issueSession({ userId: user.id, email: user.email });
  return Response.json({ token, email: user.email }, { status: 201 });
}
