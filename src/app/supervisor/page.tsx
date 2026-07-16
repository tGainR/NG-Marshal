"use client";

// Supervisor view — opens directly for supervisors. Field work only:
// see the fleet, act on issues, approve shifts, mark breakdowns.
// Planning/imports/masters live on the web console, not here.
// Supervisors may peek at the driver or operator views ("View as").

import { useEffect, useMemo, useState } from "react";
import { useApp, SUPERVISORS } from "@/lib/store";
import { getIdentity } from "@/lib/identity";
import { Vehicle } from "@/lib/types";
import { fmtClock, fmtInr } from "@/lib/incentive";
import { Wordmark } from "@/components/Brand";

const STATUS_HI: Record<Vehicle["status"], { label: string; cls: string }> = {
  running: { label: "चालू", cls: "bg-[#1E9E5A]/20 text-[#5CD79A]" },
  standby: { label: "खड़ी", cls: "bg-[#DB9A00]/20 text-[#F5B94B]" },
  breakdown: { label: "खराब", cls: "bg-[#D64545]/20 text-[#FF9E9E]" },
  diesel: { label: "डीज़ल", cls: "bg-[#3A54A0]/30 text-[#9FB4E8]" },
  no_driver: { label: "ड्राइवर नहीं", cls: "bg-[#2A3A50] text-[#8FA0B5]" },
  rest: { label: "आराम", cls: "bg-[#2A3A50] text-[#8FA0B5]" },
  offline: { label: "बंद", cls: "bg-[#2A3A50] text-[#8FA0B5]" },
};

type STab = "fleet" | "issues" | "approve";

export default function SupervisorPage() {
  const { state, dispatch } = useApp();
  const [supName, setSupName] = useState("Supervisor");
  const [tab, setTab] = useState<STab>("fleet");
  const [actionFor, setActionFor] = useState<string | null>(null);

  useEffect(() => {
    const id = getIdentity();
    if (id?.role === "supervisor") setSupName(id.name.split(" ")[0]);
    else setSupName(SUPERVISORS[0]?.name.split(" ")[0] ?? "Supervisor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = state.vehicles.filter((v) => v.status === "running").length;
  const standby = state.vehicles.filter((v) => v.status === "standby").length;
  const broken = state.vehicles.filter((v) => v.status === "breakdown").length;
  const openIssues = state.issues.filter((i) => i.status !== "resolved");

  const tripCount: Record<string, number> = {};
  state.trips.filter((t) => t.state === "completed").forEach((t) => (tripCount[t.vehicleId] = (tripCount[t.vehicleId] ?? 0) + 1));

  // shift approvals: drivers with verified (unapproved) completed trips
  const approvals = useMemo(() => {
    return state.drivers
      .map((d) => {
        const trips = state.trips.filter((t) => t.driverId === d.id && t.state === "completed");
        const pending = trips.filter((t) => t.verification === "verified");
        const teu = trips.reduce((a, t) => a + t.teu, 0);
        const amt = trips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0);
        return { d, trips: trips.length, pending: pending.length, teu, amt };
      })
      .filter((x) => x.pending > 0);
  }, [state.drivers, state.trips]);

  return (
    <main className="min-h-screen bg-[#31405A] py-5 px-4 flex flex-col items-center gap-3">
      <div className="w-full max-w-[420px] flex justify-between items-center text-[#B9C6DE] text-xs">
        <Wordmark dark compact />
        <div className="flex items-center gap-3">
          <span>{supName} · सुपरवाइज़र</span>
          <details className="relative">
            <summary className="list-none cursor-pointer text-[#FFC08A] font-bold">देखें ▾</summary>
            <div className="absolute right-0 top-6 z-40 bg-[#101A28] border border-[#2A3A50] rounded-xl overflow-hidden w-44 shadow-2xl">
              <a href="/driver?peek=1" className="block px-4 py-3 text-[13px] font-bold text-[#EAF0F8] border-b border-[#2A3A50]">🚚 Driver view</a>
              <a href="/operator?peek=1" className="block px-4 py-3 text-[13px] font-bold text-[#EAF0F8]">🏗️ Equipment view</a>
            </div>
          </details>
        </div>
      </div>

      <div className="w-full max-w-[420px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8]">
        {/* KPIs */}
        <div className="grid grid-cols-4 border-b border-[#2A3A50] text-center">
          {[
            { k: "चालू", v: running, c: "text-[#5CD79A]" },
            { k: "खड़ी", v: standby, c: "text-[#F5B94B]" },
            { k: "खराब", v: broken, c: "text-[#FF9E9E]" },
            { k: "Issues", v: openIssues.length, c: openIssues.length ? "text-[#FF9E9E]" : "text-[#5CD79A]" },
          ].map((x) => (
            <div key={x.k} className="py-3">
              <p className={`text-[26px] font-extrabold tabular-nums leading-tight ${x.c}`}>{x.v}</p>
              <p className="text-[11px] text-[#8FA0B5] font-bold">{x.k}</p>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="flex border-b border-[#2A3A50]">
          {([["fleet", "गाड़ियाँ"], ["issues", `Issues (${openIssues.length})`], ["approve", `मंज़ूरी (${approvals.length})`]] as [STab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3.5 text-[14px] font-extrabold ${tab === t ? "bg-[#1A2739] text-white border-b-2 border-[#E8641B]" : "text-[#8FA0B5]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-3.5 flex flex-col gap-2 max-h-[62vh] overflow-y-auto">
          {/* FLEET */}
          {tab === "fleet" && state.vehicles.map((v) => {
            const drv = state.drivers.find((d) => d.id === v.driverId);
            const st = STATUS_HI[v.status];
            return (
              <div key={v.id}>
                <button
                  onClick={() => setActionFor(actionFor === v.id ? null : v.id)}
                  className="w-full bg-[#1A2739] border border-[#2A3A50] rounded-xl px-3.5 py-3 flex items-center gap-3 text-left"
                >
                  <span className="font-mono font-extrabold text-[16px] w-14">{v.id}</span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-bold">{drv?.name.split(" ")[0] ?? "—"}</span>
                    <span className="block text-[11px] text-[#8FA0B5]">{v.vendor} · {tripCount[v.id] ?? 0} trips · {v.statusNote ?? v.zone}</span>
                  </span>
                  <span className={`text-[12px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                </button>
                {actionFor === v.id && (
                  <div className="flex gap-2 mt-1.5 mb-1">
                    {v.status !== "breakdown" ? (
                      <button
                        onClick={() => { dispatch({ type: "setVehicleStatus", vehicleId: v.id, status: "breakdown", by: supName }); setActionFor(null); }}
                        className="flex-1 bg-[#D64545]/20 border border-[#D64545]/50 text-[#FF9E9E] rounded-xl py-3 text-[14px] font-extrabold"
                      >
                        ⚠️ खराब mark करो
                      </button>
                    ) : (
                      <button
                        onClick={() => { dispatch({ type: "setVehicleStatus", vehicleId: v.id, status: "running", note: "Back from workshop", by: supName }); setActionFor(null); }}
                        className="flex-1 bg-[#1E9E5A]/20 border border-[#1E9E5A]/50 text-[#5CD79A] rounded-xl py-3 text-[14px] font-extrabold"
                      >
                        ✓ ठीक हो गई — चालू करो
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ISSUES */}
          {tab === "issues" && (openIssues.length === 0 ? (
            <p className="text-center text-[#5CD79A] font-bold py-8 text-[16px]">✓ कोई issue नहीं</p>
          ) : openIssues.map((i) => (
            <div key={i.id} className="bg-[#1A2739] border border-[#2A3A50] rounded-xl px-3.5 py-3">
              <div className="flex justify-between items-start gap-2">
                <p className="text-[14px] font-extrabold capitalize">{i.type.replace(/_/g, " ")}{i.vehicleId ? ` · ${i.vehicleId}` : ""}</p>
                <span className="text-[10px] font-mono text-[#F5B94B] whitespace-nowrap">{fmtClock(Math.max(0, state.now - i.openedAt))}</span>
              </div>
              <p className="text-[12px] text-[#8FA0B5] mt-1">{i.detail}</p>
              <div className="flex gap-2 mt-2.5">
                {i.status === "open" && (
                  <button onClick={() => dispatch({ type: "setIssueStatus", id: i.id, status: "acknowledged" })} className="flex-1 border border-[#2A3A50] rounded-xl py-2.5 text-[13px] font-extrabold text-[#C6D2E2]">
                    देखा ✓
                  </button>
                )}
                <button onClick={() => dispatch({ type: "setIssueStatus", id: i.id, status: "resolved" })} className="flex-1 bg-[#1E9E5A] rounded-xl py-2.5 text-[13px] font-extrabold text-white">
                  हल हो गया
                </button>
              </div>
            </div>
          )))}

          {/* APPROVALS */}
          {tab === "approve" && (approvals.length === 0 ? (
            <p className="text-center text-[#5CD79A] font-bold py-8 text-[16px]">✓ सब approve हो गया</p>
          ) : approvals.map(({ d, trips, pending, teu, amt }) => (
            <div key={d.id} className="bg-[#1A2739] border border-[#2A3A50] rounded-xl px-3.5 py-3 flex items-center gap-3">
              <span className="flex-1">
                <span className="block text-[15px] font-extrabold">{d.name}</span>
                <span className="block text-[12px] text-[#8FA0B5]">{trips} trips · {teu} TEU · {fmtInr(amt)} · {pending} pending</span>
              </span>
              <button
                onClick={() => dispatch({ type: "approveTrips", driverId: d.id })}
                className="bg-[#1E9E5A] rounded-xl px-4 py-3 text-[14px] font-extrabold text-white"
              >
                Approve ✓
              </button>
            </div>
          )))}
        </div>
      </div>

      {state.toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 bg-[#16243A] text-white text-[14px] font-bold px-5 py-3 rounded-full shadow-xl border border-[#2E5395] max-w-[90vw] text-center">
          🔔 {state.toast}
        </div>
      )}
    </main>
  );
}
