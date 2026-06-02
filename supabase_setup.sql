-- ================================================
-- SHIFT READY DATABASE SETUP
-- Paste this entire file into Supabase SQL Editor
-- and click Run. Do this once.
-- ================================================

-- BUSINESSES table
-- Each shop that signs up gets one row here
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null unique,
  owner_password_hash text not null,
  manager_password text not null default 'manager123',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  created_at timestamptz default now()
);

-- EMPLOYEES table
-- Each employee belongs to one business
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  pin text not null,
  hourly_rate numeric(10,2) default 0,
  active boolean default true,
  created_at timestamptz default now(),
  unique(business_id, pin)
);

-- TIME ENTRIES table
-- Every clock in/out punch
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  employee_name text not null,
  date text not null,
  clock_in bigint,
  clock_out bigint,
  break_start bigint,
  break_end bigint,
  total_break_minutes integer default 0,
  edited boolean default false,
  manager_note text default '',
  created_at timestamptz default now()
);

-- INDEXES for fast queries
create index if not exists idx_entries_business on time_entries(business_id);
create index if not exists idx_entries_date on time_entries(date);
create index if not exists idx_entries_employee on time_entries(employee_id);
create index if not exists idx_employees_business on employees(business_id);

-- ROW LEVEL SECURITY
-- Each business can only see its own data
alter table businesses   enable row level security;
alter table employees    enable row level security;
alter table time_entries enable row level security;

-- Allow the backend service role full access
-- (Netlify functions use the service role key)
create policy "Service role full access to businesses"
  on businesses for all using (true);

create policy "Service role full access to employees"
  on employees for all using (true);

create policy "Service role full access to time_entries"
  on time_entries for all using (true);
