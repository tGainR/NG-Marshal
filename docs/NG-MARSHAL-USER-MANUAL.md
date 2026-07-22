# NG Marshal — User Manual

**Container-yard ITV & equipment control for Navin Group O&M.** Version 0.3.0 · Mundra EXIM pilot.
This manual covers what the software is, how it is built, and — the main thing — **how to run the daily job**: import the pendency, upload the masters, mark which ITVs are live, plan them, and monitor them.

---

## 1. What NG Marshal is

NG Marshal replaces the WhatsApp-and-Excel way of running ITV operations with **one live system**. The terminal's pendency reports go in, planning happens on screen, the field reports back, and the pendency summary everyone knows updates itself.

There are **two parts**:
- **The web console** — the master control, used at the HO / planning desk on a laptop. Everything in this manual is the console unless it says "app".
- **The mobile app** — for drivers, operators and supervisors in the field. Entry and viewing only.

**Two rules the whole system is built on:**
1. **We assign ITVs; the gate assigns the container.** We plan an ITV to a terminal and movement; the terminal's printed slip binds the actual container. The app never needs to pre-know a container.
2. **No TOS access needed.** Everything is built from what we control — the emailed pendency feed, the printed ticket, our yard record, and (later) GPS.

---

## 2. The six screens (and what each is for)

At the top of the console is a **KPI strip** (ITVs live, TEUs, pendency, single-trip, equipment, open issues) that shows on every screen. Below it, six tabs:

| Tab | One-line job |
|---|---|
| **Dashboard** | The whole picture, live — deployment, fleet board, trips, hot list, open issues, and shift analytics (TAT, throughput). This is the landing screen. |
| **Pendency** | The **EXIM PENDENCY REPORT** in your exact Excel format, live. Read it, edit the manual cells, print it. |
| **Yard** | Block-wise map of where the containers actually are, from the Location column. Colour by ageing / import-export / flags / fill. |
| **Demand** | How much import & export is waiting at each destination. The "where's the work" view. |
| **ITV Planner** | **Everything to plan the ITVs in one place** — mark who's live, read the demand, quick-allocate or auto-plan, send each ITV, confirm. |
| **Setup** | Masters (vendors, ITVs, drivers), equipment & operators, rate card, planning rules, and a Data & storage panel. |

Two controls sit in the **top-right header of every screen**: **⬆ Upload file** (bring data in) and **Share to WhatsApp** (send the deployment report out). **↺ Reset** clears the session back to seed — your undo button during trials.

---

## 3. The daily workflow (this is the job)

The order matters. Steps 1–3 set up the shift; 4 plans it; 5 watches it run.

### Step 1 — Import the pendency (every 3–4 hours, whenever a file comes)

1. Click **⬆ Upload file** (top-right).
2. Drop the file(s). The real feeds are already trained:
   - **Import** — the DPD CSVs (`Import_Containers_DPD_AMTE_…_HHMMhrs.csv`). To load a whole day or week at once, **select all the CSVs together** — they replay oldest-first and the live pendency ends on the newest sheet.
   - **Export** — the daily XLSX (`Mon 13-Jul-26.xlsx`). It has several sheets; load **Sheet1** (the combined list with TERMINAL + GATE CUT-OFF). The per-terminal sheets are subsets of it, so don't load them separately.
3. In the preview, confirm the **report type** in the dropdown (it auto-detects) and read the **diagnostics line** — how many containers it read, the direction, and which columns it mapped. If a sheet reads **0**, the message says why; that file needs a container column, or a different report type. Then click **Load into system**.

**What "load" does — it never overwrites.** Each file is treated as a snapshot of what is pending *now*. New containers are **added**, ones already in the system are **updated**, and any no longer in the file have **left** — those move into history for TAT. Every load reports `+X new · Y updated · Z cleared · N pending now`. Uploading the same file twice changes nothing.

**Once loaded, the data is everywhere at once** — the Dashboard, the Pendency report, the Yard map, and the Demand and ITV Planner queues all recompute instantly from the same pool.

> **Live updates:** every 3–4 hours a new file lands — just upload it. Cleared containers drop out, new ones appear, and the whole console reflects the latest picture. (When the auto-forward email is switched on, this step happens by itself; see §7.)

### Step 2 — Upload the masters (once, then edit as needed)

Go to **Setup**.
- **Vendors** — add Active and any others (mark our own fleet "Own").
- **ITV master** — click **⬇ ITV master template** to download the blank CSV, fill it in, and upload it with **⬆ Upload file**. Columns: `Call sign, Registration, Vendor, Tags, Driver`. Put **`scanning-only`** in the Tags column for any ITV the vendor keeps on scanning — that becomes a hard rule, so the planner never sends it anywhere else.
- **Driver master** — click **⬇ Driver master template**, fill it in, upload. Columns: `Driver Name, Phone, Vendor, ITV, Note`. **Phone numbers are required** — the mobile app logs a driver in by their number.

You can also edit any ITV or driver directly in the Setup tables — map a driver to an ITV, set **Only allowed** (hard duty restriction) or **First call** (soft priority: backlog / scanning / check package / import / export).

### Step 3 — Mark which ITVs are live (start of shift)

Open **ITV Planner**. The **Shift roster** is at the top.
- **Bulk mark live** — paste the vendor's morning list of live ITVs (from their Excel or a photo). One call sign per line, or comma-separated; add a driver name after each if you have it (`A333 Ramesh Yadav`). Call signs not in the master are reported, not added.
- Or mark each ITV with **＋ Mark live** in the fleet table below.

The roster tiles show **Live this shift · Confirmed · Manual only · App only · Not marked**. This is what "starts the shift" — from here on, planning only offers ITVs that actually turned up.

> **Two sources, reconciled.** Marking here is **Manual**. When the driver later goes on duty in the app it adds the **App** source, and the ITV shows **✓ Confirmed** (both agree). You can run entirely on manual marking today; the app reconciles as it rolls out.

### Step 4 — Plan the ITVs (all on the ITV Planner)

Everything to plan is on this one screen, top to bottom:

1. **Work queues** — demand per destination (import & export), and how many ITVs you have on each. A queue with pending TEU and **0 ITVs** turns red.
2. **Quick allocate** — the fast tool: `[Active] [10] ITVs → [CT3 · Import]` → **Allocate**. It picks that many eligible live ITVs and sends them, skipping breakdown / no-driver / mid-trip / scanning-restricted units.
3. **Auto-plan** — click **⚡ Suggest plan**. It reads the live demand and your rules and **proposes** a plan (it never applies on its own): demand-weighted, fair vendor mix, scanning-only units kept on scanning, and a **vendor-wise breakdown — "what to tell each vendor"** (e.g. *Active: 1 → CT2 Import, 7 → CT3 Import…*). Click **Apply plan** to accept, or **Discard**.
4. **Fleet table** — every ITV as a row: its live status, driver, state, and a **Send to** dropdown. Change any assignment by hand here.
5. **Confirm** — new assignments are **◇ tentative** (auto-plan may still move them). Click **confirm** on a row, or **✓ Confirm all**, to lock them. Once confirmed, auto-plan leaves them alone — that's your sign-off.

Then hit **Share to WhatsApp** (top-right) to send the deployment message in your usual format.

### Step 5 — Monitor (the Dashboard)

The **Dashboard** is the live command centre:
- **Deployment by location** — ITVs on each terminal, import/export split.
- **Fleet board** — every ITV's status (running / standby+reason / breakdown / diesel / no-driver), driver, trips today, and time-in-state.
- **Trip distribution**, **hot list** (cut-off countdowns), and the **open issue queue** (breakdowns, standby, gate rejections — each owned and audited).
- **Analytics** — TAT, throughput, ITV-wise and driver-wise, from the history the app keeps.

As the field reports trips and problems, this screen updates live. Supervisors do the same from the mobile app (mark breakdowns, resolve issues, approve shifts).

---

## 4. The mobile app (field)

One app, **no role-picking**. A person types their phone number **once**; the app looks them up in the masters and from then on opens straight to their view.
- **Driver** — money-meter, where-to-go, slide to accept a job, snap the terminal slip, one ⚠️ Problem button. Going on duty marks their ITV **live (App)**.
- **Operator** — their machine, giant +/− steppers for hours & moves, one big Save.
- **Supervisor** — fleet KPIs, mark breakdowns, resolve issues, approve each driver's shift; can peek at driver/operator views.

The installable APK is `dist/NG-Marshal-v0.3.0.apk` (sideload to an Android phone).

---

## 5. How the data is kept (why it stays fast)

The app keeps the **smallest record that answers every question**. A pending container is a full row (the planner reads every field); once it leaves, it shrinks to a compact history record (about a third the size) that still answers TAT and volume questions. Every list has a retention cap. **Setup → Data & storage** shows exactly what's kept, its size, and what each answers — at normal volumes, over a year of operation fits comfortably.

> **Where the data lives today:** in the browser on the machine you use. It is not yet shared across machines — so data you load on one laptop isn't visible on another. Making the console shared and always-populated for the whole team is the hosting step (§7).

---

## 6. How the software is built (for reference)

- **Web console**: Next.js (React) — a single app with the six tabs above.
- **Mobile app**: the same code packaged as an Android APK (Capacitor).
- **Data in** via three channels, all landing in one container pool: auto-forward email, file upload (with the report-type picker and diagnostics), and audited manual entry.
- **Backend-agnostic**: runs on local storage today; switches to a shared database (Supabase, then AWS) without a rewrite.
- **Everything auditable**: manual entries and plan changes are stamped who / when / why.

---

## 7. Going from pilot to full live use

The daily workflow above runs today on a laptop. To make it shared and automatic across the team:
1. **Host it** — deploy to a shared URL with a Supabase database (steps in `itv-app/DEPLOY.md`). Then everyone sees the same live picture and the data persists centrally.
2. **Turn on auto-forward** — point the terminal's pendency email at the app, so Step 1 happens by itself every few hours.
3. **Add phone-OTP login** before drivers use the app widely.
4. **Enter the real numbers** — full ITV & driver masters, real rate card, real lane minimums and vendor restrictions.
5. **Live GPS tracking of ITVs** — comes with the driver app + GPS once adopted; until then, "live tracking" is the fleet board status plus the assignment each ITV is on.

---

## Quick reference — the daily loop
**Import pendency → Upload/confirm masters → Mark ITVs live → Plan (quick-allocate or auto-plan) → Confirm → Share report → Monitor on Dashboard → re-import when the next file lands.**

⬆ Upload file · Share to WhatsApp · ↺ Reset are on every screen.
