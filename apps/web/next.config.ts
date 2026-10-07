import type { NextConfig } from "next";
const config: NextConfig = {
  experimental: { proxyClientMaxBodySize: "21mb" },
  transpilePackages: ["@obras/ui", "@obras/validation", "@obras/domain"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_INTERNAL_URL ?? "http://localhost:3001"}/api/:path*`,
      },
    ];
  },
};
export default config;
