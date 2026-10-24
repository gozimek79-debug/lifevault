-- LifeVault etap 3. Zadania firmy, osoby przy zadaniach i odbiór zamówienia.
-- Zapis w aplikacji jest najpierw lokalny. Tu jest kopia dla Supabase.
-- Stripe i afiliacja nadal nie są używane.
-- Członek widzi tylko swoje gospodarstwo, tak jak przy dokumentach.

create table ops_people (
  id uuid primary key,
  household_id uuid not null references households (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ops_people_household_idx on ops_people (household_id, name);

create table ops_tasks (
  id uuid primary key,
  household_id uuid not null references households (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  person_id uuid references ops_people (id) on delete set null,
  due_at text check (due_at is null or due_at ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$'),
  status text not null default 'new' check (status in ('new', 'doing', 'done')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ops_tasks_household_idx on ops_tasks (household_id, status);

create table ops_orders (
  id uuid primary key,
  household_id uuid not null references households (id) on delete cascade,
  checklist jsonb not null default '[]'::jsonb,
  extracted_lines jsonb not null default '[]'::jsonb,
  source text not null check (source in ('cloud', 'tesseract', 'manual')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ops_orders_household_idx on ops_orders (household_id, updated_at desc);

alter table ops_people enable row level security;
alter table ops_tasks enable row level security;
alter table ops_orders enable row level security;

create policy ops_people_select on ops_people
  for select to authenticated
  using (is_household_member(household_id));

create policy ops_people_insert on ops_people
  for insert to authenticated
  with check (is_household_member(household_id) and created_by = auth.uid());

create policy ops_people_update on ops_people
  for update to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy ops_people_delete on ops_people
  for delete to authenticated
  using (is_household_member(household_id));

create policy ops_tasks_select on ops_tasks
  for select to authenticated
  using (is_household_member(household_id));

create policy ops_tasks_insert on ops_tasks
  for insert to authenticated
  with check (is_household_member(household_id) and created_by = auth.uid());

create policy ops_tasks_update on ops_tasks
  for update to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy ops_tasks_delete on ops_tasks
  for delete to authenticated
  using (is_household_member(household_id));

create policy ops_orders_select on ops_orders
  for select to authenticated
  using (is_household_member(household_id));

create policy ops_orders_insert on ops_orders
  for insert to authenticated
  with check (is_household_member(household_id) and created_by = auth.uid());

create policy ops_orders_update on ops_orders
  for update to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy ops_orders_delete on ops_orders
  for delete to authenticated
  using (is_household_member(household_id));

grant select, insert, update, delete on ops_people, ops_tasks, ops_orders to authenticated;
