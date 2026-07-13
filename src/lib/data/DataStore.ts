// Backend-agnostic data access. The app ONLY talks to this interface.
// Implementations: localStore (browser), supabaseStore (today), httpStore (future AWS).
// See ../../../../backend-architecture.md

export interface Snapshot {
  rev: number;
  state: unknown; // persistable subset of AppState (no sim-only fields)
}

export interface SaveResult {
  ok: boolean; // false = rev conflict (someone else wrote first) — caller should pull & retry
  rev: number; // authoritative rev after the call
}

export interface DataStore {
  readonly name: string;
  load(siteId: string): Promise<Snapshot | null>;
  save(siteId: string, state: unknown, expectedRev: number): Promise<SaveResult>;
  /** lightweight check for remote changes; returns current rev */
  peekRev(siteId: string): Promise<number | null>;
}
