/**
 * Read a required secret from the environment, failing closed.
 *
 * In production a missing/short secret throws (so a misconfigured deploy never silently
 * falls back to a guessable default). In non-production a `devFallback` may be supplied so
 * local dev and tests don't need every secret set.
 */
export function requireSecret(
  name: string,
  opts: { minLength?: number; devFallback?: string } = {},
): string {
  const min = opts.minLength ?? 16;
  const v = process.env[name];
  if (v && v.length >= min) return v;
  if (process.env.NODE_ENV !== 'production' && opts.devFallback !== undefined) {
    return opts.devFallback;
  }
  throw new Error(`${name} (>= ${min} chars) is required`);
}
