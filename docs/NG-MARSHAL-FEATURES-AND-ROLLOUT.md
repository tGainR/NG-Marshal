# NG Marshal — Features & Rollout Guide

**For the O&M team.** What the software does, how to set it up, and how to start using it.
Prepared 17 Jul 2026. Pilot site: Mundra EXIM Yard.

NG Marshal replaces the WhatsApp-plus-Excel way of running ITV and equipment operations with **one live system**: the terminal's pendency emails come in, planning happens on screen, the field apps report back, incentives compute themselves, and the pendency summary everyone knows updates itself instead of being typed by hand.

There are **two parts**: a **web console** (the master control) and a **mobile app** (drivers, operators, supervisors). The mobile app connects into the console — one shared picture.

---

## PART 1 — What the software does (feature list)

### The console has six screens, each named for a verb
Structured the way terminal operating systems (Navis N4, Tideworks) split the work — *deciding* what should happen and *assigning* which vehicle does it are different jobs and get different screens.

| Screen | Verb | What it is for |
|---|---|---|
| **Dashboard** *(landing)* | MONITOR | The whole picture — KPI strip, deployment by location, fleet board, trip distribution, hot list, open issues and shift analytics, live. |
| **Pendency** | READ | The EXIM PENDENCY REPORT in your Excel format, live. Read it, edit the manual cells, print it. |
| **Yard** | SEE | Block-wise map of where the containers actually are. Colour by ageing / import-export / flags / fill. |
| **Plan** | DECIDE | How much work waits at each destination, lane targets, the rules. No ITV is named here. |
| **ITV Planner** | ASSIGN | One row per ITV — send it where. Work queues on top, fleet below, tentative until you confirm. |
| **Setup** | CONFIGURE | Masters, equipment & operators, rate card, incentives, planning rules, and Data & storage. |

**⬆ Upload file** is in the top-right of the header — same place on every screen.


### A. Getting data in (three ways, no dependency on one)
1. **Auto-forward email** — the terminal's 3-hourly import pendency email (and export cutoff files) forward to the app and parse themselves. *(Proven on the real Adani file: 464 containers, 100% valid.)*
2. **Upload** — the **⬆ Upload file** button sits in the **top-right of the console header**, so it is in the same place on every screen. Drag/drop or choose an Excel/CSV. Type auto-detected (import pendency / export cutoff / ITV master / driver master). Multi-sheet files import together.
3. **Manual entry** — always available, always stamped who/when/why.

**Uploading never overwrites.** Each pendency file is a snapshot of what is pending *now*. On load the system reconciles: new containers are **added**, known ones **updated in place** (duplicates merged — a container can never appear twice), and any no longer in the file have **left** — those shrink into a compact history record (about a third the size) rather than being kept as full rows or deleted. Every upload reports what happened — `IMPORT 18 Jul 12:00: +38 new · 402 updated · 24 cleared · 460 pending now`. Uploading the same file twice changes nothing.

**A week of files, any order.** The feed time is read from the filename (`Import_Containers_18072026_1200`), so you can drop several files at once — they replay oldest-first and live pendency ends on the newest sheet. An older file uploaded late only back-dates history; it never wrongly clears, and never resurrects a container that has already left.

**Storage stays lean.** The pending pool only ever holds what is actually pending; departed containers become compact history; each file leaves one small trend-snapshot. Every list has a retention cap. A live **Data & storage** panel in Setup shows exactly what is kept, its size, and what question it answers — at normal volumes a year of operation fits in browser storage.

### B. Pendency report (the live version of your Excel)
- The **"EXIM PENDENCY REPORT"** you keep by hand, now **live** — recomputes the instant a file lands. It has its own **Pendency** tab, right beside the Dashboard.
- Import by dwell-day × terminal × Normal/Scanning × 20'/40', with auto **LINE HOLD** flags and red-shaded aged cells; Export by cutoff-day; TOTAL PENDENCY box; Yard Inventory; terminal-wise ITV deployment plan; Available Trailers.
- Same layout your team already reads. The parts with no data feed (yard inventory, terminal holds, remarks, check-package) are **editable in place** (✎ Edit manual) and saved — so it matches your Excel exactly, without maintaining a separate file.

### B2. Yard — the block-wise map
- Blocks, bays, rows and tiers **derived automatically from the Location column** of the pendency feed (`1T22C.3`), so the map always matches the ground — no layout file to maintain.
- One **Colour by** switch: ageing (share of the block over 48h), import/export mix, scanning & check-package flags, or how full. Flags also show as glyphs (🔍 📦 ⏱), so colour never has to carry two meanings at once.
- Click any block for the container list — position, size, direction, terminal, dwell, and **what is blocking it from moving**.

### C. Planning & allocation (the hard part, made fast)
- **Pendency by destination, import and export side by side** — each terminal tile splits into an Import half and an Export half, each with its own TEU, container count and ITVs-assigned. Gaps flag red.
- **Scanning and check package are not destinations.** They are steps a box must clear *before* it can leave — like inspection holds in a TOS. So they appear in a separate **"Needs clearing first"** band (with ODC and over-48h ageing), and a scanning box still counts in its terminal's import figure. No double-counting.
- **ITV Planner** — work queues per destination showing demand vs ITVs on it (starved queues flag red), the whole fleet below with an in-place "send to" picker, driver/restriction warnings, and **tentative vs confirmed** commitment: auto-plan and quick-allocate produce tentative assignments; once you confirm one, auto-plan will not touch it. ITVs can also be put on scanning or check-package **movement duty**.
- **Quick allocate** — "[Active] [10] ITVs → [CT4 · Import]" in one action. Skips breakdown / no-driver / mid-trip / ineligible automatically.
- **Assignment board** — pick the actual ITV and send it; ITV preferences shown (🔒 scanning-only, ★ preferred) and driver notes ("no MICT").
- **Auto-plan** — reads live pendency + your rules and **proposes** a plan (never auto-applies): demand-weighted, **fair vendor mix** (no vendor dominates a terminal), **trip equity** (drivers with fewest trips get first pick of high-yield lanes — equal earning opportunity), scanning-only units placed first, honest gaps listed. You Apply or Discard.
- **Rules** (lane minimums/maximums/weights, vendor caps, fairness toggles) are editable settings — no developer needed.
- **ITV priority in the master** — each ITV can carry a hard **"only allowed"** duty (a scanning-only unit is never sent elsewhere, even when short) and a soft **"first call"** priority (backlog / scanning / check package / import / export — taken first for that duty, but freed to the pool if it has no work). "Backlog" means send at the oldest cargo first.
- **Analytics** (on the Dashboard) — TAT and throughput, the pendency trend across feeds, and ITV-wise / driver-wise productivity — all from the data the app already keeps.

### D. Dashboard — the command center (landing screen)
- Fleet status (running / standby+reason / breakdown / diesel / no-driver), deployment by location with import/export split, trip-distribution histogram, hot-list countdowns, standby evidence pack.
- **Auto-generated pendency report** in your exact WhatsApp format — one tap to copy.

### E. Incentives
- **Per-TEU rate card** (by movement, night multiplier, boost, milestone) — versioned; old trips keep old rates.
- **Driver money-meter** live during the shift; **incentive ledger** and **shift approvals** for supervisors.

### F. Issues & audit
- Every exception (standby, gate rejection, breakdown, plan change, manual entry) is a **typed, owned, auditable record**. Manual entries and plan changes always stamped who/when/why.

### G. Equipment tracker
- Reach stackers, 3T/5T forklifts, empty container handlers, side-shifter — masters, operator mapping, **daily hours & moves** log per operator. Replaces the paper register.

### H. Projects / Sites
- Mundra EXIM today; the model scales to other sites (internal or external transport). A site switcher + "add site" is built in.

### I. The mobile app (field)
- **One app, no role-picking.** A person types their phone number **once**; the app looks them up in the masters, and from then on opens straight to **their** view (driver / operator / supervisor) with zero clicks. Big Hindi-first buttons.
  - **Driver**: money-meter, where-to-go, job offer (slide to accept), ticket camera, one ⚠️ Problem button. Their ITV comes from the master mapping.
  - **Operator**: their machine + giant +/− steppers for hours & moves, one huge Save, breakdown button.
  - **Supervisor**: fleet status, mark breakdown, issue Ack/Resolve, shift approvals, and can peek at driver/equipment views.

### Two design rules the team should know
1. **We assign ITVs, the gate assigns containers.** The app plans ITVs to terminals/movements; the terminal's printed slip (photographed by the driver) binds the actual container. The app never needs to pre-know a container.
2. **No TOS access needed.** Everything is built from what we control: the emailed feed, the printed ticket, our yard record, and GPS.

---

## PART 2 — Steps to implement (one-time setup)

Order matters. Steps 1–3 are technical (a developer, ~half a day). Steps 4–6 are yours.

**1. Get the code hosted.**
   - Repo: `github.com/tGainR/NG-Marshal` (make it **private** — Settings → Danger Zone → change visibility).
   - Create a **Supabase** project (free tier) → run `itv-app/db/migrations/001_init.sql` then `002_equipment.sql` in its SQL editor.
   - Deploy `itv-app/` to **Vercel** (import the GitHub repo). Set env vars: `NEXT_PUBLIC_BACKEND=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Full detail in `itv-app/DEPLOY.md`. This gives a shared URL the whole team uses.

**2. Turn on auto-forward (optional but recommended).**
   - Sign up an inbound-email service (CloudMailin / Mailgun / SendGrid), set a mailbox rule to forward the `opsexim.shpl@adani.com` mails to it, point its webhook at `/api/ingest`. Steps in `DEPLOY.md`. Until this is on, upload the file manually — takes 10 seconds.

**3. Add login/roles before wide use.** The pilot runs on an unlisted URL; before rolling out to drivers, add phone-OTP auth (noted in `DEPLOY.md`/`TEAM-HANDOFF.md`).

**4. Enter the masters** (in the console → Masters & settings, and Equipment tab):
   - **Vendors** (Active, and any others — mark our own fleet as "Own").
   - **ITV master** — call signs, registrations, vendor; tag scanning-only / high-capacity units.
   - **Driver master** — names, **phone numbers** (needed for the app login), restrictions.
   - **Equipment + operator master**, and map operators to equipment.
   - **Daily driver↔ITV mapping** — set once, editable any day.

**5. Set the numbers** (Masters & settings):
   - **Rate card** — the real per-TEU incentive rates (replace placeholders).
   - **Planning rules** — real lane minimums, vendor caps, any vendor→terminal restrictions.
   - **Milestone** — the TEU target + bonus.

**6. Feed pendency** — forward or upload one real pendency file, confirm the Pendency Summary and planning boards light up with real numbers.

---

## PART 3 — How to start using it (daily flow)

**Docs / data desk**
- Each 3-hour email arrives → forwarded automatically (or drop the file via ⬆ Upload file, top-right). Pendency Summary updates itself. Fill the manual bits (yard inventory, remarks) via ✎ Edit manual, same as the Excel.

**Shift incharge / planner**
- Open **Planning** → read pendency vs deployed → **Quick allocate** vendor batches, or **Suggest plan** → review → **Apply**. Assignments are recorded and audited.
- Generate the **pendency report** for WhatsApp with one tap.

**Supervisor (mobile)**
- Open app → their view → mark breakdowns, resolve issues, **approve** each driver's shift at close.

**Driver (mobile)**
- Open app → their ITV → slide on duty → accept jobs → snap the terminal slip → watch the money-meter → ⚠️ for any problem.

**Operator (mobile)**
- Open app → their machine → +/− the hours & moves → **Save**. Breakdown button if needed.

**Manager**
- Dashboard and Pendency report for the whole picture; incentive ledger for payouts.

---

## PART 4 — Status & what's still needed from the team

**Working & tested now** (on real Adani data): ingestion, pendency summary in your format, planning + auto-plan, incentives, issues/audit, equipment, the mobile app (driver/operator/supervisor), the APK.

**Still needs your input:**
1. **Vendor list & fleet sizes** — Active is the main one; who else (SSPL was mentioned)? How many ITVs each?
2. **Real lane minimums & vendor→terminal restrictions** — current values are placeholders.
3. **Real incentive rate card** — the actual per-TEU rates.
4. **Yard inventory source** — where do those numbers come from today (so we can auto-feed instead of manual)?
5. **Check-package flag** — is CP marked anywhere in the feed, or always manual?
6. Confirm **auto-plan should always propose** (never auto-apply) — current default.

**Decisions on hosting** (your call): Supabase now (free), move to AWS later — the app is built to switch backends without a rewrite.

---

## Reference (in the repo)
- `itv-app/DEPLOY.md` — deployment + auto-forward steps
- `itv-app/TEAM-HANDOFF.md` — for the developers: what's real vs simulated, architecture, priorities
- `itv-app/README.md` — run locally
- `current-process-vs-ng-marshal.md` — how things run today vs with the app
- `PROJECT-BRIEF.md` — the original brief
- `dist/NG-Marshal-v0.3.0.apk` — the installable field app (sideload to an Android phone)
