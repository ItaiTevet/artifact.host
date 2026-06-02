# Web UI — Public Site (Plan 3a) Design Spec

**Date:** 2026-06-02
**Status:** Approved design, ready for implementation planning
**One-line pitch:** *The branded artifact.host front door — paste HTML and get a live link, see how to connect your AI assistant — no account required.*

This is **Plan 3a**, the first half of the web UI. It is the **public, no-auth surface**. Sign-in and the artifact dashboard are **Plan 3b** (a separate spec/plan) and are out of scope here.

> **Why split here:** the public site has **no dependency on the deferred OAuth go-live batch** (custom domain, Supabase OAuth server, Google/GitHub apps). It can be built *and* deployed immediately. The authed dashboard (3b) needs those providers live, so it's verified during that same batch.

---

## Context & goal

The app currently ships an MCP endpoint, a REST API, and an artifact viewer — but the **homepage and root layout are still the Next.js scaffold** (Geist fonts, placeholder copy). The brand (the approved mockup: Lora + JetBrains Mono, warm off-white `#fefdfb`, amber `#b36b20`) is unbuilt.

**Goal:** replace the scaffold with the branded public site — a homepage that (a) shows how to connect an AI assistant over MCP, and (b) lets anyone paste HTML and deploy it anonymously, plus a `/docs` page (MCP + REST API) and a brand-consistent viewer chrome, OG cards, and QR codes. No accounts, no auth UI that does anything yet.

**Reference mockup:** `docs/superpowers/specs/2026-06-01-homepage-mockup.html` (self-tested in browser). The mockup's **connect snippets are outdated** — they use the dropped stdio shim (`npx -y artifact-host-mcp`); this plan replaces them with the real **remote streamable-HTTP** setup.

---

## Scope

**In scope (3a)**
- Branded root layout + design tokens (replace the Geist scaffold) with Lora + JetBrains Mono via `next/font`.
- Homepage: hero, "Connect your AI assistant" per-platform picker with corrected remote-HTTP snippets, manual HTML paste → **anonymous** deploy → inline result card (URL, edit-token, expiry, QR, view).
- `/docs` page: MCP connection guide **and** REST API reference.
- Viewer chrome reskin: password gate + 404/410 states in brand (the rendered artifact HTML is untouched).
- OG cards (`@vercel/og`, branded, not screenshots) + QR codes (client-side).
- Header with `docs` (live) + `dashboard`/`sign in` rendered but **inert** (wired in 3b).
- UI-audit fixes: responsive header ~390px, `:focus-visible`, real `⌘↵` deploy handler, self-hosted platform icons, soften "Always free".

**Out of scope (→ Plan 3b or later)**
- Any working authentication, sign-in flow, or session UI.
- The dashboard (listing/managing your own artifacts).
- Claiming anonymous artifacts into an account.
- Changing the artifact view URL (stays `/a/[slug]`), the API, or the service layer.
- Editing/managing an artifact from the web (beyond what the result card shows once).

---

## Architecture

The homepage is a **server shell** with small **client islands** for interactivity. All mutations go through the **existing, tested `POST /api/deploy`** — no business logic is added in the UI layer (single source of truth preserved).

```
app/
  layout.tsx            REPLACE → Lora + JetBrains Mono (next/font), brand metadata
  globals.css           REPLACE → brand tokens (:root palette), base + :focus-visible
  page.tsx              Homepage server shell: <Header/> + hero + <ConnectPicker/> + divider + <DeployPanel/>
  docs/page.tsx         NEW branded docs: MCP connect guide + REST API reference
  a/[slug]/
    page.tsx            (exists) brand the 404/expired chrome; artifact render unchanged
    PasswordForm.tsx    (exists) reskin to brand
    opengraph-image.tsx NEW @vercel/og branded OG card; robots-allowed
components/
  site/Header.tsx       Logo + nav: docs (live), dashboard/sign-in (inert in 3a)
  site/Footer.tsx       Minimal brand footer
  home/ConnectPicker.tsx  CLIENT: platform tabs → reveal remote-HTTP snippet + copy
  home/connect-data.ts    Per-platform snippet builders (URL injected as arg)
  home/DeployPanel.tsx    CLIENT: paste + TTL/visibility pills + ⌘↵ → POST /api/deploy
  home/ResultCard.tsx     CLIENT: URL+copy, edit-token callout, expiry, QR, view
  ui/CopyButton.tsx       CLIENT: copy-to-clipboard with feedback
  ui/QrCode.tsx           CLIENT: QR from URL (qrcode dep)
lib/web/                  Pure helpers (tested): error-message map, deploy payload, expiry format
```

**Reused as-is:** `POST /api/deploy`, `PATCH /api/artifacts/[slug]`, `lib/artifacts/*`, the viewer render/visibility logic.

**New dependencies:** `qrcode` (small, client-side QR) and dev-only `@testing-library/react` + `jsdom`. OG image rendering uses **`next/og`'s `ImageResponse`**, built into Next 16 (no install). **No CSS framework** — CSS Modules + globals, matching the repo and the mockup.

**MCP URL in snippets** is computed from `APP_BASE_URL`/request origin in the server shell and passed to `ConnectPicker` — never hardcoded — so it's correct on `vercel.app` now and `artifact.host` after the domain batch with no edits.

---

## Components & data flow

**`Header` (server):** wordmark `artifact·host` + nav. `docs` → `/docs`. `dashboard` and `sign in` render with the mockup's styling but are **inert** in 3a (no href/handler; commented "wired in 3b"). Shared by homepage + docs.

**`ConnectPicker` (client):** five platform tabs (Claude, GPT/Codex, Cursor, VS Code, Windsurf). Click toggles that platform's snippet open (mockup's reveal animation); copy button copies raw text. Each snippet shows the correct **remote-HTTP** setup — a direct URL block for OAuth-capable clients and an `npx mcp-remote <url>` fallback for stdio-only ones. The endpoint URL is a prop.

**`DeployPanel` (client):** textarea + TTL pills (`1h/1d/7d/30d`, default `7d`) + visibility pills (`public/password`; `password` reveals a password input). Deploy button and `⌘↵` both submit.

```
paste HTML → pick ttl/visibility(/password) → Deploy (or ⌘↵)
  → POST /api/deploy { content, ttl, visibility, password? }   (existing route)
  → { url, slug, edit_token, expires_at }
  → DeployPanel swaps itself for <ResultCard>
```

**`ResultCard` (client):** replaces the paste zone on success — **URL** + copy, a prominent **"Save this edit token — shown once"** callout + copy, human-readable expiry, **QR** from the URL, a **"View artifact →"** link, and **"Deploy another"** (resets to the paste zone). `CopyButton` + `QrCode` are shared primitives.

The islands hold only UI state; all persistence is the existing API.

---

## OG cards, QR, docs, viewer

**OG cards (`app/a/[slug]/opengraph-image.tsx`):** Next file-based `opengraph-image` convention + `next/og` `ImageResponse`. Renders our **own branded flexbox card** (wordmark + the artifact's `<title>` in Lora + a short snippet + amber accent on the off-white bg) — **not** a screenshot of arbitrary HTML (Satori is flexbox-only; rendering our own JSX is what makes it reliable). CDN-cached → one render per card (crawler traffic only). The viewer `<head>` emits OG/Twitter tags pointing at it; the OG route is **robots-allowed** while the artifact page stays `noindex`. Missing/expired slug → a generic branded fallback card (not an error).

**QR (`components/ui/QrCode.tsx`):** client-side via the `qrcode` package; renders the artifact URL to a canvas/data-URL. Used in `ResultCard` (reused by the 3b dashboard later). No server cost.

**`/docs` (`app/docs/page.tsx`):** static branded page, hand-authored TSX (no MDX dep), two sections kept accurate against the real routes:
- **Connect (MCP):** tools table (`deploy_html`/`update_html`/`set_visibility`), endpoint URL, per-client remote-HTTP setup (mirrors `docs/mcp-connect.md`).
- **REST API:** `POST /api/deploy` and `PATCH /api/artifacts/[slug]` (update / set visibility) — request/response shapes, the edit-token auth note, and limits (5 MB, TTLs, anon cap 5/IP).

**Viewer reskin (`app/a/[slug]/`):** the rendered artifact is untouched (user's own HTML). Branded: the `PasswordForm` gate and the **404 / 410-expired** chrome, so a gated/dead link still looks like artifact.host.

---

## Error handling

`DeployPanel` maps the existing API's structured error codes to friendly **inline** messages (never raw errors):
- **Too large** (>5 MB) → "That's over the 5 MB limit."
- **Rate limited** (anon cap 5 live/IP) → "You've got 5 live artifacts on this connection — let some expire and try again." (the "sign in for more" nudge is added in 3b)
- **Validation** (empty HTML; `password` visibility with no password) → field-level hint; submit blocked client-side before the request.
- **Network/5xx** → "Something went wrong — try again."

Other states: empty textarea disables Deploy; copy/QR failures degrade quietly (QR hides); OG returns the branded fallback for missing/expired; viewer 404/410 are the branded pages.

---

## Testing strategy

Matches the repo's "pure core, thin adapter" style — concentrate tests on logic, keep components thin.

- **Pure-function unit tests (Vitest, no new deps)** in `lib/web/`: API-code→message mapper; deploy payload builder; connect-snippet builder (correct MCP URL injected per platform); expiry humanization.
- **Component tests (`@testing-library/react` + `jsdom`, dev-only):** `DeployPanel` — submit posts the right payload to a mocked `/api/deploy`, swaps to the result card on success, shows the mapped error on failure; `ConnectPicker` — tab toggles the right snippet.
- **OG route test:** `opengraph-image` returns a 200 image for a known slug and the branded fallback for a missing one.
- **Gates:** `tsc --noEmit` + `next build` clean; manual keyboard/`:focus-visible` + ~390px mobile pass against the mockup.

---

## Non-goals (restated)

Working auth / sign-in / sessions · the dashboard · claiming anonymous artifacts · changing the `/a/[slug]` URL, the API, or the service layer · web-based editing · a CSS framework · MDX.

---

## Dependencies on deferred work

None blocking. 3a builds and deploys without the OAuth go-live batch. The header's inert `sign in`/`dashboard` and the "sign in for more" rate-limit nudge are intentionally deferred to 3b, which lands alongside the same auth batch.
