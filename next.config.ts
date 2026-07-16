import type { NextConfig } from "next";

// Two build modes:
//  - default: normal server build (web console + /api/ingest) — Vercel/Node hosting
//  - NEXT_OUTPUT=export: static export for the Capacitor mobile app (.apk).
//    scripts/build-apk.sh sets this and temporarily excludes src/app/api
//    (POST route handlers are unsupported in static export).
const isExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
