import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { checkPassword } from '@/lib/artifacts/service';
import { cookieName, signPasswordCookie } from '@/lib/http/cookies';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await req.formData();
  const password = String(form.get('password') ?? '');

  const repo = new SupabaseArtifactRepository(getServiceClient());
  const ok = await checkPassword(repo, slug, password);

  if (!ok) {
    return Response.redirect(new URL(`/a/${slug}?error=1`, req.url), 303);
  }
  const jar = await cookies();
  jar.set(cookieName(slug), signPasswordCookie(slug), {
    httpOnly: true, sameSite: 'lax', secure: true, path: `/a/${slug}`, maxAge: 1800,
  });
  return Response.redirect(new URL(`/a/${slug}`, req.url), 303);
}
