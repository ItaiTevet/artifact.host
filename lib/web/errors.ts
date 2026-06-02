/** Friendly inline messages for the deploy form, keyed by the API's error code. */
const MESSAGES: Record<string, string> = {
  too_large: "That's over the 5 MB limit.",
  live_cap_reached: "You've got 5 live artifacts on this connection — let some expire and try again.",
  rate_limited: 'Too many deploys in a short time — try again in a bit.',
  password_required: 'Enter a password, or switch to public.',
  invalid_ttl: 'Pick a valid expiry.',
  invalid_visibility: 'Pick a valid visibility.',
};

export function deployErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || 'Something went wrong — try again.';
}
