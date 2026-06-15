import { getArtifactRepository } from '@/lib/db/factory';
import { updateArtifact, setVisibility, getOwnArtifact, deleteArtifact } from '@/lib/artifacts/service';
import { ownerIdFromRequest, requireOwner } from '@/lib/http/request-auth';
import { parsePrincipals, formatPrincipals } from '@/lib/artifacts/sharing';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

// Fetch one artifact's content for the dashboard editor (owner only).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ownerId = await requireOwner(req);
    const repo = await getArtifactRepository();
    const rec = await getOwnArtifact(repo, slug, ownerId);
    return Response.json({
      slug: rec.slug,
      title: rec.title,
      content: rec.content,
      visibility: rec.visibility,
      allowlist: formatPrincipals(rec.shareAllowlist),
      expires_at: rec.expiresAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await req.json();
    // Authorize by signed-in owner (Bearer) when present, else fall back to edit token.
    const ownerId = await ownerIdFromRequest(req);
    const editToken = req.headers.get('x-edit-token') ?? body?.edit_token ?? null;
    const auth = { ownerId, editToken };
    const repo = await getArtifactRepository();

    if (typeof body?.visibility === 'string') {
      const allowlist = typeof body.allowlist === 'string'
        ? parsePrincipals(body.allowlist)
        : Array.isArray(body.allowlist) ? body.allowlist : [];
      await setVisibility(repo, slug, body.visibility, body.password ?? null, auth, allowlist);
      return Response.json({ ok: true });
    }
    if (typeof body?.content === 'string') {
      const res = await updateArtifact(repo, slug, body.content, auth);
      return Response.json({ slug: res.slug, url: res.url, expires_at: res.expiresAt.toISOString() });
    }
    return Response.json({ error: 'invalid_visibility', message: 'Provide content or visibility' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ownerId = await requireOwner(req);
    const repo = await getArtifactRepository();
    await deleteArtifact(repo, slug, ownerId);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
