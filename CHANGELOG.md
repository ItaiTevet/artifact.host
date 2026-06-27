# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The `artifact-host` CLI is
versioned independently and published from [`cli/`](cli/); CLI releases are tagged `cli-vX.Y.Z`.

## [Unreleased]

### Security
- Rendered artifacts now carry a Content-Security-Policy that blocks data-exfiltration channels
  (`connect-src`, `form-action`, `base-uri` set to `none`) while leaving resource loading open,
  so interactive artifacts keep working. The artifact iframe sandbox also drops `allow-popups`.
- Added baseline app security headers: `Strict-Transport-Security`, `X-Content-Type-Options`,
  and `Referrer-Policy`.

### Added
- Dependabot configuration for npm (app + CLI) and GitHub Actions dependencies.
- `Release CLI` GitHub Actions workflow: publishing the CLI to npm (with provenance) on a
  `cli-v*` tag.

## [0.1.0]

- Initial release: deploy HTML artifacts from the CLI or browser, visibility controls
  (public / password / restricted), comments, TTL expiry, Personal API Tokens, and a
  self-hostable single-container build.
