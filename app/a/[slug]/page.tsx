import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { viewArtifact } from '@/lib/artifacts/service';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { PasswordForm } from './PasswordForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);

  const repo = new SupabaseArtifactRepository(getServiceClient());
  const res = await viewArtifact(repo, slug, { passwordVerified });

  if (res.status === 'not_found') notFound();
  if (res.status === 'password_required') {
    return <PasswordForm slug={slug} error={error === '1'} />;
  }
  // Render the raw artifact HTML as a sandboxed srcdoc iframe (isolates artifact CSS/JS).
  return (
    <iframe
      srcDoc={res.content}
      sandbox="allow-scripts allow-popups allow-forms"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}
