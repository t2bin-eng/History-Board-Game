import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/vietnam", destination: "/vietnam-history-map.html" },
      { source: "/japan55", destination: "/japan-1955-system.html" },
    ];
  },
};

export default nextConfig;
