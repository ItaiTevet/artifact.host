import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-host build target: a standalone server bundle for the Docker image.
  output: "standalone",
  // better-sqlite3 is a native addon; keep it external so it isn't bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
