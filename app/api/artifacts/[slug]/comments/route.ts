import { cookies } from 'next/headers';
import { getArtifactRepository, getCommentRepository } from '@/lib/db/factory';
import { listCommentsForViewer, createComment } from '@/lib/artifacts/comment-service';
import { viewerFromRequest } from '@/lib/http/request-auth';
import { cookieName, verifyPasswordCookie } from '@/lib/http/cookies';
import { errorResponse } from '@/lib/http/errors';
import { readLimitedJson } from '@/lib/http/body';
import { REQUEST_MAX_BYTES } from '@/lib/artifacts/validate';
import { ServiceError } from '@/lib/artifacts/errors';
import { coerceAnchor } from '@/lib/artifacts/comment-types';
import { commentToJson } from '@/lib/http/comment-json';

export const runtime = 'nodejs';

async function readContext(req: Request, slug: string) {
  const viewer = await viewerFromRequest(req);
  const jar = await cookies();
  const passwordVerified = verifyPasswordCookie(slug, jar.get(cookieName(slug))?.value);
  return { viewer, passwordVerified };
}

// List comments — anyone who can VIEW the artifact (public → even anonymous). The agent-facing
// collaboration surface: full structured anchors included.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    const list = await listCommentsForViewer(artifacts, comments, slug, ctx);
    return Response.json({ comments: list.map(({ comment, caps }) => commentToJson(comment, caps)) });
  } catch (err) {
    return errorResponse(err);
  }
}

// Create a comment — signed-in + post permission (enforced in the service).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await readLimitedJson<{ body?: unknown; anchor?: unknown }>(req, REQUEST_MAX_BYTES);
    if (typeof body?.body !== 'string') throw new ServiceError('invalid_comment', 'A comment body is required');
    const anchor = coerceAnchor(body?.anchor);
    if (!anchor) throw new ServiceError('invalid_comment', 'A valid anchor is required');
    const ctx = await readContext(req, slug);
    const artifacts = await getArtifactRepository();
    const comments = await getCommentRepository();
    const created = await createComment(artifacts, comments, slug, { body: body.body, anchor }, ctx);
    return Response.json({ comment: commentToJson(created) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
