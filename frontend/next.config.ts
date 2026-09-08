import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: { unoptimized: true },
  devIndicators: false,
};

export default nextConfig;
