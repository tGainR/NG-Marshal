import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DataStore, Snapshot, SaveResult } from "./DataStore";

// Supabase = today's Postgres host. Nothing outside this file imports supabase-js.
// Uses plain table ops on site_state (JSONB + optimistic-lock rev) — portable semantics.

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const supabaseStore: DataStore = {
  name: "supabase",
  async load(siteId: string): Promise<Snapshot | null> {
    const { data, error } = await sb().from("site_state").select("rev,state").eq("site_id", siteId).maybeSingle();
    if (error || !data) return null;
    return { rev: Number(data.rev), state: data.state };
  },
  async save(siteId: string, state: unknown, expectedRev: number): Promise<SaveResult> {
    const next = expectedRev + 1;
    if (expectedRev === 0) {
      // first write: insert (or someone beat us — treat as conflict)
      const { error } = await sb().from("site_state").insert({ site_id: siteId, rev: next, state });
      if (!error) return { ok: true, rev: next };
      // row exists → try optimistic update below
    }
    const { data, error } = await sb()
      .from("site_state")
      .update({ rev: next, state, updated_at: new Date().toISOString() })
      .eq("site_id", siteId)
      .eq("rev", expectedRev) // optimistic lock
      .select("rev");
    if (error || !data || data.length === 0) {
      const cur = await this.peekRev(siteId);
      return { ok: false, rev: cur ?? expectedRev };
    }
    return { ok: true, rev: next };
  },
  async peekRev(siteId: string): Promise<number | null> {
    const { data, error } = await sb().from("site_state").select("rev").eq("site_id", siteId).maybeSingle();
    if (error || !data) return null;
    return Number(data.rev);
  },
};
