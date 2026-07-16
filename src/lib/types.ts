// Core domain types — universal core, each site is a project profile (see design docs)

export type MovementType = "import" | "export" | "scanning" | "check_package" | "ftwz";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  import: "Import",
  export: "Export",
  scanning: "Scanning",
  check_package: "Check package",
  ftwz: "FTWZ movement",
};

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

// Roles the product is designed around (driver / supervisor / manager / docs).
// No auth/RBAC wired yet — see TEAM-HANDOFF.md "Auth & roles" for what to build.

// A project/site the operator runs. Mundra EXIM is the first; the model is built to
// scale to other sites (incl. external-transport sites with customer/driver management).
export interface SiteDestination {
  id: string; // "MICT", "FTWZ"
  label: string; // display name
  kind: "terminal" | "ftwz" | "company"; // grouping / dashboard treatment
}

export interface Site {
  id: string;
  name: string;
  shortName: string;
  kind: "internal-transport" | "external-transport";
  destinations: SiteDestination[]; // terminals + FTWZ + (future) companies — the dashboard tiles
  terminals: string[]; // derived: destination ids of kind "terminal" (kept for existing code)
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

// Supervisor master — mobile app identity lookup + approvals attribution.
export interface Supervisor {
  id: string;
  name: string;
  phone: string;
  vendor?: string;
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
  tags: string[]; // free-form, e.g. "high-capacity"
  // Allocation preferences — shown to the planner and honoured by auto-plan.
  restrictTo?: MovementType[]; // HARD: this ITV may ONLY do these movements (e.g. scanning-only units)
  preferFor?: MovementType[]; // SOFT: prefer these, but can be sent elsewhere if needed
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

// ── Equipment (non-ITV yard equipment) ──────────────────────────────────
// Broader than ITVs: reach stackers, forklifts, empty container handlers.
// No GPS/trip state machine yet — tracked by manual daily hours/moves log,
// operator-wise. Same masters pattern as ITV/driver (add, map, edit any day).

export type EquipmentType =
  | "reach_stacker"
  | "forklift_3t"
  | "forklift_5t"
  | "ech" // empty container handler
  | "forklift_side_shifter"; // ECH variant with side-shifter attachment

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  reach_stacker: "Reach Stacker",
  forklift_3t: "Forklift · 3T",
  forklift_5t: "Forklift · 5T",
  ech: "Empty Container Handler",
  forklift_side_shifter: "Forklift · Side Shifter",
};

export type EquipmentStatus = "running" | "standby" | "breakdown" | "no_operator" | "offline";

export interface Operator {
  id: string;
  name: string;
  phone: string;
  vendor: string;
  onDuty: boolean;
  note?: string;
}

export interface Equipment {
  id: string; // asset tag, e.g. RS-04, FL3T-02
  type: EquipmentType;
  reg?: string; // registration / internal asset no
  vendor: string;
  status: EquipmentStatus;
  statusNote?: string;
  operatorId?: string;
  zone: string;
  tags: string[]; // e.g. "yard-2", "reefer-rated"
}

// Manual daily entry — hours run + moves, per equipment per operator.
// This is the equipment-side equivalent of a verified ITV trip: the record
// of truth until real telematics/hour-meter integration exists.
export interface EquipmentLog {
  id: number;
  equipmentId: string;
  operatorId: string;
  date: string; // yyyy-mm-dd
  hours: number;
  moves: number;
  note?: string;
  enteredBy: string;
  enteredAt: number;
}

// ── Planning engine ─────────────────────────────────────────────────────
// A "lane" is one plannable stream: a destination + movement type.
// Rules are edited in the console (versioned + audited, like the rate card) — never in code.

export interface LaneRule {
  id: string; // "CT3|import"
  target: string; // CT3 / FTWZ / SCAN / CP
  purpose: MovementType;
  pickup?: string; // EXIM-1 / EXIM-2 for exports
  label: string; // "CT3 · Import"
  min: number; // never go below this many ITVs
  max: number; // never exceed
  weight: number; // demand multiplier (1 = normal, 1.5 = priority)
  enabled: boolean;
}

export interface VendorRule {
  vendor: string;
  maxSupply: number; // most ITVs this vendor can field
  allowed: string[]; // lane ids this vendor may serve; empty = all
}

export interface PlanRules {
  version: string;
  effectiveFrom: string;
  lanes: LaneRule[];
  vendors: VendorRule[];
  balanceVendors: boolean; // no single vendor dominates a terminal
  tripEquity: boolean; // fewer trips so far → first pick of high-yield lanes
  minimiseChurn: boolean; // keep ITVs where they already are
  respectPreferences: boolean; // honour preferFor (restrictTo is always honoured)
}

export interface PlanChange {
  vehicleId: string;
  vendor: string;
  fromLabel?: string;
  to: Assignment;
  toLabel: string;
  reason: string;
}

export interface PlanProposal {
  changes: PlanChange[];
  gaps: string[]; // honest shortfalls, e.g. "FTWZ short by 1 — no eligible ITV"
  perLane: { laneId: string; label: string; before: number; after: number; demandTeu: number }[];
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
