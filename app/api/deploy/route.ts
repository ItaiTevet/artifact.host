import { getArtifactRepository } from '@/lib/db/factory';
import { deployArtifact } from '@/lib/artifacts/service';
import { getClientIp } from '@/lib/http/request-context';
import { ownerIdFromRequest } from '@/lib/http/request-auth';
import { errorResponse } from '@/lib/http/errors';
import { readLimitedJson } from '@/lib/http/body';
import { REQUEST_MAX_BYTES } from '@/lib/artifacts/validate';
import type { Visibility, Ttl } from '@/lib/artifacts/types';

export const runtime = 'nodejs';

interface DeployBody {
  content?: unknown;
  visibility?: Visibility;
  password?: string | null;
  ttl?: Ttl;
}

export async function POST(req: Request) {
  try {
    const body = await readLimitedJson<DeployBody>(req, REQUEST_MAX_BYTES);
    if (typeof body?.content !== 'string') {
      return Response.json({ error: 'invalid_visibility', message: 'content (string) is required' }, { status: 400 });
    }
    // Claim ownership when a session JWT or Personal API Token is presented; else anonymous.
    const ownerId = await ownerIdFromRequest(req);
    const repo = await getArtifactRepository();
    const result = await deployArtifact(repo, {
      content: body.content,
      visibility: body.visibility,
      password: body.password ?? null,
      ttl: body.ttl,
      ownerId,
      // Deployer IP stored in plain text (not hashed); also used for equality-based rate limiting.
      deployIp: getClientIp(req),
    });
    return Response.json({
      slug: result.slug,
      url: result.url,
      edit_token: result.editToken,
      expires_at: result.expiresAt.toISOString(),
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
