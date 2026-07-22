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
import { MOVEMENT_LABEL, MovementType, Site, Vehicle, liveStateOf, isLive, LIVE_LABEL, LiveState } from "@/lib/types";

const LIVE_STYLE: Record<LiveState, string> = {
  confirmed: "bg-[#E6F5EC] text-[#0F5C34] border-[#177A47]/40",
  manual: "bg-[#FDF3E3] text-[#9A6206] border-[#DB9A00]/40",
  app: "bg-[#EAF1FB] text-[#1F3864] border-[#1F3864]/30",
  none: "bg-[#F6F8FB] text-[#8B97A8] border-[#D8DEE7]",
};

/** Parse a pasted / transcribed vendor roster into call-sign + optional driver name. */
function parseRoster(text: string): { id: string; driverName?: string }[] {
  const lines = text.includes("\n") ? text.split("\n") : text.split(",");
  const out: { id: string; driverName?: string }[] = [];
  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z0-9-]+)[\s,:-]*(.*)$/);
    if (!m) return;
    out.push({ id: m[1].toUpperCase(), driverName: m[2].trim() || undefined });
  });
  return out;
}

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

export default function ItvPlannerTab({ site, allocateBar, proposal }: { site: Site; allocateBar?: React.ReactNode; proposal?: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const [vendorFilter, setVendorFilter] = useState("all");
  const [queueFilter, setQueueFilter] = useState<string>("all");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyLive, setOnlyLive] = useState(false);

  const pool = livePool(state.pool);

  // roster is "started" once anyone has marked an ITV live this shift; until then we
  // don't nag about un-live ITVs (keeps the demo and day-one usage clean)
  const rosterStarted = state.vehicles.some(isLive);

  // ── work queues ──
  // Two groups, kept apart on purpose:
  //   DESTINATIONS — terminal × import/export. Where the ITV drives.
  //   MOVEMENTS    — scanning, check package. These run across terminals; they are a
  //                  leg a box must clear, not a place. An ITV can still be put on
  //                  this duty, so they must be assignable — but they are not tiles
  //                  in the same row as MICT/CT3, which would double-count them.
  const { queues, movements, terminals } = useMemo(() => {
    const isCP = (c: (typeof pool)[number]) => /CHECK|CP\b|PACKAGE/i.test(c.category ?? "");
    const mk = (key: string, target: string, purpose: MovementType, label: string, rows: typeof pool) => ({
      key, target, purpose, label,
      teu: rows.reduce((a, c) => a + c.teu, 0),
      ctr: rows.length,
      itvs: Object.values(state.assignments).filter((a) => a.target === target && a.purpose === purpose).length,
      flagged: rows.filter((c) => c.scan || isCP(c)).length,
    });

    const dest: ReturnType<typeof mk>[] = [];
    // Per-terminal ROUND TRIP. An ITV runs a loop: yard → carry EXPORT to the terminal
    // → drop it → pick up IMPORT → carry it back to the yard. So one round trip clears
    // one export AND one import (paired). Exports are cleared first; the surplus import
    // (import > export) needs ITVs that run EMPTY out and bring import back ("straight
    // import"); a surplus export needs export-out then empty back ("straight export").
    const term: {
      d: (typeof site.destinations)[number];
      impQ: ReturnType<typeof mk>; expQ: ReturnType<typeof mk>;
      paired: number; straightImport: number; straightExport: number;
    }[] = [];
    site.destinations.forEach((d) => {
      if (d.kind === "ftwz") {
        dest.push(mk(`${d.id}·ftwz`, d.id, "ftwz", `${d.label} · Movement`, []));
        return;
      }
      const impRows = pool.filter((c) => c.terminal === d.id && (c.direction ?? "import") === "import");
      const expRows = pool.filter((c) => c.terminal === d.id && c.direction === "export");
      const impQ = mk(`${d.id}·import`, d.id, "import", `${d.label} · Import`, impRows);
      const expQ = mk(`${d.id}·export`, d.id, "export", `${d.label} · Export`, expRows);
      dest.push(impQ, expQ);
      const paired = Math.min(impRows.length, expRows.length);
      term.push({ d, impQ, expQ, paired, straightImport: impRows.length - paired, straightExport: expRows.length - paired });
    });

    const move = [
      mk("SCAN·scanning", "SCAN", "scanning", MOVEMENT_LABEL.scanning, pool.filter((c) => c.scan)),
      mk("CP·check_package", "CP", "check_package", MOVEMENT_LABEL.check_package, pool.filter(isCP)),
    ];
    return { queues: dest, movements: move, terminals: term };
  }, [pool, site.destinations, state.assignments]);

  const allQueues = [...queues, ...movements];

  const vendors = useMemo(() => [...new Set(state.vehicles.map((v) => v.vendor))].sort(), [state.vehicles]);

  const fleet = state.vehicles.filter((v) => {
    if (vendorFilter !== "all" && v.vendor !== vendorFilter) return false;
    if (onlyLive && !isLive(v)) return false;
    const a = state.assignments[v.id];
    if (onlyUnassigned && a) return false;
    if (queueFilter !== "all" && (!a || `${a.target}·${a.purpose}` !== queueFilter)) return false;
    return true;
  });

  const liveCounts = useMemo(() => {
    const c = { confirmed: 0, manual: 0, app: 0, none: 0 };
    state.vehicles.forEach((v) => c[liveStateOf(v)]++);
    return c;
  }, [state.vehicles]);
  const liveTotal = liveCounts.confirmed + liveCounts.manual + liveCounts.app;

  const tentative = Object.entries(state.assignments).filter(([, a]) => a.commit !== "confirmed").map(([id]) => id);
  const tripsOf = (id: string) => state.trips.filter((t) => t.vehicleId === id && t.state === "completed").length;

  const assign = (vehicleId: string, key: string) => {
    if (!key) { dispatch({ type: "clearAssignment", vehicleId }); return; }
    const [target, purpose] = key.split("·");
    dispatch({ type: "assignVehicle", vehicleId, assignment: { target, purpose: purpose as MovementType, commit: "tentative" } });
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* ── SHIFT ROSTER — mark which ITVs turned up, before you plan them ── */}
      <ShiftRoster counts={liveCounts} total={liveTotal} fleetSize={state.vehicles.length} />

      {/* ── WORK QUEUES ── */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Work queues · by terminal (round trip)</p>
            <p className="text-[12px] text-[#5C6B80] mt-0.5">Each terminal is one round trip: carry an <b>export</b> out, bring an <b>import</b> back. Click a half to filter the fleet below.</p>
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

        {/* how allocation works — the round-trip logic in one line */}
        <p className="text-[11px] text-[#5C6B80] bg-[#F6F8FB] border border-[#EDF0F5] rounded-md px-2.5 py-1.5 mb-3">
          <b>How it allocates:</b> exports go first — an ITV carries an export to the terminal and brings an import back (a <b className="text-[#7A4Fb0]">paired</b> trip). Extra imports beyond exports need ITVs to run empty out and bring import back (<b className="text-[#1F3864]">straight import</b>); extra exports go out and return empty (<b className="text-[#177A47]">straight export</b>).
        </p>

        {/* one bordered box per terminal — import and export halves connected */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {terminals.map((t) => {
            const Half = ({ q, tone, leg }: { q: typeof t.impQ; tone: string; leg: string }) => {
              const on = queueFilter === q.key;
              const starved = q.teu > 0 && q.itvs === 0;
              return (
                <button
                  onClick={() => setQueueFilter(on ? "all" : q.key)}
                  className={`flex-1 text-left px-2.5 py-2 rounded-md border ${on ? "border-[#1F3864] bg-[#F2F5FA]" : starved ? "border-[#F2C7C1] bg-[#FDF6F5]" : "border-[#EDF0F5] bg-white"}`}
                >
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.08em]" style={{ color: tone }}>{q.purpose === "import" ? "Import" : "Export"} <span className="text-[#96A2B4] normal-case tracking-normal">· {leg}</span></p>
                  <p className="text-[18px] font-extrabold tabular-nums leading-tight">{q.teu.toLocaleString("en-IN")}<span className="text-[9.5px] font-semibold text-[#5C6B80] ml-1">TEU</span></p>
                  <p className="text-[10px] text-[#5C6B80] leading-tight">{q.ctr} ctr{q.flagged > 0 ? ` · ${q.flagged} flagged` : ""}</p>
                  <p className={`text-[11px] font-bold mt-0.5 ${starved ? "text-[#C0392B]" : q.itvs ? "text-[#177A47]" : "text-[#96A2B4]"}`}>{q.itvs} ITV{q.itvs === 1 ? "" : "s"}</p>
                </button>
              );
            };
            return (
              <div key={t.d.id} className="border-2 border-[#CBD5E6] rounded-xl p-2.5 bg-[#FBFCFE]">
                <p className="text-[12.5px] font-extrabold font-mono text-[#16243A] mb-1.5 px-0.5">{t.d.label}</p>
                <div className="flex gap-2">
                  <Half q={t.expQ} tone="#177A47" leg="carry out" />
                  <Half q={t.impQ} tone="#1F3864" leg="bring back" />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 px-0.5 text-[10.5px] font-semibold">
                  <span className="text-[#7A4Fb0]">◆ {t.paired} paired</span>
                  {t.straightImport > 0 && <span className="text-[#1F3864]">→ {t.straightImport} straight import</span>}
                  {t.straightExport > 0 && <span className="text-[#177A47]">→ {t.straightExport} straight export</span>}
                  {t.paired === 0 && t.straightImport === 0 && t.straightExport === 0 && <span className="text-[#96A2B4]">no work</span>}
                </div>
              </div>
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

      {/* ── ALLOCATE — quick batches + auto-plan, right where the demand is ── */}
      {allocateBar}
      {proposal}

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
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5C6B80]">
            <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} />
            Only live
          </label>
          <span className="text-[11.5px] text-[#5C6B80] ml-auto">{fleet.length} of {state.vehicles.length} shown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
                {["ITV", "Live?", "Vendor", "Driver", "State", "Trips", "Send to", "Commitment", ""].map((h) => (
                  <th key={h} className="text-left font-bold px-2 py-2 border-b border-[#D8DEE7]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleet.map((v) => {
                const a = state.assignments[v.id];
                const driver = state.drivers.find((d) => d.id === v.driverId);
                const st = STATUS_STYLE[v.status] ?? STATUS_STYLE.offline;
                const ls = liveStateOf(v);
                const notLive = rosterStarted && ls === "none";
                const blocked = eligibility(v, a?.purpose ?? null) ?? (notLive ? "not marked live this shift" : null);
                const markName = v.live?.manual?.driverName;
                return (
                  <tr key={v.id} className={`border-b border-[#EDF0F5] ${blocked ? "bg-[#FDF6F5]" : ""}`}>
                    <td className="px-2 py-2 font-mono font-extrabold text-[13px]">
                      {v.id}
                      {v.restrictTo?.length ? <span title={`Only: ${v.restrictTo.map((m) => MOVEMENT_LABEL[m]).join(", ")}`} className="ml-1">🔒</span> : null}
                      {v.preferFor?.length ? <span title={`Prefers: ${v.preferFor.map((m) => MOVEMENT_LABEL[m]).join(", ")}`} className="ml-1">★</span> : null}
                    </td>
                    {/* LIVE — mark present, and show which source(s) say so */}
                    <td className="px-2 py-2">
                      {ls === "none" ? (
                        <button
                          onClick={() => dispatch({ type: "markLive", vehicleId: v.id, by: "Planner · console" })}
                          className="text-[11px] font-bold text-[#1F3864] border border-[#1F3864]/40 rounded px-2 py-1 hover:bg-[#EAF1FB]"
                        >＋ Mark live</button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            title={liveTitle(v)}
                            className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${LIVE_STYLE[ls]}`}
                          >
                            {ls === "confirmed" ? "✓ " : ""}{LIVE_LABEL[ls]}{markName ? ` · ${markName}` : ""}
                          </span>
                          {v.live?.manual && (
                            <button onClick={() => dispatch({ type: "unmarkLive", vehicleId: v.id })} title="Remove manual mark" className="text-[#C0392B] text-[11px] font-bold">✕</button>
                          )}
                        </span>
                      )}
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
          Live: <b className="text-[#0F5C34]">✓ Confirmed</b> (supervisor + driver app agree) · <b className="text-[#9A6206]">Manual</b> (supervisor only) · <b className="text-[#1F3864]">App</b> (driver only) · 🔒 restricted · ★ preferred · ◇ tentative · ✓ confirmed assignment
        </p>
      </div>
    </div>
  );
}

function liveTitle(v: Vehicle): string {
  const parts: string[] = [];
  if (v.live?.manual) parts.push(`Manual: ${v.live.manual.by}${v.live.manual.driverName ? ` (${v.live.manual.driverName})` : ""}`);
  if (v.live?.app) parts.push("Driver app: on duty");
  return parts.join(" · ") || "Not marked live";
}

/**
 * SHIFT ROSTER — the start-of-shift step. Mark which ITVs turned up (from the
 * vendor's morning list — Excel, photo or word of mouth) before planning them.
 * Works with no driver app; when the app arrives, its on-duty signal reconciles
 * with the manual mark and the ITV shows as Confirmed.
 */
function ShiftRoster({ counts, total, fleetSize }: { counts: Record<LiveState, number>; total: number; fleetSize: number }) {
  const { dispatch } = useApp();
  const [paste, setPaste] = useState("");
  const [by, setBy] = useState("Planner · console");
  const [open, setOpen] = useState(false);

  const submit = () => {
    const entries = parseRoster(paste);
    if (!entries.length) return;
    dispatch({ type: "markLiveBulk", entries, by: by.trim() || "Planner · console" });
    setPaste("");
    setOpen(false);
  };

  const tiles: { k: LiveState | "total"; label: string; v: number; cls: string }[] = [
    { k: "total", label: "Live this shift", v: total, cls: "text-[#16243A]" },
    { k: "confirmed", label: "Confirmed", v: counts.confirmed, cls: "text-[#0F5C34]" },
    { k: "manual", label: "Manual only", v: counts.manual, cls: "text-[#9A6206]" },
    { k: "app", label: "App only", v: counts.app, cls: "text-[#1F3864]" },
    { k: "none", label: "Not marked", v: counts.none, cls: counts.none ? "text-[#C0392B]" : "text-[#8B97A8]" },
  ];

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Shift roster · who turned up</p>
          <p className="text-[12px] text-[#5C6B80] mt-0.5">
            Mark the ITVs that are live for this shift — from the vendor&apos;s morning list. No driver app needed. When a driver does go on duty in the app, it reconciles with your mark and shows <b className="text-[#0F5C34]">Confirmed</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen((o) => !o)} className="bg-[#1F3864] text-white text-[12px] font-bold px-3.5 py-2 rounded-md">⬍ Bulk mark live</button>
          <button
            onClick={() => { if (confirm("Start a new shift? This clears every live mark (manual and app). Assignments are kept.")) dispatch({ type: "resetShiftLive" }); }}
            className="border border-[#D8DEE7] text-[#5C6B80] text-[12px] font-bold px-3 py-2 rounded-md"
            title="Clear the roster to rebuild it for a new shift"
          >↺ New shift</button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2.5">
        {tiles.map((t) => (
          <div key={t.k} className="border border-[#EDF0F5] rounded-lg px-3 py-2">
            <p className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-[#5C6B80]">{t.label}</p>
            <p className={`text-[22px] font-extrabold tabular-nums leading-tight ${t.cls}`}>{t.v}<span className="text-[10px] font-semibold text-[#5C6B80] ml-1">{t.k === "total" ? `of ${fleetSize}` : ""}</span></p>
          </div>
        ))}
      </div>

      {open && (
        <div className="mt-3 border-t border-[#EDF0F5] pt-3">
          <p className="text-[11.5px] text-[#5C6B80] mb-1.5">
            Paste the call signs from the vendor&apos;s list (from the Excel or photo). One per line, or comma-separated. Add a driver name after each if you have it — e.g. <code className="font-mono">A333 Ramesh Yadav</code>.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"A333 Ramesh Yadav\nA157 Sohan Bharwad\nA670\n7118, Kishan Desai"}
            className="w-full border border-[#D8DEE7] rounded-md px-3 py-2 text-[12.5px] font-mono"
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <label className="text-[11.5px] text-[#5C6B80] font-semibold">Marked by</label>
            <input value={by} onChange={(e) => setBy(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-1.5 text-[12px] w-52" />
            <span className="text-[11.5px] text-[#5C6B80]">{parseRoster(paste).length} call sign{parseRoster(paste).length === 1 ? "" : "s"} detected</span>
            <button onClick={submit} disabled={!parseRoster(paste).length} className="ml-auto bg-[#1E9E5A] text-white text-[12px] font-bold px-4 py-2 rounded-md disabled:opacity-40">Mark these live ▸</button>
          </div>
        </div>
      )}
    </div>
  );
}
