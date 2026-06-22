import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type safety is enforced via `tsc --noEmit`; linting runs separately in CI.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
