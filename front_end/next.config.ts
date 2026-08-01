import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/whep/:path*",
        destination: "http://localhost:8889/:path*",
      },
    ];
  },
};

export default nextConfig;
