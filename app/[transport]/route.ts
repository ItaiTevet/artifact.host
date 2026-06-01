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
  { serverInfo: { name: 'artifact.host', version: '1.0.0' } },
  { basePath: '', disableSse: true },
);

// GET/DELETE are part of the MCP HTTP transport surface; the handler returns 405 for unsupported methods.
export { handler as GET, handler as POST, handler as DELETE };
