"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp, RATE_CARD, SITE, SHIFT, HOT_JOBS } from "@/lib/store";
import { DEPLOYMENT } from "@/lib/seed";
import { fmtClock, fmtInr } from "@/lib/incentive";
import { Issue, VehicleStatus } from "@/lib/types";
import { Wordmark } from "@/components/Brand";

type Tab = "live" | "planning" | "incentives" | "issues" | "masters";

const STATUS_STYLE: Record<VehicleStatus, { label: string; cls: string }> = {
  running: { label: "RUNNING", cls: "bg-[#E3F4EB] text-[#177A47]" },
  standby: { label: "STANDBY", cls: "bg-[#FBF1D9] text-[#8A6100]" },
  breakdown: { label: "BREAKDOWN", cls: "bg-[#FBE4E4] text-[#A83232]" },
  diesel: { label: "DIESEL QUEUE", cls: "bg-[#E8ECF6] text-[#3A54A0]" },
  no_driver: { label: "NO DRIVER", cls: "bg-[#ECEFF3] text-[#6A7688]" },
  rest: { label: "REST", cls: "bg-[#ECEFF3] text-[#6A7688]" },
  offline: { label: "OFF DUTY", cls: "bg-[#ECEFF3] text-[#6A7688]" },
};

const ISSUE_STYLE: Record<Issue["status"], string> = {
  open: "bg-[#FBE4E4] text-[#A83232]",
  acknowledged: "bg-[#FBF1D9] text-[#8A6100]",
  escalated: "bg-[#FBF1D9] text-[#8A6100]",
  resolved: "bg-[#E3F4EB] text-[#177A47]",
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10px] tracking-[0.09em] uppercase text-[#5C6B80] pb-2 px-2 border-b border-[#D8DEE7] font-bold">
      {children}
    </th>
  );
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2.5 px-2 border-b border-[#EDF0F5] align-middle ${className}`}>{children}</td>;
}

export default function ConsolePage() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<Tab>("live");
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    results: {
      sheet: string;
      kind: import("@/lib/importer").ImportKind;
      headers: string[];
      sample: string[][];
      containers: import("@/lib/importer").ImportedContainer[];
      vehicles: import("@/lib/importer").ImportedVehicle[];
      drivers: import("@/lib/importer").ImportedDriver[];
    }[];
  } | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "planning" || t === "incentives" || t === "issues" || t === "masters") setTab(t);
  }, []);

  const completed = state.trips.filter((t) => t.state === "completed");
  
  const liveTeu = SHIFT.teuDoneBase + completed.filter((t) => t.id >= 1000).reduce((a, t) => a + t.teu, 0);
  const running = state.vehicles.filter((v) => v.status === "running").length;
  const standby = state.vehicles.filter((v) => v.status === "standby").length;
  const openIssues = state.issues.filter((i) => i.status !== "resolved");

  // trip distribution per vehicle
  const tripCount: Record<string, number> = {};
  completed.forEach((t) => (tripCount[t.vehicleId] = (tripCount[t.vehicleId] ?? 0) + 1));
  const dist = [0, 0, 0, 0]; // 1,2,3,4+
  Object.values(tripCount).forEach((n) => dist[Math.min(n, 4) - 1]++);
  const singleTrip = dist[0];

  // incentive ledger per driver
  const ledger = state.drivers.map((d) => {
    const trips = state.trips.filter((t) => t.driverId === d.id && ["completed", "aborted"].includes(t.state));
    const teu = trips.filter((t) => t.state === "completed").reduce((a, t) => a + t.teu, 0);
    const amt = trips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0) + (teu >= state.milestoneTeu ? state.rateCard.milestoneBonus : 0);
    const pendingApproval = trips.some((t) => t.verification === "verified");
    return { d, trips: trips.length, teu, amt, pendingApproval };
  });

  const pendencyNow = SHIFT.pendencyStart + SHIFT.pendencyAdd - liveTeu;

  // hot list: derive from the export pool's real gate cutoffs; fall back to seed examples when empty
  const exportPool = state.pool.filter((c) => c.direction === "export");
  const derivedHot = Object.entries(
    exportPool.reduce<Record<string, typeof exportPool>>((acc, c) => {
      const key = c.terminal || "—";
      (acc[key] = acc[key] ?? []).push(c);
      return acc;
    }, {})
  ).map(([term, rows], i) => {
    const c20 = rows.filter((r) => r.size === "20").length;
    const c40 = rows.filter((r) => r.size === "40").length;
    const cuts = rows.map((r) => Date.parse(r.cutoff ?? "")).filter((n) => !isNaN(n));
    const earliest = cuts.length ? Math.min(...cuts) : NaN;
    const deadlineMin = isNaN(earliest) ? 9999 : Math.round((earliest - Date.now()) / 60000);
    return {
      id: 1000 + i,
      label: isNaN(earliest) ? "Export pending" : `Gate cutoff ${new Date(earliest).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      terminal: term,
      count: `${c20}×20' + ${c40}×40'`,
      deadlineMin,
      boost: deadlineMin < 360 ? 40 : 0,
      done: 0,
      total: rows.length,
    };
  }).sort((a, b) => a.deadlineMin - b.deadlineMin);
  const hotJobs = derivedHot.length ? derivedHot : HOT_JOBS;

  const reportText = `*EXIM Terminal Movement Pendency* Details ( In TEUS)
${new Date().toLocaleDateString("en-GB").replace(/\//g, ".")} Day Shift (08:00 to 14:00)

At the shift start:${SHIFT.pendencyStart}
During shift add:${SHIFT.pendencyAdd}
Balance:${SHIFT.pendencyStart + SHIFT.pendencyAdd}
Actual Completed:${liveTeu}
Current Pendency:${pendencyNow}

*Remarks: ${standby > 0 ? `${standby} ITV standby CT3 gate (no parchi) — evidence pack attached` : ""}

*Total ${60 + running}"ITV Running*

— auto-generated by ITV App · ${singleTrip} single-trip ITVs · ${openIssues.length} open issues`;

  return (
    <main className="min-h-screen w-full pb-16">
      {/* top bar */}
      <div className="bg-[#1F3864] text-white">
        <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" title="Home"><Wordmark dark compact /></Link>
            <div className="border-l border-[#3A5480] pl-4">
              <span className="font-bold text-[15px]">{SITE.name}</span>
              <span className="text-[#B9C6DE] text-xs ml-3">{SHIFT.label} · live · sim {fmtClock(state.now)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setReportOpen(true); setCopied(false); }}
              className="bg-[#1E9E5A] text-white text-xs font-bold px-3.5 py-2 rounded-md"
            >
              ⇪ Generate 14:00 pendency report → WhatsApp
            </button>
            <button
              onClick={() => dispatch({ type: "resetDemo" })}
              className="border border-[#3A54A0] text-[#B9C6DE] text-xs font-bold px-3 py-2 rounded-md"
              title="Clear saved session and restart the shift"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-6xl mx-auto px-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#D8DEE7] rounded-b-xl overflow-hidden">
          <div className="p-4 border-r border-b lg:border-b-0 border-[#EDF0F5]">
            <p className="text-[10px] tracking-[0.11em] uppercase text-[#5C6B80] font-bold">ITVs allotted / reporting / running</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">
              {SHIFT.itvsAllotted} / {SHIFT.itvsReporting} / <span className="text-[#1E9E5A]">{60 + running}</span>
            </p>
            <p className="text-[11px] text-[#D64545] font-semibold">{standby} standby · 1 breakdown · 1 no driver</p>
          </div>
          <div className="p-4 lg:border-r border-b lg:border-b-0 border-[#EDF0F5]">
            <p className="text-[10px] tracking-[0.11em] uppercase text-[#5C6B80] font-bold">TEUs done vs shift target</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">
              {liveTeu} <span className="text-sm text-[#5C6B80] font-semibold">/ {SITE.shiftTeuTarget}</span>
            </p>
            <p className="text-[11px] text-[#5C6B80]">Pendency now: {pendencyNow} TEUs</p>
          </div>
          <div className="p-4 border-r border-[#EDF0F5]">
            <p className="text-[10px] tracking-[0.11em] uppercase text-[#5C6B80] font-bold">Single-trip ITVs (live)</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{singleTrip}</p>
            <p className="text-[11px] text-[#1E9E5A] font-semibold">vs 22 same time yesterday</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] tracking-[0.11em] uppercase text-[#5C6B80] font-bold">Open issues</p>
            <p className="text-2xl font-extrabold tabular-nums mt-0.5">{openIssues.length}</p>
            <p className="text-[11px] text-[#D64545] font-semibold">
              {openIssues[0] ? `${openIssues[0].detail.slice(0, 40)}…` : "—"}
            </p>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1.5 mt-5 flex-wrap">
          {(["live", "planning", "incentives", "issues", "masters"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-bold px-3.5 py-2 rounded-md border ${
                tab === t ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#5C6B80] border-[#D8DEE7]"
              }`}
            >
              {t === "live" ? "Live board" : t === "planning" ? "Planning & imports" : t === "incentives" ? "Incentive ledger" : t === "masters" ? "Masters & settings" : `Issues (${openIssues.length})`}
            </button>
          ))}
        </div>

        {/* LIVE BOARD */}
        {tab === "live" && (
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 mt-4">
            <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Fleet board · live (A333 is the demo driver)</p>
              <table className="w-full text-[12.5px] min-w-[560px]">
                <thead>
                  <tr><Th>ITV</Th><Th>Driver</Th><Th>Status</Th><Th>Where / why</Th><Th>Trips</Th><Th>Since</Th></tr>
                </thead>
                <tbody>
                  {state.vehicles.map((v) => {
                    const drv = state.drivers.find((d) => d.id === v.driverId);
                    const st = STATUS_STYLE[v.status];
                    return (
                      <tr key={v.id} className={v.id === "A333" ? "bg-[#FFF7F1]" : ""}>
                        <Td className="font-mono font-bold">{v.id}</Td>
                        <Td>{drv ? drv.name.split(" ")[0] + " " + drv.name.split(" ")[1]?.[0] + "." : "—"}</Td>
                        <Td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span></Td>
                        <Td className="text-[#5C6B80] text-[11.5px]">{v.statusNote ?? v.zone}</Td>
                        <Td className="font-mono">{tripCount[v.id] ?? 0}</Td>
                        <Td className="font-mono text-[#5C6B80] text-[11px]">{fmtClock(Math.max(0, state.now - v.statusSince))}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-3 bg-[#F2F7F3] border border-[#CBE3D3] rounded-lg px-3.5 py-2.5 flex flex-wrap justify-between items-center gap-2 text-[12px]">
                <span><b className="text-[#177A47]">Standby evidence pack ready:</b> CT3 gate · GPS-stamped · exportable PDF for terminal escalation</span>
                <button className="text-[10.5px] font-bold text-[#1F3864] border border-[#D8DEE7] bg-[#F6F8FB] rounded px-2.5 py-1">Download ▸</button>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
                <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Trip distribution · this shift</p>
                <div className="flex items-end gap-3 h-[110px]">
                  {dist.map((n, i) => {
                    const max = Math.max(...dist, 1);
                    const cls = i === 0 ? "bg-[#DB9A00]" : i === 3 ? "bg-[#1E9E5A]" : "bg-[#C9D4E4]";
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                        <span className="font-mono font-bold text-[13px]">{n}</span>
                        <div className={`w-full rounded-t ${cls} transition-all duration-500`} style={{ height: `${(n / max) * 75}%` }} />
                        <span className="text-[10px] text-[#5C6B80]">{i === 3 ? "4+ trips" : `${i + 1} trip${i ? "s" : ""}`}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#5C6B80] mt-2.5">The &quot;X ITV single trip&quot; argument, settled live.</p>
              </div>

              <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
                <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Hot list · D/O validity &amp; cutoffs</p>
                <div className="flex flex-col gap-2">
                  {hotJobs.map((h) => (
                    <div key={h.id} className="border border-[#D8DEE7] rounded-lg px-3 py-2 text-[12px]">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-semibold">{h.terminal} · {h.count}</span>
                        <span className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${h.deadlineMin < 240 ? "bg-[#FBE4E4] text-[#A83232]" : "bg-[#FBF1D9] text-[#8A6100]"}`}>
                          {h.deadlineMin < 0 ? "OVERDUE" : h.deadlineMin >= 9999 ? "no cutoff" : `${Math.floor(h.deadlineMin / 60)}:${String(h.deadlineMin % 60).padStart(2, "0")} left`}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1 text-[11px] text-[#5C6B80]">
                        <span>{h.label}{h.boost > 0 && <span className="text-[#E8641B] font-bold"> · ⚡+₹{h.boost} boost live</span>}</span>
                        <span className="font-mono">{h.done > 0 ? `${h.done}/${h.total}` : `${h.total} ctr`}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PLANNING — live pendency vs deployment, from the imported pool */}
        {tab === "planning" && (
          <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
              Live pendency vs ITVs deployed · from the imported feed {state.pool.length === 0 && "— upload the pendency file below to light this up"}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {[...SITE.terminals, "SCAN", "EXPORT"].map((term) => {
                const imports = state.pool.filter((c) => (c.direction ?? "import") === "import");
                const rows = term === "SCAN" ? imports.filter((c) => c.scan)
                  : term === "EXPORT" ? state.pool.filter((c) => c.direction === "export")
                  : imports.filter((c) => c.terminal === term && !c.scan);
                const teus = rows.reduce((a, c) => a + c.teu, 0);
                const oldest = rows.reduce((a, c) => Math.max(a, c.pendencyHrs ?? 0), 0);
                const odc = rows.filter((c) => c.category === "ODC").length;
                const assigned = Object.entries(state.assignments).filter(([, a]) =>
                  term === "SCAN" ? a.purpose === "scanning" : term === "EXPORT" ? a.purpose === "export" : a.target === term && a.purpose !== "export"
                ).length;
                const hot = teus > 0 && assigned === 0;
                return (
                  <div key={term} className={`border rounded-lg px-3 py-2.5 ${hot ? "border-[#D64545] bg-[#FDF6F6]" : "border-[#D8DEE7]"}`}>
                    <div className="flex justify-between items-baseline">
                      <span className="font-mono font-bold text-[13px]">{term}</span>
                      <span className={`text-[10px] font-bold ${hot ? "text-[#A83232]" : "text-[#177A47]"}`}>{assigned} ITV</span>
                    </div>
                    <p className="text-[18px] font-extrabold tabular-nums leading-tight">{teus} <span className="text-[10px] font-semibold text-[#5C6B80]">TEU pending</span></p>
                    <p className="text-[10px] text-[#5C6B80] font-mono">
                      {rows.length} ctr{oldest > 0 && ` · oldest ${Math.round(oldest / 24)}d`}{odc > 0 && ` · ${odc} ODC`}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-[#5C6B80] mt-2.5">
              Red = pendency with no ITV assigned. Pick actual ITVs below and send them — the terminal gate / EXIM loading point gives the container or work order.
            </p>
          </div>
        )}
        {tab === "planning" && (
          <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4 overflow-x-auto">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-1">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">
                ITV assignment board · live global pool (all vendors) · pick &amp; send
              </p>
              <span className="text-[11px] text-[#5C6B80]">
                Import: gate gives the container · Export: pickup yard + destination terminal
              </span>
            </div>
            <table className="w-full text-[12.5px] min-w-[680px]">
              <thead>
                <tr><Th>ITV</Th><Th>Driver</Th><Th>Status</Th><Th>Tags / notes</Th><Th>Assignment</Th></tr>
              </thead>
              <tbody>
                {state.vehicles.map((v) => {
                  const drv = state.drivers.find((d) => d.id === v.driverId);
                  const st = STATUS_STYLE[v.status];
                  const asg = state.assignments[v.id];
                  const assignable = !["breakdown", "no_driver", "offline"].includes(v.status) || v.id === "A333";
                  const val = asg ? `${asg.pickup ? asg.pickup + "|" : ""}${asg.target}|${asg.purpose}` : "";
                  return (
                    <tr key={v.id} className={v.id === "A333" ? "bg-[#FFF7F1]" : ""}>
                      <Td className="font-mono font-bold">{v.id}</Td>
                      <Td>{drv ? drv.name.split(" ")[0] : "—"}</Td>
                      <Td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span></Td>
                      <Td className="text-[11px]">
                        {v.tags.map((t) => (
                          <span key={t} className="inline-block bg-[#E8ECF6] text-[#3A54A0] font-bold rounded px-1.5 py-0.5 mr-1">{t}</span>
                        ))}
                        {drv?.note && <span className="text-[#8A6100]">✎ {drv.note}</span>}
                        {v.tags.length === 0 && !drv?.note && <span className="text-[#5C6B80]">—</span>}
                      </Td>
                      <Td>
                        <select
                          value={val}
                          disabled={!assignable}
                          onChange={(e) => {
                            const parts = e.target.value.split("|");
                            if (!e.target.value) dispatch({ type: "unassignVehicle", vehicleId: v.id });
                            else if (parts.length === 3)
                              dispatch({ type: "assignVehicle", vehicleId: v.id, assignment: { pickup: parts[0], target: parts[1], purpose: parts[2] as "export" } });
                            else
                              dispatch({ type: "assignVehicle", vehicleId: v.id, assignment: { target: parts[0], purpose: parts[1] as "import" } });
                          }}
                          className="border border-[#D8DEE7] rounded-md px-2 py-1.5 text-[12px] bg-white disabled:opacity-40 min-w-[190px]"
                        >
                          <option value="">— in pool (unassigned)</option>
                          <optgroup label="Import (gate gives container)">
                            <option value="MICT|import">MICT · import</option>
                            <option value="T2|import">T2 · import</option>
                            <option value="CT2|import">CT2 · import</option>
                            <option value="CT3|import">CT3 · import</option>
                            <option value="CT4|import">CT4 · import</option>
                          </optgroup>
                          <optgroup label="Export (pickup → terminal)">
                            <option value="EXIM-1|T2|export">EXIM-1 → T2 · export</option>
                            <option value="EXIM-1|CT4|export">EXIM-1 → CT4 · export</option>
                            <option value="EXIM-2|T2|export">EXIM-2 → T2 · export</option>
                            <option value="EXIM-2|CT4|export">EXIM-2 → CT4 · export</option>
                          </optgroup>
                          <optgroup label="Other">
                            <option value="SCAN|scanning">Scanning movement</option>
                            <option value="CP|check_package">Check package</option>
                          </optgroup>
                        </select>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-[#5C6B80] mt-3 border-t border-[#EDF0F5] pt-2.5">
              Assign A333 (highlighted) and watch the driver&apos;s next offer follow the assignment. Every assignment/change
              is logged as an audited plan-change event. Scanning-only ITVs should stay on scanning — the tags make it visible;
              hard rules can be enforced per site config.
            </p>
          </div>
        )}
        {tab === "planning" && (
          <div className="grid lg:grid-cols-2 gap-5 mt-4">
            <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Deployment plan · {SHIFT.label} · v3 (changes audited)</p>
              <table className="w-full text-[13px]">
                <thead><tr><Th>Movement</Th><Th>ITVs</Th><Th>Note</Th></tr></thead>
                <tbody>
                  {DEPLOYMENT.map((d) => (
                    <tr key={d.movement}>
                      <Td className="font-semibold capitalize">{d.movement.replace("_", " ")}</Td>
                      <Td className="font-mono font-bold">{d.itvs}</Td>
                      <Td className="text-[#5C6B80] text-[12px]">{d.note || "—"}</Td>
                    </tr>
                  ))}
                  <tr>
                    <Td className="font-bold">Total</Td>
                    <Td className="font-mono font-extrabold">{DEPLOYMENT.reduce((a, d) => a + d.itvs, 0)}</Td>
                    <Td className="text-[12px] text-[#5C6B80]">vendor confirms list in-app → no count disputes</Td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[11px] text-[#5C6B80] mt-3 border-t border-[#EDF0F5] pt-2.5">
                <b>Design rule:</b> we plan counts — the port gate assigns the container; the driver&apos;s ticket photo binds it. Plan changes are versioned &amp; logged (see Issues → plan_change).
              </p>
            </div>
            <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Imports · real files (Excel / CSV)</p>
                <span className="text-[10.5px] font-bold text-[#177A47] bg-[#E3F4EB] rounded-full px-2.5 py-1">
                  Pool: {state.pool.filter((c) => (c.direction ?? "import") === "import").length} import · {state.pool.filter((c) => c.direction === "export").length} export
                </span>
              </div>
              <label className="border-2 border-dashed border-[#C9D4E4] rounded-lg px-3.5 py-5 text-center text-[12.5px] cursor-pointer hover:bg-[#F6F8FB]">
                <span className="font-bold text-[#1F3864]">⇪ Drop / choose a file</span>
                <span className="block text-[11px] text-[#5C6B80] mt-1">
                  3-hr import pendency · export cutoff · ITV master · driver master — type auto-detected
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const { parseFile, guessKind, extractContainers, extractVehicles, extractDrivers } = await import("@/lib/importer");
                    const sheets = await parseFile(f);
                    const results = sheets.map((sh) => ({ sh, kind: guessKind(sh) }));
                    setImportPreview({ fileName: f.name, results: results.map(({ sh, kind }) => ({
                      sheet: sh.name,
                      kind,
                      headers: sh.rows[0] ?? [],
                      sample: sh.rows.slice(1, 5),
                      containers: kind === "container_pool" ? extractContainers(sh, f.name) : [],
                      vehicles: kind === "itv_master" ? extractVehicles(sh) : [],
                      drivers: kind === "driver_master" ? extractDrivers(sh) : [],
                    })) });
                    e.target.value = "";
                  }}
                />
              </label>
              {importPreview && (
                <div className="border border-[#D8DEE7] rounded-lg p-3 flex flex-col gap-2 text-[12px]">
                  <p className="font-bold font-mono text-[11.5px]">{importPreview.fileName}</p>
                  {importPreview.results.map((r, i) => (
                    <div key={i} className="border-t border-[#EDF0F5] pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Sheet <b className="font-mono">{r.sheet}</b> → detected{" "}
                          <b className="capitalize">{r.kind.replace("_", " ")}</b>
                          {r.kind === "container_pool" && <> · {r.containers.length} containers · {r.containers.length ? Math.round((r.containers.filter((c) => c.valid).length / r.containers.length) * 100) : 0}% check-digit valid</>}
                          {r.kind === "itv_master" && <> · {r.vehicles.length} ITVs</>}
                          {r.kind === "driver_master" && <> · {r.drivers.length} drivers</>}
                        </span>
                        {r.kind !== "unknown" && (
                          <button
                            onClick={() => {
                              if (r.kind === "container_pool") dispatch({ type: "importContainers", list: r.containers, source: importPreview.fileName });
                              if (r.kind === "itv_master") dispatch({ type: "importVehicles", list: r.vehicles });
                              if (r.kind === "driver_master") dispatch({ type: "importDrivers", list: r.drivers });
                              setImportPreview(null);
                            }}
                            className="text-[10.5px] font-bold text-white bg-[#1E9E5A] rounded px-2.5 py-1"
                          >
                            Import ▸
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto mt-1.5">
                        <table className="text-[10.5px] font-mono whitespace-nowrap">
                          <tbody>
                            <tr>{r.headers.slice(0, 8).map((h, j) => <td key={j} className="border border-[#EDF0F5] px-1.5 py-0.5 font-bold bg-[#F6F8FB]">{h || "—"}</td>)}</tr>
                            {r.sample.map((row, k) => (
                              <tr key={k}>{row.slice(0, 8).map((c, j) => <td key={j} className="border border-[#EDF0F5] px-1.5 py-0.5">{c || "—"}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setImportPreview(null)} className="text-[11px] text-[#5C6B80] self-start">Dismiss</button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="border border-[#D8DEE7] rounded-lg py-2 px-1.5">
                  <p className="font-bold text-[#177A47]">✉ Auto-forward</p>
                  <p className="text-[#5C6B80] font-mono text-[10px] mt-0.5">mundra@itv.app</p>
                  <p className="text-[10px] text-[#177A47] mt-0.5">active · parsed on arrival</p>
                </div>
                <button className="border border-[#D8DEE7] rounded-lg py-2 px-1.5">
                  <p className="font-bold text-[#1F3864]">⇪ Import</p>
                  <p className="text-[#5C6B80] text-[10px] mt-0.5">Excel / CSV / photo OCR</p>
                </button>
                <button className="border border-[#D8DEE7] rounded-lg py-2 px-1.5">
                  <p className="font-bold text-[#8A6100]">✎ Manual entry</p>
                  <p className="text-[#5C6B80] text-[10px] mt-0.5">stamped who/when/why</p>
                </button>
              </div>
              <p className="text-[11px] text-[#5C6B80]">
                Three channels, every input — no dependency on a single one. Manual entries are flagged and land in the daily manual-entries reconciliation report.
              </p>
            </div>
          </div>
        )}

        {/* INCENTIVES */}
        {tab === "incentives" && (
          <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4 overflow-x-auto">
            <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">
                Incentive ledger · rate card {state.rateCard.version} (₹{state.rateCard.perTeu.import}/TEU · night ×{state.rateCard.nightMultiplier} · quest +₹{state.rateCard.milestoneBonus} @ {state.milestoneTeu} TEU)
              </p>
              <span className="text-[11px] text-[#5C6B80]">Pipeline: provisional → verified → <b>approved</b> → paid (₹10k deposit retained)</span>
            </div>
            <table className="w-full text-[12.5px] min-w-[640px]">
              <thead><tr><Th>Driver</Th><Th>ITV</Th><Th>Trips</Th><Th>TEU</Th><Th>Quest</Th><Th>Shift incentive</Th><Th>Status</Th><Th>{""}</Th></tr></thead>
              <tbody>
                {ledger.filter((l) => l.trips > 0).sort((a, b) => b.amt - a.amt).map((l) => {
                  const veh = state.vehicles.find((v) => v.driverId === l.d.id);
                  return (
                    <tr key={l.d.id} className={l.d.id === "d-ramesh" ? "bg-[#FFF7F1]" : ""}>
                      <Td className="font-semibold">{l.d.name}</Td>
                      <Td className="font-mono">{veh?.id ?? "—"}</Td>
                      <Td className="font-mono">{l.trips}</Td>
                      <Td className="font-mono font-bold">{l.teu}</Td>
                      <Td>{l.teu >= state.milestoneTeu ? <span className="text-[#177A47] font-bold text-[11px]">✓ +₹{state.rateCard.milestoneBonus}</span> : <span className="text-[#5C6B80] text-[11px]">{state.milestoneTeu - l.teu} TEU to go</span>}</Td>
                      <Td className="font-mono font-extrabold">{fmtInr(l.amt)}</Td>
                      <Td>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.pendingApproval ? "bg-[#FBF1D9] text-[#8A6100]" : "bg-[#E3F4EB] text-[#177A47]"}`}>
                          {l.pendingApproval ? "VERIFIED · AWAITING APPROVAL" : "APPROVED"}
                        </span>
                      </Td>
                      <Td>
                        {l.pendingApproval && (
                          <button
                            onClick={() => dispatch({ type: "approveTrips", driverId: l.d.id })}
                            className="text-[10.5px] font-bold text-white bg-[#1E9E5A] rounded px-2.5 py-1"
                          >
                            Approve shift
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[11px] text-[#5C6B80] mt-3">
              Running parallel to the vendor&apos;s manual calculation for the first 2–4 weeks — this table is the comparison sheet.
            </p>
          </div>
        )}

        {/* ISSUES */}
        {tab === "issues" && (
          <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
              Issues &amp; exceptions · open first · everything owned &amp; audited
            </p>
            <div className="flex flex-col gap-2">
              {[...state.issues].sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0)).map((i) => (
                <div
                  key={i.id}
                  className={`flex flex-wrap items-center gap-3 border border-[#D8DEE7] rounded-lg px-3.5 py-2.5 text-[12.5px] border-l-4 ${
                    i.status === "resolved" ? "border-l-[#1E9E5A]" : i.status === "open" ? "border-l-[#D64545] bg-[#FDF6F6]" : "border-l-[#DB9A00] bg-[#FDFAF2]"
                  }`}
                >
                  <span className="font-bold min-w-[150px] capitalize">{i.type.replace(/_/g, " ")}{i.vehicleId ? ` · ${i.vehicleId}` : ""}</span>
                  <span className="text-[#5C6B80] flex-1 min-w-[220px]">{i.detail} · owner: <b>{i.owner}</b></span>
                  <span className="font-mono text-[10.5px] text-[#5C6B80] bg-[#EFF2F6] rounded px-2 py-0.5 whitespace-nowrap">{i.raisedBy}</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${ISSUE_STYLE[i.status]}`}>
                    {i.status.toUpperCase()} {i.status !== "resolved" && `· ${fmtClock(Math.max(0, state.now - i.openedAt))}`}
                  </span>
                  {i.status === "open" && (
                    <button onClick={() => dispatch({ type: "setIssueStatus", id: i.id, status: "acknowledged" })} className="text-[10.5px] font-bold border border-[#D8DEE7] rounded px-2 py-1">Ack</button>
                  )}
                  {i.status !== "resolved" && (
                    <button onClick={() => dispatch({ type: "setIssueStatus", id: i.id, status: "resolved" })} className="text-[10.5px] font-bold text-white bg-[#1F3864] rounded px-2 py-1">Resolve</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "masters" && <MastersTab />}
      </div>

      {/* report modal */}
      {reportOpen && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center p-4 z-50" onClick={() => setReportOpen(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-2">
              Auto-generated · today&apos;s exact WhatsApp format
            </p>
            <pre className="bg-[#F6F8FB] border border-[#D8DEE7] rounded-lg p-3.5 text-[12px] whitespace-pre-wrap font-mono">{reportText}</pre>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(reportText); setCopied(true); }}
                className="flex-1 bg-[#1E9E5A] text-white text-[13px] font-bold rounded-lg py-2.5"
              >
                {copied ? "Copied ✓ — paste in WhatsApp" : "Copy for WhatsApp"}
              </button>
              <button onClick={() => setReportOpen(false)} className="border border-[#D8DEE7] rounded-lg px-4 text-[13px] font-semibold text-[#5C6B80]">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {state.toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#16243A] text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-xl max-w-[90vw] text-center z-50">
          {state.toast}
        </div>
      )}
    </main>
  );
}


// ── Masters & settings: vendors, ITV/equipment master, drivers, daily driver↔ITV mapping, rate card ──
function MastersTab() {
  const { state, dispatch } = useApp();
  const [vName, setVName] = useState("");
  const [vType, setVType] = useState<"vendor" | "own">("vendor");
  const [nId, setNId] = useState("");
  const [nReg, setNReg] = useState("");
  const [nVen, setNVen] = useState("Active");
  const [dName, setDName] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dVen, setDVen] = useState("Active");
  const rc = state.rateCard;
  const [form, setForm] = useState({
    imp: rc.perTeu.import, exp: rc.perTeu.export, scan: rc.perTeu.scanning, cp: rc.perTeu.check_package,
    night: rc.nightMultiplier, mTeu: state.milestoneTeu, mBonus: rc.milestoneBonus, abort: rc.abortedTripCredit,
  });
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="grid lg:grid-cols-2 gap-5 mt-4">
      {/* SETTINGS */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-1">
          Incentive settings · currently {rc.version} (from {rc.effectiveFrom})
        </p>
        <p className="text-[11px] text-[#5C6B80] mb-3">Saving creates a new version — completed trips keep the rates they earned under. Every change is audited.</p>
        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          {([
            ["Rs/TEU - Import", "imp"], ["Rs/TEU - Export", "exp"], ["Rs/TEU - Scanning", "scan"], ["Rs/TEU - Check pkg", "cp"],
            ["Night multiplier", "night"], ["Milestone (TEU)", "mTeu"], ["Milestone bonus Rs", "mBonus"], ["Aborted-trip credit Rs", "abort"],
          ] as [string, keyof typeof form][]).map(([label, key]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase tracking-wide">{label}</span>
              <input
                type="number" step={key === "night" ? 0.1 : 1} value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: num(e.target.value) })}
                className="border border-[#D8DEE7] rounded-md px-2.5 py-2 tabular-nums"
              />
            </label>
          ))}
        </div>
        <button
          onClick={() => dispatch({ type: "updateSettings", milestoneTeu: form.mTeu, rateCard: { ...rc,
            perTeu: { import: form.imp, export: form.exp, scanning: form.scan, check_package: form.cp },
            nightMultiplier: form.night, milestoneBonus: form.mBonus, abortedTripCredit: form.abort } })}
          className="mt-4 bg-[#1F3864] text-white text-[13px] font-bold rounded-lg px-5 py-2.5"
        >
          Save as new version
        </button>
      </div>

      {/* VENDORS */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Vendor master</p>
        <div className="flex flex-col gap-2 mb-3">
          {state.vendors.map((v) => (
            <div key={v.id} className="flex justify-between items-center gap-2 border border-[#D8DEE7] rounded-lg px-3 py-2 text-[13px] flex-wrap">
              <span className="font-semibold">{v.name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.type === "own" ? "bg-[#E8ECF6] text-[#3A54A0]" : "bg-[#ECEFF3] text-[#6A7688]"}`}>
                {v.type === "own" ? "OWN - DIRECT EMPLOYMENT" : "VENDOR"}
              </span>
              <span className="text-[11px] text-[#5C6B80]">
                {state.vehicles.filter((x) => x.vendor.toLowerCase() === v.name.toLowerCase()).length} ITVs -{" "}
                {state.drivers.filter((x) => x.vendor.toLowerCase() === v.name.toLowerCase()).length} drivers
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Vendor name" className="flex-1 min-w-[140px] border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[13px]" />
          <select value={vType} onChange={(e) => setVType(e.target.value as "vendor" | "own")} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
            <option value="vendor">Vendor</option><option value="own">Own (direct)</option>
          </select>
          <button
            onClick={() => { if (!vName.trim()) return; dispatch({ type: "upsertVendor", vendor: { id: vName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: vName.trim(), type: vType } }); setVName(""); }}
            className="bg-[#1E9E5A] text-white text-[12px] font-bold rounded-md px-4 py-2"
          >+ Add</button>
        </div>
        <p className="text-[11px] text-[#5C6B80] mt-3 border-t border-[#EDF0F5] pt-2.5">
          &quot;Own&quot; = directly-employed drivers on our ITVs — same verified incentive engine; payout responsibility is ours.
        </p>
      </div>

      {/* ITV MASTER + DRIVER MAPPING */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
          ITV / equipment master - driver mapping (editable any day; mostly 1 driver = 1 ITV)
        </p>
        <table className="w-full text-[12.5px] min-w-[520px]">
          <thead><tr><Th>ITV</Th><Th>Reg</Th><Th>Vendor</Th><Th>Driver (today)</Th></tr></thead>
          <tbody>
            {state.vehicles.map((v) => (
              <tr key={v.id}>
                <Td className="font-mono font-bold">{v.id}</Td>
                <Td className="font-mono text-[11px] text-[#5C6B80]">{v.reg || "—"}</Td>
                <Td>{v.vendor}</Td>
                <Td>
                  <select
                    value={v.driverId ?? ""}
                    onChange={(e) => dispatch({ type: "mapDriver", vehicleId: v.id, driverId: e.target.value || null })}
                    className="border border-[#D8DEE7] rounded-md px-2 py-1.5 text-[12px] bg-white min-w-[150px]"
                  >
                    <option value="">— no driver</option>
                    {state.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 mt-3 flex-wrap">
          <input value={nId} onChange={(e) => setNId(e.target.value.toUpperCase())} placeholder="Call sign (A501)" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-36 font-mono" />
          <input value={nReg} onChange={(e) => setNReg(e.target.value.toUpperCase())} placeholder="Registration" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-40 font-mono" />
          <select value={nVen} onChange={(e) => setNVen(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
            {state.vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
          <button
            onClick={() => { if (!nId.trim()) return; dispatch({ type: "addVehicle", id: nId.trim(), reg: nReg.trim(), vendor: nVen, tags: [] }); setNId(""); setNReg(""); }}
            className="bg-[#1E9E5A] text-white text-[12px] font-bold rounded-md px-4 py-2"
          >+ Add ITV</button>
        </div>
        <p className="text-[11px] text-[#5C6B80] mt-2.5">Bulk entry: upload the ITV master Excel on Planning &amp; imports. Every mapping change is audited.</p>
      </div>

      {/* DRIVER MASTER */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Driver master</p>
        <table className="w-full text-[12.5px] min-w-[480px]">
          <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Vendor</Th><Th>ITV (today)</Th><Th>Note</Th></tr></thead>
          <tbody>
            {state.drivers.map((d) => {
              const veh = state.vehicles.find((v) => v.driverId === d.id);
              return (
                <tr key={d.id}>
                  <Td className="font-semibold">{d.name}</Td>
                  <Td className="font-mono text-[11.5px]">{d.phone || "—"}</Td>
                  <Td>{d.vendor}</Td>
                  <Td className="font-mono font-bold">{veh?.id ?? "—"}</Td>
                  <Td className="text-[11px] text-[#8A6100]">{d.note ?? ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex gap-2 mt-3 flex-wrap">
          <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Driver name" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-40" />
          <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} placeholder="Phone" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-36 font-mono" />
          <select value={dVen} onChange={(e) => setDVen(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
            {state.vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
          </select>
          <button
            onClick={() => { if (!dName.trim()) return; dispatch({ type: "addDriver", name: dName.trim(), phone: dPhone.trim(), vendor: dVen }); setDName(""); setDPhone(""); }}
            className="bg-[#1E9E5A] text-white text-[12px] font-bold rounded-md px-4 py-2"
          >+ Add driver</button>
        </div>
      </div>
    </div>
  );
}
