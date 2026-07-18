// Yard model — blocks, bays, rows, tiers.
//
// Borrowed from how terminal operating systems (Navis N4 / Tideworks) model a yard:
// a POSITION is block · bay · row · tier, and a BLOCK is anything a container can sit
// on — not just a stack. We derive the whole yard from the Location column of the
// pendency feed rather than maintaining a separate layout file, so the map stays
// true to the ground without anyone updating it.
//
// Real positions seen in the Adani feed look like `1T22C.3`; other sites write
// `A-01-1` or `B12`. The parser is deliberately tolerant — an unreadable position
// is never an error, it just lands in the "unplaced" bucket.
import { ImportedContainer } from "./importer";

export interface YardPosition {
  block: string;
  bay?: number;
  row?: string;
  tier?: number;
  raw: string;
}

/** Parse a yard position string. Returns null when there is nothing usable. */
export function parsePosition(raw?: string): YardPosition | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!s || s === "-" || s === "NA" || s === "N/A") return null;

  // 1T22C.3  → block 1T · bay 22 · row C · tier 3
  let m = s.match(/^([A-Z0-9]{1,3}?[A-Z])(\d{1,3})([A-Z])[.\-/]?(\d{1,2})?$/);
  if (m) return { block: m[1], bay: Number(m[2]), row: m[3], tier: m[4] ? Number(m[4]) : undefined, raw: s };

  // A-01-1 / A-01-1-2 → block A · bay 1 · (row) · tier
  m = s.match(/^([A-Z0-9]{1,4})[-_/](\d{1,3})(?:[-_/]([A-Z0-9]{1,2}))?(?:[-_/](\d{1,2}))?$/);
  if (m) {
    const third = m[3];
    const rowIsLetter = third && /^[A-Z]/.test(third);
    return {
      block: m[1],
      bay: Number(m[2]),
      row: rowIsLetter ? third : undefined,
      tier: m[4] ? Number(m[4]) : !rowIsLetter && third ? Number(third) : undefined,
      raw: s,
    };
  }

  // B12 / EXIM1 → block letters, bay digits
  m = s.match(/^([A-Z]{1,5})(\d{1,3})$/);
  if (m) return { block: m[1], bay: Number(m[2]), raw: s };

  // last resort: everything up to the first separator/digit run is the block
  const block = s.split(/[-_/. ]/)[0] || s;
  return { block: block.slice(0, 6), raw: s };
}

export interface BlockSummary {
  block: string;
  containers: number;
  teu: number;
  imports: number;
  exports: number;
  scanning: number;   // needs a scan leg before it can leave
  checkPackage: number;
  aged: number;       // 48h+ dwell — the boxes that should worry you
  maxDwellHrs: number;
  bays: number[];
}

export interface YardSnapshot {
  blocks: BlockSummary[];
  unplaced: number; // containers with no readable position
  totalTeu: number;
}

const isCheckPackage = (c: ImportedContainer) => /CHECK|CP\b|PACKAGE/i.test(c.category ?? "");

/** Aggregate a container pool into blocks. Feed it livePool() — cleared boxes are gone. */
export function buildYard(pool: ImportedContainer[]): YardSnapshot {
  const map = new Map<string, BlockSummary>();
  let unplaced = 0;
  let totalTeu = 0;

  pool.forEach((c) => {
    totalTeu += c.teu;
    const pos = parsePosition(c.location);
    if (!pos) { unplaced++; return; }
    let b = map.get(pos.block);
    if (!b) {
      b = { block: pos.block, containers: 0, teu: 0, imports: 0, exports: 0, scanning: 0, checkPackage: 0, aged: 0, maxDwellHrs: 0, bays: [] };
      map.set(pos.block, b);
    }
    b.containers++;
    b.teu += c.teu;
    if ((c.direction ?? "import") === "import") b.imports++; else b.exports++;
    if (c.scan) b.scanning++;
    if (isCheckPackage(c)) b.checkPackage++;
    const hrs = c.pendencyHrs ?? 0;
    if (hrs >= 48) b.aged++;
    if (hrs > b.maxDwellHrs) b.maxDwellHrs = hrs;
    if (pos.bay != null && !b.bays.includes(pos.bay)) b.bays.push(pos.bay);
  });

  const blocks = [...map.values()].sort((a, b) => a.block.localeCompare(b.block, undefined, { numeric: true }));
  blocks.forEach((b) => b.bays.sort((x, y) => x - y));
  return { blocks, unplaced, totalTeu };
}

/**
 * Colour-by dimensions for the yard map. Navis exposes the same idea as a "Color By"
 * selector — one switchable colour channel, so no single view is overloaded.
 */
export type ColourBy = "dwell" | "direction" | "flags" | "fill";

export const COLOUR_BY_LABEL: Record<ColourBy, string> = {
  dwell: "Ageing",
  direction: "Import / Export",
  flags: "Scanning & check package",
  fill: "How full",
};

/** Returns a tailwind-ish hex for a block under the chosen colour dimension. */
export function blockColour(b: BlockSummary, by: ColourBy, busiest: number): string {
  switch (by) {
    case "dwell": {
      // Share of the block that is ageing, not the single worst box — one 5-day
      // container should not paint an otherwise-healthy block red.
      const share = b.containers ? b.aged / b.containers : 0;
      return share >= 0.5 ? "#C0392B" : share >= 0.25 ? "#E8641B" : share > 0 ? "#E0A800" : "#1E9E5A";
    }
    case "direction": {
      if (!b.containers) return "#D8DEE7";
      const share = b.imports / b.containers;
      return share >= 0.8 ? "#1F3864" : share <= 0.2 ? "#177A47" : "#7A6BA8"; // navy=import, green=export, purple=mixed
    }
    case "flags":
      return b.scanning + b.checkPackage === 0 ? "#D8DEE7" : b.checkPackage > 0 ? "#8E44AD" : "#E8641B";
    case "fill": {
      const r = busiest ? b.containers / busiest : 0;
      return r > 0.75 ? "#1F3864" : r > 0.5 ? "#3A54A0" : r > 0.25 ? "#7E93C4" : "#C9D4E6";
    }
  }
}
