// Allocation engine — pure functions, no React/state deps so it stays testable.
//
// The job: match REQUIREMENT (live pendency per lane) to SUPPLY (available ITVs),
// honouring the operator's rules. Two fairness ideas drive the design:
//
//  1. Vendor balance — no single vendor dominates a terminal. Each lane's vendor
//     mix should track that vendor's share of the available fleet.
//  2. Trip equity — drivers earn per TEU, so the lane you're sent to decides what
//     you earn. ITVs with the fewest trips so far get first pick of the lanes that
//     yield the most trips. Equal opportunity, not just gap-filling.
//
// Scanning is the deliberate exception: units restricted to scanning go there first,
// regardless of mix.

import { Assignment, LaneRule, PlanProposal, PlanChange, Vehicle, PlanRules, MovementType } from "./types";

// structural type so we don't couple to the importer module
export interface PoolItem {
  direction?: "import" | "export";
  terminal?: string;
  teu: number;
  scan?: boolean;
  pendencyHrs?: number;
  cutoff?: string;
}

export interface TripLike {
  vehicleId: string;
  terminal: string;
  state: string;
}

export const laneId = (target: string, purpose: MovementType) => `${target}|${purpose}`;

/** Live demand (in TEU) for each lane, read from the imported pool. */
export function laneDemand(lane: LaneRule, pool: PoolItem[]): number {
  const imports = pool.filter((c) => (c.direction ?? "import") === "import");
  switch (lane.purpose) {
    case "scanning":
      return imports.filter((c) => c.scan).reduce((a, c) => a + c.teu, 0);
    case "import":
      return imports.filter((c) => c.terminal === lane.target && !c.scan).reduce((a, c) => a + c.teu, 0);
    case "export":
      return pool.filter((c) => c.direction === "export" && c.terminal === lane.target).reduce((a, c) => a + c.teu, 0);
    default:
      return 0; // ftwz / check_package have no pendency feed — driven by min + weight
  }
}

/** Trips per ITV so far — the basis of trip equity. */
export function tripsByVehicle(trips: TripLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  trips.filter((t) => t.state === "completed").forEach((t) => (out[t.vehicleId] = (out[t.vehicleId] ?? 0) + 1));
  return out;
}

/** How many trips a lane tends to yield per ITV — high-yield lanes are the "good" ones to win. */
export function laneYield(lane: LaneRule, trips: TripLike[]): number {
  const done = trips.filter((t) => t.state === "completed" && t.terminal === lane.target);
  if (done.length === 0) return 1;
  const itvs = new Set(done.map((t) => t.vehicleId)).size || 1;
  return done.length / itvs;
}

function isAvailable(v: Vehicle): boolean {
  return !["breakdown", "no_driver"].includes(v.status);
}

function eligible(v: Vehicle, lane: LaneRule, rules: PlanRules, driverNote?: string): boolean {
  // HARD: unit restricted to certain movements (e.g. scanning-only)
  if (v.restrictTo?.length && !v.restrictTo.includes(lane.purpose)) return false;
  // HARD: driver restriction, e.g. "no MICT"
  if (driverNote && /no\s+([A-Z0-9]+)/i.test(driverNote)) {
    const banned = driverNote.match(/no\s+([A-Z0-9]+)/i)?.[1]?.toUpperCase();
    if (banned && lane.target.toUpperCase() === banned) return false;
  }
  // HARD: vendor may be limited to certain lanes
  const vr = rules.vendors.find((x) => x.vendor.toLowerCase() === v.vendor.toLowerCase());
  if (vr?.allowed.length && !vr.allowed.includes(lane.id)) return false;
  return true;
}

/**
 * Build a proposed allocation. Never mutates state — the planner reviews and applies.
 */
export function buildPlan(args: {
  vehicles: Vehicle[];
  assignments: Record<string, Assignment>;
  pool: PoolItem[];
  trips: TripLike[];
  rules: PlanRules;
  driverNoteFor: (vehicleId: string) => string | undefined;
  vehicleBusy: (vehicleId: string) => boolean; // mid-trip → never reassign
}): PlanProposal {
  const { vehicles, assignments, pool, trips, rules, driverNoteFor, vehicleBusy } = args;
  const lanes = rules.lanes.filter((l) => l.enabled);
  const supply = vehicles.filter((v) => isAvailable(v) && !vehicleBusy(v.id));
  const tripCount = tripsByVehicle(trips);

  // ── 1. demand → target ITV count per lane ──
  const demand: Record<string, number> = {};
  lanes.forEach((l) => (demand[l.id] = laneDemand(l, pool) * l.weight));
  const totalDemand = Object.values(demand).reduce((a, b) => a + b, 0);

  const target: Record<string, number> = {};
  let remaining = supply.length;
  const totalMin = lanes.reduce((a, l) => a + l.min, 0);

  if (totalMin <= supply.length) {
    // comfortable: every lane gets its minimum
    lanes.forEach((l) => {
      target[l.id] = l.min;
      remaining -= l.min;
    });
  } else {
    // SCARCE (the normal case — fewer ITVs than the rules ask for).
    // Don't let the first lanes in the list eat everything: share the shortage
    // proportionally by priority (live demand × weight), so every lane gets a fair cut.
    const prio = (l: LaneRule) => Math.max(demand[l.id], 1) * l.weight;
    const totalPrio = lanes.reduce((a, l) => a + prio(l), 0);
    lanes.forEach((l) => {
      const share = Math.floor((prio(l) / totalPrio) * supply.length);
      target[l.id] = Math.min(l.min, share);
    });
    remaining = supply.length - lanes.reduce((a, l) => a + target[l.id], 0);
    // hand any rounding remainder to the highest-priority lanes
    lanes
      .slice()
      .sort((a, b) => prio(b) - prio(a))
      .forEach((l) => {
        if (remaining <= 0) return;
        if (target[l.id] < Math.min(l.min, l.max)) {
          target[l.id]++;
          remaining--;
        }
      });
  }

  // then proportional to weighted demand, capped
  if (remaining > 0 && totalDemand > 0) {
    lanes
      .slice()
      .sort((a, b) => demand[b.id] - demand[a.id])
      .forEach((l) => {
        if (remaining <= 0) return;
        const share = Math.round((demand[l.id] / totalDemand) * supply.length);
        const room = Math.max(0, Math.min(l.max - target[l.id], share - target[l.id], remaining));
        target[l.id] += room;
        remaining -= room;
      });
  }

  // ── 2. vendor fair share (no domination) ──
  const fleetByVendor: Record<string, number> = {};
  supply.forEach((v) => (fleetByVendor[v.vendor] = (fleetByVendor[v.vendor] ?? 0) + 1));
  const fairShare = (vendor: string) => (fleetByVendor[vendor] ?? 0) / Math.max(1, supply.length);

  // ── 3. assign ──
  const maxTrips = Math.max(1, ...Object.values(tripCount));
  const yields: Record<string, number> = {};
  lanes.forEach((l) => (yields[l.id] = laneYield(l, trips)));
  const maxYield = Math.max(1, ...Object.values(yields));

  const taken = new Set<string>();
  const laneAssigned: Record<string, Vehicle[]> = {};
  lanes.forEach((l) => (laneAssigned[l.id] = []));
  const vendorUsed: Record<string, number> = {};

  // scanning-restricted units first — the deliberate exception to mix-and-match
  const laneOrder = lanes
    .slice()
    .sort((a, b) => {
      const aRestricted = supply.some((v) => v.restrictTo?.length === 1 && v.restrictTo[0] === a.purpose);
      const bRestricted = supply.some((v) => v.restrictTo?.length === 1 && v.restrictTo[0] === b.purpose);
      if (aRestricted !== bRestricted) return aRestricted ? -1 : 1;
      return demand[b.id] - demand[a.id];
    });

  for (const lane of laneOrder) {
    const want = target[lane.id] ?? 0;
    while (laneAssigned[lane.id].length < want) {
      const candidates = supply.filter((v) => {
        if (taken.has(v.id)) return false;
        if (!eligible(v, lane, rules, driverNoteFor(v.id))) return false;
        const vr = rules.vendors.find((x) => x.vendor.toLowerCase() === v.vendor.toLowerCase());
        if (vr && (vendorUsed[v.vendor] ?? 0) >= vr.maxSupply) return false;
        return true;
      });
      if (candidates.length === 0) break;

      const scored = candidates.map((v) => {
        let score = 0;
        // restricted units belong here — strongest pull
        if (v.restrictTo?.includes(lane.purpose)) score += 100;
        // soft preference
        if (rules.respectPreferences && v.preferFor?.includes(lane.purpose)) score += 30;
        // trip equity: fewer trips → first pick of high-yield lanes
        if (rules.tripEquity) {
          const deficit = 1 - (tripCount[v.id] ?? 0) / maxTrips; // 1 = no trips yet
          score += deficit * (yields[lane.id] / maxYield) * 40;
        }
        // vendor balance: penalise a vendor already over its fair share on this lane
        if (rules.balanceVendors) {
          const here = laneAssigned[lane.id].filter((x) => x.vendor === v.vendor).length;
          const laneSize = Math.max(1, laneAssigned[lane.id].length);
          const over = here / laneSize - fairShare(v.vendor);
          score -= Math.max(0, over) * 50;
        }
        // churn: already there → keep
        if (rules.minimiseChurn) {
          const cur = assignments[v.id];
          if (cur && laneId(cur.target, cur.purpose) === lane.id) score += 25;
        }
        return { v, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const pick = scored[0].v;
      taken.add(pick.id);
      laneAssigned[lane.id].push(pick);
      vendorUsed[pick.vendor] = (vendorUsed[pick.vendor] ?? 0) + 1;
    }
  }

  // ── 4. diff + gaps ──
  const changes: PlanChange[] = [];
  const labelOf = (a?: Assignment) => {
    if (!a) return undefined;
    const l = lanes.find((x) => x.id === laneId(a.target, a.purpose));
    return l?.label ?? `${a.target} · ${a.purpose}`;
  };
  lanes.forEach((lane) => {
    laneAssigned[lane.id].forEach((v) => {
      const cur = assignments[v.id];
      if (cur && laneId(cur.target, cur.purpose) === lane.id) return; // already there
      const reasons: string[] = [];
      if (v.restrictTo?.includes(lane.purpose)) reasons.push("restricted unit");
      else if (v.preferFor?.includes(lane.purpose)) reasons.push("preferred");
      if (rules.tripEquity && (tripCount[v.id] ?? 0) === 0) reasons.push("no trips yet");
      changes.push({
        vehicleId: v.id,
        vendor: v.vendor,
        fromLabel: labelOf(cur),
        to: { target: lane.target, purpose: lane.purpose, pickup: lane.pickup },
        toLabel: lane.label,
        reason: reasons.join(" · ") || "demand",
      });
    });
  });

  const gaps: string[] = [];
  lanes.forEach((lane) => {
    const short = (target[lane.id] ?? 0) - laneAssigned[lane.id].length;
    if (short > 0) gaps.push(`${lane.label} short by ${short} — no eligible ITV available`);
  });
  const unassigned = supply.filter((v) => !taken.has(v.id)).length;
  if (unassigned > 0) gaps.push(`${unassigned} ITV${unassigned > 1 ? "s" : ""} left in pool (demand covered)`);

  const perLane = lanes.map((l) => ({
    laneId: l.id,
    label: l.label,
    before: Object.values(assignments).filter((a) => laneId(a.target, a.purpose) === l.id).length,
    after: laneAssigned[l.id].length,
    demandTeu: Math.round(laneDemand(l, pool)),
  }));

  return { changes, gaps, perLane };
}

/** Quick allocate: N ITVs from a vendor to a lane. Returns the vehicle ids chosen. */
export function pickForQuickAllocate(args: {
  vehicles: Vehicle[];
  assignments: Record<string, Assignment>;
  trips: TripLike[];
  vendor: string;
  count: number;
  lane: { target: string; purpose: MovementType };
  driverNoteFor: (vehicleId: string) => string | undefined;
  vehicleBusy: (vehicleId: string) => boolean;
}): { picked: string[]; skipped: string } {
  const { vehicles, assignments, trips, vendor, count, lane, driverNoteFor, vehicleBusy } = args;
  const tripCount = tripsByVehicle(trips);
  const pool = vehicles.filter((v) => {
    if (vendor !== "ALL" && v.vendor.toLowerCase() !== vendor.toLowerCase()) return false;
    if (!isAvailable(v)) return false;
    if (vehicleBusy(v.id)) return false;
    if (v.restrictTo?.length && !v.restrictTo.includes(lane.purpose)) return false;
    const note = driverNoteFor(v.id);
    if (note) {
      const banned = note.match(/no\s+([A-Z0-9]+)/i)?.[1]?.toUpperCase();
      if (banned && lane.target.toUpperCase() === banned) return false;
    }
    // already there? skip — nothing to change
    const cur = assignments[v.id];
    if (cur && cur.target === lane.target && cur.purpose === lane.purpose) return false;
    return true;
  });

  // prefer: units that prefer this movement, then fewest trips (equal opportunity)
  pool.sort((a, b) => {
    const ap = a.preferFor?.includes(lane.purpose) ? 1 : 0;
    const bp = b.preferFor?.includes(lane.purpose) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (tripCount[a.id] ?? 0) - (tripCount[b.id] ?? 0);
  });

  const picked = pool.slice(0, count).map((v) => v.id);
  const short = count - picked.length;
  const skipped = short > 0 ? `only ${picked.length} of ${count} available from ${vendor}` : "";
  return { picked, skipped };
}
