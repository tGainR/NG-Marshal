// Core domain types — universal core, Mundra is a site profile (see design docs)

export type MovementType = "import" | "export" | "scanning" | "check_package";

export type VehicleStatus =
  | "running"
  | "standby"
  | "breakdown"
  | "diesel"
  | "no_driver"
  | "rest"
  | "offline";

export type TripState =
  | "offered"
  | "accepted"
  | "enroute_terminal"
  | "at_gate"
  | "ticket_captured"
  | "gate_out"
  | "at_yard"
  | "completed"
  | "aborted" // gate rejected / wrong container
  | "abandoned";

export type Verification = "provisional" | "verified" | "approved" | "paid";

export type IssueType =
  | "excess_standby"
  | "no_parchi"
  | "gate_rejected"
  | "wrong_container"
  | "breakdown"
  | "diesel"
  | "no_driver"
  | "plan_change"
  | "manual_entry";

export type IssueStatus = "open" | "acknowledged" | "escalated" | "resolved";

export type Role = "driver" | "supervisor" | "manager" | "docs";

export interface Site {
  id: string;
  name: string;
  terminals: string[]; // zone ids of terminal type
  monthlyTeuTarget: number;
  shiftTeuTarget: number;
  perItvTeuTarget: number; // milestone quest threshold
}

export interface RateCard {
  version: string;
  effectiveFrom: string;
  perTeu: Record<MovementType, number>; // ₹ per TEU by movement type
  nightMultiplier: number;
  milestoneBonus: number; // at perItvTeuTarget
  abortedTripCredit: number; // flat ₹ for no-fault aborted trip
}

// Vendor master — "own" = directly-employed drivers/ITVs (incentive tracked the same way,
// but payout responsibility is ours, not a vendor's)
export interface Vendor {
  id: string;
  name: string;
  type: "vendor" | "own";
  contact?: string;
}

export interface Driver {
  id: string;
  name: string;
  nameHi: string;
  phone: string;
  vendor: string;
  onDuty: boolean;
  streakDays: number;
  note?: string; // planner-visible restriction/preference, e.g. "no MICT"
}

// Planner assigns ITV → location/purpose. Import: terminal only (gate gives container).
// Export: pickup yard + destination terminal.
export interface Assignment {
  target: string; // terminal or SCAN
  purpose: MovementType;
  pickup?: string; // EXIM-1 / EXIM-2 for exports
}

export interface Vehicle {
  id: string; // call sign e.g. A333
  reg: string;
  vendor: string;
  status: VehicleStatus;
  statusSince: number; // sim-seconds timestamp
  statusNote?: string;
  driverId?: string;
  zone: string; // current zone label
  tags: string[]; // eligibility, e.g. "scanning-only", "high-capacity"
}

export interface TripEarnings {
  base: number;
  night: number;
  boost: number;
  total: number;
}

export interface Trip {
  id: number;
  vehicleId: string;
  driverId: string;
  terminal: string;
  pickup?: string; // export pickup yard
  movement: MovementType;
  state: TripState;
  stateSince: number;
  verification: Verification;
  containerNo?: string;
  iso?: string; // e.g. 4510 / 2210
  teu: number; // 0 until ticket captured (unless known)
  boost: number; // ₹ premium, 0 if none
  boostReason?: string;
  gateWaitSec: number;
  earnings?: TripEarnings;
  timeline: { at: number; label: string }[];
}

export interface Issue {
  id: number;
  type: IssueType;
  status: IssueStatus;
  raisedBy: string; // "AUTO · GPS" | driver name | supervisor name
  owner: string;
  vehicleId?: string;
  detail: string;
  openedAt: number;
  slaMin: number;
}

export interface HotJob {
  id: number;
  label: string;
  terminal: string;
  count: string; // e.g. "14 × 20'"
  deadlineMin: number; // minutes remaining
  boost: number;
  done: number;
  total: number;
}

export interface Offer {
  terminal: string;
  movement: MovementType;
  pickup?: string; // export pickup yard
  expectedIso: string;
  expectedTeu: number;
  estMin: number;
  boost: number;
  boostReason?: string;
  expiresIn: number; // seconds
}
