import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { authProvider } from '@/lib/auth/server';
import { oidcConfig, exchangeAndValidate, domainAllowed } from '@/lib/auth/oidc';
import { getUserRepository } from '@/lib/db/factory';
import { issueSession } from '@/lib/auth/session';
import { safeReturnPath } from '@/lib/http/safe-redirect';

export const runtime = 'nodejs';

const TEMP_COOKIES = ['oidc_state', 'oidc_nonce', 'oidc_verifier', 'oidc_return'];

export async function GET(req: Request) {
  if (authProvider() !== 'oidc') return new Response('Not found', { status: 404 });

  const origin = new URL(req.url).origin;
  const jar = await cookies();
  const params = new URL(req.url).searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = jar.get('oidc_state')?.value;
  const nonce = jar.get('oidc_nonce')?.value;
  const verifier = jar.get('oidc_verifier')?.value;
  const returnTo = safeReturnPath(jar.get('oidc_return')?.value, origin);

  for (const name of TEMP_COOKIES) jar.delete({ name, path: '/api/auth/oidc' });

  const fail = (reason: string) => {
    const u = new URL(returnTo, origin);
    u.searchParams.set('auth_error', reason);
    return Response.redirect(u.toString(), 302);
  };

  if (!code || !state || !expectedState || state !== expectedState || !nonce || !verifier) {
    return fail('oidc_state');
  }

  try {
    const cfg = oidcConfig();
    const identity = await exchangeAndValidate(cfg, { code, verifier, nonce });
    if (!identity.emailVerified) return fail('email_unverified');
    if (!domainAllowed(cfg, identity)) return fail('domain_not_allowed');

    const repo = await getUserRepository();
    const user = (await repo.findByEmail(identity.email))
      ?? (await repo.create(identity.email, `oidc:${randomBytes(16).toString('hex')}`)); // no usable password

    const session = await issueSession({ userId: user.id, email: user.email });
    // Hand the session to the browser via the URL fragment (never sent to a server),
    // where lib/web/auth's bootstrap stores it. Keeps the uniform bearer/localStorage model.
    const dest = new URL(returnTo, origin);
    dest.hash = `token=${encodeURIComponent(session)}`;
    return Response.redirect(dest.toString(), 302);
  } catch {
    return fail('oidc_failed');
  }
}
