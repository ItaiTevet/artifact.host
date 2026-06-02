# artifact.host — Roadmap / Future Ideas

Forward-looking ideas not yet scoped into a spec or plan. Each item here is a
candidate for its own brainstorm → spec → plan → build cycle when prioritized.
This file is a backlog, not a commitment; nothing here is in flight.

For active/committed work see `docs/superpowers/specs/` and
`docs/superpowers/plans/`, and the current state in `docs/superpowers/HANDOFF.md`.

---

## Ideas

### 1. More comprehensive analytics
Go beyond the single `view_count` we store today. Possible directions:
- Per-artifact view timeline (views over time, not just a running total).
- Referrer / source breakdown and rough geography.
- Unique vs. total views.
- A per-artifact analytics view in the dashboard, and/or an account-level overview.
- Decide on a privacy-respecting approach (no invasive tracking; aggregate only).

### 2. Sharing permissions & team / collaboration features
Move beyond single-owner artifacts:
- Team / organization accounts with shared ownership of artifacts.
- Granular sharing permissions (view-only, edit, manage) per artifact or per team.
- Inviting collaborators; transferring ownership.
- Likely depends on a richer auth/role model than the current single `owner_id`.

### 3. In-browser visual artifact editing
Let users edit a deployed artifact directly in the browser instead of re-pasting HTML:
- Make the rendered content visually editable (e.g. contenteditable / inline WYSIWYG)
  rather than editing raw HTML in a textarea.
- Live preview and save back through the existing update path.
- Consider guardrails around the 5 MB cap, sanitization, and the
  "expiry set once, never extended" invariant.

### 4. Remove `supabase.co` from the OAuth sign-in screens
Today the Google and GitHub sign-in screens display the Supabase callback domain
(`bjztcxpqchwpdsrgapqp.supabase.co`) — e.g. "to continue to …supabase.co" (Google)
and "Authorizing will redirect to …supabase.co" (GitHub). App-name branding cannot
remove this; the domain is intrinsic to where the OAuth callback physically lives.
- Enable the **Supabase Custom Domain** add-on (paid, ~$10/mo) to serve auth from
  our own domain (e.g. `auth.artifact.host`).
- Re-point the Google + GitHub OAuth app callback URLs and the Supabase URL config
  to the custom auth domain.
- Purely a trust/polish improvement — sign-in is fully functional without it.

### 5. Upload an HTML file instead of pasting
Let users deploy by selecting/dropping an `.html` file rather than pasting into the
textarea:
- File picker + drag-and-drop onto the deploy panel; read the file client-side and
  feed it through the existing deploy path.
- Reuse the current guardrails (5 MB cap, content validation).
- Keep paste as the default; this is an additional input mode, not a replacement.

### 6. Homepage "look and feel" video illustration
The real artifact.host experience happens inside the AI platform (agent calls the MCP
tool, gets back a live link), which the marketing homepage can't currently convey.
Add a short, polished motion illustration of the agent + MCP flow:
- E.g. a Hyperframe-style animated sequence: user asks the AI → agent calls
  `deploy_html` → live URL appears → page renders.
- Goal is to communicate the end-to-end feel without making the visitor leave for an
  AI client.
- Evaluate tooling (Hyperframe / Rive / Lottie / screen-capture) and keep it
  lightweight (lazy-loaded, accessible fallback).

### 7. User-defined artifact title
Today an artifact's `title` is auto-parsed from the HTML `<title>` tag (used for the
OG card and the dashboard list). Let users set or override it explicitly:
- An optional `title` field on the deploy panel and the dashboard edit page.
- An optional `title` parameter on the `deploy_html` / `update_html` MCP tools.
- Fall back to the parsed `<title>` (then a generic default) when none is given.
- Drives the OG card heading and the dashboard list label.
