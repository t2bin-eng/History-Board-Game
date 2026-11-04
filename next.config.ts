import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/vietnam", destination: "/vietnam-history-map.html" }];
  },
};

export default nextConfig;
