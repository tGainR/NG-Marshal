# Deployment — ready-to-go checklist

The app is deployment-ready and backend-agnostic (see ../backend-architecture.md). When the Supabase project is assigned:

1. **Database:** run `db/migrations/001_init.sql` on the assigned Supabase project (SQL editor or `psql`). Plain PostgreSQL — the same file works on AWS RDS later.
2. **Env:** copy `.env.local.example` → set on the host (Vercel env vars or `.env.local`):
   - `NEXT_PUBLIC_BACKEND=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL=` (from the assigned project)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (publishable/anon key)
3. **Deploy:** `npm run build` passes clean; deploy the repo to Vercel (or any Node host — nothing Vercel-specific is used).
4. **Verify shared state:** open the console on two devices → change a driver mapping on one → it appears on the other within ~4s (snapshot sync, optimistic-lock rev).
5. **Before wide rollout:** add auth (Supabase phone-OTP behind the AuthProvider interface) — pilot runs role-picker + unlisted URL only.

Local/offline mode (no backend): leave `NEXT_PUBLIC_BACKEND=local` (default) — everything works per-browser.

## Auto-forward setup (after hosting)

1. Set `INGEST_TOKEN` (long random string) and `SUPABASE_SERVICE_ROLE_KEY` on the host.
2. Sign up an inbound-email service (CloudMailin / Mailgun Routes / SendGrid Inbound Parse) → it gives an email address.
3. Mailbox rule: auto-forward mails from opsexim.shpl@adani.com to that address.
4. Point the service's webhook at `https://<app-domain>/api/ingest?token=<INGEST_TOKEN>`.
5. Done — every 3-hourly email updates the container pool automatically; the console shows "Import pool updated" with the filename. Export files via the same route.
