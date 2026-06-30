/**
 * Deploy-time policy flags read from the environment.
 *
 * `DISABLE_ANONYMOUS_DEPLOY` requires callers to be signed in (session or Personal API
 * Token) before they can deploy — anonymous, ownerless artifacts are rejected. The hosted
 * cloud build sets this; self-hosters leave it unset (anonymous deploys allowed) or opt in.
 */
export function anonymousDeployDisabled(): boolean {
  const v = process.env.DISABLE_ANONYMOUS_DEPLOY;
  return v === 'true' || v === '1';
}
