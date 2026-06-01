import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const handler = protectedResourceHandler({
  authServerUrls: [`${SUPABASE_URL}/auth/v1`],
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
