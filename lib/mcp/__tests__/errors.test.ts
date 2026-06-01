import { describe, it, expect } from 'vitest';
import { ServiceError } from '@/lib/artifacts/errors';
import { mcpErrorResult } from '@/lib/mcp/errors';

describe('mcpErrorResult', () => {
  it('maps a ServiceError to an actionable, isError result', () => {
    const r = mcpErrorResult(new ServiceError('forbidden', 'nope'));
    expect(r.isError).toBe(true);
    expect(r.content[0].type).toBe('text');
    expect(r.content[0].text).toContain('edit_token');
  });

  it('maps too_large to a size-limit message', () => {
    const r = mcpErrorResult(new ServiceError('too_large', 'x'));
    expect(r.content[0].text).toContain('5 MB');
  });

  it('falls back to a generic message for unknown errors', () => {
    const r = mcpErrorResult(new Error('boom'));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/unexpected/i);
  });
});
