# NG Marshal — Trial Run Guide

**How to run a dummy trial before going live** — one side from the HO / planning desk, one side from the yard / field. Prepared 20 Jul 2026.

The idea of the trial is to prove the whole loop with **real files and real people, but no consequences**: HO uploads the pendency the way the terminal will send it, plans the ITVs, and the field marks trips — all on a throwaway dataset you can reset with one button. Nothing here touches live operations.

---

## Before you start (one-time, 15 minutes)

1. Open the console URL on a laptop (HO) — this is the master control.
2. Open the same URL, or the app, on 2–3 phones (field) — driver / supervisor.
3. Go to **Setup** and enter just enough to be real:
   - **Vendors** — Active, plus any others (mark our own fleet "Own").
   - **ITV master** — even 10–15 call signs is enough for a trial. On 2–3 of them set **Only allowed → Scanning only**, and on 1–2 set **First call → Backlog** or **Check package**, so you can watch those rules bite.
   - **Driver master** — names + phone numbers for the phones you'll use (the app logs in by phone number).
   - Map a driver to each ITV you'll test.
4. Note the **↺ Reset** button, top right. It clears everything back to seed — your trial's undo button.

---

## PART A — The HO / planning-desk trial

This is the loop the docs desk and shift incharge will run every day.

### A0. Mark the shift roster (start of shift)
- Open **ITV Planner** → the **Shift roster** panel is at the top.
- **Bulk mark live** → paste the vendor's morning list of live ITVs (from their Excel or a photo). One call sign per line, or comma-separated; add a driver name after each if you have it (`A333 Ramesh Yadav`). Names are optional.
- Or mark each ITV with **＋ Mark live** in the fleet table. Call signs not in the master are reported, not added.
- The roster tiles show **Live this shift · Confirmed · Manual only · App only · Not marked**. This is what "starts the shift" — from here, planning only deploys ITVs that turned up.
- When a driver later goes on duty in the app, it **reconciles** with your manual mark and the ITV flips to **✓ Confirmed** (both sources agree). Until the app is adopted, manual marking alone is enough.
- **↺ New shift** clears the roster to rebuild it next shift.

### A1. Feed the pendency (the every-3-4-hours step)
- Click **⬆ Upload file** (top-right, on every screen).
- Drop the pendency file the terminal sends. **You can drop several at once** — to simulate a day, select the last 4–8 files together; they replay oldest-first and the live pendency ends on the newest one.
- In the preview, **pick which report each sheet is** from the dropdown. The real files are already trained:
  - **Import** — the DPD CSVs (`Import_Containers_DPD_AMTE_…_HHMMhrs.csv`). One sheet, auto-detects as *Import pendency*. To load a week of history, select all the day's CSVs at once — they replay oldest-first.
  - **Export** — the daily XLSX (`Mon 13-Jul-26.xlsx`). It has **5 sheets**; load **Sheet1** (the combined list with TERMINAL + GATE CUT-OFF) as the export pendency. The per-terminal sheets are subsets of it, so don't load them separately. The app shows a **diagnostics line** — how many containers it read, the direction, and which columns it mapped — so you can see it understood the file before loading. If a sheet reads 0, the message tells you why (usually a missing container column) — send us that file and screenshot if it won't map.
- Each upload reports exactly what changed: `IMPORT 18 Jul 12:00: +38 new · 402 updated · 24 cleared · 460 pending now`.
  - **new** = containers that appeared for the first time.
  - **updated** = already in the system, figures refreshed (no duplicates — ever).
  - **cleared** = gone from this sheet, so they moved. They drop out of pendency and into history for TAT.
- **Check the file name carries a date/time** (e.g. `Import_Containers_18072026_1200`). That is how the app orders a batch. If a file has no date in the name, it's treated as "now" — fine for single uploads, but name them for bulk history.

> **Try the out-of-order case on purpose:** after loading today's files, upload a 2-day-old file. The app will say *"…is OLDER than the latest feed — nothing cleared"* and will **not** resurrect containers that have since left. That's the guard working.

### A2. Read the live pendency
- **Dashboard** — the landing screen: KPI strip, deployment by location, fleet board, trip distribution, hot list, open issues and shift analytics, all live.
- **Pendency** — the EXIM pendency report in your exact format, now filled with real numbers. Edit the manual cells (yard inventory, remarks) with ✎ Edit manual.
- **Yard** — the block-wise map, built from the Location column. Colour by ageing to see which blocks are stale.
- **Plan** — pendency per destination, import and export side by side, with "Needs clearing first" (scanning / check package / ODC / over-48h) as a separate band.

### A3. Plan the ITVs
- On **Plan**, use **Quick allocate** ("Active · 10 ITVs → CT4 · Import") for fast vendor batches, **or** click **Suggest plan** for the auto-plan.
- Auto-plan **proposes**, never applies. Read the proposal:
  - **Vendor-wise plan** — what to tell each vendor ("Active: 10 → CT4 Import, 4 → Scanning"). These are your routines.
  - Per-lane before → after, and honest gaps where demand has no ITV.
  - Confirm the scanning-only units are only ever on scanning, and any backlog/check-package priority units went where you set them.
- Click **Apply plan** — or **Discard** and allocate by hand. Applied assignments are **tentative**.

### A4. Assign and confirm (the ITV Planner)
- Go to **ITV Planner** — one row per ITV. Change any "send to" by hand.
- Each assignment is **◇ tentative** until you click **confirm** (or "Confirm all"). Once confirmed, auto-plan won't touch it. This is your sign-off.
- Use **Share to WhatsApp** (top-right) to see the deployment message in your usual format.

### A5. Watch it come back
- As the field marks trips (Part B), the **Dashboard** shows trips in flight and fleet status, and its **Analytics** panel fills in: TAT, throughput, ITV-wise and driver-wise. After a couple of feeds you'll see real turnaround times.

---

## PART B — The yard / field trial

Each person uses **one phone**. No role picking — the phone number decides who they are.

### B1. First launch (once per phone)
- Open the app → type the phone number → it finds them in the masters → "नमस्ते Ramesh, आप driver हैं" → confirm.
- From then on the app opens straight to their screen, zero clicks. (Long-press the logo to switch user during the trial when phones are shared.)

### B2. Driver
- Opens on the money-meter and their ITV (from the master mapping).
- **Slide to go on duty** → accept the job offer → drive (pretend) → **snap the terminal slip** with the camera → the trip records and the meter moves.
- Try the **⚠️ Problem** button — raises an issue that appears on the supervisor's phone and on HO's Dashboard.

### B3. Supervisor
- Opens on fleet KPIs. Mark an ITV **breakdown**, **Ack/Resolve** an issue, and at shift end **Approve** each driver's trips.
- "View as" lets a supervisor peek at a driver or operator screen.

### B4. Operator (if testing equipment)
- Opens on their machine → +/- the **hours** and **moves** → giant **Save**. Breakdown button if needed.

---

## PART C — A suggested 1-hour scripted dummy run

Do this end-to-end once, with HO on the laptop and 2 phones:

1. **HO:** Reset. Enter 12 ITVs (mark 2 scanning-only, 1 backlog-priority), 2 drivers, map them. *(5 min)*
2. **HO:** Bulk-upload one day of real pendency files. Confirm the numbers look right on the Dashboard and Pendency tabs. *(5 min)*
3. **HO:** Suggest plan → read the vendor-wise routine → confirm scanning-only units stayed on scanning → Apply. *(10 min)*
4. **HO:** ITV Planner → confirm the plan → send the WhatsApp report. *(5 min)*
5. **Field:** both phones onboard, go on duty, each accepts a job and snaps a slip. Supervisor marks one breakdown. *(15 min)*
6. **HO:** upload the *next* pendency file → watch cleared containers move to history and Analytics show first TAT numbers. *(5 min)*
7. **HO:** open **Setup → Data & storage** and show the team how little space a day used, and that nothing is duplicated. *(5 min)*
8. **Debrief:** what was confusing, what's missing, what numbers looked wrong. *(10 min)*

Then **Reset** and you're clean for the real start.

---

## PART D — What "ready for real use" needs (do these after a successful trial)

The trial runs on your laptop/phones with data kept **on each device**. To go live shared across the team:
1. **Host it** — deploy to a shared URL with a Supabase database (steps in `itv-app/DEPLOY.md`). Then everyone sees the same live picture.
2. **Turn on auto-forward** — point the terminal's pendency email at the app so A1 happens by itself (optional; manual upload works fine meanwhile).
3. **Add phone-OTP login** before drivers use it widely.
4. **Enter the real numbers** — full ITV master, real rate card, real lane minimums and vendor restrictions.

Until then, the trial and even a small real pilot can run exactly as above.

---

## Quick reference — what each screen is for
| Screen | Verb | Use it to |
|---|---|---|
| Dashboard | MONITOR | the whole picture — deployment, fleet, trips, issues, analytics (the landing screen) |
| Pendency | READ | the EXIM pendency report in your Excel format; edit manual cells; print |
| Yard | SEE | see where containers are, block by block |
| Plan | DECIDE | see demand per destination and auto-plan |
| ITV Planner | ASSIGN | send each ITV; confirm the plan |
| Setup | CONFIGURE | masters, rules, rates, and Data & storage |

**⬆ Upload file** (top-right) and **↺ Reset** are on every screen.
