# ITV Ops — Fleet, Trips & Incentives

Container-yard ITV management: verified trips (GPS + terminal ticket + yard record), live per-TEU
incentives for drivers, and a command center for planning, imports, issues and reports.
Pilot site: Mundra EXIM Yard. Universal core — sites, zones and movement types are configuration.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Default backend is `local` (per-browser storage). For the shared team backend and hosting, see `DEPLOY.md`.

## Where things are

| Path | What |
|---|---|
| `src/app/page.tsx` | Home / workspace launcher |
| `src/app/console/` | Web console: live board, planning & imports, incentive ledger, issues, masters & settings |
| `src/app/driver/` | Driver app (mobile-first; rolls out after web entries are validated) |
| `src/app/api/ingest/` | Auto-forward endpoint — inbound-email webhook posts the pendency attachment here |
| `src/lib/store.tsx` | State, trip state machine, incentive math, backend sync engine |
| `src/lib/importer.ts` | Excel/CSV parsing: pendency (import/export), ITV & driver masters, ISO 6346 validation |
| `src/lib/data/` | Backend adapters: `local` / `supabase` / future `http` (AWS) — see `../backend-architecture.md` |
| `src/components/Brand.tsx` | Product name + logo (rename the product here, one file) |
| `db/migrations/001_init.sql` | Plain-PostgreSQL schema (Supabase now, AWS RDS later — same file) |

## Key design rules (full docs in the parent folder)

- We assign **ITVs** (to terminal × movement); the port gate assigns the **container** — the driver's
  ticket photo binds it to the trip.
- Import and export pendency refresh **separate pools**; masters re-import with merge semantics.
- All incentive math flows from the **versioned rate card** in Masters & settings — completed trips keep old rates.
- Every manual entry, plan change and mapping edit is **audited**.

Docs: `../PROJECT-BRIEF.md` · `../ingestion-plan.md` · `../backend-architecture.md` · `DEPLOY.md` · `../decisions-log.md`
