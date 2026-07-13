import { DataStore, Snapshot, SaveResult } from "./DataStore";

// Browser-only store: same behavior as before (per-device), now behind the interface.
const KEY = (siteId: string) => `itv-app-${siteId}-v3`;

export const localStore: DataStore = {
  name: "local",
  async load(siteId: string): Promise<Snapshot | null> {
    try {
      const raw = localStorage.getItem(KEY(siteId));
      if (!raw) return null;
      return JSON.parse(raw) as Snapshot;
    } catch {
      return null;
    }
  },
  async save(siteId: string, state: unknown, expectedRev: number): Promise<SaveResult> {
    const rev = expectedRev + 1;
    try {
      localStorage.setItem(KEY(siteId), JSON.stringify({ rev, state }));
      return { ok: true, rev };
    } catch {
      return { ok: false, rev: expectedRev };
    }
  },
  async peekRev(siteId: string): Promise<number | null> {
    try {
      const raw = localStorage.getItem(KEY(siteId));
      return raw ? (JSON.parse(raw) as Snapshot).rev : null;
    } catch {
      return null;
    }
  },
};
