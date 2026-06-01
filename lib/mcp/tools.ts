import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { CallToolResult, ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { deployHtml, updateHtml, setArtifactVisibility } from '@/lib/mcp/handlers';
import { mcpErrorResult } from '@/lib/mcp/errors';
import { getIpHashFromHeaders } from '@/lib/http/request-context';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Derive the rate-limit IP bucket from the MCP request's forwarded headers.
 * When no headers are present (e.g. a stdio transport), this buckets all such
 * callers together under the 'unknown' hash — acceptable for the current model.
 */
function ipFrom(extra: Extra): string {
  return getIpHashFromHeaders(extra.requestInfo?.headers ?? {});
}

/** Read the authenticated user id (set by withMcpAuth) from the tool-call context, or null. */
export function ownerFrom(extra: { authInfo?: { extra?: Record<string, unknown> } }): string | null {
  const id = extra.authInfo?.extra?.userId;
  return typeof id === 'string' ? id : null;
}

/** Cast a plain result object to CallToolResult for the SDK's index-signature requirement. */
function ok(content: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: content }], structuredContent };
}

export function registerArtifactTools(server: McpServer, repo: ArtifactRepository): void {
  server.registerTool(
    'deploy_html',
    {
      title: 'Deploy HTML',
      description:
        'Host a standalone HTML document at a short, live URL and return that URL. Call this whenever you produce HTML the user may want to view or share, then show them the returned `url`. Save the returned `edit_token` if you might update the page later.',
      inputSchema: {
        html: z.string().min(1).describe('The full HTML document to host.'),
        ttl: z.enum(['1h', '1d', '7d', '30d']).default('7d').describe('How long until the artifact expires.'),
        visibility: z
          .enum(['public', 'password'])
          .default('public')
          .describe("'public' = anyone with the link; 'password' = gated behind a password."),
        password: z.string().optional().describe("Required only when visibility is 'password'."),
      },
      outputSchema: {
        url: z.string(),
        slug: z.string(),
        edit_token: z.string(),
        expires_at: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      try {
        const out = await deployHtml(repo, args, ipFrom(extra), ownerFrom(extra));
        // Handler outputs are plain objects whose fields match the outputSchema; the
        // double-cast only satisfies the SDK's index-signature type for structuredContent.
        return ok(
          `Deployed. Live URL: ${out.url}\nExpires: ${out.expires_at}\nedit_token (save to update later): ${out.edit_token}`,
          out as unknown as Record<string, unknown>,
        );
      } catch (err) {
        return mcpErrorResult(err) as CallToolResult;
      }
    },
  );

  server.registerTool(
    'update_html',
    {
      title: 'Update HTML',
      description:
        'Replace the HTML of an existing artifact, keeping the same URL. The expiry is NOT extended. Requires the edit_token from deploy_html.',
      inputSchema: {
        slug: z.string().min(1).describe('The slug from the deploy URL (the part after /a/).'),
        html: z.string().min(1).describe('The new full HTML document; replaces the existing content.'),
        edit_token: z.string().min(1).describe('The edit_token returned by deploy_html.'),
      },
      outputSchema: {
        url: z.string(),
        expires_at: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      try {
        const out = await updateHtml(repo, args, ownerFrom(extra));
        return ok(
          `Updated. Live URL: ${out.url}\nExpires (unchanged): ${out.expires_at}`,
          out as unknown as Record<string, unknown>,
        );
      } catch (err) {
        return mcpErrorResult(err) as CallToolResult;
      }
    },
  );

  server.registerTool(
    'set_visibility',
    {
      title: 'Set visibility',
      description:
        "Make an artifact public or password-protected. Setting 'password' requires a password; switching to 'public' clears it. Requires the edit_token from deploy_html.",
      inputSchema: {
        slug: z.string().min(1).describe('The slug from the deploy URL (the part after /a/).'),
        visibility: z.enum(['public', 'password']).describe("'public' or 'password'."),
        password: z.string().optional().describe("Required when setting visibility to 'password'."),
        edit_token: z.string().min(1).describe('The edit_token returned by deploy_html.'),
      },
      outputSchema: {
        slug: z.string(),
        visibility: z.enum(['public', 'password']),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args, extra) => {
      try {
        const out = await setArtifactVisibility(repo, args, ownerFrom(extra));
        return ok(
          `Visibility for ${out.slug} is now '${out.visibility}'.`,
          out as unknown as Record<string, unknown>,
        );
      } catch (err) {
        return mcpErrorResult(err) as CallToolResult;
      }
    },
  );
}
