"use client";

import React, { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { getDataStore } from "./data";
import type { DataStore } from "./data/DataStore";
import { Assignment, Driver, Equipment, EquipmentLog, Issue, MovementType, Offer, Operator, PlanProposal, PlanRules, RateCard, Site, Trip, Vehicle, Vendor, Verification } from "./types";
import {
  DRIVERS, EQUIPMENT, HOT_JOBS, ME_DRIVER_ID, ME_VEHICLE_ID, OPERATORS, PLAN_RULES, RATE_CARD, SEED_ISSUES,
  SEED_TRIPS, SHIFT, SITE, SITES, VEHICLES,
} from "./seed";
import { buildPlan, pickForQuickAllocate } from "./planner";
import { randomContainer, teuFromIso, tripEarnings } from "./incentive";
import { ImportedContainer, ImportedDriver, ImportedVehicle } from "./importer";

export interface AppState {
  now: number; // sim seconds since load
  drivers: Driver[];
  vehicles: Vehicle[];
  trips: Trip[];
  issues: Issue[];
  assignments: Record<string, Assignment>; // vehicleId → planner assignment
  pool: ImportedContainer[]; // imported container pool (pendency/cutoff files)
  sites: Site[]; // projects/sites the operator runs
  activeSiteId: string; // currently-selected site
  planRules: PlanRules; // allocation rules — editable in console, versioned
  proposal: PlanProposal | null; // auto-plan suggestion awaiting review
  vendors: Vendor[]; // vendor master (incl. "own" for directly-employed)
  equipment: Equipment[]; // yard equipment master (reach stackers, forklifts, ECH...)
  operators: Operator[]; // equipment operator master
  equipmentLogs: EquipmentLog[]; // daily hours/moves entries, operator-wise
  nextLogId: number;
  rateCard: RateCard; // editable settings — drives ALL incentive math
  milestoneTeu: number; // celebration threshold, editable
  offer: Offer | null;
  nextOfferIn: number; // seconds until next offer while idle on duty
  nextTripId: number;
  nextIssueId: number;
  passesThisShift: number;
  milestoneHit: boolean;
  celebration: string | null; // milestone popup payload
  toast: string | null;
}

type Action =
  | { type: "tick" }
  | { type: "goOnDuty" }
  | { type: "goOffDuty" }
  | { type: "acceptOffer" }
  | { type: "passOffer"; reason: string }
  | { type: "snapTicket"; containerNo?: string; iso?: string; hasPhoto?: boolean }
  | { type: "markWaiting"; reason: string }
  | { type: "abandonTrip"; reason: string }
  | { type: "gateRejected" }
  | { type: "approveTrips"; driverId: string }
  | { type: "setIssueStatus"; id: number; status: Issue["status"] }
  | { type: "assignVehicle"; vehicleId: string; assignment: Assignment }
  | { type: "unassignVehicle"; vehicleId: string }
  | { type: "importContainers"; list: ImportedContainer[]; source: string }
  | { type: "importVehicles"; list: ImportedVehicle[] }
  | { type: "importDrivers"; list: ImportedDriver[] }
  | { type: "upsertVendor"; vendor: Vendor }
  | { type: "addVehicle"; id: string; reg: string; vendor: string; tags: string[] }
  | { type: "addDriver"; name: string; phone: string; vendor: string; note?: string }
  | { type: "mapDriver"; vehicleId: string; driverId: string | null }
  | { type: "updateSettings"; rateCard: RateCard; milestoneTeu: number }
  | { type: "setActiveSite"; siteId: string }
  | { type: "quickAllocate"; vendor: string; count: number; target: string; purpose: MovementType; pickup?: string }
  | { type: "setVehiclePrefs"; vehicleId: string; restrictTo?: MovementType[]; preferFor?: MovementType[] }
  | { type: "suggestPlan" }
  | { type: "applyProposal" }
  | { type: "discardProposal" }
  | { type: "updatePlanRules"; rules: PlanRules }
  | { type: "addSite"; site: Site }
  | { type: "addEquipment"; id: string; equipType: Equipment["type"]; reg: string; vendor: string }
  | { type: "addOperator"; name: string; phone: string; vendor: string }
  | { type: "mapOperator"; equipmentId: string; operatorId: string | null }
  | { type: "logEquipmentUsage"; equipmentId: string; operatorId: string; date: string; hours: number; moves: number; note?: string; enteredBy: string }
  | { type: "hydrate"; state: Partial<AppState>; quiet?: boolean }
  | { type: "resetDemo" }
  | { type: "clearCelebration" }
  | { type: "clearToast" };

function boostFor(target: string, movement: MovementType): { boost: number; reason?: string } {
  if (target === "MICT") return { boost: 40, reason: "D/O today" };
  if (target === "CT4" && movement === "export") return { boost: 40, reason: "Gate cutoff 20:00" };
  if (movement === "scanning") return { boost: 25, reason: "Scanning premium" };
  return { boost: 0 };
}

function makeOffer(now: number, assigned?: Assignment): Offer {
  if (assigned) {
    // planner assigned this ITV — the offer reflects the assignment
    const iso = Math.random() < 0.45 ? "4510" : "2210";
    const { boost, reason } = boostFor(assigned.target, assigned.purpose);
    return {
      terminal: assigned.target,
      movement: assigned.purpose,
      pickup: assigned.pickup,
      expectedIso: iso,
      expectedTeu: teuFromIso(iso),
      estMin: 45 + Math.floor(Math.random() * 25),
      boost,
      boostReason: reason,
      expiresIn: 60,
    };
  }
  const pool = [
    { terminal: "CT3", movement: "import" as const, boost: 0, boostReason: undefined },
    { terminal: "MICT", movement: "import" as const, boost: 40, boostReason: "D/O today" },
    { terminal: "T2", movement: "export" as const, boost: 0, boostReason: undefined },
    { terminal: "CT4", movement: "export" as const, boost: 40, boostReason: "Gate cutoff 20:00" },
    { terminal: "SCAN", movement: "scanning" as const, boost: 25, boostReason: "Scanning premium" },
  ];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const iso = Math.random() < 0.45 ? "4510" : "2210";
  return {
    terminal: pick.terminal,
    movement: pick.movement,
    expectedIso: iso,
    expectedTeu: teuFromIso(iso),
    estMin: 45 + Math.floor(Math.random() * 25),
    boost: pick.boost,
    boostReason: pick.boostReason,
    expiresIn: 60,
  };
}

function myActiveTrip(s: AppState): Trip | undefined {
  return s.trips.find(
    (t) =>
      t.driverId === ME_DRIVER_ID &&
      !["completed", "aborted", "abandoned"].includes(t.state)
  );
}

function setVehicle(s: AppState, id: string, patch: Partial<Vehicle>): Vehicle[] {
  return s.vehicles.map((v) => (v.id === id ? { ...v, ...patch, statusSince: patch.status && patch.status !== v.status ? s.now : v.statusSince } : v));
}

function advanceMyTrip(s: AppState): AppState {
  const t = myActiveTrip(s);
  if (!t) return s;
  const dwell = s.now - t.stateSince;
  const patchTrip = (p: Partial<Trip>, label?: string): AppState => ({
    ...s,
    trips: s.trips.map((x) =>
      x.id === t.id
        ? { ...x, ...p, stateSince: s.now, timeline: label ? [...x.timeline, { at: s.now, label }] : x.timeline }
        : x
    ),
  });

  switch (t.state) {
    case "enroute_terminal":
      if (dwell >= 6) {
        const s2 = patchTrip({ state: "at_gate" }, `Reached ${t.terminal} gate (geofence)`);
        return { ...s2, vehicles: setVehicle(s2, ME_VEHICLE_ID, { zone: `${t.terminal} gate`, statusNote: `${t.terminal} ${t.movement} · at gate` }) };
      }
      return s;
    case "at_gate": {
      // queue timer accrues; auto-raise standby issue at 30 sim-min (we use 45s for demo)
      const s2: AppState = {
        ...s,
        trips: s.trips.map((x) => (x.id === t.id ? { ...x, gateWaitSec: x.gateWaitSec + 1 } : x)),
      };
      if (t.gateWaitSec === 45) {
        const issue: Issue = {
          id: s.nextIssueId,
          type: "excess_standby",
          status: "open",
          raisedBy: "AUTO · GPS",
          owner: "Shift Incharge",
          vehicleId: ME_VEHICLE_ID,
          detail: `${t.terminal} gate · A333 queued beyond threshold · no-fault clock running`,
          openedAt: s.now,
          slaMin: 30,
        };
        return { ...s2, issues: [issue, ...s2.issues], nextIssueId: s.nextIssueId + 1, toast: "Standby threshold — issue auto-raised, no-fault clock ✓" };
      }
      return s2;
    }
    case "ticket_captured":
      if (dwell >= 5) {
        const s2 = patchTrip({ state: "gate_out" }, "Gate out (geofence)");
        return { ...s2, vehicles: setVehicle(s2, ME_VEHICLE_ID, { zone: "En route", statusNote: `${t.terminal} → EXIM · loaded` }) };
      }
      return s;
    case "gate_out":
      if (dwell >= 6) {
        const s2 = patchTrip({ state: "at_yard" }, "Reached EXIM yard (geofence)");
        return { ...s2, vehicles: setVehicle(s2, ME_VEHICLE_ID, { zone: "EXIM yard", statusNote: "Offloading" }) };
      }
      return s;
    case "at_yard":
      if (dwell >= 4) {
        // yard record matches ticket → verified
        const earnings = tripEarnings(s.rateCard, t.movement, t.teu, t.boost, SHIFT.isNight);
        let s2 = patchTrip(
          { state: "completed", verification: "verified" as Verification, earnings },
          "Yard record matched → VERIFIED"
        );
        s2 = { ...s2, vehicles: setVehicle(s2, ME_VEHICLE_ID, { zone: "EXIM yard", statusNote: "Free · awaiting job" }) };
        // milestone check
        const myTeu = s2.trips
          .filter((x) => x.driverId === ME_DRIVER_ID && x.state === "completed")
          .reduce((a, x) => a + x.teu, 0);
        if (!s2.milestoneHit && myTeu >= s2.milestoneTeu) {
          return { ...s2, milestoneHit: true, nextOfferIn: 8, celebration: `${myTeu}`, toast: null };
        }
        return { ...s2, nextOfferIn: 8, toast: `Trip verified ✓ +₹${earnings.total}` };
      }
      return s;
    default:
      return s;
  }
}

function backgroundSim(s: AppState): AppState {
  // Every ~10s something small happens in the background fleet
  if (s.now % 10 !== 0) return s;
  const r = Math.random();
  if (r < 0.5) {
    // a background running vehicle completes a trip (adds to shift TEUs via trips list)
    const candidates = s.vehicles.filter((v) => v.status === "running" && v.id !== ME_VEHICLE_ID && v.driverId);
    if (candidates.length) {
      const v = candidates[Math.floor(Math.random() * candidates.length)];
      const iso = Math.random() < 0.45 ? "4510" : "2210";
      const teu = teuFromIso(iso);
      const movement = v.zone.includes("Scan") ? ("scanning" as const) : ("import" as const);
      const earnings = tripEarnings(s.rateCard, movement, teu, 0, SHIFT.isNight);
      const trip: Trip = {
        id: s.nextTripId,
        vehicleId: v.id,
        driverId: v.driverId!,
        terminal: v.zone.replace(" gate", "").replace("En route", "CT3"),
        movement,
        state: "completed",
        stateSince: s.now,
        verification: "verified",
        teu,
        boost: 0,
        gateWaitSec: 300 + Math.floor(Math.random() * 1500),
        earnings,
        timeline: [],
      };
      return { ...s, trips: [...s.trips, trip], nextTripId: s.nextTripId + 1 };
    }
  } else if (r < 0.65) {
    // diesel queue clears
    const v = s.vehicles.find((x) => x.status === "diesel");
    if (v) return { ...s, vehicles: setVehicle(s, v.id, { status: "running", statusNote: "Back from bowser", zone: "En route" }) };
  }
  return s;
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "tick": {
      let s2: AppState = { ...s, now: s.now + 1 };
      // offer countdown
      if (s2.offer) {
        const left = s2.offer.expiresIn - 1;
        if (left <= 0) {
          s2 = { ...s2, offer: null, nextOfferIn: 15, passesThisShift: s2.passesThisShift + 1, toast: "Offer timed out — logged as pass" };
        } else {
          s2 = { ...s2, offer: { ...s2.offer, expiresIn: left } };
        }
      } else {
        const me = s2.drivers.find((d) => d.id === ME_DRIVER_ID)!;
        if (me.onDuty && !myActiveTrip(s2)) {
          if (s2.nextOfferIn > 0) {
            s2 = { ...s2, nextOfferIn: s2.nextOfferIn - 1 };
            if (s2.nextOfferIn === 0) s2 = { ...s2, offer: makeOffer(s2.now, s2.assignments[ME_VEHICLE_ID]) };
          }
        }
      }
      s2 = advanceMyTrip(s2);
      s2 = backgroundSim(s2);
      return s2;
    }

    case "goOnDuty": {
      const s2: AppState = {
        ...s,
        drivers: s.drivers.map((d) => (d.id === ME_DRIVER_ID ? { ...d, onDuty: true } : d)),
        vehicles: setVehicle(s, ME_VEHICLE_ID, { status: "running", driverId: ME_DRIVER_ID, zone: "EXIM yard", statusNote: "On duty · awaiting job" }),
        nextOfferIn: 4,
        toast: "On duty · ITV A333 claimed ✓",
      };
      return s2;
    }

    case "goOffDuty":
      return {
        ...s,
        drivers: s.drivers.map((d) => (d.id === ME_DRIVER_ID ? { ...d, onDuty: false } : d)),
        vehicles: setVehicle(s, ME_VEHICLE_ID, { status: "offline", statusNote: "Shift ended", zone: "Parking" }),
        offer: null,
      };

    case "acceptOffer": {
      if (!s.offer) return s;
      const o = s.offer;
      const trip: Trip = {
        id: s.nextTripId,
        vehicleId: ME_VEHICLE_ID,
        driverId: ME_DRIVER_ID,
        terminal: o.terminal,
        pickup: o.pickup,
        movement: o.movement,
        state: "enroute_terminal",
        stateSince: s.now,
        verification: "provisional",
        teu: 0, // bound at ticket capture
        boost: o.boost,
        boostReason: o.boostReason,
        gateWaitSec: 0,
        timeline: [{ at: s.now, label: `Accepted ${o.terminal} ${o.movement} (offer)` }],
      };
      return {
        ...s,
        offer: null,
        trips: [...s.trips, trip],
        nextTripId: s.nextTripId + 1,
        vehicles: setVehicle(s, ME_VEHICLE_ID, { zone: "En route", statusNote: `→ ${o.terminal} · ${o.movement}` }),
      };
    }

    case "passOffer":
      return {
        ...s,
        offer: null,
        nextOfferIn: 12,
        passesThisShift: s.passesThisShift + 1,
        toast: `Passed (${a.reason}) — logged, no penalty. ${s.passesThisShift + 1}/3 this shift`,
      };

    case "snapTicket": {
      const t = myActiveTrip(s);
      if (!t || t.state !== "at_gate") return s;
      // typed entry wins; otherwise OCR stub (random valid container) until real OCR is trained
      const { containerNo, iso } = a.containerNo && a.iso ? { containerNo: a.containerNo, iso: a.iso } : randomContainer();
      const teu = teuFromIso(iso);
      return {
        ...s,
        trips: s.trips.map((x) =>
          x.id === t.id
            ? {
                ...x,
                state: "ticket_captured",
                stateSince: s.now,
                containerNo,
                iso,
                teu,
                timeline: [...x.timeline, { at: s.now, label: `Ticket OCR: ${containerNo} · ${iso} = ${teu} TEU ✓ (check digit valid)` }],
              }
            : x
        ),
        toast: `Ticket read ✓ ${containerNo} · ${teu} TEU`,
      };
    }

    case "markWaiting": {
      const t = myActiveTrip(s);
      const issue: Issue = {
        id: s.nextIssueId,
        type: a.reason === "no parchi" ? "no_parchi" : "excess_standby",
        status: "open",
        raisedBy: "Driver · Ramesh Y.",
        owner: "Shift Incharge",
        vehicleId: ME_VEHICLE_ID,
        detail: `Driver flagged waiting${t ? ` at ${t.terminal}` : ""} · reason: ${a.reason}`,
        openedAt: s.now,
        slaMin: 30,
      };
      return { ...s, issues: [issue, ...s.issues], nextIssueId: s.nextIssueId + 1, toast: "Waiting logged — no-fault clock ✓" };
    }

    case "abandonTrip": {
      const t = myActiveTrip(s);
      if (!t) return s;
      const issue: Issue = {
        id: s.nextIssueId,
        type: "excess_standby",
        status: "open",
        raisedBy: "Driver · Ramesh Y.",
        owner: "Shift Incharge",
        vehicleId: ME_VEHICLE_ID,
        detail: `Trip abandoned at ${t.terminal} · reason: ${a.reason} · declared (not hidden)`,
        openedAt: s.now,
        slaMin: 30,
      };
      return {
        ...s,
        trips: s.trips.map((x) => (x.id === t.id ? { ...x, state: "abandoned", stateSince: s.now } : x)),
        issues: [issue, ...s.issues],
        nextIssueId: s.nextIssueId + 1,
        nextOfferIn: 10,
        vehicles: setVehicle(s, ME_VEHICLE_ID, { zone: "En route", statusNote: "Returning empty · abandoned" }),
        toast: "Abandon logged with reason — supervisor notified",
      };
    }

    case "gateRejected": {
      const t = myActiveTrip(s);
      if (!t) return s;
      const credit = s.rateCard.abortedTripCredit;
      const issue: Issue = {
        id: s.nextIssueId,
        type: "gate_rejected",
        status: "open",
        raisedBy: "Driver · Ramesh Y.",
        owner: "Docs desk",
        vehicleId: ME_VEHICLE_ID,
        detail: `Gate rejected at ${t.terminal} (pre-advice/wrong container) · photo attached · partial credit ₹${credit}`,
        openedAt: s.now,
        slaMin: 45,
      };
      return {
        ...s,
        trips: s.trips.map((x) =>
          x.id === t.id
            ? { ...x, state: "aborted", stateSince: s.now, earnings: { base: 0, night: 0, boost: 0, total: credit }, verification: "verified" }
            : x
        ),
        issues: [issue, ...s.issues],
        nextIssueId: s.nextIssueId + 1,
        nextOfferIn: 10,
        vehicles: setVehicle(s, ME_VEHICLE_ID, { zone: "En route", statusNote: "Returning · gate rejected" }),
        toast: `Gate rejection logged — not your fault, ₹${credit} partial credit`,
      };
    }

    case "approveTrips":
      return {
        ...s,
        trips: s.trips.map((t) =>
          t.driverId === a.driverId && t.verification === "verified" && t.state === "completed"
            ? { ...t, verification: "approved" }
            : t
        ),
        toast: "Shift trips approved — statement released to driver",
      };

    case "setIssueStatus":
      return { ...s, issues: s.issues.map((i) => (i.id === a.id ? { ...i, status: a.status } : i)) };

    case "assignVehicle": {
      const asg = a.assignment;
      const isMe = a.vehicleId === ME_VEHICLE_ID;
      return {
        ...s,
        assignments: { ...s.assignments, [a.vehicleId]: asg },
        // assignment changes are auditable plan changes
        issues: [
          {
            id: s.nextIssueId,
            type: "plan_change" as const,
            status: "resolved" as const,
            raisedBy: "Planner · console",
            owner: "Shift Incharge",
            vehicleId: a.vehicleId,
            detail: `${a.vehicleId} assigned → ${asg.pickup ? `${asg.pickup} → ` : ""}${asg.target} (${asg.purpose.replace("_", " ")}) · logged vs plan`,
            openedAt: s.now,
            slaMin: 0,
          },
          ...s.issues,
        ],
        nextIssueId: s.nextIssueId + 1,
        // if the demo driver is idle, refresh his next offer to reflect the new assignment
        offer: isMe ? null : s.offer,
        nextOfferIn: isMe && !myActiveTrip(s) ? 3 : s.nextOfferIn,
        toast: `${a.vehicleId} → ${asg.pickup ? asg.pickup + " → " : ""}${asg.target} assigned${isMe ? " — driver's next offer updated" : ""}`,
      };
    }

    case "unassignVehicle": {
      const rest = { ...s.assignments };
      delete rest[a.vehicleId];
      return { ...s, assignments: rest, toast: `${a.vehicleId} returned to pool` };
    }

    case "importContainers": {
      // refresh semantics PER DIRECTION: a new import file replaces the import pool,
      // a new export file replaces the export pool — they never clobber each other
      const dir = a.list[0]?.direction ?? "import";
      const seen = new Set<string>();
      const fresh = a.list.filter((c) => (seen.has(c.containerNo) ? false : (seen.add(c.containerNo), true)));
      const pool = [...s.pool.filter((c) => (c.direction ?? "import") !== dir), ...fresh];
      return { ...s, pool, toast: `${dir === "export" ? "Export" : "Import"} pool updated: ${fresh.length} containers from ${a.source}` };
    }

    case "importVehicles": {
      let vehicles = [...s.vehicles];
      let added = 0, updated = 0;
      a.list.forEach((iv) => {
        const i = vehicles.findIndex((v) => v.id === iv.id || (iv.reg && v.reg === iv.reg));
        if (i >= 0) {
          vehicles[i] = { ...vehicles[i], reg: iv.reg ?? vehicles[i].reg, vendor: iv.vendor ?? vehicles[i].vendor, tags: iv.tags.length ? iv.tags : vehicles[i].tags };
          updated++;
        } else {
          vehicles.push({ id: iv.id, reg: iv.reg ?? "", vendor: iv.vendor ?? "—", status: "offline", statusSince: s.now, zone: "Parking", tags: iv.tags });
          added++;
        }
      });
      return { ...s, vehicles, toast: `ITV master: ${added} added, ${updated} updated` };
    }

    case "importDrivers": {
      let drivers = [...s.drivers];
      let vehicles = [...s.vehicles];
      let added = 0, updated = 0;
      a.list.forEach((d) => {
        const id = "d-" + d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const i = drivers.findIndex((x) => x.id === id);
        if (i >= 0) {
          drivers[i] = { ...drivers[i], phone: d.phone ?? drivers[i].phone, vendor: d.vendor ?? drivers[i].vendor, note: d.note ?? drivers[i].note };
          updated++;
        } else {
          drivers.push({ id, name: d.name, nameHi: d.name, phone: d.phone ?? "", vendor: d.vendor ?? "—", onDuty: false, streakDays: 0, note: d.note });
          added++;
        }
        if (d.vehicleId) {
          const vi = vehicles.findIndex((v) => v.id === d.vehicleId);
          if (vi >= 0) vehicles[vi] = { ...vehicles[vi], driverId: id };
        }
      });
      return { ...s, drivers, vehicles, toast: `Drivers: ${added} added, ${updated} updated` };
    }

    case "upsertVendor": {
      const i = s.vendors.findIndex((v) => v.id === a.vendor.id);
      const vendors = i >= 0 ? s.vendors.map((v) => (v.id === a.vendor.id ? a.vendor : v)) : [...s.vendors, a.vendor];
      return { ...s, vendors, toast: `Vendor saved: ${a.vendor.name}` };
    }

    case "addVehicle": {
      if (s.vehicles.some((v) => v.id === a.id)) return { ...s, toast: `ITV ${a.id} already exists` };
      const veh: Vehicle = { id: a.id, reg: a.reg, vendor: a.vendor, tags: a.tags, status: "offline", statusSince: s.now, zone: "Parking" };
      return { ...s, vehicles: [...s.vehicles, veh], toast: `ITV ${a.id} added` };
    }

    case "addDriver": {
      const id = "d-" + a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (s.drivers.some((d) => d.id === id)) return { ...s, toast: `Driver ${a.name} already exists` };
      const d: Driver = { id, name: a.name, nameHi: a.name, phone: a.phone, vendor: a.vendor, onDuty: false, streakDays: 0, note: a.note };
      return { ...s, drivers: [...s.drivers, d], toast: `Driver ${a.name} added` };
    }

    case "mapDriver": {
      // one driver ↔ one ITV (default), editable daily; audited as manual entry
      const vehicles = s.vehicles.map((v) => {
        if (v.id === a.vehicleId) return { ...v, driverId: a.driverId ?? undefined };
        if (a.driverId && v.driverId === a.driverId) return { ...v, driverId: undefined }; // driver moves ITV
        return v;
      });
      const drv = s.drivers.find((d) => d.id === a.driverId);
      const issue: Issue = {
        id: s.nextIssueId,
        type: "manual_entry",
        status: "resolved",
        raisedBy: "Planner · console",
        owner: "Shift Incharge",
        vehicleId: a.vehicleId,
        detail: `Driver mapping: ${a.vehicleId} → ${drv ? drv.name : "unassigned"} · audited`,
        openedAt: s.now,
        slaMin: 0,
      };
      return { ...s, vehicles, issues: [issue, ...s.issues], nextIssueId: s.nextIssueId + 1, toast: `${a.vehicleId} ↔ ${drv ? drv.name : "—"}` };
    }

    case "updateSettings": {
      const vNum = parseInt(s.rateCard.version.replace(/[^0-9]/g, ""), 10) || 1;
      const rateCard: RateCard = { ...a.rateCard, version: `v${vNum + 1}`, effectiveFrom: new Date().toISOString().slice(0, 10) };
      const issue: Issue = {
        id: s.nextIssueId,
        type: "manual_entry",
        status: "resolved",
        raisedBy: "Manager · console",
        owner: "Manager",
        detail: `Rate card updated to ${rateCard.version} (₹${rateCard.perTeu.import}/TEU import · milestone ${a.milestoneTeu} TEU +₹${rateCard.milestoneBonus}) · old trips keep old rates`,
        openedAt: s.now,
        slaMin: 0,
      };
      return { ...s, rateCard, milestoneTeu: a.milestoneTeu, issues: [issue, ...s.issues], nextIssueId: s.nextIssueId + 1, toast: `Rate card ${rateCard.version} live` };
    }

    case "addEquipment": {
      if (!a.id.trim()) return s;
      const equipment: Equipment[] = [
        ...s.equipment,
        { id: a.id.trim(), type: a.equipType, reg: a.reg.trim() || undefined, vendor: a.vendor, status: "offline", zone: "Parking", tags: [] },
      ];
      return { ...s, equipment, toast: `Equipment added: ${a.id.trim()}` };
    }

    case "addOperator": {
      if (!a.name.trim()) return s;
      const id = "op-" + a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const operators: Operator[] = [...s.operators, { id, name: a.name.trim(), phone: a.phone.trim(), vendor: a.vendor, onDuty: false }];
      return { ...s, operators, toast: `Operator added: ${a.name.trim()}` };
    }

    case "mapOperator": {
      // one operator ↔ one equipment (default), editable any day; audited as manual entry
      const equipment = s.equipment.map((e) => {
        if (e.id === a.equipmentId) return { ...e, operatorId: a.operatorId ?? undefined };
        if (a.operatorId && e.operatorId === a.operatorId) return { ...e, operatorId: undefined }; // operator moves equipment
        return e;
      });
      const op = s.operators.find((o) => o.id === a.operatorId);
      const issue: Issue = {
        id: s.nextIssueId,
        type: "manual_entry",
        status: "resolved",
        raisedBy: "Planner · console",
        owner: "Shift Incharge",
        vehicleId: a.equipmentId,
        detail: `Operator mapping: ${a.equipmentId} → ${op ? op.name : "unassigned"} · audited`,
        openedAt: s.now,
        slaMin: 0,
      };
      return { ...s, equipment, issues: [issue, ...s.issues], nextIssueId: s.nextIssueId + 1, toast: `${a.equipmentId} ↔ ${op ? op.name : "—"}` };
    }

    case "logEquipmentUsage": {
      if (a.hours <= 0 && a.moves <= 0) return s;
      const log: EquipmentLog = {
        id: s.nextLogId,
        equipmentId: a.equipmentId,
        operatorId: a.operatorId,
        date: a.date,
        hours: a.hours,
        moves: a.moves,
        note: a.note,
        enteredBy: a.enteredBy,
        enteredAt: s.now,
      };
      return { ...s, equipmentLogs: [log, ...s.equipmentLogs], nextLogId: s.nextLogId + 1, toast: `Logged ${a.hours}h / ${a.moves} moves · ${a.equipmentId}` };
    }

    case "quickAllocate": {
      const { picked, skipped } = pickForQuickAllocate({
        vehicles: s.vehicles,
        assignments: s.assignments,
        trips: s.trips,
        vendor: a.vendor,
        count: a.count,
        lane: { target: a.target, purpose: a.purpose },
        driverNoteFor: (id) => s.drivers.find((d) => d.id === s.vehicles.find((v) => v.id === id)?.driverId)?.note,
        vehicleBusy: (id) => s.trips.some((t) => t.vehicleId === id && !["completed", "aborted", "abandoned"].includes(t.state)),
      });
      if (picked.length === 0) return { ...s, toast: `No eligible ITV free from ${a.vendor}` };
      const assignments = { ...s.assignments };
      picked.forEach((id) => (assignments[id] = { target: a.target, purpose: a.purpose, pickup: a.pickup }));
      const issue: Issue = {
        id: s.nextIssueId,
        type: "plan_change",
        status: "resolved",
        raisedBy: "Planner · quick allocate",
        owner: "Shift Incharge",
        detail: `Quick allocate: ${picked.length} × ${a.vendor} → ${a.target} (${a.purpose.replace("_", " ")}) · ${picked.join(", ")}`,
        openedAt: s.now,
        slaMin: 0,
      };
      return {
        ...s,
        assignments,
        issues: [issue, ...s.issues],
        nextIssueId: s.nextIssueId + 1,
        offer: picked.includes(ME_VEHICLE_ID) ? null : s.offer,
        toast: `${picked.length} ITV → ${a.target}${skipped ? ` · ${skipped}` : ""}`,
      };
    }

    case "setVehiclePrefs":
      return {
        ...s,
        vehicles: s.vehicles.map((v) => (v.id === a.vehicleId ? { ...v, restrictTo: a.restrictTo, preferFor: a.preferFor } : v)),
        toast: `${a.vehicleId} preferences saved`,
      };

    case "suggestPlan": {
      const proposal = buildPlan({
        vehicles: s.vehicles,
        assignments: s.assignments,
        pool: s.pool,
        trips: s.trips,
        rules: s.planRules,
        driverNoteFor: (id) => s.drivers.find((d) => d.id === s.vehicles.find((v) => v.id === id)?.driverId)?.note,
        vehicleBusy: (id) => s.trips.some((t) => t.vehicleId === id && !["completed", "aborted", "abandoned"].includes(t.state)),
      });
      return { ...s, proposal, toast: proposal.changes.length ? `Plan ready: ${proposal.changes.length} changes` : "Already optimal — no changes" };
    }

    case "applyProposal": {
      if (!s.proposal) return s;
      const assignments = { ...s.assignments };
      s.proposal.changes.forEach((c) => (assignments[c.vehicleId] = c.to));
      const issue: Issue = {
        id: s.nextIssueId,
        type: "plan_change",
        status: "resolved",
        raisedBy: "Planner · auto-plan",
        owner: "Shift Incharge",
        detail: `Auto-plan applied (rules ${s.planRules.version}): ${s.proposal.changes.length} ITVs reassigned · audited`,
        openedAt: s.now,
        slaMin: 0,
      };
      return {
        ...s,
        assignments,
        proposal: null,
        issues: [issue, ...s.issues],
        nextIssueId: s.nextIssueId + 1,
        offer: s.proposal.changes.some((c) => c.vehicleId === ME_VEHICLE_ID) ? null : s.offer,
        toast: `Auto-plan applied · ${s.proposal.changes.length} ITVs moved`,
      };
    }

    case "discardProposal":
      return { ...s, proposal: null };

    case "updatePlanRules": {
      const n = parseInt(s.planRules.version.replace(/[^0-9]/g, ""), 10) || 1;
      const rules: PlanRules = { ...a.rules, version: `v${n + 1}`, effectiveFrom: new Date().toISOString().slice(0, 10) };
      const issue: Issue = {
        id: s.nextIssueId,
        type: "manual_entry",
        status: "resolved",
        raisedBy: "Manager · console",
        owner: "Manager",
        detail: `Planning rules updated to ${rules.version} · audited`,
        openedAt: s.now,
        slaMin: 0,
      };
      return { ...s, planRules: rules, issues: [issue, ...s.issues], nextIssueId: s.nextIssueId + 1, toast: `Planning rules ${rules.version} live` };
    }

    case "setActiveSite":
      return { ...s, activeSiteId: a.siteId, toast: `Switched to ${s.sites.find((x) => x.id === a.siteId)?.shortName ?? a.siteId}` };

    case "addSite": {
      if (s.sites.some((x) => x.id === a.site.id)) return { ...s, toast: "Site already exists" };
      return { ...s, sites: [...s.sites, a.site], activeSiteId: a.site.id, toast: `Site added: ${a.site.name}` };
    }

    case "hydrate":
      return {
        ...s,
        ...a.state,
        sites: a.state.sites ?? s.sites,
        activeSiteId: a.state.activeSiteId ?? s.activeSiteId,
        planRules: a.state.planRules ?? s.planRules,
        proposal: null,
        pool: a.state.pool ?? s.pool ?? [],
        equipment: a.state.equipment ?? s.equipment ?? [],
        operators: a.state.operators ?? s.operators ?? [],
        equipmentLogs: a.state.equipmentLogs ?? s.equipmentLogs ?? [],
        toast: a.quiet ? s.toast : "Session restored ✓",
      };

    case "resetDemo":
      return { ...initial, toast: "Demo reset" };

    case "clearCelebration":
      return { ...s, celebration: null };

    case "clearToast":
      return { ...s, toast: null };

    default:
      return s;
  }
}

const initial: AppState = {
  now: 0,
  drivers: DRIVERS,
  vehicles: VEHICLES,
  trips: SEED_TRIPS,
  issues: SEED_ISSUES,
  pool: [],
  sites: SITES,
  activeSiteId: SITE.id,
  planRules: PLAN_RULES,
  proposal: null,
  vendors: [
    { id: "active", name: "Active", type: "vendor" },
    { id: "own", name: "Own (direct employment)", type: "own" },
  ],
  equipment: EQUIPMENT,
  operators: OPERATORS,
  equipmentLogs: [],
  nextLogId: 1,
  rateCard: RATE_CARD,
  milestoneTeu: SITE.perItvTeuTarget,
  assignments: {
    A198: { target: "SCAN", purpose: "scanning" },
    A408: { target: "T2", purpose: "export", pickup: "EXIM-1" },
    A225: { target: "CT4", purpose: "import" },
  },
  offer: null,
  nextOfferIn: 0,
  nextTripId: 1000,
  nextIssueId: 100,
  passesThisShift: 0,
  milestoneHit: false, // fires the celebration when he crosses 10 TEU live
  celebration: null,
  toast: null,
};

const Ctx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> } | null>(null);

// Persistable subset — sim-only fields (now, offer, toast, celebration, nextOfferIn) never sync.
const PERSIST_KEYS = [
  "drivers", "vehicles", "trips", "issues", "assignments", "pool",
  "vendors", "rateCard", "milestoneTeu", "sites", "activeSiteId", "planRules",
  "equipment", "operators", "equipmentLogs", "nextLogId",
  "nextTripId", "nextIssueId", "passesThisShift", "milestoneHit",
] as const;
type Persistable = Pick<AppState, (typeof PERSIST_KEYS)[number]>;
function toPersistable(s: AppState): Persistable {
  const out = {} as Record<string, unknown>;
  PERSIST_KEYS.forEach((k) => (out[k] = s[k]));
  return out as unknown as Persistable;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const revRef = useRef(0);
  const lastPushedRef = useRef("");
  const readyRef = useRef(false); // gate: never push before the initial load finishes
  const dsRef = useRef<DataStore | null>(null);
  if (!dsRef.current && typeof window !== "undefined") dsRef.current = getDataStore();

  // initial load from the backend (local / supabase / future http — same code path)
  useEffect(() => {
    (async () => {
      const ds = dsRef.current;
      if (!ds) return;
      try {
        const snap = await ds.load(SITE.id);
        if (snap) {
          revRef.current = snap.rev;
          lastPushedRef.current = JSON.stringify(snap.state);
          dispatch({ type: "hydrate", state: snap.state as Partial<AppState> });
        }
      } finally {
        readyRef.current = true;
      }
    })();
  }, []);

  // push loop: every 1.5s, if the persistable subset changed, save it.
  // (interval + ref, not an effect-debounce — the 1s sim tick would forever reset a debounce timer)
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const id = setInterval(async () => {
      const ds = dsRef.current;
      if (!ds || !readyRef.current) return;
      const payload = JSON.stringify(toPersistable(stateRef.current));
      if (payload === lastPushedRef.current) return;
      const res = await ds.save(SITE.id, JSON.parse(payload), revRef.current);
      if (res.ok) {
        revRef.current = res.rev;
        lastPushedRef.current = payload;
      } else {
        // rev conflict: someone else wrote first → pull theirs (remote wins), our next edit re-pushes
        const snap = await ds.load(SITE.id);
        if (snap) {
          revRef.current = snap.rev;
          lastPushedRef.current = JSON.stringify(snap.state);
          dispatch({ type: "hydrate", state: snap.state as Partial<AppState>, quiet: true });
        }
      }
    }, 1500);
    return () => clearInterval(id);
  }, []);

  // poll shared backends for other users' changes (local mode skips this)
  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || ds.name === "local") return;
    const id = setInterval(async () => {
      const rev = await ds.peekRev(SITE.id);
      if (rev !== null && rev > revRef.current) {
        const snap = await ds.load(SITE.id);
        if (snap) {
          revRef.current = snap.rev;
          lastPushedRef.current = JSON.stringify(snap.state);
          dispatch({ type: "hydrate", state: snap.state as Partial<AppState>, quiet: true });
        }
      }
    }, 4000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (state.toast) {
      const id = setTimeout(() => dispatch({ type: "clearToast" }), 3500);
      return () => clearTimeout(id);
    }
  }, [state.toast]);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

export { ME_DRIVER_ID, ME_VEHICLE_ID, RATE_CARD, SITE, SHIFT, HOT_JOBS };
