import { getArtifactRepository } from '@/lib/db/factory';
import { listOwnArtifacts } from '@/lib/artifacts/service';
import { requireOwner } from '@/lib/http/request-auth';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const ownerId = await requireOwner(req);
    const repo = await getArtifactRepository();
    const items = await listOwnArtifacts(repo, ownerId);
    return Response.json({
      artifacts: items.map((a) => ({
        slug: a.slug,
        title: a.title,
        visibility: a.visibility,
        created_at: a.createdAt.toISOString(),
        expires_at: a.expiresAt.toISOString(),
        view_count: a.viewCount,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
