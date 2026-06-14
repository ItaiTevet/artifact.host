import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host build target: a standalone server bundle for the Docker image.
  output: "standalone",
  // Keep the optional SQL drivers external so they aren't bundled (better-sqlite3 is a
  // native addon; pg pulls in optional native bits we don't use).
  serverExternalPackages: ["better-sqlite3", "pg"],
};

export default nextConfig;
