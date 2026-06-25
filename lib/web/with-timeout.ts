/**
 * Resolve with `fallback` if `promise` hasn't settled within `ms`, so a hung
 * dependency (e.g. a Supabase `getSession()` that never returns) can't leave the
 * UI stuck on an infinite "Loading…" spinner. A rejection before the deadline is
 * propagated; the timer is cleared once the promise settles.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(fallback); }
    }, ms);
    promise.then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } },
    );
  });
}
