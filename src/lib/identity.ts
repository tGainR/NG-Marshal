// Device identity — set ONCE at onboarding, then every launch opens the person's
// own view with zero clicks. Role comes from the masters (master control), never
// from a picker. Stored in its OWN localStorage key: identity is per-device and
// must never ride along in the synced site snapshot.

export type MobileRole = "driver" | "operator" | "supervisor";

export interface DeviceIdentity {
  personId: string;
  role: MobileRole;
  name: string;
  nameLocal?: string; // Hindi name where available
  setAt: string; // ISO date
}

const KEY = "ng-marshal-identity-v1";

export function getIdentity(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const id = JSON.parse(raw) as DeviceIdentity;
    return id.personId && id.role ? id : null;
  } catch {
    return null;
  }
}

export function setIdentity(id: DeviceIdentity): void {
  localStorage.setItem(KEY, JSON.stringify(id));
}

export function clearIdentity(): void {
  localStorage.removeItem(KEY);
}

export function roleHome(role: MobileRole): string {
  return role === "driver" ? "/driver" : role === "operator" ? "/operator" : "/supervisor";
}

/** Normalise a phone number for matching: last 10 digits. */
export function normPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits.slice(-10);
}
