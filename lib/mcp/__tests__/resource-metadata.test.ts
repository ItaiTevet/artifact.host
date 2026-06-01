import { describe, it, expect } from 'vitest';
import { generateProtectedResourceMetadata } from 'mcp-handler';

describe('protected resource metadata', () => {
  it('advertises the Supabase auth server as the authorization server', () => {
    const issuer = 'https://bjztcxpqchwpdsrgapqp.supabase.co/auth/v1';
    const md = generateProtectedResourceMetadata({
      authServerUrls: [issuer],
      resourceUrl: 'https://artifact.host/mcp',
    });
    expect(md.authorization_servers).toContain(issuer);
    expect(md.resource).toBe('https://artifact.host/mcp');
  });
});
