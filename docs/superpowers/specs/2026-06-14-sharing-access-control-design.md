# Per-artifact sharing / access control — design

Status: **designed, not yet built.** Captures the agreed architecture so the future build is
well-specified. Nothing here is wired into the live view path yet (adding `restricted`
enforcement half-way would be a security hole, so it lands as one piece).

## Goal

Let an owner share an artifact with **specific people** (not just public or a shared
password). A recipient proves they're allowed to view by **either**:

- an **OAuth/session identity** whose verified email is on the allowlist — works on cloud
  and self-host, no email sending; **or**
- an **email OTP** (one-time code) for recipients without an account — needs SMTP, so it's a
  cloud / SMTP-configured add-on, off by default on self-host.

Same data model (an allowlist); the verification channel is pluggable. `intezer.com` as a
domain entry on the allowlist is the seed of the future team/org feature.

## Data model

Extend `Visibility` in `lib/artifacts/types.ts`:

```
type Visibility = 'public' | 'password' | 'restricted'   // (+ 'private' = owner-only, optional)
```

New table (both drivers — mirror in `supabase/migrations/000N_artifact_shares.sql` and the
SQLite schema in `lib/db/sqlite.ts`):

```
artifact_shares(
  id, slug -> artifacts(slug) on delete cascade,
  principal       text,                      -- 'alice@intezer.com' or a domain
  principal_type  text check in ('email','domain'),
  created_at
)
```

## Enforcement seam

Generalize the inline visibility check in `viewArtifact` (`lib/artifacts/service.ts`) into a
single function:

```
checkAccess(record, ctx): 'ok' | 'password_required' | 'login_required' | 'denied' | 'not_found'
  ctx = { passwordVerified: boolean; viewerEmail?: string | null }
```

- `public` → ok
- `password` → ok iff `passwordVerified` (unchanged behavior)
- `restricted` → ok iff `viewerEmail` matches an allowlist `email`, or its domain matches a
  `domain` entry; else `login_required` (no viewer) / `denied` (wrong identity)

`viewerEmail` is supplied by the view route from whatever proved the viewer's identity:
- **session**: `AuthProvider.getEmail()` (the signed-in viewer), or
- **OTP grant**: a short-lived signed cookie carrying the verified email.

## Pluggable verification

1. **Session (works everywhere).** Reuse the existing auth providers — the viewer signs in
   (Supabase / local-password / OIDC) and the route reads their verified email. No new infra.

2. **Email OTP (cloud / SMTP only).** A new `Mailer` interface:

   ```
   interface Mailer { send(to: string, subject: string, body: string): Promise<void> }
   ```
   - implementations: SMTP (nodemailer) or a transactional API (Resend/SES). Selected by env;
     **absent/unset → OTP disabled** (self-host default).
   - flow: `POST /a/[slug]/otp/request` (email on allowlist → mail a 6-digit code, store its
     hash + expiry keyed to slug+email) → `POST /a/[slug]/otp/verify` → on success set a signed
     **view-grant cookie** carrying the email.
   - reuse the HMAC-signed, short-TTL cookie pattern in `lib/http/cookies.ts` (today's
     password cookie) — generalize it to also carry the verified email.

## Build order (when scheduled)

1. Schema + `Visibility` extension + `artifact_shares` repository methods (both drivers).
2. `checkAccess()` + route wiring for the **session** path (no SMTP) — ship restricted sharing
   end-to-end here.
3. Owner UI to manage the allowlist on the edit page.
4. `Mailer` + OTP request/verify routes + view-grant cookie — the SMTP-gated add-on.

## Notes / invariants

- Keep the "expiry set once, never extended" invariant; shares don't affect expiry.
- Domain matching is exact on the email's domain (no subdomain wildcarding) and requires a
  verified email (`email_verified` for OIDC; provider-verified for others).
- Design the owner→artifact + allowlist so a future team/org entity can own/share without a
  rewrite (the `domain` principal type is the bridge).
