import { getArtifactRepository } from '@/lib/db/factory';
import { viewArtifact } from '@/lib/artifacts/service';
import { verifyIdentity } from '@/lib/auth/server';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// Authorized content fetch for 'restricted' artifacts — the client gate calls this with the
// viewer's session bearer; the service checks their verified email against the allowlist.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const header = req.headers.get('authorization') ?? '';
    const bearer = /^bearer /i.test(header) ? header.slice(7).trim() : undefined;
    const identity = await verifyIdentity(bearer);
    const viewer = identity ? { ownerId: identity.userId, email: identity.email } : null;

    const repo = await getArtifactRepository();
    const res = await viewArtifact(repo, slug, { passwordVerified: false, viewer });

    if (res.status === 'ok') return Response.json({ content: res.content, title: res.title });
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
