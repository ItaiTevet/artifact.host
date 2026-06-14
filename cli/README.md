# artifact-host

Deploy HTML artifacts to [artifact.host](https://artifact.host) — or your own self-hosted
instance — from the command line. No build step, no dependencies; runs anywhere Node ≥ 18 is.

```bash
# sign in (opens your browser)
npx artifact-host auth login

# deploy a file → prints the live URL
npx artifact-host deploy ./index.html --ttl 7d
```

## Commands

| Command | Description |
| --- | --- |
| `auth login [--with-token]` | Sign in via the browser, or paste a Personal API Token |
| `auth logout` | Forget the saved token for a host |
| `auth status` | Show the active host and whether a token is saved |
| `deploy <file> [--ttl 7d] [--visibility public\|password] [--password PW]` | Create an artifact |
| `list` | List your artifacts |
| `update <slug> <file>` | Replace an artifact's HTML (URL and expiry unchanged) |
| `visibility <slug> public\|password [--password PW]` | Change visibility |
| `delete <slug>` | Delete an artifact |

## Self-hosting

Point the CLI at any instance with `--host` (or the `ARTIFACT_HOST_URL` env var):

```bash
npx artifact-host auth login --host https://artifacts.your-co.com
npx artifact-host deploy ./index.html --host https://artifacts.your-co.com
```

## Auth precedence

`ARTIFACT_HOST_TOKEN` (env, ideal for CI) → token saved by `auth login`
(`~/.artifacthost/config.json`, mode `0600`, scoped per host). Anonymous `deploy` works
without auth and returns a one-time edit token; signing in claims ownership instead.
