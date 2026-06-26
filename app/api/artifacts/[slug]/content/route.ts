import { getArtifactRepository } from '@/lib/db/factory';
import { viewArtifact } from '@/lib/artifacts/service';
import { viewerFromRequest } from '@/lib/http/request-auth';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// Authorized content fetch for 'restricted' artifacts — the client gate calls this with the
// viewer's session bearer (email checked against the allowlist); a Personal API Token resolves
// to its owner, so owners can always fetch their own restricted artifact via the API/CLI too.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const viewer = await viewerFromRequest(req);

    const repo = await getArtifactRepository();
    const res = await viewArtifact(repo, slug, { passwordVerified: false, viewer });

    if (res.status === 'ok') return Response.json({ content: res.content, title: res.title, comments_enabled: res.commentsEnabled });
    if (res.status === 'restricted') {
      return res.reason === 'login'
        ? Response.json({ error: 'unauthorized', message: 'Sign in to view this artifact' }, { status: 401 })
        : Response.json({ error: 'forbidden', message: 'You do not have access to this artifact' }, { status: 403 });
    }
    if (res.status === 'password_required') {
      return Response.json({ error: 'forbidden', message: 'Password required' }, { status: 403 });
    }
    return Response.json({ error: 'not_found', message: 'Artifact not found' }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
