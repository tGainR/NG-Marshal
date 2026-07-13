# ITV Ops — Team Handoff

**From:** Rohan Shah (product) + Claude (build) · **Date:** 13 Jul 2026 · **State:** working pilot, not yet deployed

This is a functioning Next.js app, not a mockup — every flow described below was clicked through and
verified in a browser during the build. It runs today against an in-browser database (so it can be
demoed with zero setup) and is written so that flipping one environment variable moves it onto a real
shared Postgres database. **Your job is to provision that database (Supabase), deploy it (Vercel), push
it to GitHub, and take it from "verified pilot" to "production."**

Read this end to end before touching code — it'll save you re-deriving decisions that are already made.

## 1. What this actually is

A container-yard **fleet and equipment management system**, built around one idea: today, ITV trip
data, incentive calculations, and equipment usage all live in someone's head, a WhatsApp group, or a
vendor's private spreadsheet. This app makes all of it a shared, auditable, live record — without
needing API access to the port's TOS (Terminal Operating System), because we don't have that and
probably never will.

Three domains, one system:
1. **ITV trips** — GPS cycle + terminal ticket photo + yard record = a verified trip. Feeds a live
   per-TEU incentive meter for the driver.
2. **Container pendency** — the terminal's 3-hourly pendency emails (import) and cutoff files (export),
   ingested by upload or auto-forward, become a live "pendency vs. deployed ITVs" board.
3. **Yard equipment** — reach stackers, forklifts, empty container handlers: masters, operator linking,
   and daily hours/moves logging. Newer than the ITV features; intentionally simpler (no GPS trip state
   machine yet — see §7).

Pilot site: **Mundra EXIM Yard**. The data model is written to generalize to other sites (see
`../architecture.md` and `../backend-architecture.md` in the parent folder), but only Mundra has been
configured and tested.

## 2. What's real vs. what's simulated — read this before you demo it to anyone

| Real, tested, working | Simulated for the pilot |
|---|---|
| Every screen, every button, every data table | GPS movement (the driver app advances trip state on a timer, not real location) |
| Excel/CSV parsing against the **actual Adani pendency files** — 464 containers, 100% ISO 6346 check-digit valid | Ticket OCR (a valid-looking container number is generated instead of read from a photo) |
| ISO 6346 container-number validation | The background "other drivers" fleet activity on the live board |
| The incentive math (rate card → TEU → ₹, versioned) | — |
| Masters CRUD: vendors, ITVs, drivers, equipment, operators, and their mappings | — |
| The `/api/ingest` auto-forward endpoint — tested with real files via curl | — |
| Data persistence and the DataStore sync engine (see §4) | — |

Nobody should assume the driver app is field-ready. The **console is the near-term deliverable** — get
real masters and pendency flowing through it first (§8, Phase A). The driver app is a validated
prototype of the intended UX, not production code.

## 3. Repo map

```
itv-app/
├── src/app/
│   ├── page.tsx              home / workspace launcher (marketing-style landing page)
│   ├── console/page.tsx      THE main surface — 6 tabs, ~1000 lines, see §6
│   ├── driver/page.tsx       mobile-first driver app (not yet deployed to real drivers)
│   └── api/ingest/route.ts   auto-forward webhook — POST an email attachment here
├── src/lib/
│   ├── types.ts              all domain types — read this first, it's the spec
│   ├── store.tsx             state + reducer + trip state machine + incentive math + sync engine
│   ├── seed.ts                demo/seed data (Mundra site profile, sample fleet)
│   ├── importer.ts           Excel/CSV parsing: pendency (import/export), ITV & driver masters
│   ├── incentive.ts          TEU math, ISO 6346 validation, formatting helpers
│   └── data/                 backend adapters — see §4, this is the part that matters most
├── db/migrations/            plain-SQL schema, numbered, additive (run in order)
├── DEPLOY.md                  deployment checklist — follow this, don't improvise
└── README.md                  shorter version of this file, for quick reference
```

Parent folder (`../`, one level up from `itv-app/`) has the product docs: `PROJECT-BRIEF.md`,
`requirements.md`, `architecture.md`, `incentive-engine.md`, `ingestion-plan.md`,
`backend-architecture.md`, `decisions-log.md` (chronological — read if you want the "why" behind a
decision), `whatsapp-chat-findings.md` (the field research this was built from).

## 4. Architecture — the one decision that matters most

**The app never talks to Supabase directly outside of `src/lib/data/supabaseStore.ts`.** Everything else
calls a generic `DataStore` interface (`src/lib/data/DataStore.ts`). This was deliberate: the product
owner wants to start on Supabase's free tier and move to self-hosted Postgres on AWS later without a
rewrite. Concretely:

- `src/lib/data/localStore.ts` — browser storage. Default. Zero setup, single-device only.
- `src/lib/data/supabaseStore.ts` — shared Postgres via Supabase. Activate with
  `NEXT_PUBLIC_BACKEND=supabase` + URL + anon key.
- `src/lib/data/index.ts` — the switch. `getDataStore()` is the only place backend choice is decided.
- **When you move to AWS RDS:** write `src/lib/data/httpStore.ts` implementing the same `DataStore`
  interface against your own thin API, flip `NEXT_PUBLIC_BACKEND=http`. Nothing else in the app changes.

The sync model today is intentionally simple: **one JSONB snapshot per site**, optimistic-locked by a
`rev` counter (`site_state` table in `001_init.sql`). Every client polls and pushes on a ~1.5–4s
interval. This is not infinitely scalable (it's whole-site last-write-wins), but it's correct and simple
at pilot scale (a handful of concurrent console users). The migration files also create fully normalized
per-entity tables (`vehicles`, `drivers`, `trips`, `equipment`, etc.) — adopt those with per-row
CRUD + Supabase Realtime when the snapshot model is outgrown; the `DataStore` interface doesn't change,
only its Supabase implementation does. Full reasoning in `../backend-architecture.md`.

## 5. Deploy checklist (do this first)

Full detail in `DEPLOY.md`; summary:

1. **GitHub:** push this repo. It's already a git repo with clean commit history — just add a remote and push. Don't squash the history; the commits document the build.
2. **Supabase:** create a project. Run `db/migrations/001_init.sql`, then `002_equipment.sql`, in the SQL editor, in order.
3. **Vercel:** import the GitHub repo. Set env vars (table below). Deploy.
4. **Verify shared state:** open the console on two different devices/browsers, change something on one, confirm it appears on the other within ~4 seconds.
5. **Auto-forward (optional, do after 1–4 work):** see `DEPLOY.md` → "Auto-forward setup" — point an inbound-email service's webhook at `/api/ingest`.

### Environment variables

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_BACKEND` | yes | `local` (default, single-device) or `supabase` (shared) |
| `NEXT_PUBLIC_SUPABASE_URL` | if `supabase` | from the Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | if `supabase` | anon/publishable key, not the service key |
| `INGEST_TOKEN` | if using `/api/ingest` | any long random string; the webhook must send it back |
| `SUPABASE_SERVICE_ROLE_KEY` | if using `/api/ingest` | server-only key so the endpoint can write regardless of RLS |

`.env.local.example` in the repo root has the full template with comments.

## 6. Feature tour — console tabs

Open `/console`. Six tabs:

1. **Live board** — fleet status grid, trip-distribution histogram, hot list (derived live from the
   export pool's actual gate-cutoff dates — falls back to example data if no export file is loaded yet).
2. **Planning & imports** — drop a pendency Excel/CSV here. Auto-detects file type (import pendency vs.
   export cutoff vs. ITV master vs. driver master) from filename + column headers, shows a preview, one
   click commits it. Import and export pendency are tracked as **separate pools** (a new import file
   never overwrites the export pool and vice versa). Below that: the ITV assignment board — pick a real
   ITV from the pool and send it to a terminal + movement type.
3. **Incentive ledger** — per-driver TEU totals and ₹ earned this shift, sourced from the versioned rate
   card in Masters & Settings. Supervisor approval action lives here.
4. **Issues** — every standby, gate rejection, breakdown, and manual edit becomes a typed, owned,
   timestamped record here. This is also the audit log — every masters edit writes an entry.
5. **Masters & settings** — vendors (incl. "Own — direct employment" for directly-run ITVs), ITV master,
   driver master, **driver↔ITV daily mapping** (a dropdown per ITV — this is a one-time setup, editable
   any day, not something you re-enter for 125 drivers daily), and the incentive rate card (editing it
   creates a new versioned rate card — completed trips keep the rate they were earned under).
6. **Equipment** *(new this pass)* — the equipment master (reach stacker / 3T forklift / 5T forklift /
   empty container handler / forklift with side-shifter), operator master, operator↔equipment mapping
   (same pattern as driver↔ITV), and a manual daily hours+moves log, operator-wise. See §7 for what's
   deliberately *not* built here yet.

## 7. Equipment tracker — what it is and isn't (read before extending it)

The product owner asked for this to become an **equipment management app, not just ITVs**. What's
built: full masters (equipment + operators), the same map/edit/audit pattern as ITV↔driver, and a manual
daily hours/moves log per equipment per operator (this is the record of truth until real telematics
exist — reach stackers and forklifts don't have the "terminal ticket" verification anchor that ITV
trips do).

What's **not** built, and is the natural next phase:
- No trip/cycle state machine for equipment (ITVs have one; equipment doesn't — there's no per-move
  GPS geofence or ticket to verify against yet).
- No incentive engine for equipment operators (the rate card is ITV/TEU-specific; equipment would need
  its own rate model — hours-based? move-based? — once the business decides).
- No bulk Excel import for equipment/operator masters yet (the pattern from `importer.ts` for
  ITV/driver masters should extend cleanly — same shape, new `guessKind` branch).
- Equipment status (`running`/`standby`/`breakdown`/etc.) is set once at creation, not updated live —
  there's no automatic status transition like ITVs get from the trip state machine.

## 8. Priority order for continued work

**Phase A — get the console production-ready with real data (do this before touching the driver app):**
1. Supabase + Vercel deploy (§5).
2. Load the real ITV master, driver master, vendor list, and rate card through the Masters tab.
3. Run a real shift's pendency file through Planning & imports; confirm the parser handles it (it was
   tuned against Adani's format — a different terminal's file may need a `findCol` keyword tweak in
   `importer.ts`).
4. Add authentication — there is currently **none**. Anyone with the URL can edit everything. At minimum:
   Supabase Auth (phone OTP or email/password) behind a thin `AuthProvider`, gating the console. This is
   the single most important gap before this touches real operational data.
5. Bulk Excel import for the Equipment tab, mirroring the ITV/driver importer.

**Phase B — driver app rollout:**
6. Real GPS (replace the timer-based state advance in `store.tsx`'s trip state machine with actual
   geofence checks).
7. Real OCR for ticket capture (replace `randomContainer()` in `incentive.ts` with an actual OCR call —
   Google Vision / AWS Textract / a fine-tuned model against the sample photos already collected).
8. PWA manifest + install prompt so drivers can add it to their home screen.
9. Push notifications for job offers.

**Phase C — equipment maturity:**
10. Decide the equipment incentive model (if any) with the business, then build it — the rate-card
    pattern in `store.tsx`/`types.ts` (`RateCard`, `updateSettings` action) is the template to follow.
11. Equipment cycle/status automation once there's a data source (operator-carried device? fixed
    checkpoint scan?).

## 9. Design rules — don't break these without checking `decisions-log.md`

- **We assign ITVs (and now equipment) to a job; the terminal gate assigns the actual container.** The
  system must never require pre-knowing a container number to function.
- **Import and export pendency are separate pools, always.** Never merge or let one overwrite the other.
- **All incentive math flows from the versioned rate card.** Never hardcode a rate in a component —
  read it from `state.rateCard` and `state.milestoneTeu` (see how `console/page.tsx` and `driver/page.tsx`
  already do this).
- **Every manual edit is audited.** When you add a new masters edit action, follow the existing pattern
  (`mapDriver`, `mapOperator`, `updateSettings`) — write an `Issue` of type `manual_entry` alongside the
  state change.
- **The masters pattern (add / map / edit-any-day / audit) is meant to be copy-pasted** for new asset
  classes. If a 7th equipment type or a whole new domain shows up, follow the Equipment tab's shape
  rather than inventing a new one.

## 10. Known limitations (be upfront about these with anyone testing it)

- No authentication (see §8.4 — top priority).
- Single-site only; `SITE` is currently a hardcoded constant in `seed.ts`, not selectable at runtime.
- The snapshot sync model (§4) is whole-site last-write-wins; fine at pilot concurrency, not built for
  scale.
- No automated tests. `npm run build` (TypeScript strict mode) is the only current safety net —
  keep it green.
- No rate limiting or abuse protection on `/api/ingest` beyond the shared token.

## Questions

The product owner (Rohan) has the full context on the operational side (WhatsApp research, the real
Adani file formats, the incentive negotiation with vendors). Read `../decisions-log.md` first — most
"why did they do it this way" questions are answered there chronologically.
