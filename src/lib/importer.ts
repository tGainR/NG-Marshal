// Generic Excel/CSV import pipeline: parse → detect kind → auto-map columns → typed rows.
// Built to be tested against the real 3-hr pendency Excel, cutoff files, and ITV/driver masters.
import * as XLSX from "xlsx";
import { isValidContainerNo } from "./incentive";

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

export function extractContainers(sheet: ParsedSheet, filenameHint = ""): ImportedContainer[] {
  const headers = sheet.rows[0];
  const cCol = findCol(headers, ["container", "cntr", "cont"]);
  const sCol = findCol(headers, ["ctrsize", "size", "iso", "type", "ft"]);
  const teuCol = findCol(headers, ["teu"]);
  const tCol = findCol(headers, ["terminal", "port"]);
  const catCol = findCol(headers, ["catcd", "category", "impexp", "cat"]);
  const cutCol = findCol(headers, ["cutoff", "validity", "deadline"]);
  const scanCol = findCol(headers, ["scanflg", "scan"]);
  const locCol = findCol(headers, ["location", "yard"]);
  const pendCol = findCol(headers, ["pendencyhrs", "pendency", "dwell"]);
  const ptyCol = findCol(headers, ["deliverablepty", "party", "pty"]);
  // direction: filename wins (Import_Containers_… / EXPORT_…), else a GATE CUT-OFF/stuffing column means export
  const hint = filenameHint.toLowerCase();
  const direction: "import" | "export" =
    /export|cutoff|cut-off/.test(hint) ? "export"
    : /import|pendency|dpd/.test(hint) ? "import"
    : cutCol >= 0 || findCol(headers, ["stuffing"]) >= 0 ? "export"
    : "import";
  const out: ImportedContainer[] = [];
  const body = sheet.rows.slice(1);
  body.forEach((r) => {
    // container no from mapped column, else scan the row
    let no = cCol >= 0 ? r[cCol] : "";
    if (!isValidContainerNo(no)) {
      const hit = r.find((c) => isValidContainerNo(c));
      if (hit) no = hit;
    }
    if (!no) return;
    const clean = no.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{4}\d{7}$/.test(clean)) return;
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
  return out;
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
