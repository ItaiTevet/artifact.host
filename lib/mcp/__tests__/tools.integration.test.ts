import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { registerArtifactTools } from '@/lib/mcp/tools';

async function connect() {
  const repo = new InMemoryRepository();
  const server = new McpServer({ name: 'artifact-host', version: 'test' });
  registerArtifactTools(server, repo);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: 'test' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, repo };
}

describe('MCP artifact tools (in-memory client/server)', () => {
  it('exposes exactly the three tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['deploy_html', 'set_visibility', 'update_html']);
  });

  it('deploys, surfaces the URL in text + structuredContent, then updates with the edit_token', async () => {
    const { client } = await connect();
    const dep = await client.callTool({
      name: 'deploy_html',
      arguments: { html: '<title>t</title><h1>hi</h1>' },
    });
    expect(dep.isError).toBeFalsy();
    const out = dep.structuredContent as { url: string; slug: string; edit_token: string };
    expect(out.url).toContain('/a/' + out.slug);
    const textBlock = (dep.content as { type: string; text: string }[])[0];
    expect(textBlock.text).toContain(out.url);

    const upd = await client.callTool({
      name: 'update_html',
      arguments: { slug: out.slug, html: '<h1>updated</h1>', edit_token: out.edit_token },
    });
    expect(upd.isError).toBeFalsy();
  });

  it('returns an actionable isError result when the edit_token is wrong', async () => {
    const { client } = await connect();
    const dep = await client.callTool({ name: 'deploy_html', arguments: { html: '<h1>x</h1>' } });
    const slug = (dep.structuredContent as { slug: string }).slug;
    const res = await client.callTool({
      name: 'update_html',
      arguments: { slug, html: '<h1>y</h1>', edit_token: 'wrong-token' },
    });
    expect(res.isError).toBe(true);
    expect((res.content as { type: string; text: string }[])[0].text).toContain('edit_token');
  });

  it('sets visibility to password over the protocol', async () => {
    const { client } = await connect();
    const dep = await client.callTool({ name: 'deploy_html', arguments: { html: '<h1>v</h1>' } });
    const out = dep.structuredContent as { slug: string; edit_token: string };
    const res = await client.callTool({
      name: 'set_visibility',
      arguments: { slug: out.slug, visibility: 'password', password: 'pw', edit_token: out.edit_token },
    });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { visibility: string }).visibility).toBe('password');
  });
});
