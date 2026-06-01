import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { deployArtifact } from '@/lib/artifacts/service';
import { getIpHash } from '@/lib/http/request-context';
import { errorResponse } from '@/lib/http/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.content !== 'string') {
      return Response.json({ error: 'invalid_visibility', message: 'content (string) is required' }, { status: 400 });
    }
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const result = await deployArtifact(repo, {
      content: body.content,
      visibility: body.visibility,
      password: body.password ?? null,
      ttl: body.ttl,
      ownerId: null, // auth wiring arrives in Plan 2/3
      ipHash: getIpHash(req),
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
