"use client";
// ANALYTICS — what the retained data is actually for.
//
// Every number here comes from a record we deliberately keep: container history
// (TAT and throughput), feed snapshots (the pendency trend), and trips (ITV-wise
// and driver-wise productivity). If a panel here cannot be built, that record is
// not worth keeping — that is the test applied to the storage model.
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";

type View = "tat" | "trend" | "itv" | "driver";

const VIEWS: { id: View; label: string; blurb: string }[] = [
  { id: "tat", label: "TAT & throughput", blurb: "How long containers sit before they move, and how many clear per day." },
  { id: "trend", label: "Pendency trend", blurb: "What each uploaded feed said was pending — the shape of the backlog over time." },
  { id: "itv", label: "ITV-wise", blurb: "Trips and TEU per ITV, so idle or over-worked units show up." },
  { id: "driver", label: "Driver-wise", blurb: "Trips, TEU and earnings per driver." },
];

const DAY = 86400000;
const fmt = (n: number, d = 0) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function AnalyticsPanel() {
  const { state } = useApp();
  const [view, setView] = useState<View>("tat");
  const [days, setDays] = useState(7);

  const since = Date.now() - days * DAY;
  const hist = useMemo(() => state.history.filter((h) => h.outAt >= since), [state.history, since]);

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Analytics</p>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-md border ${days === d ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#5C6B80] border-[#D8DEE7]"}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`text-[11.5px] font-bold px-3 py-1.5 rounded-md border ${view === v.id ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#5C6B80] border-[#D8DEE7]"}`}>
            {v.label}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-[#5C6B80] mt-2 mb-3">{VIEWS.find((v) => v.id === view)?.blurb}</p>

      {view === "tat" && <Tat hist={hist} days={days} />}
      {view === "trend" && <Trend />}
      {view === "itv" && <ItvWise />}
      {view === "driver" && <DriverWise />}
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="text-[12px] text-[#5C6B80] py-6 text-center border border-dashed border-[#D8DEE7] rounded-lg">{what}</p>;
}

function Tat({ hist, days }: { hist: ReturnType<typeof useApp>["state"]["history"]; days: number }) {
  if (!hist.length) return <Empty what="No containers have cleared yet in this window. Upload two pendency feeds and the ones that disappear between them land here." />;

  const avg = (rows: typeof hist) => (rows.length ? rows.reduce((a, h) => a + h.dwellHrs, 0) / rows.length : 0);
  const byTerm = new Map<string, typeof hist>();
  hist.forEach((h) => {
    const k = h.term || "—";
    byTerm.set(k, [...(byTerm.get(k) ?? []), h]);
  });
  const imp = hist.filter((h) => h.dir === "import");
  const exp = hist.filter((h) => h.dir === "export");
  const teu = hist.reduce((a, h) => a + h.teu, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { k: "Average TAT", v: `${fmt(avg(hist), 1)} h`, s: `${fmt(hist.length)} containers cleared` },
          { k: "Import TAT", v: `${fmt(avg(imp), 1)} h`, s: `${fmt(imp.length)} containers` },
          { k: "Export TAT", v: `${fmt(avg(exp), 1)} h`, s: `${fmt(exp.length)} containers` },
          { k: "Throughput", v: `${fmt(teu / days, 1)} TEU/day`, s: `${fmt(teu)} TEU over ${days} days` },
        ].map((x) => (
          <div key={x.k} className="border border-[#D8DEE7] rounded-lg px-3 py-2.5">
            <p className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-[#5C6B80]">{x.k}</p>
            <p className="text-[21px] font-extrabold tabular-nums leading-tight">{x.v}</p>
            <p className="text-[10.5px] text-[#5C6B80]">{x.s}</p>
          </div>
        ))}
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
            {["Terminal", "Cleared", "TEU", "Avg TAT", "Worst"].map((h) => <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...byTerm.entries()].sort((a, b) => avg(b[1]) - avg(a[1])).map(([term, rows]) => (
            <tr key={term} className="border-b border-[#EDF0F5]">
              <td className="px-2 py-1.5 font-mono font-semibold">{term}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(rows.length)}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(rows.reduce((a, h) => a + h.teu, 0))}</td>
              <td className={`px-2 py-1.5 tabular-nums font-semibold ${avg(rows) >= 48 ? "text-[#C0392B]" : ""}`}>{fmt(avg(rows), 1)} h</td>
              <td className="px-2 py-1.5 tabular-nums text-[#5C6B80]">{fmt(Math.max(...rows.map((h) => h.dwellHrs)), 1)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trend() {
  const { state } = useApp();
  const feeds = state.feeds.slice(0, 40).reverse();
  if (!feeds.length) return <Empty what="No feeds uploaded yet. Every pendency file you load adds a point here." />;
  const max = Math.max(...feeds.map((f) => f.teu), 1);

  return (
    <div>
      <div className="flex items-end gap-1 h-40 border-b border-[#D8DEE7] pb-0">
        {feeds.map((f, i) => (
          <div key={i} className="flex-1 min-w-1.5 relative group" title={`${new Date(f.at).toLocaleString("en-IN")} · ${f.file}\n${f.pending} pending · ${f.teu} TEU\n+${f.added} new · ${f.updated} updated · ${f.cleared} cleared`}>
            <div className={`w-full rounded-t ${f.dir === "export" ? "bg-[#177A47]" : "bg-[#1F3864]"}`} style={{ height: `${(f.teu / max) * 150}px` }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10.5px] text-[#5C6B80] mt-1.5">
        <span>{new Date(feeds[0].at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="font-semibold">■ import ■ export · hover a bar for the feed detail · peak {fmt(max)} TEU</span>
        <span>{new Date(feeds[feeds.length - 1].at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <table className="w-full text-[12px] mt-3">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
            {["Feed", "When", "Dir", "Pending", "TEU", "New", "Updated", "Cleared"].map((h) => <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {state.feeds.slice(0, 12).map((f, i) => (
            <tr key={i} className="border-b border-[#EDF0F5]">
              <td className="px-2 py-1.5 font-mono text-[11px] max-w-56 truncate" title={f.file}>{f.file}</td>
              <td className="px-2 py-1.5 text-[#5C6B80]">{new Date(f.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td className="px-2 py-1.5">{f.dir === "export" ? "EXP" : "IMP"}</td>
              <td className="px-2 py-1.5 tabular-nums font-semibold">{fmt(f.pending)}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmt(f.teu)}</td>
              <td className="px-2 py-1.5 tabular-nums text-[#177A47]">+{f.added}</td>
              <td className="px-2 py-1.5 tabular-nums text-[#5C6B80]">{f.updated}</td>
              <td className="px-2 py-1.5 tabular-nums text-[#E8641B]">{f.cleared}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItvWise() {
  const { state } = useApp();
  const rows = state.vehicles.map((v) => {
    const trips = state.trips.filter((t) => t.vehicleId === v.id && t.state === "completed");
    return {
      v,
      trips: trips.length,
      teu: trips.reduce((a, t) => a + (t.teu ?? 0), 0),
      earn: trips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0),
    };
  }).sort((a, b) => b.teu - a.teu);
  const maxTeu = Math.max(1, ...rows.map((r) => r.teu));

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
          {["ITV", "Vendor", "Duty", "Trips", "TEU", "Share"].map((h) => <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.v.id} className="border-b border-[#EDF0F5]">
            <td className="px-2 py-1.5 font-mono font-bold">{r.v.id}</td>
            <td className="px-2 py-1.5 text-[#5C6B80]">{r.v.vendor}</td>
            <td className="px-2 py-1.5 text-[11px]">
              {r.v.restrictTo?.length ? <span className="text-[#C0392B] font-semibold">🔒 restricted</span> : r.v.priorityFor ? <span className="text-[#E8641B] font-semibold">★ {r.v.priorityFor}</span> : <span className="text-[#5C6B80]">—</span>}
            </td>
            <td className="px-2 py-1.5 tabular-nums font-semibold">{r.trips}</td>
            <td className="px-2 py-1.5 tabular-nums">{fmt(r.teu)}</td>
            <td className="px-2 py-1.5 w-40">
              <div className="h-2 bg-[#EDF0F5] rounded-full overflow-hidden"><div className="h-full bg-[#1F3864]" style={{ width: `${(r.teu / maxTeu) * 100}%` }} /></div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DriverWise() {
  const { state } = useApp();
  const rows = state.drivers.map((d) => {
    const trips = state.trips.filter((t) => t.driverId === d.id && t.state === "completed");
    return {
      d,
      trips: trips.length,
      teu: trips.reduce((a, t) => a + (t.teu ?? 0), 0),
      earn: trips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0),
    };
  }).sort((a, b) => b.teu - a.teu);
  const maxTeu = Math.max(1, ...rows.map((r) => r.teu));

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
          {["Driver", "Vendor", "Trips", "TEU", "Earned", "Share"].map((h) => <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.d.id} className="border-b border-[#EDF0F5]">
            <td className="px-2 py-1.5 font-semibold">{r.d.name}</td>
            <td className="px-2 py-1.5 text-[#5C6B80]">{r.d.vendor ?? "—"}</td>
            <td className="px-2 py-1.5 tabular-nums font-semibold">{r.trips}</td>
            <td className="px-2 py-1.5 tabular-nums">{fmt(r.teu)}</td>
            <td className="px-2 py-1.5 tabular-nums">₹{fmt(r.earn)}</td>
            <td className="px-2 py-1.5 w-40">
              <div className="h-2 bg-[#EDF0F5] rounded-full overflow-hidden"><div className="h-full bg-[#E8641B]" style={{ width: `${(r.teu / maxTeu) * 100}%` }} /></div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
