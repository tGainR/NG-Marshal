-- Equipment tracker — reach stackers, forklifts, empty container handlers.
-- Same plain-PostgreSQL pattern as 001_init.sql. Run after 001.

create table if not exists operators (
  id         text not null,
  site_id    text not null references sites(id),
  name       text not null,
  phone      text,
  vendor     text,
  note       text,
  on_duty    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (site_id, id)
);

create table if not exists equipment (
  id          text not null,
  site_id     text not null references sites(id),
  type        text not null, -- reach_stacker / forklift_3t / forklift_5t / ech / forklift_side_shifter
  reg         text,
  vendor      text,
  tags        text[] not null default '{}',
  status      text not null default 'offline',
  status_note text,
  operator_id text,
  zone        text,
  updated_at  timestamptz not null default now(),
  primary key (site_id, id)
);

-- daily hours/moves, operator-wise — manual entry until hour-meter/telematics integration
create table if not exists equipment_logs (
  id           bigserial primary key,
  site_id      text not null references sites(id),
  equipment_id text not null,
  operator_id  text not null,
  log_date     date not null,
  hours        numeric not null default 0,
  moves        int not null default 0,
  note         text,
  entered_by   text,
  entered_at   timestamptz not null default now()
);
create index if not exists equipment_logs_site_date on equipment_logs (site_id, log_date);
create index if not exists equipment_logs_equipment on equipment_logs (site_id, equipment_id);
