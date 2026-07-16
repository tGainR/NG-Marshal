"use client";

// Operator view — opens directly for equipment operators. One job: log today's
// hours + moves on THEIR mapped equipment (mapping comes from master control).
// Big steppers, no typing, ~3 taps to log a day. Plus a breakdown button.

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { getIdentity } from "@/lib/identity";
import { EQUIPMENT_TYPE_LABEL } from "@/lib/types";
import { Wordmark } from "@/components/Brand";

function Stepper({ label, value, onChange, step, big }: { label: string; value: number; onChange: (v: number) => void; step: number; big?: boolean }) {
  return (
    <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl p-4 flex-1">
      <p className="text-[13px] font-bold text-[#8FA0B5] text-center uppercase tracking-wide">{label}</p>
      <p className={`text-center font-extrabold tabular-nums ${big ? "text-[52px]" : "text-[44px]"} leading-tight`}>{value}</p>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onChange(Math.max(0, +(value - step).toFixed(1)))}
          className="flex-1 bg-[#22334A] rounded-xl py-3.5 text-[26px] font-extrabold active:scale-95"
        >−</button>
        <button
          onClick={() => onChange(+(value + step).toFixed(1))}
          className="flex-1 bg-[#1E9E5A] rounded-xl py-3.5 text-[26px] font-extrabold active:scale-95"
        >+</button>
      </div>
    </div>
  );
}

export default function OperatorPage() {
  const { state, dispatch } = useApp();
  const [opId, setOpId] = useState<string | null>(null);
  const [hours, setHours] = useState(8);
  const [moves, setMoves] = useState(0);
  const [saved, setSaved] = useState(false);
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    const id = getIdentity();
    if (id?.role === "operator") setOpId(id.personId);
    else setOpId(state.operators[0]?.id ?? null); // web demo / supervisor peek fallback
    setPeek(new URLSearchParams(window.location.search).get("peek") === "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = state.operators.find((o) => o.id === opId);
  const myEq = state.equipment.find((e) => e.operatorId === opId);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const myLogs = useMemo(() => state.equipmentLogs.filter((l) => l.operatorId === opId), [state.equipmentLogs, opId]);
  const todayLogs = myLogs.filter((l) => l.date === today);
  const monthLogs = myLogs.filter((l) => l.date.startsWith(month));
  const sum = (rows: typeof myLogs, k: "hours" | "moves") => rows.reduce((a, l) => a + l[k], 0);

  const save = () => {
    if (!myEq || !me || (hours <= 0 && moves <= 0)) return;
    dispatch({ type: "logEquipmentUsage", equipmentId: myEq.id, operatorId: me.id, date: today, hours, moves, enteredBy: me.name });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <main className="min-h-screen bg-[#31405A] py-5 px-4 flex flex-col items-center gap-3">
      {peek && (
        <a href="/supervisor" className="w-full max-w-[390px] bg-[#E8641B] text-white text-center font-bold rounded-xl py-2.5 text-[14px]">
          ← Supervisor view पर वापस
        </a>
      )}
      <div className="w-full max-w-[390px] flex justify-between items-center text-[#B9C6DE] text-xs">
        <Wordmark dark compact />
        <span>ऑपरेटर</span>
      </div>

      <div className="w-full max-w-[390px] bg-[#101A28] rounded-3xl border-[6px] border-[#060B12] shadow-2xl overflow-hidden text-[#EAF0F8]">
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#2A3A50]">
          <p className="text-[15px] font-bold">{me?.name ?? "—"}</p>
          <span className="font-mono text-[13px] font-bold bg-[#1A2739] border border-[#2A3A50] text-[#FFC08A] px-2.5 py-1 rounded">
            {myEq?.id ?? "—"}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {!myEq ? (
            <div className="bg-[#1A2739] border-2 border-[#D64545]/60 rounded-2xl p-5 text-center">
              <p className="text-[22px] font-extrabold text-[#FF9E9E]">मशीन नहीं मिली</p>
              <p className="text-[14px] text-[#C6D2E2] mt-2">Supervisor से बोलें — master control में आपकी equipment mapping नहीं है</p>
            </div>
          ) : (
            <>
              {/* my machine */}
              <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl px-4 py-3 text-center">
                <p className="text-[20px] font-extrabold">{EQUIPMENT_TYPE_LABEL[myEq.type]}</p>
                <p className="text-[12px] text-[#8FA0B5] font-mono mt-0.5">{myEq.id}{myEq.reg ? ` · ${myEq.reg}` : ""}</p>
              </div>

              {/* today entry — the whole job */}
              <p className="text-[15px] font-extrabold text-center">आज का काम लिखो</p>
              <div className="flex gap-3">
                <Stepper label="घंटे · Hours" value={hours} onChange={setHours} step={0.5} big />
                <Stepper label="मूव्स · Moves" value={moves} onChange={setMoves} step={5} big />
              </div>
              <button
                onClick={save}
                className={`w-full rounded-full py-5 text-[24px] font-extrabold text-white active:scale-[0.98] ${saved ? "bg-[#177A47]" : "bg-[#1E9E5A]"}`}
              >
                {saved ? "✓ सेव हो गया" : "सेव करो"}
              </button>

              {/* totals — big and readable */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl py-3">
                  <p className="text-[11px] font-bold text-[#8FA0B5] uppercase">आज · Today</p>
                  <p className="text-[24px] font-extrabold tabular-nums">{sum(todayLogs, "hours")}h · {sum(todayLogs, "moves")}</p>
                </div>
                <div className="bg-[#1A2739] border border-[#2A3A50] rounded-2xl py-3">
                  <p className="text-[11px] font-bold text-[#8FA0B5] uppercase">इस महीने · Month</p>
                  <p className="text-[24px] font-extrabold tabular-nums">{sum(monthLogs, "hours")}h · {sum(monthLogs, "moves")}</p>
                </div>
              </div>

              {/* last entries, compact */}
              {myLogs.slice(0, 3).map((l) => (
                <div key={l.id} className="flex justify-between bg-[#1A2739] border border-[#2A3A50] rounded-lg px-3 py-2 text-[13px]">
                  <span className="font-mono text-[#8FA0B5]">{l.date.slice(5)}</span>
                  <span className="font-mono font-bold">{l.hours}h · {l.moves} moves</span>
                </div>
              ))}

              {/* breakdown — one big obvious button */}
              <button
                onClick={() => me && dispatch({ type: "reportEquipmentIssue", equipmentId: myEq.id, by: me.name })}
                className="w-full border-2 border-[#D64545]/60 text-[#FF9E9E] rounded-2xl py-4 text-[18px] font-extrabold"
              >
                ⚠️ खराबी · Breakdown
              </button>
            </>
          )}
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
