# Ingestion Plan — from the real files (2026-07-06)

Source folder (Google Drive, aliased in this project): `ITV Mgmt & Driver App/Current Reports Generated/`
Analyzed: 4 × 3-hourly import CSVs (04-Jul 09:30/12:30/15:30/18:30), `Book1.xlsx` (export pendency), and the forwarded Adani email (.eml).

**⚠ TOS transition note (user, 2026-07-06):** the principal is transitioning their TOS — these formats WILL change in the near future. Ingestion is therefore built as *format adapters per document type*, versioned like the rate card: when the new TOS lands, we write a new adapter, not a new system. Nothing downstream (pool, dashboards, reconciliation) touches raw columns.

## 1. The import pendency feed (primary, container-level)

**Delivery:** email from `opsexim.shpl@adani.com`, subject "Import EXIM Movement Pendency (AMTE AND ADLL) …", one CSV attachment named `Import_Containers_DPD_AMTE_YYYY-MM-DD_HHMMhrs.csv`, every ~3 hours. Predictable sender + filename pattern → **auto-forward parsing is fully automatable** (mailbox rule → ingest address → parse attachment).

**Columns (all present in real data):**

| Column | Meaning | We use it for |
|---|---|---|
| `Container_No` | container (ISO 6346, check-digit verifiable) | pool identity, 3-way match with ticket + yard record |
| `ISO`, `CtrSize`, `TEU` | 4510/2210/4260…, 20/40, **explicit TEU** | incentive units — no inference needed |
| `Cat_Cd` | GEN / **ODC** (over-dimensional) | tough-job tag → boost eligibility |
| `Wt` | gross weight | tough-job signal (heavy) |
| `Entry_Dttm`, `Pendency(Hrs)` | when it landed, **hours waiting** | aging buckets (the dwell-day view from the master Excel), priority ordering |
| `release_dttm` | customs release time | deliverable-now filter |
| `Scan_Flg` | Y/N | **scanning stream split** — separate pendency & ITV allocation |
| `Terminal` | T2 / CT4 / … | deployment planning per terminal |
| `Location` | yard position (e.g. `1T22C.3`) | matches the position on the driver's parchi |
| `Deliverable_Pty` | ADLL / AMTE | party-wise reporting |
| `FPD`, `VCN`, `Vessel_Name`, seals | routing/vessel detail | container detail view |
| `Exit_Dttm`, `Exit_Mode` | blank while pending | exit reconciliation when present |

**What this unlocks beyond the plan:**
1. **The pendency dashboard computes itself** — terminal × size × scan × aging bucket is a pure pivot of this file. The hand-typed WhatsApp pendency report and the master Excel pivot are both derivable.
2. **File-to-file delta = completions.** 09:30→12:30→15:30→18:30 rows fell 465→456→431→386. Containers that disappear between files were moved — an independent completion check against our trip records (three verification sources now: ticket, yard record, feed delta).
3. **Hot list auto-builds** — sort by `Pendency(Hrs)` desc + `release_dttm` present = the aging containers to chase; ODC + heavy + scan = tough-tag candidates for boost.

**Adapter rules (import feed v1 — current TOS):**
- Validate every `Container_No` check digit; report valid% per file (parse-quality meter).
- TEU from `TEU` column (fallback: CtrSize, then ISO first digit).
- Pool refresh semantics: newest file replaces pool; keep a per-file snapshot for delta reporting.
- Store `fileStamp` from filename (date+time) — NOT from upload time — so late uploads don't corrupt deltas.

## 2. The export pendency file (`Book1.xlsx` format)

Excel, title row above headers (handled by header auto-detection). Sheets = separate lists (e.g. Sheet3 = 142 rows, Sheet4 = 38 rows — likely different movement/stuffing modes).

| Column | Use |
|---|---|
| `CONT` | container |
| `TERMINAL` | destination terminal (export assignments carry this) |
| `SIZE` | TEU |
| `CHA NAME` | customer/CHA — customer-wise reporting |
| `STUFFING MODE` | movement detail |
| `MOV-REC DATE` | received date → aging |
| `VESSEL NAME`, **`GATE CUT-OFF`** | the deadline → hot-list countdown + boost trigger |
| `LOCATION` | pickup position in yard (EXIM-1/2 stack) |

Adapter: same pool model, `direction = export`; cutoff parsed to a deadline → feeds the hot list automatically. User will supply the current/live export file later — adapter to be confirmed against it.

## 3. Ingestion channels (locked earlier, now concrete)

1. **Auto-forward:** rule on the receiving mailbox forwards `opsexim.shpl@adani.com` mails to the site ingest address → attachment parsed on arrival. Sender + filename pattern are stable enough for zero-touch operation. (Needs hosting/mail infra — Phase B.)
2. **Import (today, Phase A):** drag the CSV/XLSX into the console — already working.
3. **Manual entry:** always available, audited.

## 4. Phase A test script (when team sits down)

1. Upload the 09:30 CSV → check: 464 containers, valid% ≈ 100, terminal split matches reality, scan count right.
2. Upload 12:30 → pool refreshes; delta report should show ~9 moved.
3. Upload ITV master + driver list (formats TBD when user provides) → fleet board real.
4. Do a real allocation on the assignment board against the real pendency numbers.
5. Generate the pendency report → compare with the hand-typed WhatsApp one that shift.

## 5. Open items

- Export file: current live version awaited from user (Book1.xlsx adapter drafted meanwhile).
- ITV master + driver list formats: awaited.
- TOS transition: when new TOS goes live, build `import-feed-v2` adapter (expect column renames; the pool model is unchanged).
- AMTE vs ADLL: confirm which parties are in our scope and whether both feeds arrive or one combined.
