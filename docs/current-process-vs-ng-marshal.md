# Pendency & ITV Allocation — how it runs today, and what NG Marshal changes

**Prepared:** 15 Jul 2026 · **Site:** Mundra EXIM Yard · **Status:** as-understood, for correction by the team

This note records **how pendency tracking and ITV allocation actually work today**, and exactly what
the app improves. It is written from: (a) Rohan's descriptions, (b) the real Adani feed files, and
(c) analysis of ~29,000 lines of the "EXIM Movement" WhatsApp group (24 Mar – 4 Jul 2026).

Anything marked **[assumption]** needs the team to confirm or correct.

---

# PART A — How it works today

## A1. Pendency tracking

**Where the data comes from**

| Source | What it is | Cadence |
|---|---|---|
| Email from `opsexim.shpl@adani.com` | Container-level **import** pendency CSV (`Import_Containers_DPD_AMTE_<date>_<time>hrs.csv`) sent to our documentation dept | every ~3 hours |
| Export pendency file | Excel with container, terminal, size, CHA, vessel, **gate cut-off** | **[assumption]** — a summary is circulated; the detailed file exists behind it |
| EXIM Pendency master Excel | Manually maintained pivot: terminal × size × normal/scanning × dwell day | maintained by hand |

**What happens to it**

1. The 3-hourly email lands in documentation. The CSV is **rich** — container no, ISO, TEU, terminal,
   yard location, **Pendency(Hrs)** ageing, scan flag, ODC category, weight, party, release time.
2. Almost none of that richness is used downstream. Someone **screenshots the pendency Excel** and
   posts the photo to the WhatsApp group.
3. The shift incharge **hand-types** the pendency report into WhatsApp, in a rigid format:

   ```
   *EXIM Terminal Movement Pendency* Details ( In TEUS)
   At the shift start:1122   During shift add:191   Balance:1313
   Actual Completed:210      Current Pendency:1103
   *Total 68"ITV Running*
   ```
4. A **separate** scanning pendency report is typed in the same shape.
5. Repeat ~3–4× per 24 hours (shift boundaries ~07:00 / 14:00 / 19:00 / 02:00).

**Net:** 30+ structured messages typed by hand every day. The numbers exist only in WhatsApp and in
one person's Excel. There is no single source of truth, and no way to query "what's pending at CT3
that's over 5 days old?" without someone rebuilding it manually.

## A2. ITV allocation

**How ITVs get assigned today**

1. Shift incharge posts a **deployment plan in counts** on WhatsApp:
   `Import 30 itv · Export 40 · Scanning 10 · Check package 4 · Total 84`
2. The vendor supervisor (Active) replies with the **ITV list** — bare call-signs:
   `7112 7114 7116 7118 … = 84`
3. **Which actual ITV goes to which terminal is decided informally**, on the ground, by the vendor
   supervisor — verbally or over WhatsApp. It is not recorded anywhere.
4. Drivers are told via the WhatsApp group or by the supervisor in person.
5. At the terminal gate, **the terminal's system assigns the actual container** and prints the parchi
   (container no + yard position). We do not choose containers. *(MICT prints no container number at
   all — the driver only learns it at the loading location.)*

**What lives only in people's heads**

- Which ITVs are **scanning-only** (higher-capacity units).
- Which drivers have restrictions ("no MICT — gate pass issue", "day shift only").
- Which vendor is getting which terminals, and whether that's fair.

**Verification & incentive**

- Trip verification is done **by the vendor, manually**. In Rohan's words: *"we are not sure how he is
  doing it."*
- Driver incentive is calculated **manually at month end**, by the vendor. The driver has no visibility
  during the shift.

## A3. What today's method costs

Evidence from the WhatsApp group (Mar–Jul 2026):

| Problem | Evidence |
|---|---|
| **No ground truth on fleet count** | Vendor owner: *"90 itv tha"* · Incharge: *"53 movement, 20 scanning, total 73 sir"*. Recurring dispute. |
| **Single-trip arguments, settled by memory** | *"87 itv reporting 57 sigal trep"*. Counted by hand, disputed every shift. Per-ITV target is 13–14 TEU; actual runs 7–11. |
| **Standby with no audit trail** | *"ITV stand by location last 2hrs still loading pending please look into"* — 150+ times in six weeks. |
| **Blame lands on the wrong party** | ~**70% of standby is terminal-side** (RST/RTG breakdown, no parchi issued, yard jam, security blocking, pre-advice failure, system down). With no evidence, the terminal denies it and the cost lands on us/the vendor. |
| **Allocation silently decides earnings** | Drivers earn per trip/TEU. A slow terminal = less money. Nobody tracks who gets the good lanes. |
| **Utilisation gap** | 85 allotted → ~73 reporting → ~60–70 actually running. The gap is discovered late, by argument. |

---

# PART B — What NG Marshal changes

## B1. Pendency

| Today | With NG Marshal |
|---|---|
| Email → documentation → screenshot → WhatsApp photo | **Auto-forward**: the same email is forwarded to the app and **parses itself**. *(Proven on the real 09:30 file: 464 containers, 100% ISO 6346 check-digit valid.)* Also drag-and-drop import, or audited manual entry — three channels, never one dependency. |
| Import and export tracked ad-hoc, easily conflated | **Separate pools**, each refreshing independently. A new import file never clobbers export. |
| Pendency report typed by hand, 30+ msgs/day | **Generated automatically in the exact same WhatsApp format** — one tap to copy. The app feeds the group before it replaces the group. |
| Rich CSV fields discarded | **Ageing, ODC, scanning flag, yard location all used** — dashboard slices by total → direction → location without anyone rebuilding a pivot. |
| Completion known only from the typed report | **File-to-file delta is an independent check**: rows fell 465 → 456 → 431 → 386 across one day; containers that disappear between files were moved. A verification source we didn't have before. |

**Correct information structure** (this was explicitly re-planned): locations (MICT/T2/CT2/CT3/CT4/FTWZ),
directions (import/export) and movements (scanning/check-package) are **three different dimensions** and
are never shown at the same level. Hierarchy: **Total pendency → direction → location**, with movements
on their own level (scanning is *a slice of import*, not a place).

## B2. ITV allocation

| Today | With NG Marshal |
|---|---|
| Plan in **counts** on WhatsApp; actual ITVs decided informally | Plan **actual ITVs** — a real record of which unit went where, and when it changed. |
| Assigning 85 ITVs one at a time is unworkable | **Quick allocate**: `[Active] [10] ITVs → [CT4 · Import]` in one action. Auto-skips breakdown / no-driver / mid-trip / ineligible. |
| Rules live in people's heads | **ITV preferences are data**: 🔒 *scanning-only* (hard — cannot be sent elsewhere) and ★ *preferred* (soft). Driver restrictions ("no MICT") honoured automatically **and shown on the board during manual allocation**, so the planner sees them too. |
| Nobody checks vendor dominance | **Vendor balance**: each terminal's vendor mix tracks that vendor's share of the fleet — no single vendor owns a terminal. |
| Allocation quietly decides who earns | **Trip equity**: ITVs with the fewest trips get **first pick of high-yield lanes**. Equal earning opportunity, not just gap-filling. |
| Short of ITVs → the loudest lane wins | **Scarcity is shared proportionally by priority** (live demand × weight) instead of the first lanes eating everything — matching the reality that you're always short. |
| No plan record; disputes by memory | Every allocation and change is **audited** (who / when / why). "90 vs 73" becomes a number on a screen. |
| Single-trip counted by hand | **Live trip distribution** (1 / 2 / 3 / 4+ trips per ITV). |
| Standby is a complaint | **GPS-stamped standby evidence pack** — the 70% terminal-fault becomes *provable*, and the driver's no-fault clock protects his incentive. |
| Vendor verifies trips opaquely | **Independent verification**: GPS cycle + terminal ticket OCR + our own yard record. First ground truth anyone has — without needing the port's TOS. |
| Incentive: manual, month-end, invisible | **Live per-TEU meter** the driver watches during the shift; versioned rate card; supervisor approval; full ledger. |

## B3. Auto-plan — how the rules are given

Rules are **a table in the console** (versioned + audited, like the rate card) — never code:

- **Per lane** (e.g. `CT3 · Import`): min ITVs, max, demand weight.
- **Per vendor**: max supply, which lanes they're allowed to serve.
- **Global toggles**: vendor balance · trip equity · minimise churn · respect preferences.

The engine reads live pendency, applies the rules, and **proposes a diff** — *"+3 T2, +2 CT2, A198 → Scanning
(restricted unit)"* — with honest gaps listed (*"FTWZ short by 1 — no eligible ITV"*). The planner clicks
**Apply** or **Discard**. **It never silently reassigns.**

---

# PART C — What deliberately does NOT change

Being clear about this matters more than the wins:

1. **We still do not choose containers.** The terminal gate assigns the container and prints the parchi.
   The app plans **ITVs to lanes**; the container binds to the trip when the driver photographs the slip.
   Nothing in the design assumes we can pre-assign a container.
2. **No TOS access is assumed.** Everything is built from sources we control: the emailed pendency feed,
   the terminal's printed ticket, our own yard record, and GPS.
3. **The WhatsApp group doesn't die on day one.** The app generates the same reports in the same format,
   so the principal sees no change while our side stops typing.
4. **The planner stays in command.** Auto-plan proposes; a human applies. Supervisor override is permanent.

---

# PART D — Open, needs the team

1. **Vendor list & fleet sizes** — Active is the dominant vendor; **SSPL** was mentioned but I have no
   detail. Who else, and how many ITVs each?
2. **Real minimums per lane** — current values (CT3 min 10, MICT 5 …) are **my placeholders**, not yours.
3. **Vendor → terminal restrictions** — is SSPL genuinely CT2/CT3 only? **[assumption]**
4. **Export pendency file** — the live format, to confirm the parser.
5. **The actual incentive rate card** — rates today are placeholders (₹80/TEU etc.).
6. **Should auto-plan ever auto-apply** at shift start, or always propose?
7. **Which ITVs are truly scanning-only**, and which drivers carry restrictions — to seed the masters.
