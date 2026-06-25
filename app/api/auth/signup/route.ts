import { getUserRepository } from '@/lib/db/factory';
import { authProvider } from '@/lib/auth/server';
import { issueSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/artifacts/tokens';
import { checkAuthRateLimit } from '@/lib/auth/rate-limit';
import { getIpHash } from '@/lib/http/request-context';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const signupDisabled = () => process.env.DISABLE_SIGNUP === 'true' || process.env.DISABLE_SIGNUP === '1';

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
  // Throttle per IP before running scrypt (blocks signup spam + CPU-exhaustion DoS).
  if (await checkAuthRateLimit(repo, getIpHash(req))) {
    return Response.json({ error: 'rate_limited', message: 'Too many attempts; try again later' }, { status: 429 });
  }
  // When sign-up is disabled, still allow bootstrapping the very first account so the
  // instance owner can create their admin login; everyone after that is blocked.
  if (signupDisabled() && (await repo.count()) > 0) {
    return Response.json({ error: 'forbidden', message: 'Sign-up is disabled on this instance' }, { status: 403 });
  }
  if (await repo.findByEmail(email)) {
    return Response.json({ error: 'exists', message: 'An account with that email already exists' }, { status: 409 });
  }
  const user = await repo.create(email, await hashPassword(password));
  const token = await issueSession({ userId: user.id, email: user.email });
  return Response.json({ token, email: user.email }, { status: 201 });
}
