import type { CapacitorConfig } from "@capacitor/cli";

// NG Marshal field app — Capacitor wrapper around the static-exported Next.js build.
// The bundled app runs standalone (local demo mode). When the shared backend is
// hosted, point the app at it either via NEXT_PUBLIC_* envs at export time, or by
// switching to a remote `server.url` here and rebuilding.
const config: CapacitorConfig = {
  appId: "com.navingroup.ngmarshal",
  appName: "NG Marshal",
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
};

export default config;
