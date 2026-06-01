# MCP Endpoint (anonymous-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. During implementation, also consult Anthropic's **mcp-builder** skill (`https://github.com/anthropics/skills/tree/main/skills/mcp-builder`) for tool-design and eval conventions.

**Goal:** Expose the existing artifact service as a hosted, streamable-HTTP **MCP endpoint** at `/mcp` with three tools — `deploy_html`, `update_html`, `set_visibility` — using the anonymous edit-token model already built and tested.

**Architecture:** A thin MCP adapter over `lib/artifacts/service.ts`, exactly mirroring how `app/api/*` routes adapt the same service. Pure tool logic lives in `lib/mcp/handlers.ts` (unit-testable against the in-memory repo fake); `lib/mcp/tools.ts` registers those handlers on an SDK `McpServer` with Zod schemas, annotations, and actionable error mapping; `app/[transport]/route.ts` mounts the server over streamable HTTP via `mcp-handler` (stateless, no Redis). No OAuth and no `ownerId` wiring in this plan — those are deferred to Plan 2b.

**Tech Stack:** Next.js 16 (App Router, Node runtime), `mcp-handler` (Vercel's Next.js MCP adapter), `@modelcontextprotocol/sdk`, `zod@^3`, Vitest 3.

---

## File Structure

**New files:**
- `lib/mcp/handlers.ts` — pure async functions (`deployHtml`, `updateHtml`, `setArtifactVisibility`) that call the service and return plain JSON-able results; throw `ServiceError`. No MCP/SDK imports.
- `lib/mcp/errors.ts` — `mcpErrorResult(err)` mapping `ServiceError` codes → actionable tool-error results.
- `lib/mcp/tools.ts` — `registerArtifactTools(server, repo)`: Zod input/output schemas, annotations, callbacks that derive `ipHash`, format results, and catch errors.
- `app/[transport]/route.ts` — `mcp-handler` wiring; exports `GET`/`POST`/`DELETE`. Endpoint resolves to `/mcp`.
- `lib/mcp/__tests__/handlers.test.ts` — unit tests vs `InMemoryRepository`.
- `lib/mcp/__tests__/tools.integration.test.ts` — in-memory MCP `Client`↔`Server` round-trip.
- `docs/mcp-connect.md` — how to connect a client + Inspector instructions.

**Modified files:**
- `lib/http/request-context.ts` — extract `hashIp` + add `getIpHashFromHeaders` (DRY; keeps `getIpHash` byte-identical so its existing test still passes).
- `lib/http/__tests__/request-context.test.ts` — add cases for `getIpHashFromHeaders`.
- `package.json` — add `mcp-handler`, `@modelcontextprotocol/sdk`, `zod`.

**Design notes carried into tasks:**
- Tools are stateless. `deploy_html` returns `edit_token` (shown once); `update_html`/`set_visibility` require it. The service's existing `authorize()` enforces it.
- `ipHash` for rate-limit/cap reuse is derived from `x-forwarded-for` on the MCP request (`extra.requestInfo.headers`). When headers are absent (e.g. local Inspector), it falls back to a shared `'unknown'` bucket — acceptable for v1; behind Vercel the header is always present.
- Route mount: `app/[transport]/route.ts` with `basePath: ''` yields the clean `/mcp` path the spec calls for. The root dynamic `[transport]` segment is less specific than our existing routes (`/`, `/a/[slug]`, `/api/*`), so Next.js still matches those first; only otherwise-unmatched single-segment paths reach the MCP handler, which returns a proper protocol/404 error. If that greediness is undesirable later, move the file to `app/api/[transport]/route.ts` with `basePath: '/api'` (endpoint becomes `/api/mcp`).

---

## Task 1: Add header-based IP hashing (`getIpHashFromHeaders`)

**Files:**
- Modify: `lib/http/request-context.ts`
- Test: `lib/http/__tests__/request-context.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `lib/http/__tests__/request-context.test.ts` (keep existing tests as-is):

```typescript
import { getIpHashFromHeaders } from '@/lib/http/request-context';

describe('getIpHashFromHeaders', () => {
  it('matches getIpHash for the same forwarded IP', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.7' } });
    // getIpHash is already imported at the top of this file
    expect(getIpHashFromHeaders({ 'x-forwarded-for': '203.0.113.7' })).toBe(getIpHash(req));
  });

  it('uses the first IP when x-forwarded-for is an array', () => {
    const single = getIpHashFromHeaders({ 'x-forwarded-for': '203.0.113.7' });
    expect(getIpHashFromHeaders({ 'x-forwarded-for': ['203.0.113.7', '10.0.0.1'] })).toBe(single);
  });

  it('falls back to the constant bucket when the header is missing', () => {
    const none = new Request('http://x');
    expect(getIpHashFromHeaders({})).toBe(getIpHash(none));
  });
});
```

> If `getIpHash` is not already imported at the top of the test file, add `import { getIpHash, getIpHashFromHeaders } from '@/lib/http/request-context';` and remove any duplicate import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- request-context`
Expected: FAIL — `getIpHashFromHeaders` is not exported.

- [ ] **Step 3: Refactor `request-context.ts` to add the function (DRY, behavior-preserving)**

Replace the entire contents of `lib/http/request-context.ts` with:

```typescript
import { createHash } from 'node:crypto';

function firstForwardedIp(xff: string | null | undefined): string {
  return (xff ?? '').split(',')[0]?.trim() || 'unknown';
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip || 'unknown').digest('hex');
}

export function getIpHash(req: Request): string {
  return hashIp(firstForwardedIp(req.headers.get('x-forwarded-for')));
}

/** Same hashing as getIpHash, but from a plain headers object (e.g. MCP requestInfo.headers). */
export function getIpHashFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): string {
  const v = headers['x-forwarded-for'];
  const xff = Array.isArray(v) ? v[0] : v ?? null;
  return hashIp(firstForwardedIp(xff));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- request-context`
Expected: PASS — both the original `getIpHash` tests and the new `getIpHashFromHeaders` tests.

- [ ] **Step 5: Commit**

```bash
git add lib/http/request-context.ts lib/http/__tests__/request-context.test.ts
git commit -m "feat: add getIpHashFromHeaders for MCP request IP hashing"
```

---

## Task 2: MCP error mapping (`lib/mcp/errors.ts`)

**Files:**
- Create: `lib/mcp/errors.ts`
- Test: `lib/mcp/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/mcp/__tests__/errors.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- mcp/__tests__/errors`
Expected: FAIL — cannot find module `@/lib/mcp/errors`.

- [ ] **Step 3: Implement `lib/mcp/errors.ts`**

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- mcp/__tests__/errors`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/errors.ts lib/mcp/__tests__/errors.test.ts
git commit -m "feat: add MCP error mapping with actionable messages"
```

---

## Task 3: Pure tool handlers (`lib/mcp/handlers.ts`)

**Files:**
- Create: `lib/mcp/handlers.ts`
- Test: `lib/mcp/__tests__/handlers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/mcp/__tests__/handlers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '@/lib/artifacts/__tests__/in-memory-repository';
import { deployHtml, updateHtml, setArtifactVisibility } from '@/lib/mcp/handlers';

const IP = 'ip-test';

describe('mcp handlers', () => {
  it('deployHtml returns url/slug/edit_token/expires_at', async () => {
    const repo = new InMemoryRepository();
    const out = await deployHtml(repo, { html: '<title>T</title><h1>hi</h1>' }, IP);
    expect(out.url).toContain('/a/' + out.slug);
    expect(out.edit_token.length).toBeGreaterThan(10);
    expect(new Date(out.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('deployHtml passes ttl and visibility through to the service', async () => {
    const repo = new InMemoryRepository();
    const out = await deployHtml(repo, { html: '<h1>a</h1>', ttl: '1h', visibility: 'public' }, IP);
    const row = (await repo.findBySlug(out.slug))!;
    expect(row.visibility).toBe('public');
    // 1h TTL → expiry within ~1 hour, well under the 7d default
    expect(new Date(out.expires_at).getTime() - Date.now()).toBeLessThan(2 * 3600_000);
  });

  it('updateHtml succeeds with the matching edit_token and replaces content', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    const out = await updateHtml(repo, { slug: dep.slug, html: '<h1>b</h1>', edit_token: dep.edit_token });
    expect(out.url).toContain(dep.slug);
    expect((await repo.findBySlug(dep.slug))!.content).toBe('<h1>b</h1>');
  });

  it('updateHtml throws forbidden on a wrong edit_token', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    await expect(
      updateHtml(repo, { slug: dep.slug, html: '<h1>b</h1>', edit_token: 'nope' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('setArtifactVisibility sets a password hash', async () => {
    const repo = new InMemoryRepository();
    const dep = await deployHtml(repo, { html: '<h1>a</h1>' }, IP);
    const out = await setArtifactVisibility(repo, {
      slug: dep.slug, visibility: 'password', password: 'pw', edit_token: dep.edit_token,
    });
    expect(out.visibility).toBe('password');
    expect((await repo.findBySlug(dep.slug))!.passwordHash).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mcp/__tests__/handlers`
Expected: FAIL — cannot find module `@/lib/mcp/handlers`.

- [ ] **Step 3: Implement `lib/mcp/handlers.ts`**

```typescript
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { deployArtifact, updateArtifact, setVisibility } from '@/lib/artifacts/service';
import type { Ttl, Visibility } from '@/lib/artifacts/types';

export interface DeployArgs {
  html: string;
  ttl?: Ttl;
  visibility?: Visibility;
  password?: string;
}
export interface DeployOut {
  url: string;
  slug: string;
  edit_token: string;
  expires_at: string;
}

export async function deployHtml(
  repo: ArtifactRepository,
  args: DeployArgs,
  ipHash: string,
): Promise<DeployOut> {
  const r = await deployArtifact(repo, {
    content: args.html,
    ttl: args.ttl,
    visibility: args.visibility,
    password: args.password ?? null,
    ownerId: null,
    ipHash,
  });
  return { url: r.url, slug: r.slug, edit_token: r.editToken, expires_at: r.expiresAt.toISOString() };
}

export interface UpdateArgs {
  slug: string;
  html: string;
  edit_token: string;
}
export interface UpdateOut {
  url: string;
  expires_at: string;
}

export async function updateHtml(
  repo: ArtifactRepository,
  args: UpdateArgs,
): Promise<UpdateOut> {
  const r = await updateArtifact(repo, args.slug, args.html, {
    ownerId: null,
    editToken: args.edit_token,
  });
  return { url: r.url, expires_at: r.expiresAt.toISOString() };
}

export interface VisibilityArgs {
  slug: string;
  visibility: Visibility;
  password?: string;
  edit_token: string;
}
export interface VisibilityOut {
  slug: string;
  visibility: Visibility;
}

export async function setArtifactVisibility(
  repo: ArtifactRepository,
  args: VisibilityArgs,
): Promise<VisibilityOut> {
  await setVisibility(repo, args.slug, args.visibility, args.password ?? null, {
    ownerId: null,
    editToken: args.edit_token,
  });
  return { slug: args.slug, visibility: args.visibility };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mcp/__tests__/handlers`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/handlers.ts lib/mcp/__tests__/handlers.test.ts
git commit -m "feat: add pure MCP tool handlers over the artifact service"
```

---

## Task 4: Install SDK + register tools (`lib/mcp/tools.ts`) with an in-memory MCP round-trip test

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `lib/mcp/tools.ts`
- Test: `lib/mcp/__tests__/tools.integration.test.ts`

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install mcp-handler @modelcontextprotocol/sdk "zod@^3"
```
Expected: packages added to `dependencies`. (`zod` is pinned to v3 because the MCP SDK targets zod 3.)

> **API check (mcp-builder Phase 1):** open the installed `node_modules/mcp-handler/README.md` and `node_modules/@modelcontextprotocol/sdk/README.md`. Confirm `createMcpHandler(initServer, serverOptions, config)` and `McpServer.registerTool(name, config, callback)` exist with the shapes used below. If the installed version uses `server.tool(name, description, inputShape, cb)` instead of `registerTool`, adapt the registrations in Step 4 accordingly (same Zod shapes, same callback bodies).

- [ ] **Step 2: Write the failing integration test**

Create `lib/mcp/__tests__/tools.integration.test.ts`:

```typescript
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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- mcp/__tests__/tools`
Expected: FAIL — cannot find module `@/lib/mcp/tools`.

- [ ] **Step 4: Implement `lib/mcp/tools.ts`**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ArtifactRepository } from '@/lib/artifacts/repository';
import { deployHtml, updateHtml, setArtifactVisibility } from '@/lib/mcp/handlers';
import { mcpErrorResult } from '@/lib/mcp/errors';
import { getIpHashFromHeaders } from '@/lib/http/request-context';

/** Derive the rate-limit IP bucket from the MCP request's forwarded headers. */
function ipFrom(extra: { requestInfo?: { headers?: Record<string, string | string[] | undefined> } }): string {
  return getIpHashFromHeaders(extra.requestInfo?.headers ?? {});
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
        const out = await deployHtml(repo, args, ipFrom(extra));
        return {
          content: [
            {
              type: 'text',
              text: `Deployed. Live URL: ${out.url}\nExpires: ${out.expires_at}\nedit_token (save to update later): ${out.edit_token}`,
            },
          ],
          structuredContent: out,
        };
      } catch (err) {
        return mcpErrorResult(err);
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
    async (args) => {
      try {
        const out = await updateHtml(repo, args);
        return {
          content: [{ type: 'text', text: `Updated. Live URL: ${out.url}\nExpires (unchanged): ${out.expires_at}` }],
          structuredContent: out,
        };
      } catch (err) {
        return mcpErrorResult(err);
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
    async (args) => {
      try {
        const out = await setArtifactVisibility(repo, args);
        return {
          content: [{ type: 'text', text: `Visibility for ${out.slug} is now '${out.visibility}'.` }],
          structuredContent: out,
        };
      } catch (err) {
        return mcpErrorResult(err);
      }
    },
  );
}
```

> Note: when `outputSchema` is set, the SDK validates `structuredContent` on success. Error results return `isError: true` **without** `structuredContent`, which is exempt from that validation. If the installed SDK version rejects an `isError` result lacking `structuredContent`, drop the three `outputSchema` blocks (the text content still carries the result).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- mcp/__tests__/tools`
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/mcp/tools.ts lib/mcp/__tests__/tools.integration.test.ts
git commit -m "feat: register deploy_html/update_html/set_visibility MCP tools"
```

---

## Task 5: Mount the streamable-HTTP route (`app/[transport]/route.ts`) and verify with MCP Inspector

**Files:**
- Create: `app/[transport]/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/[transport]/route.ts`:

```typescript
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
```

- [ ] **Step 2: Build to confirm the route compiles**

Run: `npm run build`
Expected: build succeeds; the build output lists a route for `/[transport]`.

- [ ] **Step 3: Start the dev server**

Run (background): `npm run dev`
Wait until `http://localhost:3000` responds.

- [ ] **Step 4: Manually verify with MCP Inspector**

Run: `npx @modelcontextprotocol/inspector`
In the Inspector UI:
1. Transport type: **Streamable HTTP**.
2. URL: `http://localhost:3000/mcp`.
3. Connect → **List Tools** → confirm `deploy_html`, `update_html`, `set_visibility` appear with their descriptions.
4. Call `deploy_html` with `{ "html": "<title>Inspector</title><h1>hi</h1>" }`. Confirm the result text contains a `http://localhost:3000/a/<slug>` URL and `structuredContent` has `url/slug/edit_token/expires_at`.
5. Open that URL in a browser → the HTML renders.
6. Call `update_html` with the returned `slug` + `edit_token` and new HTML → success; refresh the browser → updated.
7. Call `update_html` again with a bad `edit_token` → an `isError` result whose text mentions `edit_token`.

> If the endpoint is not reachable at `/mcp`, check the build's route list for the actual path the handler is mounted at and update `docs/mcp-connect.md` (Task 6) accordingly; if needed, fall back to `app/api/[transport]/route.ts` with `basePath: '/api'` (endpoint `/api/mcp`).

- [ ] **Step 5: Stop the dev server, then commit**

```bash
git add app/[transport]/route.ts
git commit -m "feat: mount streamable-HTTP MCP endpoint at /mcp"
```

---

## Task 6: Connect documentation (`docs/mcp-connect.md`)

**Files:**
- Create: `docs/mcp-connect.md`

- [ ] **Step 1: Write the doc**

Create `docs/mcp-connect.md`:

```markdown
# Connecting to the artifact.host MCP server

artifact.host exposes a **streamable-HTTP** MCP endpoint.

- **Local dev:** `http://localhost:3000/mcp`
- **Production:** `https://<your-vercel-domain>/mcp`

## Tools

| Tool | Purpose | Key inputs |
|------|---------|-----------|
| `deploy_html` | Host an HTML string at a live URL | `html`, `ttl` (1h/1d/7d/30d), `visibility` (public/password), `password?` |
| `update_html` | Replace an artifact's HTML (same URL, expiry unchanged) | `slug`, `html`, `edit_token` |
| `set_visibility` | Make an artifact public or password-protected | `slug`, `visibility`, `password?`, `edit_token` |

`deploy_html` returns `{ url, slug, edit_token, expires_at }`. **Save `edit_token`** — it is shown once and is required to update or change visibility later. Anonymous (no-login) usage is fully supported via this token.

## Clients that speak streamable-HTTP MCP directly

Add a remote MCP server pointing at the endpoint URL. Example config block:

```json
{
  "mcpServers": {
    "artifact-host": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

(The exact config key/shape varies by client; use the client's "remote/HTTP MCP server" option with the URL above.)

## Manual testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Choose **Streamable HTTP**, enter the endpoint URL, connect, and use **List Tools** / **Call Tool**.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mcp-connect.md
git commit -m "docs: how to connect to the MCP endpoint"
```

---

## Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all suites pass — the pre-existing 58 tests **plus** the new MCP tests (errors: 3, handlers: 5, tools integration: 3, request-context additions: 3). No skips other than environment-gated ones already accounted for.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean type-check and successful build.

- [ ] **Step 3: Update the handoff doc**

In `docs/superpowers/HANDOFF.md`, under the completed/next-steps sections, record that the anonymous MCP endpoint (`/mcp`, three tools) is built, unit + in-memory-integration tested, and Inspector-verified locally; next up is Plan 2b (OAuth) then Plan 3 (Web UI). Commit:

```bash
git add docs/superpowers/HANDOFF.md
git commit -m "docs: MCP endpoint (anonymous) complete; next is OAuth (Plan 2b)"
```

---

## Task 8 (GATED): Deploy to Vercel and verify the hosted endpoint

> **PAUSE — get explicit user confirmation before this task.** It publishes the app and requires production secrets. Do not run it autonomously.

**Files:** none (deployment + config).

- [ ] **Step 1: Confirm with the user** that they want to deploy now, and that the production Supabase project (or a separate prod project) is the intended target.

- [ ] **Step 2: Deploy via the Vercel MCP**

Use the Vercel MCP `deploy_to_vercel` tool against this repository/project.

- [ ] **Step 3: Set production environment variables** on the Vercel project (dashboard → Settings → Environment Variables, or via the Vercel MCP if supported):
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_...` key)
- `COOKIE_SECRET`
- `CRON_SECRET`
- `APP_BASE_URL` = the production URL (e.g. `https://<domain>`), so returned artifact URLs are absolute and correct.

Redeploy if the variables were added after the first deploy.

- [ ] **Step 4: Verify the hosted endpoint** with MCP Inspector (Streamable HTTP → `https://<domain>/mcp`): list tools, `deploy_html`, open the returned URL in a browser, confirm it renders with `X-Robots-Tag: noindex`.

- [ ] **Step 5: Update `docs/mcp-connect.md`** with the real production URL and commit.

---

## Self-Review

**Spec coverage (against `2026-06-01-html-artifact-sharing-design.md`, MCP-relevant items):**
- `/mcp` streamable-HTTP endpoint → Task 5. ✅
- `deploy_html` / `update_html` / `set_visibility` over the existing service → Tasks 3–4. ✅
- Anonymous edit-token model; `ownerId` stays null (OAuth deferred) → Tasks 3–4; OAuth explicitly out of scope (Plan 2b). ✅ (per approved scoping decision)
- AI-native tuned tool names/descriptions → Task 4 descriptions. ✅
- Rate-limit/live-cap reuse via IP → Tasks 1 + 4 (`getIpHashFromHeaders` + `ipFrom`). ✅
- stdio shim → intentionally **out of scope** (user chose streamable-HTTP only). Documented in `docs/mcp-connect.md`. ✅
- Hosted on Vercel → Task 8 (gated). ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code; every command has expected output. The two hedges (mcp-handler/SDK API check in Task 4 Step 1; `outputSchema` fallback note) are explicit verification instructions with concrete fallbacks, not missing content.

**Type consistency:** `deployHtml`/`updateHtml`/`setArtifactVisibility` signatures and the `DeployOut`/`UpdateOut`/`VisibilityOut` shapes are defined in Task 3 and consumed unchanged in Task 4. `registerArtifactTools(server, repo)` is defined in Task 4 and called identically in Tasks 4 (test) and 5 (route). `getIpHashFromHeaders` defined in Task 1, used in Task 4. `mcpErrorResult` defined in Task 2, used in Task 4. Tool names (`deploy_html`, `update_html`, `set_visibility`) are consistent across tests, implementation, and docs.

**Scope:** Single subsystem (one MCP adapter over an existing service). Appropriately sized for one plan.
