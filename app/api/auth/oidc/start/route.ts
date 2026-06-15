import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { authProvider } from '@/lib/auth/server';
import { oidcConfig, pkce, buildAuthUrl } from '@/lib/auth/oidc';
import { safeReturnPath } from '@/lib/http/safe-redirect';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (authProvider() !== 'oidc') return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const cfg = oidcConfig();
  const returnTo = safeReturnPath(url.searchParams.get('returnTo'), url.origin);
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const { verifier, challenge } = pkce();
  const authUrl = await buildAuthUrl(cfg, { state, nonce, challenge });

  const jar = await cookies();
  const opts = {
    httpOnly: true, sameSite: 'lax' as const,
    secure: (process.env.APP_BASE_URL ?? '').startsWith('https'),
    path: '/api/auth/oidc', maxAge: 600,
  };
  jar.set('oidc_state', state, opts);
  jar.set('oidc_nonce', nonce, opts);
  jar.set('oidc_verifier', verifier, opts);
  jar.set('oidc_return', returnTo, opts);

  return Response.redirect(authUrl, 302);
}
