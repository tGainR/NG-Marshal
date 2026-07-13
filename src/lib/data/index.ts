import { DataStore } from "./DataStore";
import { localStore } from "./localStore";

// Backend selection — the ONLY place the app decides where data lives.
// NEXT_PUBLIC_BACKEND: "local" (default) | "supabase" | "http" (future AWS impl)
export function getDataStore(): DataStore {
  const backend = process.env.NEXT_PUBLIC_BACKEND ?? "local";
  if (backend === "supabase") {
    // lazy require keeps supabase-js out of the bundle in local mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabaseStore } = require("./supabaseStore") as typeof import("./supabaseStore");
    return supabaseStore;
  }
  return localStore;
}
