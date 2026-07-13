-- ITV Trip & Incentive App — initial schema
-- PLAIN PostgreSQL only (no vendor-specific features) so this runs identically
-- on Supabase today and AWS RDS tomorrow. See backend-architecture.md.

-- ── v1 sync: one snapshot row per site (JSONB + optimistic-lock rev) ──
create table if not exists site_state (
  site_id    text primary key,
  rev        bigint not null default 0,
  state      jsonb  not null,
  updated_at timestamptz not null default now()
);

-- ── v2 normalized entities (created now, adopted when snapshot sync is outgrown) ──
create table if not exists sites (
  id                text primary key,
  name              text not null,
  config            jsonb not null default '{}'::jsonb, -- terminals, targets, rate card, zones
  created_at        timestamptz not null default now()
);

create table if not exists vehicles (
  id          text not null,
  site_id     text not null references sites(id),
  reg         text,
  vendor      text,
  tags        text[] not null default '{}',
  status      text not null default 'offline',
  status_note text,
  driver_id   text,
  zone        text,
  updated_at  timestamptz not null default now(),
  primary key (site_id, id)
);

create table if not exists drivers (
  id         text not null,
  site_id    text not null references sites(id),
  name       text not null,
  name_local text,
  phone      text,
  vendor     text,
  note       text,
  on_duty    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (site_id, id)
);

create table if not exists assignments (
  site_id    text not null references sites(id),
  vehicle_id text not null,
  target     text not null,          -- terminal or SCAN/CP
  purpose    text not null,          -- import/export/scanning/check_package
  pickup     text,                   -- EXIM-1/2 for exports
  created_by text,
  created_at timestamptz not null default now(),
  primary key (site_id, vehicle_id)
);

create table if not exists pool_containers (
  site_id      text not null references sites(id),
  container_no text not null,
  direction    text not null default 'import', -- import/export
  size         text,
  teu          int not null default 1,
  terminal     text,
  category     text,                 -- GEN/ODC
  scan         boolean,
  location     text,
  pendency_hrs numeric,
  party        text,
  cutoff       text,
  file_stamp   text,                 -- from source filename, for delta reports
  imported_at  timestamptz not null default now(),
  primary key (site_id, container_no)
);

create table if not exists trips (
  id           bigserial primary key,
  site_id      text not null references sites(id),
  vehicle_id   text not null,
  driver_id    text not null,
  terminal     text,
  pickup       text,
  movement     text not null,
  state        text not null,
  verification text not null default 'provisional',
  container_no text,
  iso          text,
  teu          int not null default 0,
  boost        int not null default 0,
  boost_reason text,
  gate_wait_s  int not null default 0,
  earnings     jsonb,
  timeline     jsonb not null default '[]'::jsonb,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists trips_site_driver on trips (site_id, driver_id);
create index if not exists trips_site_vehicle on trips (site_id, vehicle_id);

create table if not exists issues (
  id         bigserial primary key,
  site_id    text not null references sites(id),
  type       text not null,
  status     text not null default 'open',
  raised_by  text,
  owner      text,
  vehicle_id text,
  detail     text,
  sla_min    int,
  opened_at  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists issues_site_status on issues (site_id, status);

-- audit log for manual entries / plan changes (append-only)
create table if not exists audit_log (
  id         bigserial primary key,
  site_id    text not null,
  actor      text,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
