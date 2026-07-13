import { RateCard, MovementType, TripEarnings } from "./types";

// TEU from ISO size/type code: first digit 2 => 20' (1 TEU), 4 => 40' (2 TEU)
export function teuFromIso(iso: string): number {
  return iso.startsWith("4") ? 2 : 1;
}

export function tripEarnings(
  rc: RateCard,
  movement: MovementType,
  teu: number,
  boost: number,
  isNight: boolean
): TripEarnings {
  const base = rc.perTeu[movement] * teu;
  const night = isNight ? Math.round(base * (rc.nightMultiplier - 1)) : 0;
  const total = base + night + boost;
  return { base, night, boost, total };
}

// ISO 6346 container number check digit
const LETTER_VALUES: Record<string, number> = {};
{
  // A=10 ... Z=38, skipping multiples of 11
  let v = 10;
  for (let i = 0; i < 26; i++) {
    if (v % 11 === 0) v++;
    LETTER_VALUES[String.fromCharCode(65 + i)] = v;
    v++;
  }
}

export function iso6346CheckDigit(ownerSerial: string): number {
  // ownerSerial: 4 letters + 6 digits
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = ownerSerial[i];
    const val = i < 4 ? LETTER_VALUES[ch] : parseInt(ch, 10);
    sum += val * Math.pow(2, i);
  }
  return (sum % 11) % 10;
}

export function randomContainer(prefixes = ["TRHU", "BEAU", "MSKU", "TGBU", "CMAU", "OOLU", "HLXU"]): {
  containerNo: string;
  iso: string;
} {
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const serial = String(Math.floor(100000 + Math.random() * 899999));
  const check = iso6346CheckDigit(p + serial);
  const iso = Math.random() < 0.45 ? "4510" : "2210";
  return { containerNo: `${p}${serial}${check}`, iso };
}

export function isValidContainerNo(no: string): boolean {
  const clean = no.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{7}$/.test(clean)) return false;
  return iso6346CheckDigit(clean.slice(0, 10)) === parseInt(clean[10], 10);
}

export function fmtInr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
