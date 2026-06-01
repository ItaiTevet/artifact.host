import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';
import { registerArtifactTools } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const baseHandler = createMcpHandler(
  (server) => {
    const repo = new SupabaseArtifactRepository(getServiceClient());
    registerArtifactTools(server, repo);
  },
  { serverInfo: { name: 'artifact.host', version: '1.0.0' } },
  { basePath: '', disableSse: true },
);

// Dual-mode: a valid Supabase JWT identifies the owner; no/invalid token → anonymous.
const handler = withMcpAuth(baseHandler, verifyMcpToken, {
  required: false,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
});

export { handler as GET, handler as POST, handler as DELETE };
