import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@/lib": path.resolve(__dirname, "lib"),
      "@/types": path.resolve(__dirname, "types"),
      "@/components": path.resolve(__dirname, "src/components"),
      "@/app": path.resolve(__dirname, "src/app"),
    },
  },
};

export default nextConfig;
