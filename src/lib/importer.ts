// Generic Excel/CSV import pipeline: parse → detect kind → auto-map columns → typed rows.
// Built to be tested against the real 3-hr pendency Excel, cutoff files, and ITV/driver masters.
import * as XLSX from "xlsx";
import { isValidContainerNo } from "./incentive";
import { ContainerHistory } from "./types";

export type ImportKind = "container_pool" | "itv_master" | "driver_master" | "unknown";

export interface ParsedSheet {
  name: string;
  rows: string[][]; // trimmed strings, header row first (after detection)
  headerIndex: number;
}

export interface ImportedContainer {
  containerNo: string;
  direction: "import" | "export";
  size: "20" | "40";
  teu: number;
  terminal?: string;
  category?: string; // GEN / ODC — ODC = tough-job tag
  cutoff?: string;
  scan?: boolean; // Scan_Flg
  location?: string; // yard position
  pendencyHrs?: number; // aging
  party?: string; // ADLL / AMTE
  valid: boolean; // ISO 6346 check digit
  // ── lifecycle (set by reconciliation, not by the parser) ──
  // Each uploaded pendency file is a SNAPSHOT of what is currently pending. New rows
  // are added, existing rows updated in place, and rows absent from the newest file
  // have left — those are shrunk into a compact ContainerHistory record rather than
  // kept here, so this array only ever holds live work.
  status?: "pending";
  firstSeenFile?: string;
  firstSeenAt?: number; // epoch ms of the FEED it first appeared in — the TAT clock start
  lastSeenFile?: string;
  lastSeenAt?: number;
}

export interface ReconcileResult {
  pool: ImportedContainer[];     // PENDING only — cleared rows are never kept here
  history: ContainerHistory[];   // compact records for the ones that left, newest first
  added: number;
  updated: number;
  cleared: number;
  stale: number; // rows ignored because that container had already left
}

const flagsOf = (c: ImportedContainer) =>
  [c.scan ? "s" : "", /CHECK|CP\b|PACKAGE/i.test(c.category ?? "") ? "c" : "", c.category === "ODC" ? "o" : ""].join("") || undefined;

/**
 * Merge a newly uploaded snapshot into the existing pool, for ONE direction.
 *
 * Additive and status-driven: new rows added, known rows updated in place (deduped),
 * rows absent from the snapshot marked as gone. A gone container is NOT kept as a
 * full row — it is shrunk to a ContainerHistory record (about a third the size) that
 * still carries everything TAT and volume reporting need. The pool therefore only
 * ever holds what is actually pending, and does not grow with throughput.
 *
 * `feedAt` is the timestamp OF THE FILE. Uploading an older file after a newer one
 * must not wrongly clear containers, so the caller passes `isNewest` — when false we
 * only add and update, never clear.
 */
export function reconcilePool(
  prevPool: ImportedContainer[],
  incomingRows: ImportedContainer[],
  direction: "import" | "export",
  source: string,
  feedAt: number,
  isNewest = true,
  prevHistory: ContainerHistory[] = [],
): ReconcileResult {
  // A container that has already LEFT must not be resurrected by a stale sheet.
  // An older feed still lists boxes that have since moved; adding them back would
  // silently inflate live pendency. So we skip any incoming row whose container
  // departed at or after this feed's own timestamp. (If it genuinely comes back
  // later, that feed is newer than the departure and it is added normally.)
  const departedAt = new Map<string, number>();
  prevHistory.forEach((h) => {
    if (h.dir !== direction) return;
    const prev = departedAt.get(h.no) ?? 0;
    if (h.outAt > prev) departedAt.set(h.no, h.outAt);
  });

  const incoming = new Map<string, ImportedContainer>();
  let stale = 0;
  incomingRows.forEach((c) => {
    if ((departedAt.get(c.containerNo) ?? 0) >= feedAt) { stale++; return; }
    incoming.set(c.containerNo, c); // last row wins → duplicates removed
  });
  const existing = new Map(
    prevPool.filter((c) => (c.direction ?? "import") === direction).map((c) => [c.containerNo, c] as const),
  );
  let added = 0, updated = 0, cleared = 0;
  const stillPending: ImportedContainer[] = [];
  const history: ContainerHistory[] = [];

  incoming.forEach((row, no) => {
    const prev = existing.get(no);
    if (prev) {
      updated++;
      stillPending.push({ ...prev, ...row, status: "pending", firstSeenAt: prev.firstSeenAt ?? feedAt, lastSeenFile: source, lastSeenAt: feedAt });
    } else {
      added++;
      stillPending.push({ ...row, status: "pending", firstSeenFile: source, firstSeenAt: feedAt, lastSeenFile: source, lastSeenAt: feedAt });
    }
  });

  existing.forEach((prev, no) => {
    if (incoming.has(no)) return;
    if (!isNewest) { stillPending.push(prev); return; } // an older file proves nothing about what has left
    cleared++;
    history.push({
      no,
      dir: direction,
      teu: prev.teu,
      term: prev.terminal,
      flags: flagsOf(prev),
      inAt: prev.firstSeenAt ?? feedAt,
      outAt: feedAt,
      dwellHrs: prev.pendencyHrs ?? Math.max(0, (feedAt - (prev.firstSeenAt ?? feedAt)) / 3600000),
    });
  });

  const pool = [...prevPool.filter((c) => (c.direction ?? "import") !== direction), ...stillPending];
  return { pool, history, added, updated, cleared, stale };
}

/**
 * Containers still pending. The pool now holds only pending rows, so this is a
 * safety net for state saved by an older build (which did keep cleared rows).
 */
export function livePool<T extends { status?: string }>(pool: T[]): T[] {
  return pool.filter((c) => c.status !== "cleared");
}

export interface ImportedVehicle {
  id: string;
  reg?: string;
  vendor?: string;
  tags: string[];
  driverName?: string;
}

export interface ImportedDriver {
  name: string;
  phone?: string;
  vendor?: string;
  note?: string;
  vehicleId?: string;
}

export function parseBuffer(buf: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => {
    // raw:false → use Excel's formatted text (dates as dd-mm-yyyy, not serial numbers)
    const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: false }) as unknown[][];
    const rows = raw
      .map((r) => r.map((c) => String(c ?? "").trim()))
      .filter((r) => r.some((c) => c !== ""));
    const headerIndex = detectHeaderRow(rows);
    return { name, rows: rows.slice(headerIndex), headerIndex };
  }).filter((s) => s.rows.length > 0);
}

export async function parseFile(file: File): Promise<ParsedSheet[]> {
  return parseBuffer(await file.arrayBuffer());
}

// header row = first row where ≥2 cells look like labels (non-numeric, short)
function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const labelish = rows[i].filter((c) => c && c.length < 40 && isNaN(Number(c))).length;
    if (labelish >= 2) return i;
  }
  return 0;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function findCol(headers: string[], keys: string[]): number {
  const h = headers.map(norm);
  for (const k of keys) {
    const i = h.findIndex((x) => x.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

// ── Report formats ───────────────────────────────────────────────────────────
// The team uploads specific named reports (import pendency, export cut-off, ITV
// master, driver master). Rather than only guessing from the columns — which fails
// when a terminal renames a header — the uploader lets them PICK which report it is,
// and we map deterministically. The column lists below are the CURRENT known shapes;
// they are hints, not hard requirements, and are expected to change over time. When
// the real formats are confirmed, edit REPORT_FORMATS here — no other code changes.
export interface ReportFormat {
  id: string;
  label: string;
  category: string;      // groups the report in the Import chooser (e.g. "Pendency", "Masters")
  kind: ImportKind;
  direction?: "import" | "export";
  blurb: string;
  icon?: string;         // emoji shown on the chooser card
  status?: "ready" | "coming";  // "coming" = placeholder for a report we'll wire when the file is confirmed
  columns: string[];     // known/expected headers — shown to the user, used to find the header row
  template?: string[][]; // downloadable blank format: header row + a sample row or two
}

// The catalogue of reports the app can import. This is the ONLY place to edit when a
// new report type arrives — add an entry and it appears in the Import chooser + picker
// automatically. Set status:"coming" to list a report we expect but haven't wired yet.
export const REPORT_FORMATS: ReportFormat[] = [
  {
    id: "import_pendency",
    label: "Import pendency — DPD",
    category: "Pendency",
    kind: "container_pool",
    direction: "import",
    icon: "📥",
    status: "ready",
    blurb: "The import DPD pendency feed (Import_Containers_DPD_… .csv, every 3 hrs) — one row per pending import container. Load one file, or many together to build history.",
    columns: ["Container_No", "CtrSize", "TEU", "Cat_Cd", "Pendency(Hrs)", "Scan_Flg", "Terminal", "Location", "Deliverable_Pty"],
    template: [
      ["Container_No", "CtrSize", "TEU", "Cat_Cd", "Pendency(Hrs)", "Scan_Flg", "Terminal", "Location", "Deliverable_Pty"],
      ["MSCU1234565", "20", "1", "GEN", "12.5", "N", "CT3", "1H05", "ADLL"],
      ["TGHU2345677", "40", "2", "ODC", "51.0", "Y", "CT4", "SB04", "AMTE"],
    ],
  },
  {
    id: "export_cutoff",
    label: "Export cut-off",
    category: "Pendency",
    kind: "container_pool",
    direction: "export",
    icon: "📤",
    status: "ready",
    blurb: "Export containers by gate cut-off (the daily 'Mon 13-Jul-26.xlsx'). Use the combined sheet with CONT + TERMINAL + GATE CUT-OFF.",
    columns: ["CONT", "SIZE", "TERMINAL", "GATE CUT-OFF", "LOCATION", "CHA NAME", "VESSEL NAME"],
    template: [
      ["SR NO.", "CONT", "SIZE", "TERMINAL", "GATE CUT-OFF", "LOCATION", "CHA NAME", "VESSEL NAME"],
      ["1", "HAMU4084920", "40", "T2", "7/14/26 23:00", "EXIM", "SSS SAI SHIPPING SERVICES", "TIRUA"],
      ["2", "CMAU0853081", "20", "CT4", "7/13/26 16:00", "EXIM 2", "NARENDRA LOGISTICS PVT LTD", "CMA CGM PELLEAS"],
    ],
  },
  {
    id: "itv_master",
    label: "ITV master",
    category: "Masters",
    kind: "itv_master",
    icon: "🚛",
    status: "ready",
    blurb: "The fleet list — call signs, registrations, vendor, tags. A 'scanning-only' tag becomes a hard rule.",
    columns: ["Call sign", "Registration", "Vendor", "Tags", "Driver"],
    template: [
      ["Call sign", "Registration", "Vendor", "Tags", "Driver"],
      ["A333", "GJ12AB1234", "Active", "scanning-only", "Ramesh Yadav"],
      ["A157", "GJ12AB5678", "Active", "", "Sohan Bharwad"],
      ["7118", "GJ12CD9012", "SSPL", "high-capacity", ""],
    ],
  },
  {
    id: "driver_master",
    label: "Driver master",
    category: "Masters",
    kind: "driver_master",
    icon: "👷",
    status: "ready",
    blurb: "Drivers — name, phone (needed for the app login), vendor, ITV.",
    columns: ["Driver Name", "Phone", "Vendor", "ITV", "Note"],
    template: [
      ["Driver Name", "Phone", "Vendor", "ITV", "Note"],
      ["Ramesh Yadav", "98250 11223", "Active", "A333", ""],
      ["Sohan Bharwad", "98250 22334", "Active", "A157", "no MICT"],
    ],
  },
  // ── Reports we expect but haven't wired yet — listed so the chooser shows the full
  //    picture. Flip status to "ready" and fill columns/direction when the file arrives. ──
  {
    id: "yard_inventory",
    label: "Yard inventory",
    category: "Pendency",
    kind: "container_pool",
    direction: "import",
    icon: "🗺️",
    status: "coming",
    blurb: "Full yard stock by block/position (not just pendency). Send us a sample and we'll wire it.",
    columns: [],
  },
  {
    id: "empty_report",
    label: "Empty container report",
    category: "Pendency",
    kind: "container_pool",
    direction: "export",
    icon: "📦",
    status: "coming",
    blurb: "Empties by line/size for repositioning. Send us a sample and we'll wire it.",
    columns: [],
  },
];

export const formatById = (id?: string) => REPORT_FORMATS.find((f) => f.id === id);

/** The report format that best matches a sheet, for defaulting the picker. */
export function guessFormat(sheet: ParsedSheet): ReportFormat | undefined {
  const kind = guessKind(sheet);
  if (kind === "container_pool") {
    const headers = sheet.rows[0] ?? [];
    // A pendency list has a terminal, a cut-off, or a pendency column. A sheet with
    // containers but none of those is a DETAIL sheet (e.g. an export stuffing-package
    // list) — default it to "skip" so it isn't loaded and doesn't clobber terminals.
    const hasTerminal = findCol(headers, ["terminal", "port"]) >= 0;
    const hasCutoff = findCol(headers, ["gatecutoff", "cutoff", "cut-off"]) >= 0;
    const hasPendency = findCol(headers, ["pendencyhrs", "pendency", "dwell"]) >= 0;
    if (!hasTerminal && !hasCutoff && !hasPendency) return undefined; // detail sheet → skip
    // import feeds carry a pendency/scan column; export lists carry a gate cut-off
    return formatById(hasPendency || findCol(headers, ["scanflg", "scan"]) >= 0 ? "import_pendency" : "export_cutoff");
  }
  return REPORT_FORMATS.find((f) => f.kind === kind);
}

export function guessKind(sheet: ParsedSheet): ImportKind {
  const headers = sheet.rows[0] ?? [];
  const hasContainer = findCol(headers, ["container", "cntr", "cont"]) >= 0;
  const hasDriverName = findCol(headers, ["drivername", "driver"]) >= 0;
  const hasVehicle = findCol(headers, ["itv", "vehicle", "truck", "callsign", "regno", "registration"]) >= 0;
  const hasPhone = findCol(headers, ["phone", "mobile", "contact"]) >= 0;
  // data-shape check: many valid container numbers in any column → container pool
  const body = sheet.rows.slice(1, 30);
  let containerHits = 0;
  body.forEach((r) => r.forEach((c) => { if (isValidContainerNo(c)) containerHits++; }));
  if (containerHits >= 3 || hasContainer) return "container_pool";
  if (hasDriverName && hasPhone) return "driver_master";
  if (hasVehicle) return "itv_master";
  return "unknown";
}

// Diagnostics so a failed import is never silent — the modal shows exactly what was
// detected, and the team can send us this if a real file won't map.
export interface ExtractDiag {
  headerRow: string[];
  mapped: { field: string; column: string | null }[];
  bodyRows: number;
  extracted: number;
  droppedNoContainer: number;
  droppedBadFormat: number;
  direction: "import" | "export";
  note?: string;
}

export function extractContainers(sheet: ParsedSheet, filenameHint = "", forcedDir?: "import" | "export"): ImportedContainer[] {
  return extractContainersDiag(sheet, filenameHint, forcedDir).containers;
}

export function extractContainersDiag(
  sheet: ParsedSheet,
  filenameHint = "",
  forcedDir?: "import" | "export",
): { containers: ImportedContainer[]; diag: ExtractDiag } {
  // Header row: normally row 0 (parseBuffer already found it). But real files carry
  // title rows and merged cells that fool detection, so if row 0 has no container
  // column, scan deeper for the row that actually looks like the header.
  let headerIdx = 0;
  let headers = sheet.rows[0] ?? [];
  let note: string | undefined;
  if (findCol(headers, ["container", "cntr", "cont"]) < 0) {
    for (let i = 1; i < Math.min(sheet.rows.length, 15); i++) {
      if (findCol(sheet.rows[i], ["container", "cntr", "cont"]) >= 0) {
        headerIdx = i; headers = sheet.rows[i];
        note = `Header wasn't the first row — used row ${i + 1} (the one with a container column).`;
        break;
      }
    }
  }

  const cCol = findCol(headers, ["container", "cntr", "cont"]);
  const sCol = findCol(headers, ["ctrsize", "size", "iso", "type", "ft"]);
  const teuCol = findCol(headers, ["teu"]);
  const tCol = findCol(headers, ["terminal", "port"]);
  const catCol = findCol(headers, ["catcd", "category", "impexp"]); // NOT bare "cat" — it matches "loCATion"
  const cutCol = findCol(headers, ["cutoff", "validity", "deadline"]);
  const scanCol = findCol(headers, ["scanflg", "scan"]);
  const locCol = findCol(headers, ["location", "yard"]);
  const pendCol = findCol(headers, ["pendencyhrs", "pendency", "dwell"]);
  const ptyCol = findCol(headers, ["deliverablepty", "party", "pty"]);

  // Direction: a chosen report format wins; else filename; else a cut-off/stuffing column.
  const hint = filenameHint.toLowerCase();
  const direction: "import" | "export" = forcedDir
    ? forcedDir
    : /export|cutoff|cut-off/.test(hint) ? "export"
    : /import|pendency|dpd/.test(hint) ? "import"
    : cutCol >= 0 || findCol(headers, ["stuffing"]) >= 0 ? "export"
    : "import";

  const out: ImportedContainer[] = [];
  const body = sheet.rows.slice(headerIdx + 1);
  let droppedNoContainer = 0, droppedBadFormat = 0;

  body.forEach((r) => {
    let no = cCol >= 0 ? r[cCol] : "";
    if (!isValidContainerNo(no)) {
      const hit = r.find((c) => isValidContainerNo(c)); // fall back to any valid-looking cell
      if (hit) no = hit;
    }
    const clean = (no || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!clean) { droppedNoContainer++; return; }
    if (!/^[A-Z]{4}\d{7}$/.test(clean)) { droppedBadFormat++; return; } // ISO 6346 shape (4 letters + 7 digits)
    const sizeRaw = sCol >= 0 ? r[sCol] : "";
    const size: "20" | "40" = /^4|40/.test(sizeRaw) ? "40" : "20";
    const teuRaw = teuCol >= 0 ? parseInt(r[teuCol], 10) : NaN;
    const pendRaw = pendCol >= 0 ? parseFloat(r[pendCol]) : NaN;
    out.push({
      containerNo: clean,
      direction,
      size,
      teu: !isNaN(teuRaw) && teuRaw > 0 ? teuRaw : size === "40" ? 2 : 1,
      terminal: tCol >= 0 ? r[tCol] || undefined : undefined,
      category: catCol >= 0 ? r[catCol] || undefined : undefined,
      cutoff: cutCol >= 0 ? r[cutCol] || undefined : undefined,
      scan: scanCol >= 0 ? /^y/i.test(r[scanCol]) : undefined,
      location: locCol >= 0 ? r[locCol] || undefined : undefined,
      pendencyHrs: !isNaN(pendRaw) ? pendRaw : undefined,
      party: ptyCol >= 0 ? r[ptyCol] || undefined : undefined,
      valid: isValidContainerNo(clean),
    });
  });

  const col = (i: number) => (i >= 0 ? headers[i] || `col ${i + 1}` : null);
  const diag: ExtractDiag = {
    headerRow: headers,
    mapped: [
      { field: "Container", column: col(cCol) },
      { field: "Size", column: col(sCol) },
      { field: "Terminal", column: col(tCol) },
      { field: "Category", column: col(catCol) },
      { field: "Scan flag", column: col(scanCol) },
      { field: "Pendency hrs", column: col(pendCol) },
      { field: "Location", column: col(locCol) },
      { field: "Cut-off", column: col(cutCol) },
    ],
    bodyRows: body.length,
    extracted: out.length,
    droppedNoContainer,
    droppedBadFormat,
    direction,
    note: cCol < 0 ? (note ?? "No container column found — scanned each row for a container number instead.") : note,
  };
  return { containers: out, diag };
}

export function extractVehicles(sheet: ParsedSheet): ImportedVehicle[] {
  const headers = sheet.rows[0];
  const idCol = findCol(headers, ["callsign", "itvno", "itv", "vehicleno", "vehicle", "truck"]);
  const regCol = findCol(headers, ["registration", "regno", "reg"]);
  const venCol = findCol(headers, ["vendor", "transporter", "company"]);
  const tagCol = findCol(headers, ["tag", "purpose", "capacity", "type", "remark"]);
  const drvCol = findCol(headers, ["drivername", "driver"]);
  if (idCol < 0 && regCol < 0) return [];
  return sheet.rows.slice(1).flatMap((r) => {
    const id = (idCol >= 0 ? r[idCol] : "") || (regCol >= 0 ? r[regCol].slice(-4) : "");
    if (!id) return [];
    return [{
      id: id.toUpperCase(),
      reg: regCol >= 0 ? r[regCol] || undefined : undefined,
      vendor: venCol >= 0 ? r[venCol] || undefined : undefined,
      tags: tagCol >= 0 && r[tagCol] ? r[tagCol].split(/[,;/]/).map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
      driverName: drvCol >= 0 ? r[drvCol] || undefined : undefined,
    }];
  });
}

export function extractDrivers(sheet: ParsedSheet): ImportedDriver[] {
  const headers = sheet.rows[0];
  const nCol = findCol(headers, ["drivername", "name", "driver"]);
  const pCol = findCol(headers, ["phone", "mobile", "contact"]);
  const venCol = findCol(headers, ["vendor", "transporter", "company"]);
  const noteCol = findCol(headers, ["note", "restriction", "remark"]);
  const vCol = findCol(headers, ["itv", "vehicle", "truck"]);
  if (nCol < 0) return [];
  return sheet.rows.slice(1).flatMap((r) => {
    const name = r[nCol];
    if (!name) return [];
    return [{
      name,
      phone: pCol >= 0 ? r[pCol] || undefined : undefined,
      vendor: venCol >= 0 ? r[venCol] || undefined : undefined,
      note: noteCol >= 0 ? r[noteCol] || undefined : undefined,
      vehicleId: vCol >= 0 ? (r[vCol] || "").toUpperCase() || undefined : undefined,
    }];
  });
}

/**
 * Work out WHEN a feed was taken, from its filename. The team's files carry the
 * timestamp in the name (Import_Containers_18072026_1200.xlsx, pendency-2026-07-18-1530.csv).
 * This is what lets a week of files be uploaded in any order and still stack up
 * correctly: we clear containers only against the newest feed seen so far.
 * Returns NaN when the name carries no date — caller then falls back to upload order.
 */
export function parseFeedTimestamp(filename: string): number {
  const f = filename.replace(/\.[a-z]+$/i, "");
  // ddmmyyyy or yyyymmdd, optionally followed by hhmm
  let m = f.match(/(\d{2})(\d{2})(\d{4})[_\-. ]?(\d{2})?(\d{2})?(?!\d)/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
  }
  m = f.match(/(\d{4})[_\-.]?(\d{2})[_\-.]?(\d{2})[_\-. ]?(\d{2})?[_\-.:]?(\d{2})?(?!\d)/);
  if (m && Number(m[2]) <= 12 && Number(m[3]) <= 31) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
  }
  // dd-Mmm-yy / dd Mmm yyyy — e.g. the export "Mon 13-Jul-26.xlsx" files
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = f.match(/(\d{1,2})[-\s]([A-Za-z]{3,})[-\s.](\d{2,4})/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mon >= 0) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return new Date(y, mon, Number(m[1])).getTime();
    }
  }
  return NaN;
}

/** Parse sheet-style dates: "7/5/26 10:00" (m/d/yy), "20-06-2026 08:30" (d-m-yyyy), ISO. NaN if unparseable. */
export function parseSheetDateMs(raw?: string): number {
  if (!raw) return NaN;
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[1]) - 1, Number(m[2]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
  }
  m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0)).getTime();
  return Date.parse(raw);
}
