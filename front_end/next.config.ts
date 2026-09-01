import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.30.0.190"],

  async rewrites() {
    return [
      {
        source: "/api/whep/:path*",
        destination: "http://localhost:8891/:path*",
      },
      {
        source: "/flask/:path*",
        destination: "http://127.0.0.1:5000/:path*",
      },
      {
        source: "/mtx/:path*",
        destination: "http://127.0.0.1:9997/:path*",
      },
    ];
  },
};

export default nextConfig;