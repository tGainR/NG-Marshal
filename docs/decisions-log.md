# Decisions Log

Chronological log of confirmed decisions. Once something is here, treat it as settled and don't re-litigate without an explicit reversal.

## 2026-05-10 — initial design pass

### Scope
- **Build a simple trip-logging tool first, not an Uber-style app.** Adoption-first. Phase 2 adds the pick-board / Uber-style features.
- **Multi-vendor support is baseline**, not a future feature.
- **Replacing TOS or vendor GPS is not the goal.** We stitch, we don't replace.

### Driver UX
- **Driver entry must be brutally minimal** — a few buttons, no typing required. Anything more breaks adoption.
- **Driver does not enter container info.** Documentation team enters it; supervisor assigns.

### Challan handling
- **Multi-actor challan entry.** App must support: photo by driver, typed by driver, typed by office staff (supervisor or documentation desk). Three modes, one record.

### Delivery
- **No Play Store.** PWA / sideloaded link only.

### GPS & hardware
- **Vendor GPS is not accessible** — we don't depend on it. Our app's device is the GPS source.
- **VMT-primary, smartphone-fallback, same PWA on both.** Don't design VMT-only features. Auth supports both "vehicle-bound device + driver claims it" (VMT) and "driver-bound device + picks the vehicle" (phone).
- **Pilot Phase 1 on driver phones at one CFS.** Roll out VMTs vendor-by-vendor once value is visible to vendors.

### Phase 2 product direction
- **Documentation uploads job list as Excel every few hours** — Excel/CSV importer is required, not optional.
- **Drivers self-pick from a job board; unclaimed jobs auto-assign by algorithm.**
- **Cherry-picking is a hard problem to solve up front.** Pure free-pick fails. Layered release (staged-time-window visibility) + fairness ledger (tough-job ratio) + algorithmic auto-assign is the agreed approach. Difficulty tagging on every JobOrder from day one is load-bearing.

### Tech defaults (revisable, but the current plan)
- PWA (web app), works on Android phones and VMTs equally.
- Supabase (Postgres + Auth + Realtime + Storage) for the backend in Phase 1.
- Phone + OTP for driver login; email for office staff.
- Vercel hosting.
- Built-in dashboard + Excel export for reports.

### Architectural rules to bake in during Phase 1
1. `JobOrder` table is **separate from** `Assignment` table. A job can exist unassigned. (Phase 1 supervisor assigns 100%; Phase 2 drivers + system do.)
2. `difficulty` field populated on every `JobOrder` from day one — even if Phase 1 doesn't use it. Gives Phase 2 months of training data.
3. Excel/CSV importer for orders ships in Phase 1, even if used lightly.

## 2026-07-04 — incentive-first re-framing

- **Incentive engine promoted to the core Phase 1 feature.** Live per-trip incentive accrual, visible to the driver during the shift; shift-end total. This is the adoption hook — drivers pull, we don't push.
- **Assume no TOS API access** from principals (Adani etc.). Trip records are built from four captures we control: 3-hourly dependency list upload, terminal-slip photo at gate, our own exam-gate entry, GPS geofences. See `data-capture-without-tos.md`.
- **Per-shift bank payout with ₹10k retained deposit** is on the table, possibly Phase 1 — but agreed approach is to run app-computed incentive parallel to manual calculation for 2–4 weeks first, and check payroll/compliance treatment before switching the payout rail.
- Abandoned jobs and wrong-container picks must be first-class events (declared, logged, incentive rules configurable).

## 2026-07-04 — WhatsApp chat analysis (EXIM Movement group, Mar–Jul 2026)

Full chat + ticket photos analyzed; ground truth in `whatsapp-chat-findings.md`. Plan changes (proposed by analysis, pending user confirmation where marked):

- **Job model pivot:** no upstream per-container job list exists. App models **deployments** (N ITVs → terminal × movement type) + trip records created at execution from terminal ticket capture. Per-container JobOrder kept only for hot lists (D/O validity / gate cutoff).
- **Incentive unit = per TEU** (20'=1, 40'=2, from ISO code on ticket), with milestone bonus at the ~13 TEU/shift site target. *Pending user confirmation against actual vendor rate structure.*
- **No-fault standby clock** is a hard requirement: ~70% of waiting is terminal-side; excusable delay must not hurt the driver, and produces GPS-stamped standby evidence packs for terminal escalation.
- **Auto-generated reports in today's exact WhatsApp formats** (pendency, shift movement summary, trip distribution, ITV list) are Phase-1 scope — the supervisor-side adoption hook; the app feeds the WhatsApp group before replacing it.
- **Aborted-trip event** (gate rejected / pre-advice failure / wrong container) with photo + partial-credit rules — frequent and rarely driver's fault.
- **Pilot target: Mundra EXIM yard, Active Cargo Movers** (~70–90 ITVs — dominant vendor; multi-vendor stays baseline in the data model).
- Phase-2 tough-job mapping confirmed by evidence: 20' scanning containers, MICT double-20s, night shifts are the refused/avoided work.

## 2026-07-04 (evening) — universality + container-level inputs

- **Vendor-agnostic design confirmed.** Active is current, not permanent — direct drivers or other vendors possible. No Active-specific assumptions in the core.
- **Universal core, site profiles on top.** Core abstraction: Site → Zones (geofences) → Movement types → Rate card; a trip = a verified cycle between zones with optional container evidence. Covers CFS↔terminal (Mundra), in-terminal QC↔yard, ICD rail↔yard, and 20–30 km outside movements. Mundra ships first as a site profile; "Mundra version" acceptable if it proves too special.
- **Salary models both supported:** fixed + incentive, and pure per-trip (incentive-only, likely for outside movements).
- **Container-level import pendency Excel (emailed 3-hourly by terminal to documentation) + export cutoff file are importable planning inputs.** Model: container pool → deployments → trips → 3-way reconciliation. User to upload sample files.
- **Deliverable requested: team brief** (to vet the whole concept) + basic visual mockup of the flow.

## 2026-07-04 (late evening) — platform split, roles, issue tracking

- **Web console = complete management** (planning, imports incl. screenshot-OCR of dependency reports, manual entries, dashboards with zone occupancy / average dwell per location / red-flag issues, config, approvals, admin).
- **One mobile app, role-based views**: driver (incentive-first), supervisor, ops manager, docs/gate staff. Login-based access control. Android first, iOS later (PWA core keeps this cheap).
- **Issue tracking is a first-class module** — typed issues, auto-raised by thresholds or by people, owned/escalated/resolved with evidence; manual entries and plan changes always audited and flagged; daily manual-entries reconciliation report.
- **Container assignment confirmed OUT of our control at Mundra** — plan counts, bind containers at execution via slip OCR. Schema allows per-container assignment for future sites but Mundra profile does not use it.

## 2026-07-04 (night) — Uber/Ola-inspired trip module

- **Adopt Uber/Ola interaction patterns, reject their complexity** (reconciles the May "simpler than Uber" rule): duty toggle, 60-sec offer card with estimated ₹, slide-to-confirm on money-relevant transitions, per-trip fare-breakdown receipt, BOOST premium on tough/hot jobs (visible before accept, feeds fairness ledger), quests/streaks framing for milestone bonuses, Uber-Fleet-style live dispatch map in the web console. NOT copied: navigation, ratings, chat, algorithmic surge. Full design in `trip-module-design.md`.
- Offer-card UX is the same in Phase 1 (supervisor deployment ack) and Phase 2 (pick board / auto-assign) — only the offer source changes.

## 2026-07-04 — first build (itv-app/)

- **Pilot app scaffolded and running**: Next.js 16 + TypeScript + Tailwind in `itv-app/`. Working: role picker, full driver flow (duty slide → offer card w/ countdown & boost → GPS-simulated legs → ticket snap with mock OCR incl. ISO 6346 check digit → auto-verify at yard → fare receipt → live money meter & quest), web console (KPIs, fleet board, trip-distribution histogram, hot list, deployment plan, import-pool stubs, incentive ledger with supervisor approval, issue tracker with lifecycle, auto-generated pendency report in the WhatsApp format with copy button).
- Runs on an in-memory live simulation (1s tick; state resets on refresh; use in-app links to keep state across views). Next build steps: Supabase persistence + OTP auth + real device GPS + real OCR + PWA manifest.

## 2026-07-04 — data ingestion trio LOCKED

- **Every planning input reaches the system three ways, all first-class:**
  1. **Auto-forward** — a per-site ingest email address (e.g. mundra@itv.app); the terminal's 3-hourly import pendency email and cutoff files get forwarded (or a mailbox rule does it) and are parsed automatically.
  2. **Import** — upload Excel/CSV or a photo/screenshot (OCR) through the web console.
  3. **Manual entry** — always available, always stamped who/when/why, flagged as manual, and included in the daily manual-entries reconciliation report.
- Same trio applies to any future site's inputs (ICD rail lists, outside-movement job sheets). Parser per document type; the ingestion channel is never a constraint.

## 2026-07-04 — assignment flow locked (planning by us, container by gate)

- **Flow:** dependency arrives → planning/supervisor decides how many ITVs per location → picks SPECIFIC ITVs from a **live global pool across all vendors** and sends them.
- **Eligibility tags & notes are first-class:** some ITVs are scanning-only (higher capacity), some drivers don't/can't go certain places. Software carries tags/filters/notes on vehicles and drivers ("this ITV is for this purpose"); planner filters the pool by them.
- **Import:** we assign ITV → terminal only. The port gate gives the actual container/job. Never pretend otherwise.
- **Export:** we DO tell the driver the pickup point (EXIM-1/2) and each container's specific destination terminal — export assignments carry pickup + destination.
- **Driver's job = go where assigned.** The offer card reflects the assignment.

## 2026-07-04 — driver UI radically simplified + milestones

- **Driver main screen shows exactly three things:** where to go (huge), money (huge), one ⚠️ Problem button. Everything else (receipts, trip list, rate card, end-shift) behind a "Details ▾" drill-in. Text cut to minimum, Hindi-first.
- **Problem button opens a bottom sheet** with 3-4 big options (long wait / gate rejected / abandon / vehicle issue); photo + GPS attach automatically.
- **Milestone celebrations:** full-screen popup with confetti + trophy + bonus amount when a milestone is hit. First milestone (placeholder until user provides the real tiers): **10+ TEU in a shift → +₹100**. More tiers to come from user.
- **Shift timings corrected: 08:00–20:00 / 20:00–08:00.**

## 2026-07-04 — usable version v0.2

- **State now persists across refresh** (localStorage; ↺ Reset button in console top bar). A real shift can be logged without losing data.
- **Real ticket capture flow:** camera input (rear camera on phones) + optional typed container number with live ISO 6346 check-digit validation (red/green border); OCR stub fills in only when nothing is typed. Real OCR to be trained on actual parchi photos.
- **Training data needed from user** (list given in chat): 3-hr pendency Excels, export cutoff file, 15–20 real parchi photos, vendor incentive sheet + rates, ITV & driver masters, zone locations, milestone tiers, approver name.
- Hosting decision pending: app must be deployed (Vercel or other) + Supabase before drivers' phones can use it. Local-only until user okays deployment.

## 2026-07-04 — real import pipeline built & tested (v0.3)

- **Testing plan agreed:** Phase A local — parse real files, ingest, dashboards, allocation (user provides ITV master + vendor + driver lists, pendency Excels). Driver side rollout comes after.
- **Import pipeline live in the console (Planning tab):** real .xlsx/.xls/.csv upload → SheetJS parse → header-row auto-detection → file-type auto-detection (container pool / ITV master / driver master) → column auto-mapping by header keywords → preview with sample rows → one-click import. Container numbers validated by ISO 6346 check digit; invalid ones flagged (tested: planted a corrupt number, 92% valid reported correctly).
- ITV master import merges by call sign/registration (adds new, updates existing); driver master import links drivers to ITVs; container pool refresh replaces (3-hourly semantics), deduped.
- Waiting on user's real files to tune the parsers.

## 2026-07-06 — real files analyzed, ingestion plan made, parsers PROVEN

- User shared the real feed via Drive alias (`ITV Mgmt & Driver App/Current Reports Generated/`): 4× 3-hourly import CSVs (04-Jul 09:30–18:30), Book1.xlsx (export pendency w/ gate cutoffs), and the source .eml (from opsexim.shpl@adani.com, CSV attached, stable filename pattern → auto-forward fully automatable).
- **Import feed is container-level and richer than planned:** explicit TEU, Terminal, Scan_Flg, yard Location, Pendency(Hrs) aging, Cat_Cd (ODC = tough tag), Deliverable_Pty (ADLL/AMTE), release_dttm. Pendency dashboard, aging buckets, scan-stream split, and hot list all derive from this one file. File-to-file delta (465→456→431→386 rows through the day) = independent completion verification.
- **Tested in-app: real 09:30 CSV → 464 containers, 100% check-digit valid, imported to pool. Book1.xlsx → detected, 100% valid, title row skipped; Excel-serial dates fixed (raw:false).**
- Full plan in `ingestion-plan.md`. **TOS transition flagged by user** — formats will change; ingestion built as versioned format-adapters so only an adapter gets rewritten, not the system.
- Awaited: current live export file (user will give later), ITV master, driver list.

## 2026-07-06 — planning flow confirmed + pendency-vs-deployment strip built

- User re-confirmed the core planning flow: see LIVE pendency + available ITVs together → assign the ACTUAL ITV (not a count) to terminal × movement (import/export/scanning/CP) → container/work order comes from the terminal gate (import) or EXIM loading point (export).
- Built: "Live pendency vs ITVs deployed" strip on the Planning tab — per terminal + SCAN stream: pending TEUs, container count, oldest dwell (days), ODC count, ITVs currently assigned; RED when pendency has zero ITVs. Computed entirely from the imported real feed (verified with the 04-Jul 09:30 file: T2 377 TEU/190 ctr/oldest 10d, CT2 204 TEU red, SCAN 147 TEU).
- Hosting question raised by user. Answer: current build = per-browser storage → fine hosted for ONE planning workstation; TEAM use needs the shared backend (Supabase) + logins first. Decision pending.

## 2026-07-07 — masters & settings complete; deployment-ready (v0.4)

- **No Supabase provisioning yet** (user will assign one); app is deployment-ready: portable DataStore layer (local/supabase/future http-AWS), plain-SQL migration in repo, env-switch backend, DEPLOY.md checklist.
- **Everything enterable on the web console — new "Masters & settings" tab, all tested working:**
  - Vendor master (incl. "Own — direct employment" type for our directly-employed drivers; same verified incentive engine, payout responsibility ours).
  - ITV/equipment master: add ITVs manually (+ existing Excel bulk import).
  - Driver master: add drivers manually (+ Excel import).
  - **Driver ↔ ITV mapping, editable any day** (dropdown per ITV; mostly 1 driver = 1 ITV; every change audited).
  - **Incentive settings editable**: ₹/TEU per movement type, night multiplier, milestone TEU + bonus, aborted-trip credit. Saving creates a NEW rate-card version (v2, v3…) with audit entry; completed trips keep old rates; ledger and driver app recompute from the live version.
- Verified end-to-end in browser: added "NavIn Own Fleet" (own), driver Mahesh Parmar, ITV O101, mapped them, changed ₹80→₹90 + bonus → "Rate card v2 live", ledger showed v2 rates, all persisted across reload.
- Driver app intentionally NOT deployed yet — web-side entries validated first, per user.

## 2026-07-07 — recurring imports complete + auto-forward endpoint live (v0.5)

- **Direction-aware pool:** import pendency and export cutoff files now refresh their OWN pool (per-direction replace, deduped) — they no longer overwrite each other. Direction detected from filename, falling back to columns (GATE CUT-OFF/stuffing → export). Pool chip shows "N import · M export"; EXPORT card added to the pendency-vs-deployment strip.
- **Auto-forward endpoint built and tested: POST /api/ingest** — accepts the forwarded email attachment (multipart, as CloudMailin/Mailgun/SendGrid inbound services send) or a raw CSV/XLSX body; token-authenticated; parses with the same pipeline as the console; updates the shared pool per-direction with optimistic-lock retry. Tested with the real Adani CSV (464 containers, 100% valid) and export Excel (175, 100%). Runs in parse-only mode until the Supabase is assigned, then stores automatically.
- Recurring masters already supported: re-upload ITV/driver Excel any time — merge semantics (update existing, add new).
- Remaining for zero-touch auto-forward: assign Supabase + host the app + create the mailbox rule pointing the inbound-email service at /api/ingest?token=… (10-minute setup, documented in DEPLOY.md/ingestion-plan.md).

## 2026-07-07 — professional product face (v0.6)

- **Product branded "ITV Ops"** (working name, one-file rename in src/components/Brand.tsx): orange container-mark logo + wordmark, used on home, console top bar, and driver app.
- **Professional home page**: nav with live-site chip, hero ("Every trip verified. Every rupee visible. Every ITV accounted for."), LIVE stats row from real state (ITVs running, TEUs vs target, container pool import/export split, incentives accrued, open issues), four workspace entry cards, six-feature grid, footer with backend-mode indicator.
- Browser tab title/meta updated. Verified visually — stats row showed the real imported pool (464 import · 36 export).

## 2026-07-13 — final polish & housekeeping (v0.6.1)

- Hot list now DERIVED from the export pool's real gate cutoffs (grouped per terminal, earliest cutoff, 20'/40' split, auto-boost when <6h, OVERDUE flag) — seed examples only shown when no export file is loaded. Robust cutoff parsing for both real formats (m/d/yy from Excel, dd-mm-yyyy from CSVs).
- Celebration popup copy now uses the configured milestone (was hardcoded "10+").
- Report header uses the corrected 08:00 shift time.
- Real container data removed from public/ (was only for testing; must not ship).
- itv-app README written (run instructions, code map, design rules); full build committed to git (v0.6 pilot) — repo ready to push/deploy when hosting is decided.

## 2026-07-13 — equipment tracker + handoff to development team (v0.7)

- **Scope expansion confirmed by user**: this is no longer "just an ITV app" — it's a container-yard **fleet & equipment management** system. Added equipment types: Reach Stacker, 3T Forklift, 5T Forklift, Empty Container Handler, Forklift with Side Shifter.
- **Equipment tracker built**: equipment master, operator master, operator↔equipment mapping (identical audited pattern to driver↔ITV — one-time setup, editable any day, not a daily 125-driver re-entry chore per user's explicit clarification), manual daily hours/moves log per operator (the equipment-side "verified trip" until real telematics exist). New DB migration `002_equipment.sql`. Tested end-to-end in browser incl. persistence.
- **Confirmed working (re-verified per user's repeated ask)**: import pendency + export pendency both import via manual upload or email auto-forward (`/api/ingest`), as separate never-overwriting pools; ITV/driver/vendor masters all upload/enter-able; driver↔ITV linking is a settable-once, edit-when-needed mapping.
- **Codebase packaged for handoff to the dev team**: cleaned dead code (unused `Role` type, unused default create-next-app SVGs), confirmed zero-warning production build, wrote `itv-app/TEAM-HANDOFF.md` (real-vs-simulated table, architecture, deploy checklist, env vars, feature tour, priority-ordered remaining work, design rules, known limitations). `README.md` points to it. Full history committed to git (4 clean commits); team to push to GitHub, provision Supabase, deploy to Vercel themselves.
- Home page / branding broadened to "Fleet · Equipment · Incentives" positioning.

## 2026-07-13 (evening) — projects/sites split, FTWZ, import CTA, dashboard refresh (v0.8)

- **Projects / Sites is now a first-class concept.** A site is a project profile (id, name, kind: internal/external transport, destinations, targets). Console header has a **project switcher** (dropdown + "Add project/site" — internal or external). Home page has a **Projects/Sites section** showing each site with its destinations. Model is built to scale to other sites (incl. future external-transport sites with customer-driver management) — Mundra EXIM is the one configured today. `SITES` array in seed; `sites`/`activeSiteId` in state, persisted.
- **FTWZ added as a movement destination** (Free Trade Warehousing Zone — now live at Mundra). Appears on the dashboard "Deployment by destination" strip (highlighted, NEW badge), the planning pendency strip, and the assignment board (FTWZ movement option). New `ftwz` movement type + rate-card rate. Destinations = 4 terminals + FTWZ, and the framework takes more (e.g. movement-to-companies later) without code changes — just add destinations to the site.
- **Import is now a prominent CTA** (user's "most important thing"): an orange "⬆ Import file" button in the console header (works from any tab), plus a full-width drag-or-click import banner at the top of the Planning tab. The buried drop-zone remains as a secondary path. Import handler hoisted/shared.
- **Dashboard decluttered for a transport-management feel**: KPI strip is now 6 compact tiles (ITVs running, TEUs/target, pendency, single-trip, equipment, open issues) with 2-3 word sub-labels instead of sentences; wordy captions removed from the live board; added the "Deployment by destination" tile row (terminals + FTWZ, ITVs deployed each).
- Verified end-to-end in browser: project switcher opens/lists/adds; FTWZ assignment flows to the deployment card (0→1 ITV) and persists; home Projects section renders with destination chips. Clean production build.
- **GitHub: user requested a private upload.** No `gh` CLI / credentials on the machine — prepared the repo (clean history, git identity set, .env gitignored) and gave the user the exact authenticated commands to create the private repo and push (they must authenticate; I can't create accounts or handle credentials).

## 2026-07-15 — as-is vs to-be note written

- Wrote `current-process-vs-ng-marshal.md` — documents how pendency tracking and ITV allocation
  actually run today (3-hourly Adani email → screenshot → hand-typed WhatsApp report; deployment
  planned in counts, actual ITV choice informal and unrecorded; vendor-verified trips; month-end
  manual incentive), what it costs (fleet-count disputes, single-trip arguments, 150+ standby
  complaints with no audit trail, ~70% terminal-fault standby that lands on us), and exactly what
  the app changes. Includes what deliberately does NOT change (we never choose containers; no TOS
  assumed; WhatsApp fed not replaced on day one; planner stays in command).
- Assumptions explicitly flagged for team correction: export file format, SSPL/vendor list & fleet
  sizes, real lane minimums, vendor→terminal restrictions, real rate card, scanning-only ITV list.

## 2026-07-16 — NG Marshal field app (.apk) built

- **Mobile app = field companion for driver / operator / supervisor.** Entry & viewing only — no imports, masters, planning or reports (console-only). Capacitor 8 wrapper (`com.navingroup.ngmarshal`) around a static-export build of the same codebase.
- **No role picker, ever (user mandate):** identity set ONCE at onboarding — phone number typed, looked up in the masters, role comes from master control. Saved on the device (own localStorage key, never synced). Every later launch opens the person's own view with zero clicks. `/m?reset=1` clears identity for testing/phone handover. Unknown number → "supervisor se baat karein", no crash.
- **Driver view de-hardcoded:** `meDriverId` now in state (set from device identity); the driver's ITV comes from the driver↔ITV mapping in master control ("whatever is given to them"); unmapped → clear Hindi message. Trip machine/issues attribute to the actual person.
- **Operator view (new):** mapped equipment shown; giant hour/move steppers (no typing) + one huge Save → equipmentLogs; today/month totals; breakdown button raises an audited issue and marks the unit down.
- **Supervisor view (new):** Hindi status KPIs; fleet list with tap-to-mark breakdown/restore (audited via new `setVehicleStatus`); issue queue with Ack/Resolve; per-driver shift approvals; "देखें ▾" peek into driver/operator views with return bar. Planning deliberately absent.
- **Build chain:** `NEXT_OUTPUT=export` static export (api/ route temporarily excluded — POST handlers unsupported in export), Capacitor sync, Gradle assembleDebug via Homebrew CLI toolchain (openjdk@21 — Capacitor 8 needs Java 21, not 17; android-commandlinetools; no Android Studio). `scripts/build-apk.sh` is the one-command rebuild. Gradle wrapper pointed at locally-fetched distribution after slow-network failures.
- All verified in browser first: onboarding lookups for all three roles, zero-click relaunch, Sohan lands on HIS A157 (not demo Ramesh), operator log entry persists, supervisor resolve/approve work.

## 2026-07-16 (late) — live Pendency Summary in the team's Excel format + ingestion re-verified

- **New console tab "Pendency summary"** — a live replica of the hand-built "EXIM PENDENCY REPORT" Excel everyone knows: navy title bar with as-on timestamp + LIVE badge; IMPORT by dwell day (7th & Above → TODAY → CHECK PACKAGE, with dwell dates) × terminal × Normal/Scanning × 20'/40' + Exim Scanning + Normal/Scanning TEU columns + REMARK (auto LINE HOLD at 6th day+); red shading on non-zero/aged cells; TOTAL DPD bar. EXPORT by cutoff day (5th → TODAY CUTOFF+CP) × terminal × size + TEU. TOTAL PENDENCY box, YARD INVENTORY panel (feed not connected — shown honestly with dashes), Terminal-Wise ITV Deployment Plan fed live from assignments + pending box counts, Available Trailers. Not 3-hourly — recomputes the instant a file lands or an ITV is assigned.
- **Ingestion re-verified with the real files through the UI**: import CSV → 464 containers; Book1.xlsx exports → 175 containers across BOTH sheets.
- **Bug found & fixed during the retest:** a multi-sheet export file's sheets imported one-by-one would REPLACE each other (per-direction refresh semantics). Added "Import ALL container sheets together" for multi-sheet files — merges sheets of one file into a single pool update.
- Summary totals from real data: Import-Normal 674 TEU, Import-Scanning 147, Export 312.

## 2026-07-17 — closed all summary open-items + team feature/rollout note

- **Pendency Summary manual fields now editable & persisted** (✎ Edit manual on the tab): remarks per import dwell-row (auto LINE HOLD as placeholder, overridable — e.g. "YESTERDAY RELEASE"), Yard Inventory 20'/40' per segment with auto TEU total, Terminal HOLD MICT + EN-BLOCK LDD/MTY, and CHECK PACKAGE TEU. New SummaryNotes type + summaryNotes state slice + setSummaryNotes action, persisted. Closes the three open items (yard feed / CP / remark) honestly — computed parts auto-fill, unfed parts are manual-editable and saved, matching the team's Excel.
- **Team deliverable written**: NG-MARSHAL-FEATURES-AND-ROLLOUT.md (+ a Word version "NG Marshal — Features & Rollout Guide.docx" for circulation) — full feature list, one-time implementation steps, daily-use flow per role, and the outstanding inputs needed from the team.
- Verified: edit → Save → persists across reload (remark + CP confirmed).

## 2026-07-17 — terminology fix: UPLOAD (file) vs IMPORT/EXPORT (cargo), one uploader

- **Word collision resolved.** "Import" was doing two jobs: the EXIM cargo direction AND the act of putting a file in. Now strictly: **UPLOAD** = file action; **IMPORT / EXPORT** = cargo direction only. Glossary line shown in the UI: "Upload = putting a file in; import / export = the cargo direction inside it."
- **Four upload entry points collapsed to ONE** — the blue "⬆ Upload a data file" bar at the top of the Planning tab. Removed: the header "Import file" button, the second dropzone card ("Imports · real files"), and the dead "⇪ Import" button in the channels strip.
- Renames: tab "Planning & imports" → **"Planning & uploads"**; buttons "Import ▸" → **"Load into system ▸"**, "Import ALL container sheets" → **"Load ALL sheets together ▸"**; preview now says **"IMPORT pendency list" / "EXPORT cutoff list"** instead of the generic "container pool"; pool chip → "In system: N import · M export containers"; toasts → "Loaded 464 IMPORT containers from …". Home card "Imports & Planning" → "Planning & Uploads".
- The old duplicate card became a non-clickable **"How data arrives"** panel (auto-forward / upload / manual entry) so the 3-channel story stays visible without pretending to be more upload buttons.
- Verified: exactly 1 file input on the page; upload → preview ("Sheet1 → IMPORT pendency list · 464 containers · 100% valid") → Load into system → "Loaded 464 IMPORT containers" → "In system: 464 import · 0 export".

## 18 Jul 2026 — Uploads reconcile, never overwrite

Uploading a pendency file used to **replace** the whole pool for that direction. It now **reconciles**: new containers added, known containers updated in place (deduped by container number), containers absent from the newest file marked `cleared` and kept as history (capped at 2000 per direction). Every upload reports `+N new · N updated · N cleared`. One shared `reconcilePool()` in `src/lib/importer.ts` is used by both the console reducer and the `/api/ingest` auto-forward route, so email and manual upload behave identically. Pendency counts read `livePool()` — cleared rows never inflate the numbers.

## 18 Jul 2026 — Console cut from seven screens to five

Seven tabs was too many to tell apart. Now: **Pendency summary** (default & first), **Planning**, **Live board** (issues merged in, with a count badge), **Incentives**, **Setup** (masters + equipment merged). A one-line "what this screen is for" sits under the tab bar. Old deep links (`?tab=issues`, `?tab=masters`, `?tab=equipment`) redirect to their new home.

## 18 Jul 2026 — One upload button, top-right of the header

The uploader was a banner inside the Planning tab. It is now a single **⬆ Upload file** button in the top-right of the console header, reachable from every screen, and the file preview opens as a **modal** so you stay on whatever screen you were on. Terminology holds: **UPLOAD** = file action, **IMPORT/EXPORT** = cargo direction.

## 18 Jul 2026 — Console reorganised around verbs, after studying Navis N4

Researched how Navis N4 / SPARCS, Tideworks and CyberLogitec structure terminal operations, and reorganised to match. Six screens, each named for a verb:

| Screen | Verb | Job |
|---|---|---|
| Summary | READ | the EXIM pendency report, live |
| Yard | SEE | block-wise map of where containers are |
| Plan | DECIDE | demand per destination, lane targets, rules — no ITV named |
| ITV Planner | ASSIGN | one row per ITV, send it where |
| Live | MONITOR | trips in flight, fleet state, issues |
| Setup | CONFIGURE | masters, equipment, rates, rules |

**The fix this addresses:** Planning and Live board overlapped badly because *plan* (intent) and *dispatch* (which ITV goes where) were fused. Every TOS studied splits them — Navis into Yard Allocations vs Equipment Control, Tideworks into two separate products (Spinnaker vs Traffic Control). ITV Planner is now its own screen, as asked.

**Borrowed deliberately:**
- **Work queues** (Navis EC) — demand per destination with ITVs-on-it, starved queues flagged red. Click to filter the fleet.
- **Tentative vs confirmed** (Navis "definite plans") — auto-plan and quick-allocate produce *tentative* assignments; the planner confirms and the optimiser then leaves them alone. `Assignment.commit`.
- **Colour By** (Navis graphical yard) — one switchable colour dimension on the yard map (ageing / direction / flags / fill), with flags as separate glyphs. Three visual channels, none overloaded.
- **Derived "can it move" flags** (Navis Stop-Road / Stop-Vsl) — the planner reads *what's blocking this*, not a hold list.

## 18 Jul 2026 — Scanning and check package are prerequisites, NOT destinations

Settled the modelling question. Three independent axes, kept independent:
- **WHERE** — destination terminal (MICT, T2, CT2, CT3, CT4, FTWZ)
- **WHICH WAY** — import vs export, split *inside* each destination tile so both are visible at once
- **WHAT BLOCKS IT** — scanning, check package, ODC, ageing

Scanning and check package are **legs a box must clear before it can leave**, the way a TOS models inspection as a prerequisite service event — not places. So a scanning box counts in its terminal's import figure *and* shows in the "Needs clearing first" band, with no double-counting (verified: destination imports sum exactly to the import total). ITVs can still be *put on* scanning or check-package duty, so those appear as assignable **movement duties** in the ITV Planner, in a separate group from destinations.

## 18 Jul 2026 — Yard blocks derived from the feed, not a maintained layout

The yard map builds itself by parsing the **Location** column (`1T22C.3` → block 1T · bay 22 · row C · tier 3; also handles `A-01-1` and `B12`). No layout file to maintain, so the map cannot drift from the ground. Unreadable positions land in an "unplaced" count rather than failing.

Blocks are coloured by the **share** of containers ageing past 48h, not the single worst box — one 5-day container should not paint an otherwise-healthy block red.

**Default taken without confirmation** (question asked, not answered): the yard team decides stacking on the ground and the app records it; NG Marshal does not direct stack positions. Consistent with the locked rule that we assign ITVs and the gate assigns containers. Adding rule-based stack suggestion (Navis "Expert Decking": score candidate stacks by weighted penalties, lowest wins) is a clean later addition if wanted.

## 20 Jul 2026 — Storage model: keep the smallest record that answers every question

Rule set: keep nothing no question needs, but keep everything needed for TAT, pendency, ITV-wise and driver-wise reporting.
- **Pending containers** stay as full rows (the planner reads every field). The pool now holds *only* pending rows — it never grows with throughput.
- A container that leaves is **shrunk** from a full row (~15 fields) to a compact `ContainerHistory` (no, dir, teu, terminal, flags, in, out, dwell) — about a third the size — which still answers every TAT and volume question.
- **Feed snapshots**: one small row per uploaded file (pending, TEU, added/updated/cleared, TEU-per-terminal) = the pendency trend line.
- Retention caps on every unbounded list (history 40k, feeds 1.5k, trips 20k, issues 3k, equipment logs 8k), oldest-first. A live **Data & storage** panel in Setup shows row counts, byte sizes and what each answers. At normal volumes a year of operation fits inside browser storage.

## 20 Jul 2026 — A week of files, uploaded any order, stacks up correctly

- **Feed timestamp comes from the filename** (`Import_Containers_18072026_1200`, `pendency-2026-07-18-1530`), not upload time.
- **Bulk upload**: select many files at once → sorted by feed timestamp → replayed **oldest-first**, so live pendency ends on the newest sheet. Verified: 8 shuffled feeds → correct chronological replay, 12-in/12-out per window, 84 history rows, pending always matching the newest sheet.
- **Out-of-order guard**: a feed older than the newest seen only adds/updates back-dated rows, never clears.
- **Anti-resurrection guard** (bug found and fixed in testing): a stale sheet still lists containers that have since left. Those are now skipped — a departed container is never brought back by an older file. Verified: stale 14-Jul file after a full week → pending held at 60, zero resurrected.

## 20 Jul 2026 — ITV priority in the master; scanning-only proven

ITV master now carries two independent controls:
- **Only allowed (hard, `restrictTo`)** — a scanning-only ITV is *never* sent elsewhere, even when every other lane is short. Verified: 6 rounds of auto-plan → 0 violations.
- **First call (soft, `priorityFor`)** — taken for a duty (backlog / scanning / check package / import / export) before any other unit, but freed to the normal pool if that duty has no work, so it never stands idle. "Backlog" = send at the oldest cargo first (scored by the lane's aged-share). Verified: backlog unit went to the most-aged lane (CT3).

Auto-plan now emits a **vendor-wise plan** ("Active: 10 → CT4 · Import, 4 → Scanning …") — the answer to "give me my routines per vendor" — and every proposal remains editable after Apply from the ITV Planner.

## 20 Jul 2026 — Analytics surfaced (proves the storage model earns its keep)

Summary tab now carries an Analytics panel with four views, each built only from retained data: **TAT & throughput** (from history), **Pendency trend** (from feeds), **ITV-wise** and **Driver-wise** (from trips). If a view can't be built, that record isn't worth keeping — the test applied to the whole storage model. Verified rendering on 84 cleared containers (avg TAT 90.5h, per-terminal breakdown).


## 20 Jul 2026 — Dashboard is the landing tab again; Pendency is its own

Feedback: after making the EXIM pendency report the default screen, the command-centre dashboard felt lost. Fixed by splitting them: **Dashboard** (deployment, fleet board, trip distribution, hot list, open issues, shift analytics) is tab 1 and the landing screen; **Pendency** (the EXIM report in the team's Excel format) sits right beside it as tab 2. Same six-tab count — the old "Live" content is the dashboard, promoted to first; the pendency report keeps its own home. Both the manager's glance and the formal report are one click apart.

## 20 Jul 2026 — v0.3.0 cut: APK rebuilt, docs synced

Version bumped 0.1.0 → 0.3.0 to mark the release carrying reconciliation, the storage/history model, week-of-files replay, ITV priority, the Yard map, ITV Planner, analytics, and the Dashboard-first layout. Field APK rebuilt from the current static export (`dist/NG-Marshal-v0.3.0.apk`, internal versionName synced to 0.3.0) and verified — package `com.navingroup.ngmarshal`, launch activity present, all five routes (console, driver, m, operator, supervisor) serving 200. Trial guide and features doc updated to the Dashboard/Pendency tab names. The APK stays out of git (build artifact); the team regenerates it with `scripts/build-apk.sh`.

## 20 Jul 2026 — Manually mark ITVs live at shift start (with app reconciliation)

The driver app will take time to adopt, so the shift can't wait on it. Added a **Shift roster** at the top of the ITV Planner: mark which ITVs turned up, from the vendor's morning list, with no driver app needed.

- **Two independent sources**, shown on every ITV: **manual** (a supervisor/planner marked it) and **app** (the driver went on duty). When both agree the ITV is **✓ Confirmed** — the reconciliation the user asked for.
- **Manual marking** — per-ITV "＋ Mark live", or **bulk**: paste the vendor's list (from Excel or a photo), one call sign per line or comma-separated, with an optional driver name after each (`A333 Ramesh Yadav`). Call signs not in the master are reported, not silently added. Driver names are optional — an ITV can be marked live with no name.
- **`Vehicle.live = { manual?: {by, at, driverName?}, app?: {at} }`**, kept separate from `status` (what the ITV is doing) — `live` is whether it turned up at all. `liveStateOf()` derives confirmed / manual / app / none.
- **The driver app's on-duty signal sets the `app` source** (hooked into `goOnDuty`), so a manually-marked ITV flips to Confirmed the moment its driver logs in. Verified end-to-end: planner marks A333 → driver Ramesh onboards by phone and goes on duty → A333 shows ✓ Confirmed.
- **Planning is live-aware**: once the roster is started (anyone marked live), auto-plan and quick-allocate only deploy ITVs that turned up; un-live ITVs are flagged in the fleet. Before any mark exists, behaviour is unchanged (day-one / demo friendly).
- **Dashboard KPI** switches from "ITVs running" to **"ITVs live · N confirmed · of fleet"** once the roster starts. **"↺ New shift"** clears all marks to rebuild the roster.

The intended end state, now supported: the vendor supervisor's marking and the driver app both say live, they match, and the ITV is Confirmed — and the roster of who's available drives planning at the start of each shift.

## 20 Jul 2026 — Import: report-type picker, diagnostics, and fixing "won't import"

The team's real files weren't importing reliably because the app was guessing the report type from headers/filename, which breaks when a terminal renames a column. Reworked the upload flow:

- **Report-type dropdown** in the import modal — the user says which report each sheet is (Import pendency / Export cut-off / ITV master / Driver master). The chosen format **forces** kind and direction; no more guessing wrong. `REPORT_FORMATS` registry in `importer.ts` is the single place to edit when the real formats are confirmed — they carry the current known column shapes as hints.
- **Diagnostics panel** — every container sheet shows exactly what was detected: N read from M rows, direction, which column mapped to Container/Size/Terminal/etc. (unmapped ones in red), and rows dropped with the reason. A 0-container result says plainly "Nothing loaded — check for a container column, or pick a different report; if it still won't map, send us this file + screenshot." A stubborn file is never a silent failure now.
- **More robust extraction** — deeper header-row search (skips title/blank rows before the real header), and column matching stays fuzzy (includes-based). Verified: a file with a title row + renamed headers (CONTAINER NUMBER, DWELL HRS) read 40/40; a vessel-schedule file correctly reported 0 with a clear reason.

## 20 Jul 2026 — Import/export toggle on the Yard; WhatsApp button is now a share action

- **Yard tab** gained an **All / Import / Export** segmented toggle, so you can see just the import or just the export blocks (verified: 45 all → 30 import / 15 export). The Pendency board already shows both directions side by side, so it needs no toggle.
- **"Report → WhatsApp"** read like an import button (the ⇪ upload glyph). Replaced with a **WhatsApp icon + "Share to WhatsApp"** on a rounded WhatsApp-green pill — clearly a send-out action, visually distinct from the orange "⬆ Upload file".

## 21 Jul 2026 — Trained on the real Adani files; verified end-to-end with a week of data

Received the team's real files and confirmed the formats:
- **Import — DPD pendency (CSV, 3-hourly):** `Import_Containers_DPD_AMTE_YYYY-MM-DD_HHMMhrs.csv`. Columns: `Container_No, CtrSize, TEU, Cat_Cd, Pendency(Hrs), Scan_Flg, Terminal, Location, Deliverable_Pty` (+ ISO, vessel, seals, entry/exit times). One sheet, ~240 rows. Maps cleanly — read 239/239.
- **Export — cut-off (XLSX, daily):** `Mon 13-Jul-26.xlsx`, **5 sheets**. Sheet1 is the combined list (CONT, SIZE, TERMINAL, GATE CUT-OFF, LOCATION, CHA NAME, VESSEL…); Sheet2/3/5 are per-terminal (CT2/CT3/CT4) subsets; Sheet4 is a detailed stuffing list that also carries TERMINAL + GATE CUT-OFF further right. Column is `CONT`, not `Container_No`.

Fixes made from the real data:
- **`Cat_Cd`/category bug:** the loose `"cat"` matcher was matching lo**cat**ion; dropped it (import Cat_Cd still maps via `catcd`).
- **Feed timestamps:** added `dd-Mmm-yy` parsing so the export files (`Mon 13-Jul-26`) get a real date; import filenames already parsed.
- **`REPORT_FORMATS`** column hints updated to the real headers; blurbs name the actual files.
- **Multi-sheet export caution:** the export sheets overlap (Sheet1 ≈ per-terminal sheets combined), so loading them one-by-one would wrongly clear across sheets. Guidance: load **Sheet1** (the combined list) as the export pendency; the app defaults each container sheet sensibly and the picker lets you choose.

**Verified with the full week in the browser:** replayed all 41 import CSVs oldest-first → 239 pending (matches the newest sheet), 2,171 in history, split CT2 67 / CT3 105 / CT4 30 / T2 37; loaded export Sheet1 → 90 across MICT/T2/CT2/CT3/CT4. The EXIM pendency report, Yard map (38 real blocks / 329 containers), and Analytics (1,451 cleared / TAT) all populated correctly from the real files.

**Note on "filling the data":** app state lives in each browser's local storage (no shared backend yet), so data loaded in one browser isn't visible in another. To populate their own console the team drags the week's import CSVs onto **⬆ Upload file** (they replay oldest-first) and loads the export xlsx's Sheet1. A shared, always-populated console needs the Supabase backend (see DEPLOY.md).

## 22 Jul 2026 — Planning consolidated; masters upload; full workflow verified on real data

**ITV Planner is now the single planning sheet.** Quick Allocate + auto-plan (Suggest plan) moved onto it, alongside the shift roster, work queues and fleet table — so "plan the ITVs" is one screen, top to bottom: mark live → read demand → quick-allocate or auto-plan → send each ITV → confirm. The old duplicate assignment board was removed from the Plan tab (now "Demand" — just the pendency-by-destination view). Tab purposes reworded.

**Masters upload + templates.** Setup has ⬇ ITV master template and ⬇ Driver master template buttons (download a blank CSV with the right columns). A `scanning-only` tag in the ITV master now sets the HARD `restrictTo: ["scanning"]` so a scanning-designated ITV is never sent elsewhere by the planner.

**Full workflow verified end-to-end with the real files:** replayed 41 import CSVs → 239 pending / 2,171 history; uploaded a 15-ITV master + 15-driver master (drivers auto-mapped to ITVs); bulk-marked 14 live; Quick Allocate assigned 5 ITVs to a lane; **auto-plan produced a 7-change proposal with the vendor-wise breakdown** ("Active 11 ITVs · 1 → CT2 Import · 7 → CT3 Import…"). Data flows to Dashboard, Pendency report, Yard and Demand queues simultaneously.

**Debugging note:** the auto-plan `proposal` is intentionally in-memory (not in PERSIST_KEYS), so it's transient — visible in the ProposalPanel, gone on reload. Assignments and confirmations persist.

**Deliverable:** `NG-MARSHAL-USER-MANUAL.md` — 7 sections: what it is, the six screens, the daily workflow (import → masters → mark live → plan → monitor), the mobile app, storage, how it's built, and going to full live use.

## 22 Jul 2026 — Fixed the constant auto-update that was thrashing storage

Reported: figures changed every second and the "database" (browser storage) was crashing. Cause: a per-second demo **simulation tick** ran `backgroundSim` (randomly mutated the whole fleet, generated trips) and advanced the clock, and every mutation made the save loop **re-serialise the now-large state (2k+ containers + history) to storage repeatedly**. Harmless with the tiny demo pool; with real data it thrashed. Fixed so the front-end never auto-updates:

- **`backgroundSim` removed from the tick.** The fleet/pendency now change ONLY from real events — uploads, marks, assignments, driver actions.
- **Persist only on real change.** Added a non-persisted `pv` (persist-version) counter, bumped only by actions that alter saved data (not the clock/toast). The save loop is a cheap no-op unless `pv` changed — so an idle console does zero work and never re-serialises. Verified: 0 storage writes in 5s idle; exactly 1 write on an upload, then silent.
- **The console never ticks.** The clock/offer tick now runs ONLY while this device's driver is on duty (the mobile app) — so the console is a static snapshot. Verified: `now` and trips unchanged over 5s on the console; the driver app still gets offers when on duty.
- **Real live clock** in the header via an isolated component (only that text re-renders each second, not the whole tree).
- **↻ Refresh button** pulls the latest saved snapshot on demand — figures update when you press it (and it will pull other users' changes once on the shared backend).

Net: the console shows a still picture that updates on **upload, a planning action, or Refresh** — never on its own. Live auto-updating every few hours is a backend job (auto-forward email), exactly as intended.

## 22 Jul 2026 — Upload menu: choose Import / Export / master explicitly

The single "Upload file" button gave no way to say up-front whether a file was import or export — it only auto-detected. Turned it into a dropdown: **Import pendency**, **Export cut-off**, **ITV master**, **Driver master**, and **Any file (auto-detect)**. Picking Import or Export **forces** that direction on every sheet (the modal locks to it), so an ambiguously-shaped file can't be misread. Auto-detect and drag-drop still work as before. Verified: an import-shaped CSV uploaded via the Export option was read as direction EXPORT.

## 22 Jul 2026 — One Import button → a report-type chooser page

Replaced the upload dropdown with a single **⬆ Import** button that opens an **Import** page: a card for every report in REPORT_FORMATS, grouped by category (Pendency, Masters, …). Built to scale — there will be many more report types than import/export pendency, so new ones just get added to the registry and appear here automatically. Added a `category`, `icon`, and `status` ("ready"/"coming") to each format; "coming" reports (e.g. Yard inventory, Empty container report) are shown with a **SOON** badge so the full picture is visible before we wire them. Clicking a ready card opens the file picker and forces that report type through to the preview + diagnostics. An "auto-detect any file" option remains at the bottom. Verified: Import-pendency card → file → preview locked to Import, direction IMPORT.
