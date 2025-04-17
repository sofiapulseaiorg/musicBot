import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    runtime: "edge", // enables Edge Runtime
  },
};

export default nextConfig;
