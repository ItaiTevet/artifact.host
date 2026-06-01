import { ServiceError, type ServiceErrorCode } from '@/lib/artifacts/errors';

export const MCP_ERROR_MESSAGES: Record<ServiceErrorCode, string> = {
  too_large: 'The HTML is larger than the 5 MB limit. Reduce the size and try again.',
  invalid_ttl: "ttl must be one of: '1h', '1d', '7d', '30d'.",
  invalid_visibility: "visibility must be 'public' or 'password'.",
  password_required: "Provide a non-empty password when visibility is 'password'.",
  not_found: 'No live artifact found for that slug — it may have expired or never existed.',
  forbidden: 'The edit_token does not match this artifact. Use the edit_token that deploy_html returned.',
  unauthorized: 'Authentication is required for this action.',
  rate_limited: 'Too many deploys from this client recently. Wait a bit, then try again.',
  live_cap_reached: 'You have too many live artifacts. Let some expire before deploying more.',
};

export interface McpErrorResult {
  content: { type: 'text'; text: string }[];
  isError: true;
}

export function mcpErrorResult(err: unknown): McpErrorResult {
  if (err instanceof ServiceError) {
    return { content: [{ type: 'text', text: MCP_ERROR_MESSAGES[err.code] }], isError: true };
  }
  console.error(err);
  return { content: [{ type: 'text', text: 'Unexpected server error. Please try again.' }], isError: true };
}
