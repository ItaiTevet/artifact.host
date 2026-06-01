import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { updateArtifact, setVisibility } from '@/lib/artifacts/service';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const editToken = req.headers.get('x-edit-token') ?? body?.edit_token ?? null;
    const auth = { ownerId: null, editToken };
    const repo = new SupabaseArtifactRepository(getServiceClient());

    // Visibility change request.
    if (typeof body?.visibility === 'string') {
      await setVisibility(repo, slug, body.visibility, body.password ?? null, auth);
      return Response.json({ ok: true });
    }

    // Content update request.
    if (typeof body?.content === 'string') {
      const res = await updateArtifact(repo, slug, body.content, auth);
      return Response.json({ slug: res.slug, url: res.url, expires_at: res.expiresAt.toISOString() });
    }

    return Response.json({ error: 'invalid_visibility', message: 'Provide content or visibility' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
