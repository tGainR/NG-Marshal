"use client";
// ITV PLANNER — the dispatch board. One row per ITV: where it is going, and why.
//
// Structure borrowed from Equipment Control in a terminal operating system:
//   · WORK QUEUES across the top — demand per destination, and how many ITVs serve it
//   · the FLEET below — every vehicle, its queue, its state, assignable in place
//   · assignments carry a COMMITMENT level (tentative vs confirmed). Auto-plan and
//     quick-allocate produce tentative rows; the planner confirms them, and from then
//     on the optimiser leaves them alone. Same rule Navis uses for definite plans.
//
// Deliberately NOT here: choosing which container an ITV carries. The gate assigns
// the container — we assign the ITV. That rule is locked.
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { livePool } from "@/lib/importer";
import { MOVEMENT_LABEL, MovementType, Site, Vehicle } from "@/lib/types";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  running: { label: "Running", cls: "bg-[#E6F5EC] text-[#177A47]" },
  standby: { label: "Standby", cls: "bg-[#FDF3E3] text-[#9A6206]" },
  breakdown: { label: "Breakdown", cls: "bg-[#FBEAE8] text-[#C0392B]" },
  diesel: { label: "Diesel", cls: "bg-[#FDF3E3] text-[#9A6206]" },
  no_driver: { label: "No driver", cls: "bg-[#FBEAE8] text-[#C0392B]" },
  rest: { label: "Rest", cls: "bg-[#EDF0F5] text-[#5C6B80]" },
  offline: { label: "Offline", cls: "bg-[#EDF0F5] text-[#5C6B80]" },
};

/** An ITV can be sent somewhere only if it is actually able to go. */
function eligibility(v: Vehicle, purpose: MovementType | null): string | null {
  if (v.status === "breakdown") return "broken down";
  if (v.status === "no_driver") return "no driver mapped";
  if (purpose && v.restrictTo?.length && !v.restrictTo.includes(purpose)) return `restricted to ${v.restrictTo.map((m) => MOVEMENT_LABEL[m]).join(" / ")}`;
  return null;
}

export default function ItvPlannerTab({ site }: { site: Site }) {
  const { state, dispatch } = useApp();
  const [vendorFilter, setVendorFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const pool = livePool(state.pool);

  // ── work queues ──
  // Two groups, kept apart on purpose:
  //   DESTINATIONS — terminal × import/export. Where the ITV drives.
  //   MOVEMENTS    — scanning, check package. These run across terminals; they are a
  //                  leg a box must clear, not a place. An ITV can still be put on
  //                  this duty, so they must be assignable — but they are not tiles
  //                  in the same row as MICT/CT3, which would double-count them.
  const { queues, movements } = useMemo(() => {
    const isCP = (c: (typeof pool)[number]) => /CHECK|CP\b|PACKAGE/i.test(c.category ?? "");
    const mk = (key: string, target: string, purpose: MovementType, label: string, rows: typeof pool) => ({
      key, target, purpose, label,
      teu: rows.reduce((a, c) => a + c.teu, 0),
      ctr: rows.length,
      itvs: Object.values(state.assignments).filter((a) => a.target === target && a.purpose === purpose).length,
      flagged: rows.filter((c) => c.scan || isCP(c)).length,
    });

    const dest: ReturnType<typeof mk>[] = [];
    site.destinations.forEach((d) => {
      if (d.kind === "ftwz") {
        dest.push(mk(`${d.id}·ftwz`, d.id, "ftwz", `${d.label} · Movement`, []));
        return;
      }
      (["import", "export"] as MovementType[]).forEach((purpose) => {
        const rows = pool.filter((c) => c.terminal === d.id && (c.direction ?? "import") === purpose);
        dest.push(mk(`${d.id}·${purpose}`, d.id, purpose, `${d.label} · ${MOVEMENT_LABEL[purpose]}`, rows));
      });
    });

    const move = [
      mk("SCAN·scanning", "SCAN", "scanning", MOVEMENT_LABEL.scanning, pool.filter((c) => c.scan)),
      mk("CP·check_package", "CP", "check_package", MOVEMENT_LABEL.check_package, pool.filter(isCP)),
    ];
    return { queues: dest, movements: move };
  }, [pool, site.destinations, state.assignments]);

  const allQueues = [...queues, ...movements];

  const vendors = useMemo(() => [...new Set(state.vehicles.map((v) => v.vendor))].sort(), [state.vehicles]);

  const fleet = state.vehicles.filter((v) => {
    if (vendorFilter !== "all" && v.vendor !== vendorFilter) return false;
    const a = state.assignments[v.id];
    if (onlyUnassigned && a) return false;
    if (queueFilter !== "all" && (!a || `${a.target}·${a.purpose}` !== queueFilter)) return false;
    return true;
  });

  const tentative = Object.entries(state.assignments).filter(([, a]) => a.commit !== "confirmed").map(([id]) => id);
  const tripsOf = (id: string) => state.trips.filter((t) => t.vehicleId === id && t.state === "completed").length;

  const assign = (vehicleId: string, key: string) => {
    if (!key) { dispatch({ type: "clearAssignment", vehicleId }); return; }
    const [target, purpose] = key.split("·");
    dispatch({ type: "assignVehicle", vehicleId, assignment: { target, purpose: purpose as MovementType, commit: "tentative" } });
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* ── WORK QUEUES ── */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Work queues</p>
            <p className="text-[12px] text-[#5C6B80] mt-0.5">Demand waiting at each destination, and how many ITVs you have on it. Click a queue to filter the fleet below.</p>
          </div>
          {tentative.length > 0 && (
            <button
              onClick={() => dispatch({ type: "commitAssignments", vehicleIds: tentative })}
              className="bg-[#1E9E5A] text-white text-[12px] font-bold px-3.5 py-2 rounded-md"
            >
              ✓ Confirm all {tentative.length} tentative
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {queues.map((q) => {
            const starved = q.teu > 0 && q.itvs === 0;
            const on = queueFilter === q.key;
            return (
              <button
                key={q.key}
                onClick={() => setQueueFilter(on ? "all" : q.key)}
                className={`text-left rounded-lg p-3 border-2 ${
                  on ? "border-[#1F3864] bg-[#F2F5FA]" : starved ? "border-[#F2C7C1] bg-[#FDF6F5]" : "border-[#EDF0F5] bg-white"
                }`}
              >
                <p className="text-[11px] font-bold text-[#16243A] leading-tight">{q.label}</p>
                <p className="text-[21px] font-extrabold tabular-nums leading-tight mt-1">{q.teu.toLocaleString("en-IN")}<span className="text-[10px] font-semibold text-[#5C6B80] ml-1">TEU</span></p>
                <p className="text-[10.5px] text-[#5C6B80] font-medium">{q.ctr} ctr · {q.flagged > 0 ? `${q.flagged} flagged` : "none flagged"}</p>
                <p className={`text-[11.5px] font-bold mt-1 ${starved ? "text-[#C0392B]" : q.itvs ? "text-[#177A47]" : "text-[#5C6B80]"}`}>
                  {q.itvs} ITV{q.itvs === 1 ? "" : "s"}{starved && " — none assigned"}
                </p>
              </button>
            );
          })}
        </div>

        {/* movements — a leg across terminals, not a destination */}
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mt-4 mb-2">
          Movement duties <span className="font-medium normal-case tracking-normal">· these run across terminals — already counted above, not extra demand</span>
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
          {movements.map((q) => {
            const on = queueFilter === q.key;
            return (
              <button
                key={q.key}
                onClick={() => setQueueFilter(on ? "all" : q.key)}
                className={`text-left rounded-lg p-3 border-2 ${on ? "border-[#1F3864] bg-[#F2F5FA]" : "border-[#EDF0F5] bg-white"}`}
              >
                <p className="text-[11px] font-bold text-[#16243A] leading-tight">{q.purpose === "scanning" ? "🔍" : "📦"} {q.label}</p>
                <p className="text-[21px] font-extrabold tabular-nums leading-tight mt-1">{q.teu.toLocaleString("en-IN")}<span className="text-[10px] font-semibold text-[#5C6B80] ml-1">TEU</span></p>
                <p className="text-[10.5px] text-[#5C6B80] font-medium">{q.ctr} ctr waiting</p>
                <p className={`text-[11.5px] font-bold mt-1 ${q.itvs ? "text-[#177A47]" : "text-[#5C6B80]"}`}>{q.itvs} ITV{q.itvs === 1 ? "" : "s"}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FLEET ── */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mr-1">Fleet — send each ITV</p>
          <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="text-[12px] border border-[#D8DEE7] rounded-md px-2 py-1.5 font-semibold">
            <option value="all">All vendors</option>
            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {queueFilter !== "all" && (
            <button onClick={() => setQueueFilter("all")} className="text-[11.5px] font-bold text-[#1F3864] border border-[#D8DEE7] rounded-md px-2.5 py-1.5">
              Queue: {allQueues.find((q) => q.key === queueFilter)?.label} ✕
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5C6B80] ml-1">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />
            Only unassigned
          </label>
          <span className="text-[11.5px] text-[#5C6B80] ml-auto">{fleet.length} of {state.vehicles.length} shown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
                {["ITV", "Vendor", "Driver", "State", "Trips", "Send to", "Commitment", ""].map((h) => (
                  <th key={h} className="text-left font-bold px-2 py-2 border-b border-[#D8DEE7]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleet.map((v) => {
                const a = state.assignments[v.id];
                const driver = state.drivers.find((d) => d.id === v.driverId);
                const st = STATUS_STYLE[v.status] ?? STATUS_STYLE.offline;
                const blocked = eligibility(v, a?.purpose ?? null);
                return (
                  <tr key={v.id} className={`border-b border-[#EDF0F5] ${blocked ? "bg-[#FDF6F5]" : ""}`}>
                    <td className="px-2 py-2 font-mono font-extrabold text-[13px]">
                      {v.id}
                      {v.restrictTo?.length ? <span title={`Only: ${v.restrictTo.map((m) => MOVEMENT_LABEL[m]).join(", ")}`} className="ml-1">🔒</span> : null}
                      {v.preferFor?.length ? <span title={`Prefers: ${v.preferFor.map((m) => MOVEMENT_LABEL[m]).join(", ")}`} className="ml-1">★</span> : null}
                    </td>
                    <td className="px-2 py-2 text-[#5C6B80]">{v.vendor}</td>
                    <td className="px-2 py-2">
                      {driver?.name ?? <span className="text-[#C0392B] font-semibold">unmapped</span>}
                      {driver?.note && <span title={driver.note} className="ml-1 text-[#E8641B]">⚠</span>}
                    </td>
                    <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-2 py-2 tabular-nums font-semibold">{tripsOf(v.id)}</td>
                    <td className="px-2 py-2">
                      <select
                        value={a ? `${a.target}·${a.purpose}` : ""}
                        onChange={(e) => assign(v.id, e.target.value)}
                        className={`text-[12px] border rounded-md px-2 py-1.5 font-semibold min-w-44 ${a ? "border-[#1F3864] text-[#16243A]" : "border-[#D8DEE7] text-[#5C6B80]"}`}
                      >
                        <option value="">— not assigned —</option>
                        <optgroup label="Destinations">
                          {queues.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                        </optgroup>
                        <optgroup label="Movement duties">
                          {movements.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      {!a ? <span className="text-[#5C6B80]">—</span>
                        : a.commit === "confirmed"
                          ? <span className="text-[#177A47] font-bold">✓ Confirmed</span>
                          : <button onClick={() => dispatch({ type: "commitAssignments", vehicleIds: [v.id] })} className="text-[11.5px] font-bold text-[#9A6206] bg-[#FDF3E3] rounded px-2 py-1">◇ Tentative — confirm</button>}
                    </td>
                    <td className="px-2 py-2">
                      {blocked && <span className="text-[11px] font-semibold text-[#C0392B]">{blocked}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {fleet.length === 0 && <p className="text-[12px] text-[#5C6B80] py-6 text-center">No ITV matches these filters.</p>}
        </div>
        <p className="text-[11px] text-[#5C6B80] mt-3">
          🔒 restricted unit · ★ preferred movement · ⚠ driver note · ◇ tentative (auto-plan may still move it) · ✓ confirmed (auto-plan will not touch it)
        </p>
      </div>
    </div>
  );
}
