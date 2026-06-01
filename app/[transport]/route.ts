import { createMcpHandler } from 'mcp-handler';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { registerArtifactTools } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    const repo = new SupabaseArtifactRepository(getServiceClient());
    registerArtifactTools(server, repo);
  },
  {},
  { basePath: '' },
);

export { handler as GET, handler as POST, handler as DELETE };
