# Public Web UI (Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next.js scaffold with the branded public site — a homepage (connect-your-AI picker + anonymous paste-deploy with an inline result card), a `/docs` page (MCP + REST API), branded viewer chrome, OG cards, and QR codes — with no working auth (that's Plan 3b).

**Architecture:** A server-rendered shell with small client islands for interactivity. All deploys go through the existing, tested `POST /api/deploy` (no business logic added in the UI). Pure helpers live in `lib/web/` and are unit-tested; the interactive islands are thin and get a couple of focused component tests. Brand = Lora + JetBrains Mono (`next/font`), warm off-white `#fefdfb`, amber `#b36b20`, expressed as CSS variables (no CSS framework).

**Tech Stack:** Next.js 16 (App Router, Node runtime), React 19, CSS Modules + a global token sheet, `next/font/google`, `next/og` `ImageResponse` (OG cards), `qrcode` (client QR), Vitest 3 + `@testing-library/react` + `jsdom` (component tests).

**Spec:** `docs/superpowers/specs/2026-06-02-web-ui-public-design.md`

---

## Key facts verified against the codebase

- **`POST /api/deploy`** → `201 { slug, url, edit_token, expires_at }`. On error → `{ error: <code>, message }` with HTTP status. Deploy-relevant codes: `too_large` (413), `rate_limited` (429), `live_cap_reached` (429), `password_required` (400), `invalid_ttl`/`invalid_visibility` (400), `internal` (500). `ANON_LIVE_CAP = 5`.
- **Viewer** `app/a/[slug]/page.tsx`: renders an `<iframe srcDoc>` for `ok`, `<PasswordForm>` for `password_required`, and calls `notFound()` for `not_found` (covers missing AND expired). `PasswordForm` is a server component with inline `system-ui` styles.
- **Service** exposes `extractTitle(html)` and the repository `findBySlug(slug)` → `ArtifactRecord | null` (fields incl. `title`, `content`, `expiresAt`, `visibility`) — used by the OG route directly (no view increment, no password gate).
- **`APP_BASE_URL`** env is the canonical base (`lib/artifacts/service.ts` uses it). The MCP URL = `${APP_BASE_URL}/mcp`.
- Current `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/page.module.css` are the **Geist scaffold** and get replaced/removed.
- Reference visual: `docs/superpowers/specs/2026-06-01-homepage-mockup.html` (palette + layout to port).

---

## File Structure

**New:**
- `lib/web/errors.ts` + test — deploy error-code → friendly message.
- `lib/web/format.ts` + test — expiry humanizer.
- `lib/web/deploy.ts` + test — client-side validation + POST payload builder.
- `lib/web/connect.ts` + test — per-platform connect snippet builder (MCP URL injected).
- `components/site/Header.tsx` + `Header.module.css`, `components/site/Footer.tsx` + `Footer.module.css`.
- `components/home/ConnectPicker.tsx` + `.module.css`, `components/home/PlatformIcon.tsx`.
- `components/home/DeployPanel.tsx` + `.module.css`, `components/home/ResultCard.tsx` + `.module.css`.
- `components/ui/CopyButton.tsx`, `components/ui/QrCode.tsx`.
- `components/home/DeployPanel.test.tsx`, `components/home/ConnectPicker.test.tsx`, `components/ui/QrCode.test.tsx`.
- `app/docs/page.tsx` + `docs.module.css`.
- `app/a/[slug]/opengraph-image.tsx`, `app/a/[slug]/og.test.ts`.
- `app/a/[slug]/not-found.tsx`.
- `app/home.module.css` (homepage layout).

**Replaced/modified:**
- `app/layout.tsx` (fonts + metadata), `app/globals.css` (brand tokens), `app/page.tsx` (real homepage), delete `app/page.module.css`.
- `app/a/[slug]/PasswordForm.tsx` (reskin), `app/a/[slug]/page.tsx` (add OG/Twitter `<head>` meta via `generateMetadata`).
- `package.json` (`qrcode`, dev: `@testing-library/react`, `jsdom`, `@types/qrcode`).
- `docs/superpowers/HANDOFF.md` (record 3a).

---

## Task 1: Pure web helpers (`lib/web/`)

**Files:**
- Create: `lib/web/errors.ts`, `lib/web/format.ts`, `lib/web/deploy.ts`
- Test: `lib/web/__tests__/web-helpers.test.ts`

- [ ] **Step 1: Write the failing tests** — create `lib/web/__tests__/web-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { deployErrorMessage } from '@/lib/web/errors';
import { humanizeExpiry } from '@/lib/web/format';
import { validateDeployInput, buildDeployPayload } from '@/lib/web/deploy';

describe('deployErrorMessage', () => {
  it('maps known codes to friendly copy', () => {
    expect(deployErrorMessage('too_large')).toMatch(/5 MB/);
    expect(deployErrorMessage('live_cap_reached')).toMatch(/5 live/);
    expect(deployErrorMessage('rate_limited')).toMatch(/too many/i);
    expect(deployErrorMessage('password_required')).toMatch(/password/i);
  });
  it('falls back for unknown / missing codes', () => {
    expect(deployErrorMessage('internal')).toMatch(/something went wrong/i);
    expect(deployErrorMessage(undefined)).toMatch(/something went wrong/i);
  });
});

describe('humanizeExpiry', () => {
  const now = new Date('2026-06-02T00:00:00Z');
  it('renders hours under 48h', () => {
    expect(humanizeExpiry('2026-06-02T01:00:00Z', now)).toBe('Expires in 1 hour');
    expect(humanizeExpiry('2026-06-02T05:00:00Z', now)).toBe('Expires in 5 hours');
  });
  it('renders days at/over 48h', () => {
    expect(humanizeExpiry('2026-06-09T00:00:00Z', now)).toBe('Expires in 7 days');
    expect(humanizeExpiry('2026-06-03T00:00:00Z', now)).toBe('Expires in 1 day');
  });
  it('handles already-expired', () => {
    expect(humanizeExpiry('2026-06-01T00:00:00Z', now)).toBe('Expired');
  });
});

describe('validateDeployInput', () => {
  it('rejects empty html', () => {
    expect(validateDeployInput({ content: '   ', visibility: 'public', password: '' }))
      .toEqual({ ok: false, error: 'Paste some HTML first.' });
  });
  it('rejects password visibility without a password', () => {
    expect(validateDeployInput({ content: '<h1>x</h1>', visibility: 'password', password: '' }))
      .toEqual({ ok: false, error: 'Enter a password, or switch to public.' });
  });
  it('accepts valid input', () => {
    expect(validateDeployInput({ content: '<h1>x</h1>', visibility: 'public', password: '' }))
      .toEqual({ ok: true });
  });
});

describe('buildDeployPayload', () => {
  it('omits password for public', () => {
    expect(buildDeployPayload({ content: '<h1>x</h1>', ttl: '7d', visibility: 'public', password: '' }))
      .toEqual({ content: '<h1>x</h1>', ttl: '7d', visibility: 'public' });
  });
  it('includes password for password visibility', () => {
    expect(buildDeployPayload({ content: '<h1>x</h1>', ttl: '1h', visibility: 'password', password: 'pw' }))
      .toEqual({ content: '<h1>x</h1>', ttl: '1h', visibility: 'password', password: 'pw' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- web/__tests__/web-helpers`
Expected: FAIL — modules `@/lib/web/errors` etc. not found.

- [ ] **Step 3: Implement `lib/web/errors.ts`**

```typescript
/** Friendly inline messages for the deploy form, keyed by the API's error code. */
const MESSAGES: Record<string, string> = {
  too_large: "That's over the 5 MB limit.",
  live_cap_reached: "You've got 5 live artifacts on this connection — let some expire and try again.",
  rate_limited: 'Too many deploys in a short time — try again in a bit.',
  password_required: 'Enter a password, or switch to public.',
  invalid_ttl: 'Pick a valid expiry.',
  invalid_visibility: 'Pick a valid visibility.',
};

export function deployErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || 'Something went wrong — try again.';
}
```

- [ ] **Step 4: Implement `lib/web/format.ts`**

```typescript
/** "Expires in 7 days" / "Expires in 1 hour" / "Expired" from an ISO timestamp. */
export function humanizeExpiry(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) {
    const h = Math.max(1, hours);
    return `Expires in ${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(hours / 24);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}
```

- [ ] **Step 5: Implement `lib/web/deploy.ts`**

```typescript
export type Ttl = '1h' | '1d' | '7d' | '30d';
export type Visibility = 'public' | 'password';

export interface DeployFormState {
  content: string;
  ttl: Ttl;
  visibility: Visibility;
  password: string;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateDeployInput(s: Pick<DeployFormState, 'content' | 'visibility' | 'password'>): ValidationResult {
  if (!s.content.trim()) return { ok: false, error: 'Paste some HTML first.' };
  if (s.visibility === 'password' && !s.password) return { ok: false, error: 'Enter a password, or switch to public.' };
  return { ok: true };
}

export interface DeployPayload {
  content: string;
  ttl: Ttl;
  visibility: Visibility;
  password?: string;
}

export function buildDeployPayload(s: DeployFormState): DeployPayload {
  const payload: DeployPayload = { content: s.content, ttl: s.ttl, visibility: s.visibility };
  if (s.visibility === 'password' && s.password) payload.password = s.password;
  return payload;
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test -- web/__tests__/web-helpers`
Expected: PASS (all describe blocks green).

- [ ] **Step 7: Type-check + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add lib/web/errors.ts lib/web/format.ts lib/web/deploy.ts lib/web/__tests__/web-helpers.test.ts
git commit -m "feat: pure web helpers (error map, expiry format, deploy payload)"
```

---

## Task 2: Connect-snippet builder (`lib/web/connect.ts`)

**Files:**
- Create: `lib/web/connect.ts`
- Test: `lib/web/__tests__/connect.test.ts`

- [ ] **Step 1: Write the failing test** — create `lib/web/__tests__/connect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildConnectSnippets, PLATFORM_IDS } from '@/lib/web/connect';

const URL = 'https://artifact.host/mcp';

describe('buildConnectSnippets', () => {
  it('returns one entry per known platform', () => {
    const snippets = buildConnectSnippets(URL);
    expect(snippets.map((s) => s.id)).toEqual([...PLATFORM_IDS]);
  });
  it('injects the given MCP URL into every snippet', () => {
    for (const s of buildConnectSnippets(URL)) {
      expect(s.code).toContain(URL);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.step.length).toBeGreaterThan(0);
    }
  });
  it('never contains the dropped stdio shim package', () => {
    for (const s of buildConnectSnippets(URL)) {
      expect(s.code).not.toContain('artifact-host-mcp');
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- web/__tests__/connect`
Expected: FAIL — `@/lib/web/connect` not found.

- [ ] **Step 3: Implement `lib/web/connect.ts`**

```typescript
export const PLATFORM_IDS = ['claude', 'openai', 'cursor', 'vscode', 'windsurf'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface ConnectSnippet {
  id: PlatformId;
  name: string;
  step: string;
  code: string;
}

/**
 * Per-client setup for the REMOTE streamable-HTTP MCP endpoint. OAuth-capable
 * clients take the URL directly; stdio-only clients use `npx mcp-remote <url>`.
 * Mirrors docs/mcp-connect.md. `url` is the live endpoint (…/mcp).
 */
export function buildConnectSnippets(url: string): ConnectSnippet[] {
  return [
    {
      id: 'claude',
      name: 'Claude',
      step: 'Claude Code (terminal) — or add a remote MCP server in Claude Desktop',
      code: [
        `# Claude Code`,
        `claude mcp add --transport http artifact-host ${url}`,
        ``,
        `# Claude Desktop → Settings → Connectors → Add custom (remote) → URL:`,
        `${url}`,
      ].join('\n'),
    },
    {
      id: 'openai',
      name: 'GPT / Codex',
      step: 'Codex CLI (via mcp-remote) or ChatGPT Desktop connectors',
      code: [
        `# Codex CLI`,
        `codex mcp add artifact-host -- npx -y mcp-remote ${url}`,
        ``,
        `# ChatGPT Desktop → Settings → Connectors → Add → URL:`,
        `${url}`,
      ].join('\n'),
    },
    {
      id: 'cursor',
      name: 'Cursor',
      step: 'Add to .cursor/mcp.json',
      code: [
        `{`,
        `  "mcpServers": {`,
        `    "artifact-host": { "url": "${url}" }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
    {
      id: 'vscode',
      name: 'VS Code',
      step: 'Add to .vscode/mcp.json (agent mode)',
      code: [
        `{`,
        `  "servers": {`,
        `    "artifact-host": { "type": "http", "url": "${url}" }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      step: 'Add to ~/.codeium/windsurf/mcp_config.json (via mcp-remote)',
      code: [
        `{`,
        `  "mcpServers": {`,
        `    "artifact-host": { "command": "npx", "args": ["-y", "mcp-remote", "${url}"] }`,
        `  }`,
        `}`,
      ].join('\n'),
    },
  ];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- web/__tests__/connect`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/web/connect.ts lib/web/__tests__/connect.test.ts
git commit -m "feat: per-platform remote MCP connect snippets"
```

---

## Task 3: Brand foundation — layout, tokens, header/footer, shell homepage

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Delete: `app/page.module.css`
- Create: `components/site/Header.tsx`, `components/site/Header.module.css`, `components/site/Footer.tsx`, `components/site/Footer.module.css`, `app/home.module.css`

> No unit test (presentational). Verification is `npm run build` + `tsc`. This task ends with a deployable branded shell (header + hero); the interactive sections land in Tasks 4–6.

- [ ] **Step 1: Replace `app/globals.css`** with brand tokens + base:

```css
:root {
  --ink: #0e0c09;
  --ink-2: #5a5449;
  --ink-3: #a09890;
  --rule: #e2dbd2;
  --bg: #fefdfb;
  --bg-2: #f6f1eb;
  --amber: #b36b20;
  --serif: var(--font-serif), Georgia, serif;
  --mono: var(--font-mono), ui-monospace, monospace;
}

* { box-sizing: border-box; padding: 0; margin: 0; }

html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--mono);
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

a { color: inherit; text-decoration: none; }

:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; border-radius: 2px; }
```

- [ ] **Step 2: Replace `app/layout.tsx`** with brand fonts + metadata:

```tsx
import type { Metadata } from 'next';
import { Lora, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const lora = Lora({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title: 'artifact.host — Share what your AI built',
  description: 'Paste your AI’s HTML, get a live link. One MCP call. Expires when you want.',
  openGraph: {
    title: 'artifact.host',
    description: 'Share what your AI built. One tool call from your agent.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lora.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `components/site/Header.tsx`**

```tsx
import Link from 'next/link';
import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        artifact<span>.host</span>
      </Link>
      <nav className={styles.nav}>
        <Link href="/docs">docs</Link>
        {/* dashboard + sign in are wired in Plan 3b — inert for now. */}
        <span className={styles.inert} aria-disabled="true">dashboard</span>
        <span className={styles.signin} aria-disabled="true">sign in</span>
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Create `components/site/Header.module.css`**

```css
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px; height: 52px;
  border-bottom: 1px solid var(--rule); flex-shrink: 0;
}
.logo { font-family: var(--serif); font-size: 16px; font-weight: 600; font-style: italic; letter-spacing: -.01em; }
.logo span { color: var(--ink-3); font-weight: 500; }
.nav { display: flex; align-items: center; gap: 26px; }
.nav a { font-size: 12px; color: var(--ink-2); letter-spacing: .04em; }
.nav a:hover { color: var(--ink); }
.inert { font-size: 12px; color: var(--ink-3); letter-spacing: .04em; cursor: default; }
.signin {
  font-size: 12px; color: var(--ink-3);
  border: 1px solid var(--rule); padding: 6px 16px; border-radius: 2px;
  letter-spacing: .03em; cursor: default;
}
@media (max-width: 480px) {
  .header { padding: 0 18px; }
  .nav { gap: 14px; }
  .inert { display: none; }
}
```

- [ ] **Step 5: Create `components/site/Footer.tsx` + `Footer.module.css`**

```tsx
import Link from 'next/link';
import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>artifact.host</span>
      <Link href="/docs">docs</Link>
    </footer>
  );
}
```

```css
.footer {
  display: flex; gap: 18px; justify-content: center; align-items: center;
  padding: 22px; border-top: 1px solid var(--rule);
  font-size: 11px; color: var(--ink-3); letter-spacing: .04em; flex-shrink: 0;
}
.footer a:hover { color: var(--ink); }
```

- [ ] **Step 6: Create `app/home.module.css`** (homepage layout used by Tasks 4–6):

```css
.main {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  padding: 52px 24px 100px; width: 100%;
}
.hero { text-align: center; margin-bottom: 40px; max-width: 600px; }
.headline {
  font-family: var(--serif); font-style: italic; font-weight: 600;
  font-size: clamp(34px, 4.4vw, 50px); line-height: 1.08; letter-spacing: -.02em;
  margin-bottom: 16px;
}
.subline {
  font-size: 13px; font-weight: 300; color: var(--ink-2);
  line-height: 1.85; letter-spacing: .02em; max-width: 400px; margin: 0 auto;
}
.sectionLabel {
  font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 13px; text-align: center;
}
.divider { display: flex; align-items: center; gap: 14px; width: 100%; max-width: 620px; margin: 8px 0 20px; }
.dividerLine { flex: 1; height: 1px; background: var(--rule); }
.dividerText { font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3); white-space: nowrap; }
```

- [ ] **Step 7: Replace `app/page.tsx`** with the branded shell (interactive islands added next tasks):

```tsx
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import styles from './home.module.css';

export default function Home() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.headline}>Share what<br />your AI built.</h1>
          <p className={styles.subline}>
            One tool call from your agent. Renders live at a short URL — nothing to install for viewers.
          </p>
        </div>
        {/* CONNECT_PICKER_SLOT (Task 4) */}
        {/* DEPLOY_PANEL_SLOT (Task 6) */}
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 8: Delete the scaffold module CSS**

Run: `git rm app/page.module.css`

- [ ] **Step 9: Build + type-check**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds; `/` renders the branded shell.

- [ ] **Step 10: Commit**

```bash
git add app/layout.tsx app/globals.css app/page.tsx app/home.module.css components/site
git commit -m "feat: branded shell — fonts, tokens, header/footer, hero"
```

---

## Task 4: Connect picker island

**Files:**
- Create: `components/home/PlatformIcon.tsx`, `components/home/ConnectPicker.tsx`, `components/home/ConnectPicker.module.css`, `components/home/ConnectPicker.test.tsx`
- Modify: `app/page.tsx` (mount the island)
- Modify: `package.json` (add dev test deps — done here so the component test runs)

- [ ] **Step 1: Install component-test deps**

Run: `npm install -D @testing-library/react jsdom`
Expected: added to `devDependencies`.

- [ ] **Step 2: Write the failing component test** — `components/home/ConnectPicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConnectPicker } from './ConnectPicker';

afterEach(cleanup);

describe('ConnectPicker', () => {
  it('reveals a platform snippet containing the MCP URL when a tab is clicked', () => {
    render(<ConnectPicker mcpUrl="https://artifact.host/mcp" />);
    // Snippet hidden until a platform is chosen.
    expect(screen.queryByText(/artifact-host/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cursor/ }));
    expect(screen.getByText(/https:\/\/artifact\.host\/mcp/)).toBeTruthy();
  });

  it('toggles the snippet off when the active tab is clicked again', () => {
    render(<ConnectPicker mcpUrl="https://artifact.host/mcp" />);
    const tab = screen.getByRole('button', { name: /Cursor/ });
    fireEvent.click(tab);
    expect(screen.queryByText(/https:\/\/artifact\.host\/mcp/)).toBeTruthy();
    fireEvent.click(tab);
    expect(screen.queryByText(/https:\/\/artifact\.host\/mcp/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- components/home/ConnectPicker`
Expected: FAIL — `./ConnectPicker` not found.

- [ ] **Step 4: Create `components/home/PlatformIcon.tsx`** (license-safe monochrome lettermark tiles; real brand SVGs can replace these later):

```tsx
import type { PlatformId } from '@/lib/web/connect';

const GLYPH: Record<PlatformId, string> = {
  claude: 'C', openai: 'G', cursor: '⌘', vscode: 'V', windsurf: 'W',
};

export function PlatformIcon({ id }: { id: PlatformId }) {
  return (
    <span aria-hidden style={{
      width: 36, height: 36, borderRadius: 8, background: '#fff',
      border: '1px solid var(--rule)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: 'var(--serif)', fontStyle: 'italic',
      fontSize: 17, color: 'var(--ink)',
    }}>{GLYPH[id]}</span>
  );
}
```

- [ ] **Step 5: Create `components/home/ConnectPicker.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { buildConnectSnippets, type PlatformId } from '@/lib/web/connect';
import { PlatformIcon } from './PlatformIcon';
import styles from './ConnectPicker.module.css';

export function ConnectPicker({ mcpUrl }: { mcpUrl: string }) {
  const snippets = useMemo(() => buildConnectSnippets(mcpUrl), [mcpUrl]);
  const [active, setActive] = useState<PlatformId | null>(null);
  const [copied, setCopied] = useState(false);
  const current = snippets.find((s) => s.id === active) ?? null;

  function toggle(id: PlatformId) {
    setCopied(false);
    setActive((prev) => (prev === id ? null : id));
  }
  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Connect your AI assistant</div>
      <div className={styles.tabs}>
        {snippets.map((s) => (
          <button
            key={s.id}
            className={`${styles.tab} ${active === s.id ? styles.activeTab : ''}`}
            onClick={() => toggle(s.id)}
          >
            <PlatformIcon id={s.id} />
            <span className={styles.tabName}>{s.name}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className={styles.snippet}>
          <div className={styles.step}>{current.step}</div>
          <pre className={styles.code}>{current.code}</pre>
          <button className={styles.copy} onClick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `components/home/ConnectPicker.module.css`**

```css
.wrap { width: 100%; max-width: 620px; display: flex; flex-direction: column; align-items: center; margin-bottom: 28px; }
.label { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 13px; }
.tabs { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; width: 100%; }
.tab {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 15px 20px 12px; border: 1px solid var(--rule); border-radius: 4px;
  cursor: pointer; background: transparent; min-width: 90px; transition: border-color .12s, background .12s;
}
.tab:hover { border-color: var(--ink-2); background: var(--bg-2); }
.activeTab { border-color: var(--ink); background: var(--bg-2); }
.tabName { font-size: 11px; color: var(--ink-2); }
.activeTab .tabName { color: var(--ink); }
.snippet { width: 100%; background: #111009; border-radius: 4px; padding: 16px 18px; position: relative; }
.step { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #5a544c; margin-bottom: 12px; padding-right: 60px; }
.code { font-family: var(--mono); font-size: 12.5px; font-weight: 300; color: #cfc9c0; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.copy {
  position: absolute; top: 14px; right: 14px; font-family: var(--mono); font-size: 11px;
  letter-spacing: .06em; text-transform: uppercase; color: #5a544c; border: 1px solid #2c2820;
  border-radius: 2px; padding: 4px 11px; cursor: pointer; background: transparent;
}
.copy:hover { color: #cfc9c0; border-color: #4a4540; }
```

- [ ] **Step 7: Mount in `app/page.tsx`** — replace the `{/* CONNECT_PICKER_SLOT (Task 4) */}` line with:

```tsx
        <ConnectPicker mcpUrl={`${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/mcp`} />
```

Add the import at the top of `app/page.tsx`:

```tsx
import { ConnectPicker } from '@/components/home/ConnectPicker';
```

- [ ] **Step 8: Run the test + build**

Run: `npm test -- components/home/ConnectPicker` → PASS (2 tests).
Run: `npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json components/home/PlatformIcon.tsx components/home/ConnectPicker.tsx components/home/ConnectPicker.module.css components/home/ConnectPicker.test.tsx "app/page.tsx"
git commit -m "feat: connect-your-AI platform picker with remote-MCP snippets"
```

---

## Task 5: Copy + QR primitives

**Files:**
- Create: `components/ui/CopyButton.tsx`, `components/ui/QrCode.tsx`, `components/ui/QrCode.test.tsx`
- Modify: `package.json` (`qrcode`, `@types/qrcode`)

- [ ] **Step 1: Install qrcode**

Run: `npm install qrcode && npm install -D @types/qrcode`
Expected: `qrcode` in deps, types in devDeps.

- [ ] **Step 2: Write the failing test** — `components/ui/QrCode.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QrCode } from './QrCode';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKE') },
}));

afterEach(cleanup);

describe('QrCode', () => {
  it('renders an img with the generated data URL', async () => {
    render(<QrCode value="https://artifact.host/a/x7k2" />);
    await waitFor(() => {
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img.src).toContain('data:image/png;base64,FAKE');
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- components/ui/QrCode`
Expected: FAIL — `./QrCode` not found.

- [ ] **Step 4: Create `components/ui/QrCode.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 132 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0e0c09', light: '#fefdfb' } })
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  if (!src) return null;
  return <img src={src} alt="QR code for the artifact URL" width={size} height={size} />;
}
```

- [ ] **Step 5: Create `components/ui/CopyButton.tsx`**

```tsx
'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'copy', className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — ignore */ }
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? 'copied ✓' : label}
    </button>
  );
}
```

- [ ] **Step 6: Run the test**

Run: `npm test -- components/ui/QrCode` → PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json components/ui/QrCode.tsx components/ui/QrCode.test.tsx components/ui/CopyButton.tsx
git commit -m "feat: CopyButton + client-side QrCode primitives"
```

---

## Task 6: Deploy panel + result card

**Files:**
- Create: `components/home/DeployPanel.tsx`, `components/home/DeployPanel.module.css`, `components/home/ResultCard.tsx`, `components/home/ResultCard.module.css`, `components/home/DeployPanel.test.tsx`
- Modify: `app/page.tsx` (mount the panel + the "or paste" divider)

- [ ] **Step 1: Write the failing component test** — `components/home/DeployPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DeployPanel } from './DeployPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function typeHtml(html: string) {
  const ta = screen.getByPlaceholderText(/Paste your HTML/i);
  fireEvent.change(ta, { target: { value: html } });
}

describe('DeployPanel', () => {
  it('posts the right payload and swaps to the result card on success', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ slug: 'x7k2', url: 'https://artifact.host/a/x7k2', edit_token: 'tok_abc', expires_at: '2099-01-01T00:00:00Z' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    render(<DeployPanel />);
    typeHtml('<h1>hi</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));

    await waitFor(() => expect(screen.getByText(/artifact\.host\/a\/x7k2/)).toBeTruthy());
    expect(screen.getByText(/tok_abc/)).toBeTruthy();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ content: '<h1>hi</h1>', ttl: '7d', visibility: 'public' });
  });

  it('shows a mapped inline error on API failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'too_large', message: 'x' }), { status: 413, headers: { 'content-type': 'application/json' } },
    )));
    render(<DeployPanel />);
    typeHtml('<h1>big</h1>');
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    await waitFor(() => expect(screen.getByText(/over the 5 MB limit/i)).toBeTruthy());
  });

  it('blocks submit with no HTML', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeployPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Deploy artifact/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Paste some HTML first/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/home/DeployPanel`
Expected: FAIL — `./DeployPanel` not found.

- [ ] **Step 3: Create `components/home/ResultCard.tsx`**

```tsx
'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { QrCode } from '@/components/ui/QrCode';
import { humanizeExpiry } from '@/lib/web/format';
import styles from './ResultCard.module.css';

export interface DeployResult {
  url: string;
  slug: string;
  edit_token: string;
  expires_at: string;
}

export function ResultCard({ result, onReset }: { result: DeployResult; onReset: () => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <a className={styles.url} href={result.url} target="_blank" rel="noreferrer">{result.url}</a>
        <CopyButton className={styles.copy} text={result.url} />
      </div>
      <div className={styles.token}>
        <div className={styles.tokenLabel}>Save this edit token — shown once</div>
        <div className={styles.row}>
          <code className={styles.tokenValue}>{result.edit_token}</code>
          <CopyButton className={styles.copy} text={result.edit_token} />
        </div>
      </div>
      <div className={styles.meta}>{humanizeExpiry(result.expires_at)}</div>
      <div className={styles.qr}><QrCode value={result.url} /></div>
      <div className={styles.actions}>
        <a className={styles.view} href={result.url} target="_blank" rel="noreferrer">View artifact →</a>
        <button className={styles.again} onClick={onReset}>Deploy another</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/home/ResultCard.module.css`**

```css
.card { width: 100%; max-width: 620px; background: var(--bg-2); border: 1px solid var(--rule); border-radius: 4px; padding: 22px; }
.row { display: flex; align-items: center; gap: 10px; }
.url { font-size: 14px; color: var(--amber); overflow-wrap: anywhere; }
.copy { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); border: 1px solid var(--rule); background: var(--bg); border-radius: 2px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
.copy:hover { border-color: var(--ink-2); color: var(--ink); }
.token { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--rule); }
.tokenLabel { font-size: 11px; letter-spacing: .04em; color: var(--amber); margin-bottom: 8px; }
.tokenValue { font-size: 13px; color: var(--ink); overflow-wrap: anywhere; }
.meta { margin-top: 14px; font-size: 11px; color: var(--ink-3); letter-spacing: .02em; }
.qr { margin-top: 16px; }
.actions { display: flex; align-items: center; gap: 18px; margin-top: 18px; }
.view { font-family: var(--serif); font-style: italic; font-size: 15px; color: var(--ink); }
.again { font-family: var(--mono); font-size: 12px; color: var(--ink-2); background: none; border: none; cursor: pointer; }
.again:hover { color: var(--ink); }
```

- [ ] **Step 5: Create `components/home/DeployPanel.tsx`**

```tsx
'use client';

import { useState, type KeyboardEvent } from 'react';
import { validateDeployInput, buildDeployPayload, type Ttl, type Visibility } from '@/lib/web/deploy';
import { deployErrorMessage } from '@/lib/web/errors';
import { ResultCard, type DeployResult } from './ResultCard';
import styles from './DeployPanel.module.css';

const TTLS: Ttl[] = ['1h', '1d', '7d', '30d'];

export function DeployPanel() {
  const [content, setContent] = useState('');
  const [ttl, setTtl] = useState<Ttl>('7d');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeployResult | null>(null);

  async function deploy() {
    setError(null);
    const check = validateDeployInput({ content, visibility, password });
    if (!check.ok) { setError(check.error); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildDeployPayload({ content, ttl, visibility, password })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(deployErrorMessage(data?.error)); return; }
      setResult(data as DeployResult);
    } catch {
      setError(deployErrorMessage(undefined));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void deploy(); }
  }

  function reset() {
    setResult(null); setContent(''); setError(null); setPassword('');
  }

  if (result) return <ResultCard result={result} onReset={reset} />;

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <textarea
          className={styles.textarea}
          placeholder="Paste your HTML here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className={styles.hint}>⌘↵ deploy</div>
      </div>

      <div className={styles.opts}>
        {TTLS.map((t) => (
          <button key={t} className={`${styles.pill} ${ttl === t ? styles.on : ''}`} onClick={() => setTtl(t)}>{t}</button>
        ))}
        <div className={styles.optDiv} />
        <button className={`${styles.pill} ${visibility === 'public' ? styles.on : ''}`} onClick={() => setVisibility('public')}>public</button>
        <button className={`${styles.pill} ${visibility === 'password' ? styles.on : ''}`} onClick={() => setVisibility('password')}>password</button>
      </div>

      {visibility === 'password' && (
        <input
          className={styles.password}
          type="password"
          placeholder="Password for viewers"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.deployRow}>
        <button className={styles.deploy} onClick={() => void deploy()} disabled={busy}>
          {busy ? 'Deploying…' : 'Deploy artifact'} <span className={styles.arr}>→</span>
        </button>
        <div className={styles.deployMeta}>
          Returns a live URL + edit token.<br />No account needed.
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `components/home/DeployPanel.module.css`**

```css
.wrap { width: 100%; max-width: 620px; }
.box { background: var(--bg-2); border: 1px solid var(--rule); border-radius: 3px; position: relative; margin-bottom: 13px; }
.box:focus-within { border-color: var(--ink-2); }
.textarea {
  display: block; width: 100%; height: 140px; background: transparent; border: none; outline: none;
  resize: vertical; font-family: var(--mono); font-size: 13px; font-weight: 300; color: var(--ink);
  padding: 15px 16px; line-height: 1.7; caret-color: var(--amber);
}
.textarea::placeholder { color: var(--ink-3); }
.hint { position: absolute; bottom: 11px; right: 11px; font-size: 11px; color: var(--ink-3); background: var(--bg); border: 1px solid var(--rule); border-radius: 2px; padding: 3px 9px; pointer-events: none; }
.opts { display: flex; align-items: center; gap: 7px; margin-bottom: 16px; flex-wrap: wrap; }
.pill { font-family: var(--mono); font-size: 12px; color: var(--ink-2); border: 1px solid var(--rule); border-radius: 999px; padding: 5px 14px; cursor: pointer; background: transparent; }
.pill:hover { border-color: var(--ink-2); color: var(--ink); }
.on { border-color: var(--ink); color: var(--ink); background: var(--bg-2); }
.optDiv { width: 1px; height: 16px; background: var(--rule); margin: 0 2px; }
.password { width: 100%; font-family: var(--mono); font-size: 13px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 3px; background: var(--bg-2); margin-bottom: 16px; outline: none; }
.password:focus { border-color: var(--ink-2); }
.error { font-size: 12px; color: #b00020; margin-bottom: 14px; }
.deployRow { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.deploy { font-family: var(--serif); font-style: italic; font-weight: 600; font-size: 16px; color: var(--bg); background: var(--ink); border: none; border-radius: 3px; padding: 12px 28px; cursor: pointer; display: flex; align-items: center; gap: 9px; }
.deploy:hover { background: #26211c; }
.deploy:disabled { opacity: .6; cursor: default; }
.arr { font-family: var(--mono); font-style: normal; font-weight: 300; font-size: 13px; }
.deployMeta { font-size: 11px; font-weight: 300; color: var(--ink-3); line-height: 1.8; }
```

- [ ] **Step 7: Mount in `app/page.tsx`** — replace the `{/* DEPLOY_PANEL_SLOT (Task 6) */}` line with the divider + panel:

```tsx
        <div className={styles.divider}>
          <div className={styles.dividerLine} />
          <div className={styles.dividerText}>or paste HTML to try it</div>
          <div className={styles.dividerLine} />
        </div>
        <DeployPanel />
```

Add the import to `app/page.tsx`:

```tsx
import { DeployPanel } from '@/components/home/DeployPanel';
```

- [ ] **Step 8: Run tests + build**

Run: `npm test -- components/home/DeployPanel` → PASS (3 tests).
Run: `npm run build` → succeeds.

- [ ] **Step 9: Commit**

```bash
git add components/home/DeployPanel.tsx components/home/DeployPanel.module.css components/home/ResultCard.tsx components/home/ResultCard.module.css components/home/DeployPanel.test.tsx "app/page.tsx"
git commit -m "feat: paste-to-deploy panel with inline result card (URL, edit token, QR)"
```

---

## Task 7: `/docs` page (MCP + REST API)

**Files:**
- Create: `app/docs/page.tsx`, `app/docs/docs.module.css`

> Static content page. Verification: build + the page renders both sections. No unit test (static JSX).

- [ ] **Step 1: Create `app/docs/docs.module.css`**

```css
.main { flex: 1; width: 100%; max-width: 760px; margin: 0 auto; padding: 48px 24px 100px; }
.h1 { font-family: var(--serif); font-style: italic; font-weight: 600; font-size: 30px; margin-bottom: 8px; }
.lede { font-size: 13px; color: var(--ink-2); line-height: 1.8; margin-bottom: 36px; }
.h2 { font-family: var(--serif); font-style: italic; font-size: 21px; margin: 34px 0 12px; }
.p { font-size: 13px; color: var(--ink-2); line-height: 1.85; margin-bottom: 14px; }
.table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 12.5px; }
.table th, .table td { text-align: left; border-bottom: 1px solid var(--rule); padding: 9px 10px; vertical-align: top; }
.table th { color: var(--ink-3); font-weight: 400; letter-spacing: .04em; text-transform: uppercase; font-size: 11px; }
.code { display: block; background: #111009; color: #cfc9c0; border-radius: 4px; padding: 14px 16px; font-size: 12.5px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; margin: 10px 0 20px; }
.tag { font-family: var(--mono); font-size: 12px; color: var(--amber); }
```

- [ ] **Step 2: Create `app/docs/page.tsx`**

```tsx
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import styles from './docs.module.css';

export const metadata = { title: 'Docs — artifact.host' };

const MCP_URL = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/mcp`;

export default function DocsPage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <h1 className={styles.h1}>Docs</h1>
        <p className={styles.lede}>
          Deploy HTML over MCP (from your AI assistant) or directly over the REST API. Anonymous use is
          fully supported via a one-time edit token; no account required.
        </p>

        <h2 className={styles.h2}>Connect over MCP</h2>
        <p className={styles.p}>
          artifact.host exposes a streamable-HTTP MCP endpoint at <span className={styles.tag}>{MCP_URL}</span>.
          Add it as a remote MCP server; stdio-only clients can bridge with <span className={styles.tag}>npx mcp-remote {MCP_URL}</span>.
        </p>
        <table className={styles.table}>
          <thead><tr><th>Tool</th><th>Purpose</th><th>Key inputs</th></tr></thead>
          <tbody>
            <tr><td>deploy_html</td><td>Host an HTML string at a live URL</td><td>html, ttl (1h/1d/7d/30d), visibility (public/password), password?</td></tr>
            <tr><td>update_html</td><td>Replace an artifact’s HTML (same URL, expiry unchanged)</td><td>slug, html, edit_token</td></tr>
            <tr><td>set_visibility</td><td>Make an artifact public or password-protected</td><td>slug, visibility, password?, edit_token</td></tr>
          </tbody>
        </table>

        <h2 className={styles.h2}>REST API</h2>
        <p className={styles.p}><strong>POST /api/deploy</strong> — create an artifact. Body:</p>
        <code className={styles.code}>{`{
  "content": "<!doctype html>…",   // required, ≤ 5 MB
  "ttl": "7d",                      // 1h | 1d | 7d | 30d (default 7d)
  "visibility": "public",           // public | password
  "password": "…"                   // required when visibility = password
}

→ 201 { "slug", "url", "edit_token", "expires_at" }`}</code>
        <p className={styles.p}>
          <strong>PATCH /api/artifacts/&#123;slug&#125;</strong> — update content or visibility. Authorize with the
          edit token via the <span className={styles.tag}>x-edit-token</span> header (or <span className={styles.tag}>edit_token</span> in the body).
        </p>
        <code className={styles.code}>{`// Update content
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "content": "<!doctype html>…" }
→ { "slug", "url", "expires_at" }

// Change visibility
PATCH /api/artifacts/x7k2
x-edit-token: <token>
{ "visibility": "password", "password": "…" }
→ { "ok": true }`}</code>
        <p className={styles.p}>
          Limits: 5 MB per artifact; up to 5 live artifacts per connection (anonymous); expiry is set once at deploy
          and never extended by updates.
        </p>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Build + verify**

Run: `npm run build` → succeeds; `/docs` listed.
Manual: visit `/docs`, confirm both the MCP table and REST API sections render in brand.

- [ ] **Step 4: Commit**

```bash
git add app/docs/page.tsx app/docs/docs.module.css
git commit -m "feat: branded /docs page (MCP tools + REST API reference)"
```

---

## Task 8: OG cards + viewer meta

**Files:**
- Create: `app/a/[slug]/opengraph-image.tsx`, `app/a/[slug]/__tests__/og.test.ts`
- Modify: `app/a/[slug]/page.tsx` (add `generateMetadata` for OG/Twitter tags)

- [ ] **Step 1: Write the failing test** — `app/a/[slug]/__tests__/og.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Stub the data layer so the OG handler doesn't touch Supabase.
vi.mock('@/lib/db/supabase', () => ({ getServiceClient: () => ({}) }));
const findBySlug = vi.fn();
vi.mock('@/lib/db/artifact-repository', () => ({
  SupabaseArtifactRepository: class { findBySlug = findBySlug; },
}));

import Image from '@/app/a/[slug]/opengraph-image';

describe('opengraph-image', () => {
  it('returns an image response for an existing artifact', async () => {
    findBySlug.mockResolvedValueOnce({ title: 'My Chart', expiresAt: new Date(Date.now() + 3_600_000) });
    const res = await Image({ params: Promise.resolve({ slug: 'x7k2' }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('image/');
  });

  it('returns a branded fallback for a missing/expired artifact', async () => {
    findBySlug.mockResolvedValueOnce(null);
    const res = await Image({ params: Promise.resolve({ slug: 'nope' }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('image/');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- a/__tests__/og` (or `npm test -- opengraph`)
Expected: FAIL — `opengraph-image` module not found.

- [ ] **Step 3: Create `app/a/[slug]/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import { getServiceClient } from '@/lib/db/supabase';
import { SupabaseArtifactRepository } from '@/lib/db/artifact-repository';

export const runtime = 'nodejs';
export const alt = 'artifact.host';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function titleFor(slug: string): Promise<string | null> {
  try {
    const repo = new SupabaseArtifactRepository(getServiceClient());
    const rec = await repo.findBySlug(slug);
    if (!rec || rec.expiresAt <= new Date()) return null;
    return rec.title ?? null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = await titleFor(slug);
  const heading = title ?? 'Shared on artifact.host';

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#fefdfb', padding: 80,
      }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#a09890' }}>
          artifact<span style={{ color: '#0e0c09' }}>.host</span>
        </div>
        <div style={{ display: 'flex', fontSize: 64, color: '#0e0c09', lineHeight: 1.1, maxWidth: 1000 }}>
          {heading}
        </div>
        <div style={{ display: 'flex', height: 8, width: 120, background: '#b36b20' }} />
      </div>
    ),
    size,
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- opengraph`
Expected: PASS (2 tests).

> The test only asserts a `Response` with an `image/*` content-type (don't snapshot pixels). **If `ImageResponse` cannot construct under the Vitest node runtime** (Satori/resvg WASM init can fail in test), don't fight it: extract the title/heading resolution into an exported pure helper in the same file —
> ```typescript
> export function resolveHeading(rec: { title: string | null; expiresAt: Date } | null, now: Date = new Date()): string {
>   if (!rec || rec.expiresAt <= now) return 'Shared on artifact.host';
>   return rec.title ?? 'Shared on artifact.host';
> }
> ```
> — have the component use it, and unit-test `resolveHeading` (present title, missing record, expired) instead of constructing the image. Keep one build-level assertion that the route compiles (covered by Step 6's `npm run build`).

- [ ] **Step 5: Add OG/Twitter meta to the viewer** — edit `app/a/[slug]/page.tsx`. Add a `generateMetadata` export above the `Page` component (do not change the existing `Page`):

```tsx
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    robots: { index: false, follow: false },
    openGraph: { images: [`/a/${slug}/opengraph-image`] },
    twitter: { card: 'summary_large_image', images: [`/a/${slug}/opengraph-image`] },
  };
}
```

- [ ] **Step 6: Build + verify**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds; route list includes `/a/[slug]/opengraph-image`.

- [ ] **Step 7: Commit**

```bash
git add "app/a/[slug]/opengraph-image.tsx" "app/a/[slug]/__tests__/og.test.ts" "app/a/[slug]/page.tsx"
git commit -m "feat: branded OG cards for artifacts + viewer social meta"
```

---

## Task 9: Viewer chrome reskin (password gate + not-found)

**Files:**
- Modify: `app/a/[slug]/PasswordForm.tsx`
- Create: `app/a/[slug]/not-found.tsx`, `app/a/[slug]/gate.module.css`

> Presentational. Verification: build + manual. The artifact render (iframe) is unchanged.

- [ ] **Step 1: Create `app/a/[slug]/gate.module.css`**

```css
.wrap { max-width: 380px; margin: 18vh auto; padding: 0 20px; text-align: center; }
.logo { font-family: var(--serif); font-style: italic; font-weight: 600; font-size: 16px; color: var(--ink-3); margin-bottom: 24px; }
.logo b { color: var(--ink); font-weight: 600; }
.h1 { font-family: var(--serif); font-style: italic; font-size: 22px; margin-bottom: 18px; }
.input { width: 100%; font-family: var(--mono); font-size: 14px; padding: 11px 13px; border: 1px solid var(--rule); border-radius: 3px; background: var(--bg-2); outline: none; }
.input:focus { border-color: var(--ink-2); }
.error { color: #b00020; font-size: 12px; margin: 10px 0 0; }
.btn { font-family: var(--serif); font-style: italic; font-weight: 600; font-size: 15px; color: var(--bg); background: var(--ink); border: none; border-radius: 3px; padding: 11px 24px; margin-top: 16px; cursor: pointer; }
.btn:hover { background: #26211c; }
.muted { font-size: 12px; color: var(--ink-3); line-height: 1.8; }
.link { color: var(--amber); }
```

- [ ] **Step 2: Reskin `app/a/[slug]/PasswordForm.tsx`** (keep the same props + POST action):

```tsx
import styles from './gate.module.css';

export function PasswordForm({ slug, error }: { slug: string; error: boolean }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>artifact<b>.host</b></div>
      <h1 className={styles.h1}>This artifact is password-protected</h1>
      <form method="POST" action={`/a/${slug}/password`}>
        <input className={styles.input} type="password" name="password" placeholder="Password" autoFocus />
        {error && <p className={styles.error}>Incorrect password.</p>}
        <div><button className={styles.btn} type="submit">View artifact</button></div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/a/[slug]/not-found.tsx`** (branded 404/expired):

```tsx
import Link from 'next/link';
import styles from './gate.module.css';

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.logo}>artifact<b>.host</b></div>
      <h1 className={styles.h1}>This artifact isn’t here</h1>
      <p className={styles.muted}>
        It may have expired, or the link is wrong. Artifacts are removed when their timer runs out.
      </p>
      <p className={styles.muted} style={{ marginTop: 16 }}>
        <Link className={styles.link} href="/">Deploy a new one →</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Build + verify**

Run: `npm run build` → succeeds.
Manual: a password artifact shows the branded gate; a missing/expired slug shows the branded not-found.

- [ ] **Step 5: Commit**

```bash
git add "app/a/[slug]/PasswordForm.tsx" "app/a/[slug]/not-found.tsx" "app/a/[slug]/gate.module.css"
git commit -m "feat: brand the viewer password gate + not-found/expired pages"
```

---

## Task 10: Full verification, audit pass, docs

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`

- [ ] **Step 1: Full suite + types + build**

Run: `npm test` → all green (the prior suite + the new web-helper, connect, ConnectPicker, QrCode, DeployPanel, and OG tests).
Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds; route list includes `/`, `/docs`, `/a/[slug]`, `/a/[slug]/opengraph-image`.

- [ ] **Step 2: Manual audit checklist (controller, `npm run dev`)**

Verify against the mockup + spec:
- Homepage hero, platform picker (each tab reveals a snippet with the live MCP URL, copy works), paste → deploy → result card (URL/edit-token/QR/expiry), "Deploy another" reset.
- Error path: paste nothing → inline "Paste some HTML first."; a >5 MB paste → "over the 5 MB limit."
- Keyboard: `⌘↵`/`Ctrl+↵` in the textarea deploys; `:focus-visible` rings show on tabbing.
- Mobile ~390px: header doesn't overlap (the inert `dashboard` link hides at ≤480px), picker wraps, panel usable.
- `/docs` renders both sections; viewer password gate + a missing slug both show branded chrome; an artifact link's OG preview (`/a/<slug>/opengraph-image`) returns a branded card.

- [ ] **Step 3: Update `docs/superpowers/HANDOFF.md`** — add under the resume section:

```markdown
## Plan 3a (public web UI) — DONE
Branded shell (Lora + JetBrains Mono), homepage (connect picker + anonymous paste-deploy with inline result card), `/docs` (MCP + REST API), branded OG cards + QR, reskinned viewer gate/not-found. Deploys via the existing `POST /api/deploy`. Auth header links are inert (wired in Plan 3b). New deps: `qrcode`, dev `@testing-library/react` + `jsdom`. Next: Plan 3b (sign-in + dashboard), and the deferred OAuth/domain go-live batch.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/HANDOFF.md
git commit -m "docs: record Plan 3a public web UI complete"
```

---

## Self-Review

**Spec coverage:**
- Branded layout + tokens + fonts → Task 3. ✅
- Homepage hero + per-platform connect picker (corrected remote-HTTP snippets, URL from `APP_BASE_URL`) → Tasks 2, 4. ✅
- Manual paste → anonymous deploy via existing `/api/deploy` → inline result card (URL, edit-token callout, expiry, QR, view, reset) → Tasks 1, 5, 6. ✅
- `/docs` (MCP + REST API) → Task 7. ✅
- OG cards (`next/og`, branded, fallback) + viewer social meta + `noindex` → Task 8. ✅
- QR (client-side `qrcode`) → Tasks 5, 6. ✅
- Viewer chrome reskin (password gate + 404/expired) → Task 9. ✅
- Header with inert dashboard/sign-in → Task 3. ✅
- Error-code → message mapping → Tasks 1, 6. ✅
- Audit fixes (responsive header, `:focus-visible`, real `⌘↵`, self-hosted/lettermark icons, soften "Always free" → "No account needed") → Tasks 3, 4, 6, 10. ✅
- Testing: pure-helper unit tests + component tests (ConnectPicker, DeployPanel, QrCode) + OG route test → Tasks 1, 2, 4, 5, 6, 8. ✅
- View URL stays `/a/[slug]`, API/service untouched → no task changes them. ✅

**Placeholder scan:** No TBD/TODO. Every code step has complete code; the two presentational tasks (3, 9) and the docs page (7) state build/manual verification explicitly because they aren't unit-testable, not as a hand-wave. The `{/* …SLOT */}` comments in Task 3's `page.tsx` are real anchor comments that Tasks 4 and 6 replace with named code.

**Type consistency:** `Ttl`/`Visibility` are defined in `lib/web/deploy.ts` (Task 1) and reused by `DeployPanel` (Task 6). `DeployResult` is defined in `ResultCard.tsx` (Task 6) and consumed by `DeployPanel`. `PlatformId`/`ConnectSnippet`/`buildConnectSnippets` defined in Task 2, consumed by `ConnectPicker`/`PlatformIcon` (Task 4). `deployErrorMessage`, `humanizeExpiry`, `validateDeployInput`, `buildDeployPayload` signatures match their call sites. The `/api/deploy` response shape (`{ slug, url, edit_token, expires_at }`) matches `DeployResult` and the actual route.

**Scope:** One cohesive subsystem (the public, no-auth web UI). Auth/dashboard are explicitly Plan 3b. Appropriately sized for one plan; ten tasks, each independently committable and (where logic exists) tested.
