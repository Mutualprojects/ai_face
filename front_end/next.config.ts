import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.30.0.190"],

  async rewrites() {
    return [
      {
        source: "/api/whep/:path*",
        destination: "http://localhost:8891/:path*",
      },
    ];
  },
};

export default nextConfig;