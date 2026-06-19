# Launch checklist

Tracks the **public / irreversible** actions to do **last** (only on explicit go, per item),
plus the non-public prep that feeds them. Nothing in the "parked" section happens until
deliberately chosen.

> This file lives in the (currently private) repo. Remove or keep as you like before the repo
> is made public.

## 🔒 Parked — public / irreversible (do last)

- [ ] **Publish the CLI to npm** (`artifact-host`). Claims the global name; versions are
  immutable and unpublish is heavily restricted → effectively irreversible. Needs your npm
  account + 2FA. Run `npm pack` and review the tarball first.
- [ ] **Make the GitHub repo public** (the actual open-sourcing). Anything cloned/cached while
  public can't be fully retracted.
- [ ] *(only meaningful after the two above)* Verify the homepage `npx artifact-host` snippet
  resolves publicly; any external announcement.

## 🧰 Non-public prep (safe to do anytime beforehand)

Feeds the parked items but exposes nothing on its own:

- [ ] CLI publish prep: finalize `cli/package.json` (name, description, repository, keywords,
  `files`, `bin`, license, engines), add `.npmignore`, `npm pack` dry-run review, check name
  availability, optional provenance release workflow (inert until publish).
- [ ] OSS scaffolding: `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, README pass,
  issue/PR templates.
- [ ] Docker self-host smoke: real `docker build` + `docker compose up` boot (needs Docker —
  local machine or a CI job).
- [ ] Cloud e2e against prod with a PAT (`E2E_BASE_URL=https://artifact.host ARTIFACT_HOST_TOKEN=… npm run e2e`).
- [ ] One manual pass of cloud OAuth + CLI `auth login` loopback (needs a browser).

## 🧹 Housekeeping

- [ ] Revoke the Personal API Token pasted in chat (`/dashboard/tokens`).
- [ ] (Optional) bump `actions/checkout` / `setup-node` for the Node 20 deprecation warning.

## 🌟 Optional / future

- [ ] Email-OTP sharing path (needs SMTP / a Mailer).
- [ ] Sharing UX polish: show "restricted" state in the dashboard list; nicer denied page.

---

## Status snapshot (2026-06-15)

Live on prod (`main` = `d34a425`, deployed & READY):
MCP removed → CLI + PATs; pluggable auth (supabase / local-password / OIDC-Google);
SQLite + Postgres + Docker self-host packaging; dashboard token UI; security fixes
(open-redirect, login timing) + RLS enabled; DISABLE_SIGNUP; homepage CLI showcase;
per-artifact sharing (restricted + allowlist); home-deploy ownership fix.
CI green: unit + API e2e (6/6) + browser e2e (2/2).
