# Local (Desktop) session — handoff runbook

Everything below needs a **real local machine** and couldn't be done/verified in the remote
cloud session (network egress was locked down, no Docker, no browser, no npm account). Hand
this file to the local Claude Code session (or follow it yourself).

See also [`launch-checklist.md`](./launch-checklist.md) for the parked public/irreversible items.

## Where things stand
- Everything is on **`main`** (`19ddf2f`) — also live on prod (`artifact.host`, Vercel
  auto-deploys from `main`). The `claude/self-hosting-architecture-X0WK8` branch is identical.
  CI is green (unit + API e2e + browser e2e).
- Supabase prod already has the schema changes applied (`api_tokens`, `share_allowlist`,
  widened `visibility` check, RLS enabled).

## Start the local session
In an existing clone, just sync `main`:
```bash
git checkout main
git pull            # → 19ddf2f (or later)
npm ci              # deps changed: better-sqlite3, pg, @playwright/test
```
Prereqs: Node 22, Docker (for Task 2), an npm account (for Task 3, when you choose to publish),
and a **fresh prod Personal API Token** (create at https://artifact.host/dashboard/tokens —
and revoke the one pasted in the previous chat).

---

## Task 1 — Verify the CLOUD instance end-to-end
*(Blocked remotely by egress + no browser. The cloud path differs from self-host only in auth.)*

**1a. Automated cloud e2e (uses a PAT, no browser):**
```bash
npm run build
E2E_BASE_URL=https://artifact.host ARTIFACT_HOST_TOKEN=ah_yourPAT npm run e2e
```
Expected: passes. It creates 1h-TTL artifacts and deletes the ones it owns on teardown (one
anonymous artifact can't be deleted and will expire). Multi-identity restricted checks are
auto-skipped in cloud mode (can't mint OAuth identities) — that's covered manually in 1c.

**1b. The ownership fix (the bug you reported):** sign in to https://artifact.host with Google,
deploy any HTML from the home page → confirm it **appears in `/dashboard`** and shows the
"Saved to your dashboard." line + a `restricted` option.

**1c. Restricted sharing on cloud (the one unverified code path — Supabase `email` claim):**
- Signed in as account A, deploy an artifact, set it **restricted** with an allowlist
  containing account B's email (or a domain).
- In a separate browser/incognito, sign in as **account B** → open the artifact URL → should
  render. Sign in as a **non-listed** account → should be denied. Signed out → should prompt
  sign-in. This confirms `verifyIdentity` resolves the email from the Supabase token.

**1d. CLI browser login against cloud:** `node cli/bin/artifact.js auth login --host https://artifact.host`
→ completes via browser OAuth → then `node cli/bin/artifact.js deploy ./some.html --host https://artifact.host`
and `… list` show the artifact.

## Task 2 — Docker self-host smoke
*(No Docker in the cloud session. Validates the headline self-host path + better-sqlite3 in the standalone build.)*
```bash
cp .env.example .env
# set AUTH_SECRET, COOKIE_SECRET, CRON_SECRET (each: openssl rand -hex 32)
docker compose up -d --build
# open http://localhost:3000 → create an account on /dashboard
# /dashboard/tokens → create a PAT
node cli/bin/artifact.js auth login --with-token <pat> --host http://localhost:3000
node cli/bin/artifact.js deploy ./some.html --host http://localhost:3000   # open the URL
docker compose logs app | grep -i error   # expect none; confirm better-sqlite3 loaded
```
Expected: account creation, owned deploy, and rendering all work with **no Supabase/SMTP**.
Also try `AUTH_PROVIDER=oidc` + Google Workspace vars per `.env.example`/README if you want to
exercise the OIDC path.

## Task 3 — Publish the CLI to npm  🔒 PUBLIC / IRREVERSIBLE
*(Do only when ready. Versions are immutable; unpublish is restricted.)*
```bash
cd cli
# finalize package.json first if not already: name, version, description, repository,
#   keywords, files, bin, license, engines; add an .npmignore if needed
npm pack --dry-run            # REVIEW the exact file list before anything goes out
npm login                     # your account; 2FA recommended
npm publish --access public   # the irreversible step
```
After publishing, confirm `npx artifact-host --help` works (the homepage advertises it).
Optional: add a GitHub release workflow with `npm publish --provenance` for build attestation.
If `artifact-host` is taken, use a scope (e.g. `@yourorg/artifact-host`, still `--access public`).

## Task 4 — Make the GitHub repo public  🔒 PUBLIC / IRREVERSIBLE
GitHub → repo Settings → General → Danger Zone → Change visibility → Public. Do a final pass
that no secrets are committed (`.env*` is gitignored; the CLI/code carry none). Consider
removing `docs/launch-checklist.md` / this file first if you don't want them public.

## Task 5 — Housekeeping
- Revoke the PAT pasted in the earlier chat (`/dashboard/tokens`).
- Optional: bump `actions/checkout` / `actions/setup-node` (Node 20 deprecation warning).
- Merge this branch to `main` (it's only ahead by these docs) if you want them on the default branch.
