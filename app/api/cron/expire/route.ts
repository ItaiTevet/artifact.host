import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const repo = new SupabaseArtifactRepository(getServiceClient());
  const deleted = await repo.deleteExpired(new Date());
  return Response.json({ deleted });
}
