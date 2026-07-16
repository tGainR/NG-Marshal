"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useApp, RATE_CARD, SITE, SHIFT, HOT_JOBS } from "@/lib/store";
import { DEPLOYMENT } from "@/lib/seed";
import { fmtClock, fmtInr } from "@/lib/incentive";
import { parseSheetDateMs } from "@/lib/importer";
import { EQUIPMENT_TYPE_LABEL, EquipmentType, Issue, MOVEMENT_LABEL, VehicleStatus } from "@/lib/types";
import { Wordmark } from "@/components/Brand";

type Tab = "live" | "summary" | "planning" | "incentives" | "issues" | "masters" | "equipment";

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
  const [siteMenu, setSiteMenu] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "summary" || t === "planning" || t === "incentives" || t === "issues" || t === "masters" || t === "equipment") setTab(t);
  }, []);

  const site = state.sites.find((x) => x.id === state.activeSiteId) ?? SITE;
  const completed = state.trips.filter((t) => t.state === "completed");
  
  const liveTeu = SHIFT.teuDoneBase + completed.filter((t) => t.id >= 1000).reduce((a, t) => a + t.teu, 0);
  const running = state.vehicles.filter((v) => v.status === "running").length;
  const standby = state.vehicles.filter((v) => v.status === "standby").length;
  const equipRunning = state.equipment.filter((e) => e.status === "running").length;
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

  // robust cutoff parser — handles "7/5/26 10:00" (m/d/yy) and "20-06-2026 08:30" (d-m-yyyy)
  const parseCutoffMs = (raw?: string): number => {
    if (!raw) return NaN;
    let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return new Date(y, Number(m[1]) - 1, Number(m[2]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
    }
    m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
    return Date.parse(raw);
  };

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
    const cuts = rows.map((r) => parseCutoffMs(r.cutoff)).filter((n) => !isNaN(n));
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

— auto-generated by NG Marshal · ${singleTrip} single-trip ITVs · ${openIssues.length} open issues`;

  // shared import handler — used by the top CTA and the drop-zone
  async function handleImportFile(f: File) {
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
    setTab("planning");
  }

  return (
    <main className="min-h-screen w-full pb-16">
      {/* top bar */}
      <div className="bg-[#1F3864] text-white">
        <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" title="Home"><Wordmark dark compact /></Link>
            <div className="border-l border-[#3A5480] pl-4 relative">
              <button onClick={() => setSiteMenu((v) => !v)} className="flex items-center gap-1.5 text-left">
                <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-[#8FA3C7] block">Project</span>
                <span className="font-bold text-[15px] flex items-center gap-1.5">{site.name} <span className="text-[#8FA3C7] text-[10px]">▾</span></span>
              </button>
              <span className="text-[#B9C6DE] text-xs ml-0 block">{SHIFT.label} · live · sim {fmtClock(state.now)}</span>
              {siteMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSiteMenu(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-50 bg-white text-[#16243A] rounded-lg shadow-xl border border-[#D8DEE7] w-64 py-1.5">
                    <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#5C6B80] px-3 py-1.5">Projects / Sites</p>
                    {state.sites.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { dispatch({ type: "setActiveSite", siteId: s.id }); setSiteMenu(false); }}
                        className={`w-full text-left px-3 py-2 hover:bg-[#F6F8FB] flex items-center justify-between ${s.id === site.id ? "bg-[#F2F7F3]" : ""}`}
                      >
                        <span>
                          <span className="font-semibold text-[13px] block">{s.name}</span>
                          <span className="text-[11px] text-[#5C6B80]">{s.kind === "internal-transport" ? "Internal transport" : "External transport"} · {s.destinations.length} destinations</span>
                        </span>
                        {s.id === site.id && <span className="text-[#177A47] text-[12px] font-bold">✓</span>}
                      </button>
                    ))}
                    <div className="border-t border-[#EDF0F5] mt-1 pt-1">
                      <button
                        onClick={() => {
                          const name = prompt("New project / site name (e.g. Adani Hazira CFS)");
                          if (!name?.trim()) return;
                          const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                          const external = confirm("Is this an EXTERNAL-transport site (customer drivers, no internal ITV fleet)?\n\nOK = external · Cancel = internal");
                          dispatch({ type: "addSite", site: {
                            id, name: name.trim(), shortName: name.trim().split(" ").slice(0, 2).join(" "),
                            kind: external ? "external-transport" : "internal-transport",
                            destinations: [], terminals: [], monthlyTeuTarget: 0, shiftTeuTarget: 0, perItvTeuTarget: 10,
                          } });
                          setSiteMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[#F6F8FB] text-[13px] font-semibold text-[#1F3864]"
                      >
                        + Add project / site
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              className="bg-[#E8641B] text-white text-xs font-bold px-3.5 py-2 rounded-md flex items-center gap-1.5"
            >
              ⬆ Import file
            </button>
            <button
              onClick={() => { setReportOpen(true); setCopied(false); }}
              className="bg-[#1E9E5A] text-white text-xs font-bold px-3.5 py-2 rounded-md"
            >
              ⇪ Report → WhatsApp
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

      {/* KPI tiles — dense, scannable */}
      <div className="max-w-6xl mx-auto px-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 bg-white border border-[#D8DEE7] rounded-b-xl overflow-hidden">
          {[
            { k: "ITVs running", v: `${60 + running}`, sub: `of ${SHIFT.itvsAllotted}`, tone: "good" },
            { k: "TEUs / target", v: `${liveTeu}`, sub: `of ${site.shiftTeuTarget}`, tone: "ink" },
            { k: "Pendency", v: `${pendencyNow}`, sub: "TEU now", tone: "ink" },
            { k: "Single-trip", v: `${singleTrip}`, sub: "vs 22 y'day", tone: singleTrip > 15 ? "warn" : "good" },
            { k: "Equipment", v: `${equipRunning}`, sub: `of ${state.equipment.length}`, tone: "ink" },
            { k: "Open issues", v: `${openIssues.length}`, sub: openIssues.length ? "tracked" : "clear", tone: openIssues.length ? "warn" : "good" },
          ].map((x, i) => (
            <div key={x.k} className={`p-4 border-[#EDF0F5] ${i < 5 ? "border-r" : ""} ${i < 3 ? "border-b lg:border-b-0" : ""}`}>
              <p className="text-[9.5px] tracking-[0.11em] uppercase text-[#5C6B80] font-bold">{x.k}</p>
              <p className={`text-[26px] font-extrabold tabular-nums leading-tight mt-0.5 ${x.tone === "good" ? "text-[#177A47]" : x.tone === "warn" ? "text-[#C0392B]" : "text-[#16243A]"}`}>{x.v}</p>
              <p className="text-[10.5px] text-[#5C6B80] font-medium">{x.sub}</p>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="flex gap-1.5 mt-5 flex-wrap">
          {(["live", "summary", "planning", "incentives", "issues", "masters", "equipment"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-bold px-3.5 py-2 rounded-md border ${
                tab === t ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#5C6B80] border-[#D8DEE7]"
              }`}
            >
              {t === "live" ? "Live board" : t === "summary" ? "Pendency summary" : t === "planning" ? "Planning & imports" : t === "incentives" ? "Incentive ledger" : t === "masters" ? "Masters & settings" : t === "equipment" ? "Equipment" : `Issues (${openIssues.length})`}
            </button>
          ))}
        </div>

        {/* LIVE BOARD */}
        {tab === "live" && (
          <div className="mt-4 flex flex-col gap-5">
          {/* Deployment — locations first (with direction split), movements separately */}
          <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
              Deployment by location <span className="font-medium normal-case tracking-normal">· import / export split within each</span>
            </p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2.5">
              {site.destinations.map((dest) => {
                const at = Object.values(state.assignments).filter((a) =>
                  dest.kind === "ftwz" ? a.purpose === "ftwz" || a.target === dest.id : a.target === dest.id
                );
                const imp = at.filter((a) => a.purpose === "import").length;
                const exp = at.filter((a) => a.purpose === "export").length;
                return (
                  <div key={dest.id} className={`rounded-lg px-3 py-2.5 border ${dest.kind === "ftwz" ? "border-[#E8641B]/40 bg-[#FFF7F1]" : "border-[#D8DEE7]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[13px]">{dest.label}</span>
                      {dest.kind === "ftwz" && <span className="text-[8.5px] font-bold tracking-wide text-[#E8641B] uppercase">new</span>}
                    </div>
                    <p className="text-[22px] font-extrabold tabular-nums leading-tight">{at.length}<span className="text-[10px] font-semibold text-[#5C6B80] ml-1">ITV</span></p>
                    <p className="text-[10px] text-[#5C6B80] font-mono">
                      {dest.kind === "ftwz" ? "FTW zone" : `${imp} imp · ${exp} exp`}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3.5 pt-3 border-t border-[#EDF0F5]">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-2">Movements <span className="font-medium normal-case tracking-normal">· run across terminals</span></p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {([["scanning", "Scanning"], ["check_package", "Check package"]] as const).map(([purpose, label]) => (
                  <div key={purpose} className="rounded-lg px-3 py-2.5 border border-[#D8DEE7]">
                    <span className="font-bold text-[12.5px]">{label}</span>
                    <p className="text-[22px] font-extrabold tabular-nums leading-tight">
                      {Object.values(state.assignments).filter((a) => a.purpose === purpose).length}
                      <span className="text-[10px] font-semibold text-[#5C6B80] ml-1">ITV</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5">
            <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
              <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Fleet board · live</p>
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
                <span><b className="text-[#177A47]">Standby evidence pack ready</b> · CT3 gate · GPS-stamped</span>
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
          </div>
        )}

        {/* PLANNING — prominent import CTA, then live pendency vs deployment */}
        {tab === "planning" && (
          <label
            className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-[#1F3864] text-white rounded-xl px-5 py-4 cursor-pointer hover:bg-[#26426f] transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleImportFile(f); }}
          >
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
            <div>
              <p className="font-bold text-[15px] flex items-center gap-2">⬆ Import pendency, cutoff or master file</p>
              <p className="text-[12px] text-[#C9D4E6] mt-0.5">Drag a file here, or click — import pendency · export cutoff · ITV / driver master. Type auto-detected.</p>
            </div>
            <span className="bg-[#E8641B] text-white text-[13px] font-bold px-4 py-2 rounded-lg whitespace-nowrap">Choose file →</span>
          </label>
        )}
        {tab === "summary" && <PendencySummaryTab site={site} />}
        {tab === "planning" && <PendencyPanel site={site} />}
        {/* QUICK ALLOCATE + AUTO-PLAN */}
        {tab === "planning" && <QuickAllocateBar />}
        {tab === "planning" && state.proposal && <ProposalPanel />}
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
                        {v.restrictTo?.map((m) => (
                          <span key={m} className="inline-block bg-[#FBE4E4] text-[#A83232] font-bold rounded px-1.5 py-0.5 mr-1" title="Hard restriction — may ONLY do this">
                            🔒 {MOVEMENT_LABEL[m]} only
                          </span>
                        ))}
                        {v.preferFor?.map((m) => (
                          <span key={m} className="inline-block bg-[#E3F4EB] text-[#177A47] font-bold rounded px-1.5 py-0.5 mr-1" title="Preferred — send here first if possible">
                            ★ {MOVEMENT_LABEL[m]} preferred
                          </span>
                        ))}
                        {v.tags.map((t) => (
                          <span key={t} className="inline-block bg-[#E8ECF6] text-[#3A54A0] font-bold rounded px-1.5 py-0.5 mr-1">{t}</span>
                        ))}
                        {drv?.note && <span className="text-[#8A6100]">✎ {drv.note}</span>}
                        {!v.restrictTo?.length && !v.preferFor?.length && v.tags.length === 0 && !drv?.note && <span className="text-[#5C6B80]">—</span>}
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
                            <option value="FTWZ|ftwz">FTWZ movement</option>
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
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }}
                />
              </label>
              {importPreview && (
                <div className="border border-[#D8DEE7] rounded-lg p-3 flex flex-col gap-2 text-[12px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold font-mono text-[11.5px]">{importPreview.fileName}</p>
                    {importPreview.results.filter((r) => r.kind === "container_pool").length > 1 && (
                      <button
                        onClick={() => {
                          const all = importPreview.results.filter((r) => r.kind === "container_pool").flatMap((r) => r.containers);
                          dispatch({ type: "importContainers", list: all, source: `${importPreview.fileName} (all sheets)` });
                          setImportPreview(null);
                        }}
                        className="text-[11px] font-bold text-white bg-[#1F3864] rounded px-3 py-1.5"
                      >
                        Import ALL container sheets together ▸
                      </button>
                    )}
                  </div>
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
        {tab === "equipment" && <EquipmentTab />}
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
    imp: rc.perTeu.import, exp: rc.perTeu.export, scan: rc.perTeu.scanning, cp: rc.perTeu.check_package, ftwz: rc.perTeu.ftwz,
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
            ["Rs/TEU - FTWZ", "ftwz"], ["Night multiplier", "night"], ["Milestone (TEU)", "mTeu"], ["Milestone bonus Rs", "mBonus"],
            ["Aborted-trip credit Rs", "abort"],
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
            perTeu: { import: form.imp, export: form.exp, scanning: form.scan, check_package: form.cp, ftwz: form.ftwz },
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
          ITV master · driver mapping (editable any day; mostly 1 driver = 1 ITV)
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

// ── Equipment: reach stackers, forklifts, ECH — masters, operator mapping, daily hours/moves log ──
const EQUIP_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  running: { label: "RUNNING", cls: "bg-[#E3F4EB] text-[#177A47]" },
  standby: { label: "STANDBY", cls: "bg-[#FBF1D9] text-[#8A6100]" },
  breakdown: { label: "BREAKDOWN", cls: "bg-[#FBE4E4] text-[#A83232]" },
  no_operator: { label: "NO OPERATOR", cls: "bg-[#ECEFF3] text-[#6A7688]" },
  offline: { label: "OFF DUTY", cls: "bg-[#ECEFF3] text-[#6A7688]" },
};

const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_TYPE_LABEL) as EquipmentType[];

function EquipmentTab() {
  const { state, dispatch } = useApp();
  const today = new Date().toISOString().slice(0, 10);

  const [eId, setEId] = useState("");
  const [eType, setEType] = useState<EquipmentType>("reach_stacker");
  const [eReg, setEReg] = useState("");
  const [eVen, setEVen] = useState(state.vendors[0]?.name ?? "Active");

  const [oName, setOName] = useState("");
  const [oPhone, setOPhone] = useState("");
  const [oVen, setOVen] = useState(state.vendors[0]?.name ?? "Active");

  const [logEquip, setLogEquip] = useState("");
  const [logOp, setLogOp] = useState("");
  const [logHours, setLogHours] = useState("");
  const [logMoves, setLogMoves] = useState("");
  const [logNote, setLogNote] = useState("");

  const byType = EQUIPMENT_TYPES.map((t) => ({
    type: t,
    items: state.equipment.filter((e) => e.type === t),
  }));

  const todaysLogs = state.equipmentLogs.filter((l) => l.date === today);
  const totalHours = todaysLogs.reduce((a, l) => a + l.hours, 0);
  const totalMoves = todaysLogs.reduce((a, l) => a + l.moves, 0);

  return (
    <div className="grid gap-5 mt-4">
      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {byType.map(({ type, items }) => {
          const running = items.filter((e) => e.status === "running").length;
          return (
            <div key={type} className="bg-white border border-[#D8DEE7] rounded-lg px-3.5 py-3">
              <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#5C6B80]">{EQUIPMENT_TYPE_LABEL[type]}</p>
              <p className="text-[20px] font-extrabold tabular-nums mt-0.5">
                {items.length} <span className="text-[11px] font-semibold text-[#5C6B80]">unit{items.length === 1 ? "" : "s"}</span>
              </p>
              <p className="text-[11px] text-[#1E9E5A] font-semibold">{running} running now</p>
            </div>
          );
        })}
        <div className="bg-[#1F3864] text-white rounded-lg px-3.5 py-3">
          <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#B9C6DE]">Today&apos;s logged usage</p>
          <p className="text-[20px] font-extrabold tabular-nums mt-0.5">{totalHours}h <span className="text-[13px] font-semibold text-[#B9C6DE]">· {totalMoves} moves</span></p>
          <p className="text-[11px] text-[#B9C6DE]">{todaysLogs.length} entries today</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* EQUIPMENT MASTER */}
        <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
          <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
            Equipment master · operator mapping
          </p>
          <table className="w-full text-[12.5px] min-w-[560px]">
            <thead><tr><Th>Asset</Th><Th>Type</Th><Th>Vendor</Th><Th>Status</Th><Th>Operator (today)</Th></tr></thead>
            <tbody>
              {state.equipment.map((e) => (
                <tr key={e.id}>
                  <Td className="font-mono font-bold">{e.id}</Td>
                  <Td className="text-[11.5px]">{EQUIPMENT_TYPE_LABEL[e.type]}</Td>
                  <Td>{e.vendor}</Td>
                  <Td>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${(EQUIP_STATUS_STYLE[e.status] ?? EQUIP_STATUS_STYLE.offline).cls}`}>
                      {(EQUIP_STATUS_STYLE[e.status] ?? EQUIP_STATUS_STYLE.offline).label}
                    </span>
                  </Td>
                  <Td>
                    <select
                      value={e.operatorId ?? ""}
                      onChange={(ev) => dispatch({ type: "mapOperator", equipmentId: e.id, operatorId: ev.target.value || null })}
                      className="border border-[#D8DEE7] rounded-md px-2 py-1.5 text-[12px] bg-white min-w-[150px]"
                    >
                      <option value="">— no operator</option>
                      {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3 flex-wrap">
            <input value={eId} onChange={(e) => setEId(e.target.value.toUpperCase())} placeholder="Asset tag (RS-09)" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-36 font-mono" />
            <select value={eType} onChange={(e) => setEType(e.target.value as EquipmentType)} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{EQUIPMENT_TYPE_LABEL[t]}</option>)}
            </select>
            <input value={eReg} onChange={(e) => setEReg(e.target.value.toUpperCase())} placeholder="Registration" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-36 font-mono" />
            <select value={eVen} onChange={(e) => setEVen(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
              {state.vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
            <button
              onClick={() => { if (!eId.trim()) return; dispatch({ type: "addEquipment", id: eId.trim(), equipType: eType, reg: eReg.trim(), vendor: eVen }); setEId(""); setEReg(""); }}
              className="bg-[#1E9E5A] text-white text-[12px] font-bold rounded-md px-4 py-2"
            >+ Add equipment</button>
          </div>
          <p className="text-[11px] text-[#5C6B80] mt-2.5">Covers reach stackers, 3T/5T forklifts, empty container handlers, forklifts with side-shifter. Every mapping change is audited.</p>
        </div>

        {/* OPERATOR MASTER */}
        <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
          <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">Operator master</p>
          <table className="w-full text-[12.5px] min-w-[420px]">
            <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Vendor</Th><Th>Equipment (today)</Th></tr></thead>
            <tbody>
              {state.operators.map((o) => {
                const eq = state.equipment.find((e) => e.operatorId === o.id);
                return (
                  <tr key={o.id}>
                    <Td className="font-semibold">{o.name}</Td>
                    <Td className="font-mono text-[11.5px]">{o.phone || "—"}</Td>
                    <Td>{o.vendor}</Td>
                    <Td className="font-mono font-bold">{eq?.id ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2 mt-3 flex-wrap">
            <input value={oName} onChange={(e) => setOName(e.target.value)} placeholder="Operator name" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-40" />
            <input value={oPhone} onChange={(e) => setOPhone(e.target.value)} placeholder="Phone" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-36 font-mono" />
            <select value={oVen} onChange={(e) => setOVen(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 text-[12px]">
              {state.vendors.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
            <button
              onClick={() => { if (!oName.trim()) return; dispatch({ type: "addOperator", name: oName.trim(), phone: oPhone.trim(), vendor: oVen }); setOName(""); setOPhone(""); }}
              className="bg-[#1E9E5A] text-white text-[12px] font-bold rounded-md px-4 py-2"
            >+ Add operator</button>
          </div>
          <p className="text-[11px] text-[#5C6B80] mt-2.5">Bulk entry (100+ operators) should go through an Excel import — same pattern as driver master; wire the parser to this list when the file format is confirmed.</p>
        </div>
      </div>

      {/* DAILY HOURS / MOVES LOG */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-3">
          Daily hours &amp; moves · operator-wise (manual entry until hour-meter/telematics integration)
        </p>
        <div className="flex gap-2 flex-wrap items-end mb-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase">Equipment</span>
            <select value={logEquip} onChange={(e) => setLogEquip(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 py-2 text-[12.5px] min-w-[130px]">
              <option value="">— select —</option>
              {state.equipment.map((e) => <option key={e.id} value={e.id}>{e.id}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase">Operator</span>
            <select value={logOp} onChange={(e) => setLogOp(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2 py-2 text-[12.5px] min-w-[130px]">
              <option value="">— select —</option>
              {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase">Hours</span>
            <input type="number" step="0.5" value={logHours} onChange={(e) => setLogHours(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-20 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase">Moves</span>
            <input type="number" value={logMoves} onChange={(e) => setLogMoves(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px] w-20 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <span className="text-[10.5px] font-bold text-[#5C6B80] uppercase">Note (optional)</span>
            <input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="e.g. yard 2 stacking" className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[12.5px]" />
          </label>
          <button
            onClick={() => {
              if (!logEquip || !logOp) return;
              dispatch({
                type: "logEquipmentUsage", equipmentId: logEquip, operatorId: logOp, date: today,
                hours: parseFloat(logHours) || 0, moves: parseInt(logMoves, 10) || 0, note: logNote.trim() || undefined,
                enteredBy: "Console user",
              });
              setLogHours(""); setLogMoves(""); setLogNote("");
            }}
            className="bg-[#1F3864] text-white text-[12.5px] font-bold rounded-md px-4 py-2"
          >+ Log entry</button>
        </div>
        <table className="w-full text-[12px] min-w-[560px]">
          <thead><tr><Th>Date</Th><Th>Equipment</Th><Th>Operator</Th><Th>Hours</Th><Th>Moves</Th><Th>Note</Th></tr></thead>
          <tbody>
            {state.equipmentLogs.slice(0, 12).map((l) => (
              <tr key={l.id}>
                <Td className="font-mono text-[11px]">{l.date}</Td>
                <Td className="font-mono font-bold">{l.equipmentId}</Td>
                <Td>{state.operators.find((o) => o.id === l.operatorId)?.name ?? "—"}</Td>
                <Td className="tabular-nums">{l.hours}</Td>
                <Td className="tabular-nums">{l.moves}</Td>
                <Td className="text-[#5C6B80] text-[11px]">{l.note ?? ""}</Td>
              </tr>
            ))}
            {state.equipmentLogs.length === 0 && (
              <tr><Td className="text-[#5C6B80]" >No entries yet — log the first shift&apos;s hours above.</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td><Td>{""}</Td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Quick allocate: "10 ITVs from Active → CT4 (import)" in one action ──
function QuickAllocateBar() {
  const { state, dispatch } = useApp();
  const lanes = state.planRules.lanes.filter((l) => l.enabled);
  const vendorNames = ["ALL", ...state.vendors.map((v) => v.name)];
  const [vendor, setVendor] = useState("ALL");
  const [count, setCount] = useState("10");
  const [laneKey, setLaneKey] = useState(lanes[0]?.id ?? "");

  const lane = lanes.find((l) => l.id === laneKey);
  const availableFromVendor = state.vehicles.filter(
    (v) => (vendor === "ALL" || v.vendor.toLowerCase() === vendor.toLowerCase()) && !["breakdown", "no_driver"].includes(v.status)
  ).length;

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
      <div className="flex flex-wrap items-end gap-2.5">
        <div>
          <p className="text-[10px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-1.5">Quick allocate</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[13px] font-semibold bg-white">
              {vendorNames.map((v) => <option key={v} value={v}>{v === "ALL" ? "Any vendor" : v}</option>)}
            </select>
            <input
              type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)}
              className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[13px] w-20 tabular-nums font-semibold"
            />
            <span className="text-[13px] text-[#5C6B80] font-semibold">ITVs →</span>
            <select value={laneKey} onChange={(e) => setLaneKey(e.target.value)} className="border border-[#D8DEE7] rounded-md px-2.5 py-2 text-[13px] font-semibold bg-white min-w-[150px]">
              {lanes.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <button
              onClick={() => {
                if (!lane) return;
                dispatch({ type: "quickAllocate", vendor, count: parseInt(count, 10) || 1, target: lane.target, purpose: lane.purpose, pickup: lane.pickup });
              }}
              className="bg-[#1F3864] text-white text-[13px] font-bold rounded-md px-5 py-2"
            >
              Allocate
            </button>
          </div>
          <p className="text-[11px] text-[#5C6B80] mt-1.5">
            {availableFromVendor} available from {vendor === "ALL" ? "all vendors" : vendor} · skips breakdown / no-driver / mid-trip / ineligible
          </p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => dispatch({ type: "suggestPlan" })}
            className="bg-[#E8641B] text-white text-[13px] font-bold rounded-md px-5 py-2.5 flex items-center gap-2"
          >
            ⚡ Suggest plan
          </button>
          <p className="text-[10.5px] text-[#5C6B80] mt-1.5 text-right">rules {state.planRules.version} · you review before it applies</p>
        </div>
      </div>
    </div>
  );
}

// ── Auto-plan proposal — always reviewed, never silently applied ──
function ProposalPanel() {
  const { state, dispatch } = useApp();
  const p = state.proposal;
  if (!p) return null;
  return (
    <div className="bg-white border-2 border-[#E8641B] rounded-xl p-4 mt-4">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">
          Proposed plan · {p.changes.length} change{p.changes.length === 1 ? "" : "s"} · rules {state.planRules.version}
        </p>
        <div className="flex gap-2">
          <button onClick={() => dispatch({ type: "discardProposal" })} className="border border-[#D8DEE7] text-[#5C6B80] text-[12.5px] font-bold rounded-md px-3.5 py-1.5">Discard</button>
          <button onClick={() => dispatch({ type: "applyProposal" })} className="bg-[#1E9E5A] text-white text-[12.5px] font-bold rounded-md px-4 py-1.5" disabled={p.changes.length === 0}>
            Apply plan
          </button>
        </div>
      </div>

      {/* per-lane before → after */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        {p.perLane.filter((l) => l.before !== l.after || l.demandTeu > 0).map((l) => (
          <div key={l.laneId} className="border border-[#D8DEE7] rounded-lg px-2.5 py-2">
            <p className="text-[10.5px] font-bold font-mono">{l.label}</p>
            <p className="text-[15px] font-extrabold tabular-nums">
              {l.before} <span className="text-[#5C6B80] text-[11px]">→</span> <span className={l.after > l.before ? "text-[#177A47]" : l.after < l.before ? "text-[#C0392B]" : ""}>{l.after}</span>
              <span className="text-[10px] text-[#5C6B80] font-semibold ml-1">ITV</span>
            </p>
            <p className="text-[10px] text-[#5C6B80]">{l.demandTeu} TEU pending</p>
          </div>
        ))}
      </div>

      {/* changes */}
      {p.changes.length > 0 && (
        <div className="overflow-x-auto max-h-64 overflow-y-auto border border-[#EDF0F5] rounded-lg">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[#F6F8FB]">
              <tr><Th>ITV</Th><Th>Vendor</Th><Th>From</Th><Th>To</Th><Th>Why</Th></tr>
            </thead>
            <tbody>
              {p.changes.map((c) => (
                <tr key={c.vehicleId}>
                  <Td className="font-mono font-bold">{c.vehicleId}</Td>
                  <Td>{c.vendor}</Td>
                  <Td className="text-[#5C6B80]">{c.fromLabel ?? "— pool"}</Td>
                  <Td className="font-semibold">{c.toLabel}</Td>
                  <Td className="text-[11px] text-[#5C6B80]">{c.reason}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.gaps.length > 0 && (
        <div className="mt-3 bg-[#FDFAF2] border border-[#F0DFAF] rounded-lg px-3.5 py-2.5">
          <p className="text-[11px] font-bold text-[#8A6100] mb-1">Honest gaps</p>
          {p.gaps.map((g) => <p key={g} className="text-[11.5px] text-[#8A6100]">· {g}</p>)}
        </div>
      )}
    </div>
  );
}

// ── Pendency, structured properly ────────────────────────────────────────
// Locations (MICT/T2/CT…) and directions (import/export) are DIFFERENT dimensions
// and must never sit at the same level. Hierarchy here:
//   Total pendency → split by direction → then location-wise within that direction.
// Scanning / check-package are MOVEMENTS, not locations — shown separately below.
function PendencyPanel({ site }: { site: import("@/lib/types").Site }) {
  const { state } = useApp();
  const [dir, setDir] = useState<"import" | "export">("import");

  const imports = state.pool.filter((c) => (c.direction ?? "import") === "import");
  const exports_ = state.pool.filter((c) => c.direction === "export");
  const teuOf = (rows: typeof state.pool) => rows.reduce((a, c) => a + c.teu, 0);

  const impTeu = teuOf(imports);
  const expTeu = teuOf(exports_);
  const scanRows = imports.filter((c) => c.scan);
  const scanTeu = teuOf(scanRows);
  const totalTeu = impTeu + expTeu;

  const rowsFor = (dest: { id: string; kind: string }) => {
    if (dest.kind === "ftwz") return [];
    return dir === "import"
      ? imports.filter((c) => c.terminal === dest.id && !c.scan)
      : exports_.filter((c) => c.terminal === dest.id);
  };
  const itvsAt = (dest: { id: string; kind: string }) =>
    Object.values(state.assignments).filter((a) =>
      dest.kind === "ftwz" ? a.purpose === "ftwz" || a.target === dest.id : a.target === dest.id && a.purpose === dir
    ).length;

  const movementItvs = (purpose: string) => Object.values(state.assignments).filter((a) => a.purpose === purpose).length;

  const Chip = ({ on, onClick, label, value }: { on: boolean; onClick: () => void; label: string; value: string }) => (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-lg border text-left transition-colors ${
        on ? "bg-[#1F3864] border-[#1F3864] text-white" : "bg-white border-[#D8DEE7] text-[#16243A] hover:border-[#1F3864]"
      }`}
    >
      <span className={`block text-[9.5px] font-bold tracking-[0.1em] uppercase ${on ? "text-[#B9C6DE]" : "text-[#5C6B80]"}`}>{label}</span>
      <span className="block text-[17px] font-extrabold tabular-nums leading-tight">{value}</span>
    </button>
  );

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
      {/* Level 1 — total, then direction */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="pr-3.5 mr-1 border-r border-[#D8DEE7]">
          <p className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-[#5C6B80]">Total pendency</p>
          <p className="text-[26px] font-extrabold tabular-nums leading-tight">
            {totalTeu.toLocaleString("en-IN")} <span className="text-[11px] font-semibold text-[#5C6B80]">TEU</span>
          </p>
        </div>
        <Chip on={dir === "import"} onClick={() => setDir("import")} label="Import" value={`${impTeu.toLocaleString("en-IN")} TEU`} />
        <Chip on={dir === "export"} onClick={() => setDir("export")} label="Export" value={`${expTeu.toLocaleString("en-IN")} TEU`} />
        <span className="text-[11px] text-[#5C6B80] ml-1">
          {dir === "import" ? `${imports.length} containers` : `${exports_.length} containers`} · click to switch view
        </span>
      </div>

      {/* Level 2 — location-wise, WITHIN the chosen direction */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">
          {dir === "import" ? "Import" : "Export"} pendency by location
        </p>
        <span className="text-[10.5px] text-[#5C6B80]">Red = pending with no ITV on this movement</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {site.destinations.map((dest) => {
          const rows = rowsFor(dest);
          const teus = teuOf(rows);
          const oldest = rows.reduce((a, c) => Math.max(a, c.pendencyHrs ?? 0), 0);
          const odc = rows.filter((c) => c.category === "ODC").length;
          const itvs = itvsAt(dest);
          const isFtwz = dest.kind === "ftwz";
          const hot = teus > 0 && itvs === 0;
          return (
            <div key={dest.id} className={`border rounded-lg px-3 py-2.5 ${hot ? "border-[#D64545] bg-[#FDF6F6]" : isFtwz ? "border-[#E8641B]/40 bg-[#FFF7F1]" : "border-[#D8DEE7]"}`}>
              <div className="flex justify-between items-baseline">
                <span className="font-mono font-bold text-[13px]">{dest.label}</span>
                <span className={`text-[10px] font-bold ${hot ? "text-[#A83232]" : "text-[#177A47]"}`}>{itvs} ITV</span>
              </div>
              {isFtwz ? (
                <p className="text-[11px] text-[#5C6B80] mt-1">No pendency feed<br />deployment only</p>
              ) : (
                <>
                  <p className="text-[18px] font-extrabold tabular-nums leading-tight">{teus} <span className="text-[10px] font-semibold text-[#5C6B80]">TEU</span></p>
                  <p className="text-[10px] text-[#5C6B80] font-mono">
                    {rows.length} ctr{oldest > 0 && ` · ${Math.round(oldest / 24)}d`}{odc > 0 && ` · ${odc} ODC`}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Movements — NOT locations, so they live on their own level */}
      <div className="mt-4 pt-3.5 border-t border-[#EDF0F5]">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold mb-2">Movements <span className="font-medium normal-case tracking-normal">· not locations — these run across terminals</span></p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <div className="border border-[#D8DEE7] rounded-lg px-3 py-2.5">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[12.5px]">Scanning</span>
              <span className="text-[10px] font-bold text-[#177A47]">{movementItvs("scanning")} ITV</span>
            </div>
            <p className="text-[18px] font-extrabold tabular-nums leading-tight">{scanTeu} <span className="text-[10px] font-semibold text-[#5C6B80]">TEU</span></p>
            <p className="text-[10px] text-[#5C6B80] font-mono">{scanRows.length} ctr · a slice of import</p>
          </div>
          <div className="border border-[#D8DEE7] rounded-lg px-3 py-2.5">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-[12.5px]">Check package</span>
              <span className="text-[10px] font-bold text-[#177A47]">{movementItvs("check_package")} ITV</span>
            </div>
            <p className="text-[11px] text-[#5C6B80] mt-1">No pendency feed<br />deployment only</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pendency Summary — the live version of the manually-maintained Excel ─────
// Mirrors "EXIM PENDENCY REPORT" exactly as the team knows it: import by dwell
// day × terminal × normal/scanning × 20'/40', export by cutoff day, total
// pendency box, yard inventory, terminal-wise ITV deployment plan. Computed
// live from the imported pool + assignments — no more hand-built pivot.
function PendencySummaryTab({ site }: { site: import("@/lib/types").Site }) {
  const { state } = useApp();
  const terms = site.destinations.filter((d) => d.kind === "terminal").map((d) => d.id);
  const now = new Date();
  const DAY = 86400000;

  const imports = state.pool.filter((c) => (c.direction ?? "import") === "import");
  const exports_ = state.pool.filter((c) => c.direction === "export");

  // dwell bucket 0=TODAY … 6=7th DAY & Above
  const dwellBucket = (c: (typeof imports)[number]) => Math.min(6, Math.floor((c.pendencyHrs ?? 0) / 24));
  const IMP_ROWS = ["7th DAY & Above", "6th DAY", "5th DAY", "4th DAY", "3rd DAY", "2nd DAY", "TODAY"]; // bucket 6..0
  const impCell = (bucket: number, term: string, scan: boolean, size: "20" | "40") =>
    imports.filter((c) => dwellBucket(c) === bucket && c.terminal === term && !!c.scan === scan && c.size === size).length;
  const impTeu = (bucket: number, scan: boolean) =>
    imports.filter((c) => dwellBucket(c) === bucket && !!c.scan === scan).reduce((a, c) => a + c.teu, 0);
  const dt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  // export cutoff bucket 0=TODAY CUTOFF+CP … 4=5th DAY
  const cutBucket = (c: (typeof exports_)[number]) => {
    const ms = parseSheetDateMs(c.cutoff);
    if (isNaN(ms)) return 0;
    const days = Math.floor((ms - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
    return Math.max(0, Math.min(4, days));
  };
  const EXP_ROWS = ["5th DAY", "4th DAY", "3rd DAY", "2nd DAY", "TODAY CUTOFF+CP"]; // bucket 4..0
  const expCell = (bucket: number, term: string, size: "20" | "40") =>
    exports_.filter((c) => cutBucket(c) === bucket && c.terminal === term && c.size === size).length;
  const expTeu = (bucket: number) => exports_.filter((c) => cutBucket(c) === bucket).reduce((a, c) => a + c.teu, 0);

  // totals box
  const tExp = exports_.reduce((a, c) => a + c.teu, 0);
  const tImpN = imports.filter((c) => !c.scan).reduce((a, c) => a + c.teu, 0);
  const tImpS = imports.filter((c) => c.scan).reduce((a, c) => a + c.teu, 0);

  // deployment plan
  const asg = Object.values(state.assignments);
  const planItv = (term: string, mode: "import" | "export") => asg.filter((a) => a.target === term && a.purpose === mode).length;
  const planBox = (term: string, mode: "import" | "export", size: "20" | "40") =>
    (mode === "import" ? imports : exports_).filter((c) => c.terminal === term && c.size === size).length;
  const availItv = state.vehicles.filter((v) => !["breakdown", "no_driver"].includes(v.status)).length - Object.keys(state.assignments).length;

  const H = "border border-[#9FB3C8] px-1.5 py-0.5 text-center";
  const HB = `${H} bg-[#1F3864] text-white font-bold`;
  const HG = `${H} bg-[#D5E4F0] font-bold`;
  const cell = (n: number, aged = false) => (
    <td className={`${H} font-mono tabular-nums ${n > 0 ? (aged ? "bg-[#F8CFCF] font-bold" : "bg-[#FBE9E9] font-semibold") : ""}`}>{n}</td>
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 overflow-x-auto">
        {/* title bar — same as the Excel */}
        <div className="bg-[#1F3864] text-white text-center font-extrabold text-[16px] py-2 rounded flex items-center justify-center gap-3">
          EXIM PENDENCY REPORT AS ON {`${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()} ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
          <span className="text-[9px] font-bold bg-[#1E9E5A] rounded-full px-2 py-0.5 tracking-wider">LIVE</span>
        </div>

        {/* IMPORT — dwell day × terminal × normal/scanning × size */}
        <table className="mt-3 text-[11px] whitespace-nowrap border-collapse">
          <thead>
            <tr>
              <td className={`${HB} text-left`} rowSpan={3}>DISCHARGE</td>
              <td className={HB} rowSpan={3}>Dwell Date</td>
              {terms.map((t) => <td key={t} className={HG} colSpan={4}>{t}</td>)}
              <td className={HG} colSpan={2}>Exim Scanning</td>
              <td className={HG} rowSpan={2}>Normal<br/>TEU&apos;s</td>
              <td className={HG} rowSpan={2}>Scanning<br/>TEU&apos;s</td>
              <td className={`${HB}`} rowSpan={3}>REMARK</td>
            </tr>
            <tr>
              {terms.map((t) => (
                <React.Fragment key={t}>
                  <td className={HG} colSpan={2}>Normal</td>
                  <td className={HG} colSpan={2}>Scanning</td>
                </React.Fragment>
              ))}
              <td className={HG} colSpan={2}>20&apos; / 40&apos;</td>
            </tr>
            <tr>
              {terms.map((t) => (
                <React.Fragment key={t}>
                  <td className={HG}>20&apos;</td><td className={HG}>40&apos;</td><td className={HG}>20&apos;</td><td className={HG}>40&apos;</td>
                </React.Fragment>
              ))}
              <td className={HG}>20&apos;</td><td className={HG}>40&apos;</td>
              <td className={HG}>TEU</td><td className={HG}>TEU</td>
            </tr>
          </thead>
          <tbody>
            {IMP_ROWS.map((label, i) => {
              const bucket = 6 - i;
              const rowDate = new Date(now.getTime() - bucket * DAY);
              const aged = bucket >= 1;
              return (
                <tr key={label}>
                  <td className={`${H} text-left font-bold`}>{label}</td>
                  <td className={`${H} font-mono`}>{dt(rowDate)}</td>
                  {terms.map((t) => (
                    <React.Fragment key={t}>
                      {cell(impCell(bucket, t, false, "20"), aged)}
                      {cell(impCell(bucket, t, false, "40"), aged)}
                      {cell(impCell(bucket, t, true, "20"), aged)}
                      {cell(impCell(bucket, t, true, "40"), aged)}
                    </React.Fragment>
                  ))}
                  {cell(0)}{cell(0)}
                  {cell(impTeu(bucket, false), aged)}
                  {cell(impTeu(bucket, true), aged)}
                  <td className={`${H} text-left text-[#C0392B] font-bold`}>{bucket >= 5 && impTeu(bucket, false) + impTeu(bucket, true) > 0 ? "LINE HOLD" : ""}</td>
                </tr>
              );
            })}
            <tr>
              <td className={`${H} text-left font-bold`}>CHECK PACKAGE</td>
              <td className={`${H} font-mono`}>{dt(now)}</td>
              {terms.map((t) => <React.Fragment key={t}>{cell(0)}{cell(0)}{cell(0)}{cell(0)}</React.Fragment>)}
              {cell(0)}{cell(0)}{cell(0)}{cell(0)}
              <td className={H}></td>
            </tr>
            <tr>
              <td className={`${HB} text-left`} colSpan={2}>IMPORT · TOTAL DPD</td>
              {terms.map((t) => (
                <React.Fragment key={t}>
                  <td className={`${HB} font-mono`}>{imports.filter((c) => c.terminal === t && !c.scan && c.size === "20").length}</td>
                  <td className={`${HB} font-mono`}>{imports.filter((c) => c.terminal === t && !c.scan && c.size === "40").length}</td>
                  <td className={`${HB} font-mono`}>{imports.filter((c) => c.terminal === t && c.scan && c.size === "20").length}</td>
                  <td className={`${HB} font-mono`}>{imports.filter((c) => c.terminal === t && c.scan && c.size === "40").length}</td>
                </React.Fragment>
              ))}
              <td className={`${HB} font-mono`}>0</td><td className={`${HB} font-mono`}>0</td>
              <td className={`${HB} font-mono`}>{tImpN}</td>
              <td className={`${HB} font-mono`}>{tImpS}</td>
              <td className={HB}></td>
            </tr>
          </tbody>
        </table>

        {/* EXPORT — cutoff day × terminal × size */}
        <table className="mt-4 text-[11px] whitespace-nowrap border-collapse">
          <thead>
            <tr>
              <td className={`${HB} text-left`} rowSpan={2}>CUTOFF</td>
              <td className={HB} rowSpan={2}>Cutoff Date</td>
              {terms.map((t) => <td key={t} className={HG} colSpan={2}>{t}</td>)}
              <td className={HG} rowSpan={2}>TEU&apos;s</td>
            </tr>
            <tr>{terms.map((t) => <React.Fragment key={t}><td className={HG}>20&apos;</td><td className={HG}>40&apos;</td></React.Fragment>)}</tr>
          </thead>
          <tbody>
            {EXP_ROWS.map((label, i) => {
              const bucket = 4 - i;
              const rowDate = new Date(now.getTime() + bucket * DAY);
              const urgent = bucket <= 1;
              return (
                <tr key={label}>
                  <td className={`${H} text-left font-bold`}>{label}</td>
                  <td className={`${H} font-mono`}>{dt(rowDate)}</td>
                  {terms.map((t) => (
                    <React.Fragment key={t}>
                      {cell(expCell(bucket, t, "20"), urgent)}
                      {cell(expCell(bucket, t, "40"), urgent)}
                    </React.Fragment>
                  ))}
                  {cell(expTeu(bucket), urgent)}
                </tr>
              );
            })}
            <tr>
              <td className={`${HB} text-left`} colSpan={2}>EXPORT · TOTAL</td>
              {terms.map((t) => (
                <React.Fragment key={t}>
                  <td className={`${HB} font-mono`}>{exports_.filter((c) => c.terminal === t && c.size === "20").length}</td>
                  <td className={`${HB} font-mono`}>{exports_.filter((c) => c.terminal === t && c.size === "40").length}</td>
                </React.Fragment>
              ))}
              <td className={`${HB} font-mono`}>{tExp}</td>
            </tr>
          </tbody>
        </table>

        {/* boxes: total pendency + yard inventory */}
        <div className="mt-4 flex flex-wrap gap-4">
          <table className="text-[11.5px] border-collapse">
            <thead><tr><td className={HB} colSpan={2}>TOTAL PENDENCY</td></tr></thead>
            <tbody>
              {([["EXPORT", tExp, true], ["IMPORT - NORMAL", tImpN, true], ["IMPORT - SCANNING", tImpS, false], ["CHECK PACKAGE", 0, false]] as [string, number, boolean][]).map(([k, v, red]) => (
                <tr key={k}>
                  <td className={`${H} text-left font-semibold`}>{k}</td>
                  <td className={`${H} font-mono font-bold ${red && v > 0 ? "bg-[#F8CFCF]" : ""}`}>{v}</td>
                </tr>
              ))}
              <tr><td className={`${HB} text-left`}>TOTAL</td><td className={`${HB} font-mono ${tExp + tImpN + tImpS > 0 ? "bg-[#C0392B]" : ""}`}>{tExp + tImpN + tImpS}</td></tr>
              <tr><td className={`${H} text-left text-[#C0392B] font-bold`}>Terminal HOLD MICT</td><td className={`${H} font-mono`}>00 TEUs</td></tr>
              <tr><td className={`${H} text-left font-semibold`}>EN-BLOCK LDD</td><td className={`${H} font-mono`}>00 Teus</td></tr>
              <tr><td className={`${H} text-left font-semibold`}>EN-BLOCK MTY</td><td className={`${H} font-mono`}>00 Teus</td></tr>
            </tbody>
          </table>

          <table className="text-[11.5px] border-collapse">
            <thead>
              <tr><td className={HB} colSpan={4}>YARD INVENTORY</td></tr>
              <tr><td className={HG}>SEGMENT</td><td className={HG}>20</td><td className={HG}>40</td><td className={HG}>TEUS</td></tr>
            </thead>
            <tbody>
              {["EXPORT - DOC", "EXPORT - BUFFER", "CHECK PACKAGE", "IMPORT"].map((seg) => (
                <tr key={seg}>
                  <td className={`${H} text-left font-semibold`}>{seg}</td>
                  <td className={`${H} text-[#5C6B80]`}>—</td><td className={`${H} text-[#5C6B80]`}>—</td><td className={`${H} text-[#5C6B80]`}>—</td>
                </tr>
              ))}
              <tr><td className={`${HB} text-left`}>TOTAL</td><td className={HB}>—</td><td className={HB}>—</td><td className={HB}>—</td></tr>
              <tr><td className={`${H} text-left text-[10px] text-[#5C6B80]`} colSpan={4}>yard inventory feed not connected yet</td></tr>
            </tbody>
          </table>
        </div>

        {/* Terminal-wise ITV deployment plan — live from assignments */}
        <table className="mt-4 text-[11px] whitespace-nowrap border-collapse">
          <thead>
            <tr><td className={HB} colSpan={2 + terms.length * 3}>Terminal Wise ITV Deployment Plan <span className="font-normal">(boxes pending by size · ITVs = live assignments)</span></td></tr>
            <tr>
              <td className={`${HG} text-left`} rowSpan={2}>MOVEMENT MODE</td>
              {terms.map((t) => <td key={t} className={HG} colSpan={3}>{t}</td>)}
              <td className={`${HG}`} rowSpan={2}>Available<br/>Trailers</td>
            </tr>
            <tr>{terms.map((t) => <React.Fragment key={t}><td className={HG}>20&apos;</td><td className={HG}>40&apos;</td><td className={HG}>ITVs</td></React.Fragment>)}</tr>
          </thead>
          <tbody>
            {(["export", "import"] as const).map((mode) => (
              <tr key={mode}>
                <td className={`${H} text-left font-bold uppercase`}>{mode}</td>
                {terms.map((t) => (
                  <React.Fragment key={t}>
                    {cell(planBox(t, mode, "20"))}
                    {cell(planBox(t, mode, "40"))}
                    <td className={`${H} font-mono font-bold ${planItv(t, mode) > 0 ? "bg-[#DDF0E4]" : ""}`}>{planItv(t, mode)}</td>
                  </React.Fragment>
                ))}
                {mode === "export"
                  ? <td className={`${H} font-mono font-extrabold bg-[#BFE0F5]`} rowSpan={2}>{Math.max(0, availItv)}</td>
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10.5px] text-[#5C6B80] mt-2">
          Live — recomputes the moment a pendency file lands or an ITV is assigned. Same layout as the manual Excel; LINE HOLD auto-flags 6th day+.
        </p>
      </div>
    </div>
  );
}
