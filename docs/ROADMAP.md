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
