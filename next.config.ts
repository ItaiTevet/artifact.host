import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host build target: a standalone server bundle for the Docker image.
  output: "standalone",
  // Keep the optional SQL drivers external so they aren't bundled (better-sqlite3 is a
  // native addon; pg pulls in optional native bits we don't use).
  serverExternalPackages: ["better-sqlite3", "pg"],
  // Baseline security headers on every response (OWASP Secure Headers baseline). These are the
  // low-cost, no-breakage ones; a full Content-Security-Policy for the app's own pages is a
  // separate, larger effort and is intentionally not set here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS for two years (Vercel terminates TLS; all subdomains are HTTPS).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Don't let browsers MIME-sniff responses into a different content type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Send the origin (not the full path/query) on cross-origin navigations.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
