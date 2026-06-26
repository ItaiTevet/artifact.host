# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in artifact.host, please report it
**privately** rather than opening a public issue.

- Use GitHub's [private vulnerability reporting](https://github.com/ItaiTevet/artifact.host/security/advisories/new)
  ("Report a vulnerability" under the repository's **Security** tab), **or**
- Email the maintainer directly.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (a proof of concept if possible).
- The affected version / commit and deployment mode (self-host or hosted).

We will acknowledge your report as soon as we can, investigate, and keep you
updated on the fix. Please give us a reasonable opportunity to address the issue
before any public disclosure.

## Supported versions

This project is pre-1.0 and moves quickly; security fixes are applied to the
latest `main`. Please make sure you are running an up-to-date build before
reporting.

## Scope

Self-hosters are responsible for their own deployment configuration. In
particular, make sure you set strong, unique values for `AUTH_SECRET`,
`COOKIE_SECRET`, and `CRON_SECRET` (the app refuses to start in production
without them), and serve the app over HTTPS.
