import { Site, RateCard, Driver, Vehicle, Trip, Issue, HotJob, Equipment, Operator, PlanRules, Supervisor, SummaryNotes } from "./types";

// ——— Mundra EXIM yard site profile ———
// Destinations = the 4 container terminals + FTWZ (Free Trade Warehousing Zone, now live).
// These are the tiles that show ITVs-deployed + figures on the dashboard.

export const SITE: Site = {
  id: "mundra-exim",
  name: "Mundra EXIM Yard",
  shortName: "Mundra EXIM",
  kind: "internal-transport",
  destinations: [
    { id: "MICT", label: "MICT", kind: "terminal" },
    { id: "T2", label: "T2", kind: "terminal" },
    { id: "CT2", label: "CT2", kind: "terminal" },
    { id: "CT3", label: "CT3", kind: "terminal" },
    { id: "CT4", label: "CT4", kind: "terminal" },
    { id: "FTWZ", label: "FTWZ", kind: "ftwz" },
  ],
  terminals: ["MICT", "T2", "CT2", "CT3", "CT4"],
  monthlyTeuTarget: 40000,
  shiftTeuTarget: 900,
  perItvTeuTarget: 10, // milestone: 10+ TEU in a shift (user-set, more tiers later)
};

// All projects/sites the operator runs. Scalable — add sites here or via the console.
export const SITES: Site[] = [SITE];

// ——— Planning rules (editable in the console; versioned + audited like the rate card) ———
export const PLAN_RULES: PlanRules = {
  version: "v1",
  effectiveFrom: "2026-07-13",
  lanes: [
    { id: "MICT|import", target: "MICT", purpose: "import", label: "MICT · Import", min: 5, max: 20, weight: 1.2, enabled: true },
    { id: "T2|import", target: "T2", purpose: "import", label: "T2 · Import", min: 5, max: 30, weight: 1, enabled: true },
    { id: "CT2|import", target: "CT2", purpose: "import", label: "CT2 · Import", min: 5, max: 30, weight: 1, enabled: true },
    { id: "CT3|import", target: "CT3", purpose: "import", label: "CT3 · Import", min: 10, max: 40, weight: 1.5, enabled: true },
    { id: "CT4|import", target: "CT4", purpose: "import", label: "CT4 · Import", min: 5, max: 25, weight: 1, enabled: true },
    { id: "T2|export", target: "T2", purpose: "export", pickup: "EXIM-1", label: "T2 · Export", min: 4, max: 25, weight: 1, enabled: true },
    { id: "CT4|export", target: "CT4", purpose: "export", pickup: "EXIM-1", label: "CT4 · Export", min: 4, max: 25, weight: 1, enabled: true },
    { id: "FTWZ|ftwz", target: "FTWZ", purpose: "ftwz", label: "FTWZ", min: 2, max: 10, weight: 1, enabled: true },
    { id: "SCAN|scanning", target: "SCAN", purpose: "scanning", label: "Scanning", min: 10, max: 15, weight: 1, enabled: true },
    { id: "CP|check_package", target: "CP", purpose: "check_package", label: "Check package", min: 2, max: 6, weight: 1, enabled: true },
  ],
  vendors: [
    { vendor: "Active", maxSupply: 70, allowed: [] },
    { vendor: "Own", maxSupply: 10, allowed: [] },
  ],
  balanceVendors: true,
  tripEquity: true,
  minimiseChurn: true,
  respectPreferences: true,
};

export const DEFAULT_SUMMARY_NOTES: SummaryNotes = {
  remarks: {},
  yard: {
    "EXPORT - DOC": { c20: 0, c40: 0 },
    "EXPORT - BUFFER": { c20: 0, c40: 0 },
    "CHECK PACKAGE": { c20: 0, c40: 0 },
    "IMPORT": { c20: 0, c40: 0 },
  },
  holds: { terminalHoldMict: "00 TEUs", enBlockLdd: "00 Teus", enBlockMty: "00 Teus" },
  checkPackageTeu: 0,
};

export const RATE_CARD: RateCard = {
  version: "v1 · pilot",
  effectiveFrom: "2026-07-01",
  perTeu: { import: 80, export: 80, scanning: 60, check_package: 60, ftwz: 80 },
  nightMultiplier: 1.2,
  milestoneBonus: 100,
  abortedTripCredit: 40,
};

export const ME_DRIVER_ID = "d-ramesh";
export const ME_VEHICLE_ID = "A333";

export const DRIVERS: Driver[] = [
  { id: ME_DRIVER_ID, name: "Ramesh Yadav", nameHi: "रमेश यादव", phone: "98250 11223", vendor: "Active", onDuty: false, streakDays: 6 },
  { id: "d-sohan", name: "Sohan Bharwad", nameHi: "सोहन भरवाड", phone: "98250 22334", vendor: "Active", onDuty: true, streakDays: 3 },
  { id: "d-imran", name: "Imran Sheikh", nameHi: "इमरान शेख", phone: "98250 33445", vendor: "Active", onDuty: true, streakDays: 11, note: "no MICT (gate pass issue)" },
  { id: "d-kishan", name: "Kishan Desai", nameHi: "किशन देसाई", phone: "98250 44556", vendor: "Active", onDuty: true, streakDays: 1, note: "day shift only" },
  { id: "d-bharat", name: "Bharat Koli", nameHi: "भरत कोली", phone: "98250 55667", vendor: "Active", onDuty: true, streakDays: 8 },
  { id: "d-nasim", name: "Nasim SK", nameHi: "नसीम एसके", phone: "98250 66778", vendor: "Active", onDuty: true, streakDays: 4 },
  { id: "d-vijay", name: "Vijay Rabari", nameHi: "विजय रबारी", phone: "98250 77889", vendor: "Active", onDuty: true, streakDays: 2, note: "scanning preferred" },
  { id: "d-arjun", name: "Arjun Chauhan", nameHi: "अर्जुन चौहान", phone: "98250 88990", vendor: "Active", onDuty: true, streakDays: 5 },
];

export const VEHICLES: Vehicle[] = [
  { id: "A333", tags: [], reg: "GJ12AU8670", vendor: "Active", status: "offline", statusSince: 0, driverId: ME_DRIVER_ID, zone: "Parking" },
  { id: "A157", tags: [], reg: "GJ39T7157", vendor: "Active", status: "standby", statusSince: -7800, statusNote: "CT3 gate · no location parchi", driverId: "d-sohan", zone: "CT3 gate" },
  { id: "A670", tags: ["high-capacity"], preferFor: ["scanning"], reg: "GJ39T7670", vendor: "Active", status: "breakdown", statusSince: -5400, statusNote: "Workshop · clutch, ETA 16:00", driverId: "d-imran", zone: "Workshop" },
  { id: "7118", tags: [], reg: "GJ39T7118", vendor: "Active", status: "diesel", statusSince: -900, statusNote: "Bowser point · #3 in line", driverId: "d-kishan", zone: "Bowser" },
  { id: "A408", tags: ["high-capacity"], preferFor: ["export"], reg: "GJ39T7408", vendor: "Active", status: "running", statusSince: -1100, statusNote: "T2 export · in-terminal", driverId: "d-bharat", zone: "T2" },
  { id: "A144", tags: [], reg: "GJ39T7144", vendor: "Active", status: "no_driver", statusSince: -14000, statusNote: "Parking · driver not reported", driverId: undefined, zone: "Parking" },
  { id: "A142", tags: [], reg: "GJ39T7142", vendor: "Active", status: "running", statusSince: -600, statusNote: "CT3 import · returning", driverId: "d-nasim", zone: "En route" },
  { id: "A198", tags: ["high-capacity"], restrictTo: ["scanning"], reg: "GJ39T7198", vendor: "Active", status: "running", statusSince: -300, statusNote: "Scanning movement", driverId: "d-vijay", zone: "Scan yard" },
  { id: "A225", tags: [], reg: "GJ39T7225", vendor: "Active", status: "running", statusSince: -2400, statusNote: "CT4 import · at gate", driverId: "d-arjun", zone: "CT4 gate" },
];

// Background trips already done this shift (for console numbers & histogram)
let tid = 100;
function doneTrip(vehicleId: string, driverId: string, terminal: string, teu: number, total: number): Trip {
  return {
    id: tid++,
    vehicleId,
    driverId,
    terminal,
    movement: "import",
    state: "completed",
    stateSince: -3600,
    verification: "verified",
    teu,
    boost: 0,
    gateWaitSec: 600 + Math.floor(Math.random() * 1800),
    earnings: { base: total, night: 0, boost: 0, total },
    timeline: [],
  };
}

export const SEED_TRIPS: Trip[] = [
  // Ramesh (me): 4 completed trips → 8 TEU, one 40' trip away from the 10-TEU celebration
  doneTrip("A333", ME_DRIVER_ID, "CT3", 2, 160),
  doneTrip("A333", ME_DRIVER_ID, "CT3", 2, 160),
  doneTrip("A333", ME_DRIVER_ID, "CT4", 2, 160),
  doneTrip("A333", ME_DRIVER_ID, "CT3", 2, 160),
  // others
  doneTrip("A157", "d-sohan", "CT3", 2, 160),
  doneTrip("A157", "d-sohan", "CT3", 1, 80),
  doneTrip("A157", "d-sohan", "CT3", 2, 160),
  doneTrip("A408", "d-bharat", "T2", 2, 160),
  doneTrip("A408", "d-bharat", "T2", 2, 160),
  doneTrip("A408", "d-bharat", "T2", 2, 160),
  doneTrip("A408", "d-bharat", "T2", 2, 160),
  doneTrip("A142", "d-nasim", "CT3", 2, 160),
  doneTrip("A142", "d-nasim", "CT3", 2, 160),
  doneTrip("A198", "d-vijay", "SCAN", 1, 60),
  doneTrip("A198", "d-vijay", "SCAN", 1, 60),
  doneTrip("A198", "d-vijay", "SCAN", 1, 60),
  doneTrip("A225", "d-arjun", "CT4", 2, 160),
  doneTrip("7118", "d-kishan", "CT2", 2, 160),
  doneTrip("7118", "d-kishan", "CT2", 2, 160),
  doneTrip("A670", "d-imran", "MICT", 1, 80),
  doneTrip("A670", "d-imran", "MICT", 1, 80),
];

export const SEED_ISSUES: Issue[] = [
  {
    id: 1,
    type: "excess_standby",
    status: "open",
    raisedBy: "AUTO · GPS",
    owner: "Shift Incharge",
    vehicleId: "A157",
    detail: "CT3 gate · 4 ITVs · 02:10 avg wait · no location parchi issued. Escalate to CT3 Supt at 02:30.",
    openedAt: -1320,
    slaMin: 30,
  },
  {
    id: 2,
    type: "gate_rejected",
    status: "escalated",
    raisedBy: "Driver · Bharat K.",
    owner: "Docs desk",
    vehicleId: "A408",
    detail: "Pre-advice missing on TGBU 501226-4 at CT4 out-gate. Photo attached.",
    openedAt: -3300,
    slaMin: 45,
  },
  {
    id: 3,
    type: "plan_change",
    status: "resolved",
    raisedBy: "Shift Incharge",
    owner: "Shift Incharge",
    detail: "10 ITVs moved CT3 → T2 export at 11:40 (vessel cutoff). Logged vs original plan v2.",
    openedAt: -10800,
    slaMin: 0,
  },
  {
    id: 4,
    type: "breakdown",
    status: "acknowledged",
    raisedBy: "Supervisor · Vansh",
    owner: "Active workshop",
    vehicleId: "A670",
    detail: "Clutch failure. Towed to workshop, ETA back 16:00.",
    openedAt: -5400,
    slaMin: 240,
  },
];

export const HOT_JOBS: HotJob[] = [
  { id: 1, label: "D/O validity today", terminal: "MICT", count: "14 × 20'", deadlineMin: 200, boost: 40, done: 5, total: 14 },
  { id: 2, label: "CMA CGM gate cutoff 20:00", terminal: "CT4", count: "119×20' + 84×40'", deadlineMin: 360, boost: 40, done: 96, total: 203 },
  { id: 3, label: "Export loading", terminal: "T2", count: "60 × 20'", deadlineMin: 420, boost: 0, done: 41, total: 60 },
];

// Deployment plan for the shift (counts, never containers — see design rule)
export const DEPLOYMENT = [
  { movement: "import" as const, itvs: 30, note: "CT3 heavy · MICT D/O first" },
  { movement: "export" as const, itvs: 40, note: "T2 + CT4 cutoffs" },
  { movement: "scanning" as const, itvs: 10, note: "" },
  { movement: "check_package" as const, itvs: 4, note: "" },
];

export const SHIFT = {
  label: "Day shift 08:00–20:00",
  isNight: false,
  itvsAllotted: 85,
  itvsReporting: 73,
  teuDoneBase: 412, // background fleet TEUs at load (mine excluded, added live)
  pendencyStart: 1122,
  pendencyAdd: 191,
};

// ── Equipment & operator masters (seed examples) ──
export const OPERATORS: Operator[] = [
  { id: "op-jignesh", name: "Jignesh Vala", phone: "98250 10101", vendor: "Active", onDuty: true },
  { id: "op-pravin", name: "Pravin Solanki", phone: "98250 20202", vendor: "Galaxy", onDuty: true },
  { id: "op-harish", name: "Harish Bhatt", phone: "98250 30303", vendor: "Active", onDuty: true },
  { id: "op-dilip", name: "Dilip Chauhan", phone: "98250 40404", vendor: "Own", onDuty: false },
];

export const SUPERVISORS: Supervisor[] = [
  { id: "s-vansh", name: "Vansh Mota", phone: "98250 90909", vendor: "Active" },
  { id: "s-kalp", name: "Kalp Thacker", phone: "98250 80808", vendor: "Active" },
];

export const EQUIPMENT: Equipment[] = [
  { id: "RS-04", type: "reach_stacker", reg: "GJ12EQ4001", vendor: "Active", status: "running", statusNote: "Yard 2 · stacking", operatorId: "op-jignesh", zone: "Yard 2", tags: [] },
  { id: "RS-08", type: "reach_stacker", reg: "GJ12EQ4008", vendor: "Galaxy", status: "breakdown", statusNote: "Hydraulic fault · workshop", operatorId: "op-pravin", zone: "Workshop", tags: [] },
  { id: "FL3T-02", type: "forklift_3t", reg: "GJ12EQ5002", vendor: "Active", status: "running", statusNote: "CFS shed", operatorId: "op-harish", zone: "CFS shed", tags: [] },
  { id: "FL5T-01", type: "forklift_5t", reg: "GJ12EQ5101", vendor: "Own", status: "no_operator", zone: "Parking", tags: [] },
  { id: "ECH-01", type: "ech", reg: "GJ12EQ6001", vendor: "Own", status: "standby", statusNote: "Awaiting empty stack job", zone: "Empty yard", tags: [] },
  { id: "ECHSS-01", type: "forklift_side_shifter", reg: "GJ12EQ6501", vendor: "Active", status: "offline", zone: "Parking", tags: [] },
];
