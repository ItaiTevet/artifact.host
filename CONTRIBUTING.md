# Contributing to artifact.host

Thanks for your interest in improving artifact.host! Contributions of all
kinds are welcome — bug reports, fixes, docs, and features.

## Getting started

```bash
npm install
npm run dev               # http://localhost:3000
```

The default profile needs **no external services** — SQLite + local
email/password accounts. Copy `.env.example` to `.env` and fill in the secrets
(`AUTH_SECRET`, `COOKIE_SECRET`, `CRON_SECRET` — each `openssl rand -hex 32`).

## Tests

Please make sure the suite is green before opening a PR:

```bash
npm test                       # vitest unit/logic (no credentials needed)
npm run build && npm run e2e   # hermetic HTTP end-to-end (self-host mode)
npm run e2e:browser            # browser end-to-end (Playwright)
```

Testing spans both deployment modes (cloud + self-host) — see
[TESTING.md](TESTING.md) for details.

## Pull requests

1. Fork the repo and create a feature branch off `main`.
2. Keep changes focused; match the style and structure of the surrounding code.
3. Add or update tests for any behavior change.
4. Make sure `npm test` and the e2e suites pass.
5. Write a clear PR description explaining the *why*, not just the *what*.

CI (GitHub Actions) runs the unit tests plus the API and browser e2e suites on
every pull request.

## Reporting bugs & ideas

- **Bugs:** open an issue with steps to reproduce, expected vs. actual behavior,
  and your environment (self-host vs. hosted, DB driver, auth provider).
- **Features / ideas:** check [`docs/ROADMAP.md`](docs/ROADMAP.md) first, then
  open an issue to discuss before starting large work.

## Security

Please do **not** file public issues for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for how to report them privately.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
