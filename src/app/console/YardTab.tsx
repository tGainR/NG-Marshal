"use client";
// YARD — the block-wise picture of where containers actually are.
//
// Modelled on the graphical yard view in terminal operating systems: a grid of
// blocks, one switchable colour dimension (Navis calls it "Color By"), and detail
// on demand rather than everything crammed into one view. The blocks are derived
// from the Location column of the pendency feed, so the map matches the ground
// without anyone maintaining a layout file.
import { useState } from "react";
import { useApp } from "@/lib/store";
import { ImportedContainer, livePool } from "@/lib/importer";
import { buildYard, blockColour, ColourBy, COLOUR_BY_LABEL, BlockSummary, parsePosition } from "@/lib/yard";

export default function YardTab() {
  const { state } = useApp();
  const [by, setBy] = useState<ColourBy>("dwell");
  const [open, setOpen] = useState<string | null>(null);

  const pool = livePool(state.pool);
  const yard = buildYard(pool);
  const busiest = Math.max(1, ...yard.blocks.map((b) => b.containers));
  const openBlock = yard.blocks.find((b) => b.block === open);

  if (!yard.blocks.length) {
    return (
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-8 mt-4 text-center">
        <p className="text-[15px] font-bold text-[#16243A]">No yard positions yet</p>
        <p className="text-[12.5px] text-[#5C6B80] mt-1.5 max-w-lg mx-auto">
          The yard map builds itself from the <b>Location</b> column of the pendency feed
          (positions like <code className="font-mono">1T22C.3</code>). Upload a pendency file and the blocks appear here.
          {yard.unplaced > 0 && <> {yard.unplaced} container{yard.unplaced === 1 ? "" : "s"} in the system have no readable position.</>}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Colour-by selector — one switchable dimension, so no view is overloaded */}
      <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-[0.1em] uppercase text-[#5C6B80] font-bold">Yard map</p>
            <p className="text-[12px] text-[#5C6B80] mt-0.5">
              {yard.blocks.length} blocks · {pool.length} containers · {yard.totalTeu.toLocaleString("en-IN")} TEU
              {yard.unplaced > 0 && <> · <b className="text-[#C0392B]">{yard.unplaced} with no position</b></>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#5C6B80] mr-1">Colour by</span>
            {(Object.keys(COLOUR_BY_LABEL) as ColourBy[]).map((k) => (
              <button
                key={k}
                onClick={() => setBy(k)}
                className={`text-[11.5px] font-bold px-2.5 py-1.5 rounded-md border ${
                  by === k ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#5C6B80] border-[#D8DEE7]"
                }`}
              >
                {COLOUR_BY_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <Legend by={by} />

        {/* the blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 mt-3.5">
          {yard.blocks.map((b) => {
            const c = blockColour(b, by, busiest);
            const dark = by === "fill" ? b.containers / busiest > 0.5 : true;
            return (
              <button
                key={b.block}
                onClick={() => setOpen(open === b.block ? null : b.block)}
                className={`rounded-lg p-3 text-left border-2 transition-all ${open === b.block ? "border-[#16243A] scale-[1.02]" : "border-transparent"}`}
                style={{ background: c, color: dark ? "#fff" : "#16243A" }}
                title={`${b.containers} containers · ${b.teu} TEU · oldest ${Math.round(b.maxDwellHrs)}h`}
              >
                <p className="font-mono font-extrabold text-[15px] leading-none">{b.block}</p>
                <p className="text-[22px] font-extrabold tabular-nums leading-tight mt-1">{b.containers}</p>
                <p className="text-[10.5px] font-semibold opacity-85 leading-tight">{b.teu} TEU · {b.bays.length || "?"} bays</p>
                {/* flag glyphs — a separate visual channel from colour, as in a TOS */}
                <p className="text-[11px] mt-1 h-4 leading-none opacity-95">
                  {b.scanning > 0 && <span title={`${b.scanning} awaiting scan`}>🔍{b.scanning} </span>}
                  {b.checkPackage > 0 && <span title={`${b.checkPackage} check package`}>📦{b.checkPackage} </span>}
                  {b.aged > 0 && <span title={`${b.aged} over 48h`}>⏱{b.aged}</span>}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {openBlock && <BlockDetail b={openBlock} pool={pool} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Legend({ by }: { by: ColourBy }) {
  const items: Record<ColourBy, [string, string][]> = {
    dwell: [["#1E9E5A", "none over 48h"], ["#E0A800", "some ageing"], ["#E8641B", "a quarter ageing"], ["#C0392B", "half or more ageing"]],
    direction: [["#1F3864", "mostly import"], ["#177A47", "mostly export"], ["#7A6BA8", "mixed"]],
    flags: [["#D8DEE7", "clear to move"], ["#E8641B", "scan pending"], ["#8E44AD", "check package"]],
    fill: [["#C9D4E6", "light"], ["#7E93C4", "moderate"], ["#3A54A0", "busy"], ["#1F3864", "fullest"]],
  };
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      {items[by].map(([c, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-[#5C6B80] font-medium">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: c }} />
          {label}
        </span>
      ))}
      <span className="text-[11px] text-[#5C6B80] ml-auto">🔍 scan pending · 📦 check package · ⏱ over 48h · click a block for detail</span>
    </div>
  );
}

function BlockDetail({ b, pool, onClose }: { b: BlockSummary; pool: ImportedContainer[]; onClose: () => void }) {
  const rows = pool
    .filter((c) => parsePosition(c.location)?.block === b.block)
    .sort((x, y) => (y.pendencyHrs ?? 0) - (x.pendencyHrs ?? 0));

  return (
    <div className="bg-white border border-[#D8DEE7] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-extrabold font-mono">Block {b.block}</p>
          <p className="text-[12px] text-[#5C6B80]">
            {b.containers} containers · {b.teu} TEU · {b.imports} import / {b.exports} export · oldest {Math.round(b.maxDwellHrs)}h
          </p>
        </div>
        <button onClick={onClose} className="text-[12px] font-bold text-[#5C6B80] border border-[#D8DEE7] rounded-md px-3 py-1.5">Close</button>
      </div>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-[11.5px] whitespace-nowrap">
          <thead className="sticky top-0 bg-[#F6F8FB]">
            <tr className="text-[10px] uppercase tracking-[0.08em] text-[#5C6B80]">
              {["Container", "Position", "Size", "Dir", "Terminal", "Dwell", "Blocked by"].map((h) => (
                <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-[#D8DEE7]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((c) => {
              const blocked = [c.scan && "scan", /CHECK|CP\b|PACKAGE/i.test(c.category ?? "") && "check package"].filter(Boolean).join(" · ");
              return (
                <tr key={c.containerNo} className="border-b border-[#EDF0F5]">
                  <td className="px-2 py-1.5 font-mono font-semibold">{c.containerNo}</td>
                  <td className="px-2 py-1.5 font-mono text-[#5C6B80]">{c.location || "—"}</td>
                  <td className="px-2 py-1.5">{c.size}&apos;</td>
                  <td className="px-2 py-1.5">{(c.direction ?? "import") === "import" ? "IMP" : "EXP"}</td>
                  <td className="px-2 py-1.5">{c.terminal || "—"}</td>
                  <td className={`px-2 py-1.5 tabular-nums font-semibold ${(c.pendencyHrs ?? 0) >= 48 ? "text-[#C0392B]" : ""}`}>
                    {c.pendencyHrs != null ? `${Math.round(c.pendencyHrs)}h` : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {blocked ? <span className="text-[#E8641B] font-semibold">{blocked}</span> : <span className="text-[#177A47]">clear</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 200 && <p className="text-[11px] text-[#5C6B80] px-2 py-2">Showing the 200 oldest of {rows.length}.</p>}
      </div>
    </div>
  );
}
