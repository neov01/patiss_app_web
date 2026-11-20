import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Un autre package-lock.json existe dans /Users/willmac : sans racine explicite,
  // Turbopack prend le dossier parent et surveille tout le home, ce qui casse
  // le rechargement à chaud (notamment de globals.css).
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
