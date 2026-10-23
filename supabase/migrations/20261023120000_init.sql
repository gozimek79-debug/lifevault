-- LifeVault etap 1.
-- Członek widzi tylko swoje gospodarstwo. Klucz szyfrujący NIE jest w tej bazie:
-- encryption_meta trzyma sól, IV i parametry KDF, nigdy hasło ani klucz AES.
-- Kolumny stripe / affiliate / voice są rezerwą na później i nie mają UI.

create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  affiliate_ref text,
  created_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  role text not null check (role in ('owner', 'member')),
  invite_status text not null default 'pending' check (invite_status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (household_id, email)
);

create table documents (
  id uuid primary key,
  household_id uuid not null references households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  doc_type text not null check (doc_type in ('invoice', 'receipt', 'warranty', 'manual', 'other')),
  title text,
  vendor text,
  manufacturer text,
  model text,
  serial_number text,
  price_amount numeric(12, 2),
  price_currency text,
  purchase_date date,
  warranty_end date,
  extracted_text text,
  notes text,
  keywords text,
  blob_path text,
  encryption_meta jsonb,
  manual_search_url text,
  manual_source text check (manual_source in ('api', 'link')),
  manual_blob_path text,
  manual_encryption_meta jsonb,
  manual_file_name text,
  file_name text,
  file_mime text,
  voice_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      concat_ws(
        ' ',
        coalesce(extracted_text, ''),
        coalesce(title, ''),
        coalesce(vendor, ''),
        coalesce(manufacturer, ''),
        coalesce(model, ''),
        coalesce(serial_number, ''),
        coalesce(notes, ''),
        coalesce(keywords, ''),
        coalesce(doc_type, '')
      )
    )
  ) stored
);

create index documents_household_idx on documents (household_id);
create index documents_search_idx on documents using gin (search_vector);

create table warranties (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references documents (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  ends_on date not null,
  created_at timestamptz not null default now()
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  document_id uuid references documents (id) on delete cascade,
  due_on date not null,
  remind_on date not null,
  days_before integer not null check (days_before in (30, 7, 1)),
  kind text not null default 'warranty',
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index reminders_household_idx on reminders (household_id, remind_on);

create table consents (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete set null,
  email text,
  consent_type text not null,
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now()
);

create table push_subscriptions (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  endpoint text,
  p256dh text,
  auth text,
  created_at timestamptz not null default now()
);

-- Funkcje omijają RLS (security definer), więc same sprawdzają auth.uid().
-- Dzięki temu polityki nie czytają household_members rekurencyjnie.

create or replace function is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from household_members
    where household_id = hid
      and user_id = auth.uid()
      and invite_status = 'accepted'
  );
$$;

create or replace function is_household_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from household_members
    where household_id = hid
      and user_id = auth.uid()
      and role = 'owner'
      and invite_status = 'accepted'
  );
$$;

create or replace function create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  insert into households (name)
  values (coalesce(nullif(trim(household_name), ''), 'Dom'))
  returning id into hid;
  insert into household_members (household_id, user_id, email, role, invite_status)
  values (hid, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')), 'owner', 'accepted');
  return hid;
end;
$$;

create or replace function invite_household_member(hid uuid, invite_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text := lower(trim(invite_email));
  new_id uuid;
begin
  if auth.uid() is null or not is_household_owner(hid) then
    raise exception 'forbidden';
  end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'bad email';
  end if;
  insert into household_members (household_id, email, role, invite_status)
  values (hid, mail, 'member', 'pending')
  on conflict (household_id, email) do nothing
  returning id into new_id;
  if new_id is null then
    select id into new_id
    from household_members
    where household_id = hid and lower(email) = mail;
  end if;
  return new_id;
end;
$$;

create or replace function accept_household_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or mail = '' then
    return null;
  end if;
  select household_id into hid
  from household_members
  where lower(email) = mail and invite_status = 'pending'
  order by created_at desc
  limit 1;
  if hid is null then
    return null;
  end if;
  update household_members
  set user_id = auth.uid(), invite_status = 'accepted'
  where household_id = hid and lower(email) = mail and invite_status = 'pending';
  return hid;
end;
$$;

revoke all on function is_household_member(uuid) from public;
revoke all on function is_household_owner(uuid) from public;
revoke all on function create_household(text) from public;
revoke all on function invite_household_member(uuid, text) from public;
revoke all on function accept_household_invite() from public;
grant execute on function is_household_member(uuid) to authenticated;
grant execute on function is_household_owner(uuid) to authenticated;
grant execute on function create_household(text) to authenticated;
grant execute on function invite_household_member(uuid, text) to authenticated;
grant execute on function accept_household_invite() to authenticated;

alter table households enable row level security;
alter table household_members enable row level security;
alter table documents enable row level security;
alter table warranties enable row level security;
alter table reminders enable row level security;
alter table consents enable row level security;
alter table push_subscriptions enable row level security;

create policy households_select on households
  for select to authenticated
  using (is_household_member(id));

create policy households_update on households
  for update to authenticated
  using (is_household_owner(id))
  with check (is_household_owner(id));

create policy members_select on household_members
  for select to authenticated
  using (is_household_member(household_id));

create policy documents_select on documents
  for select to authenticated
  using (is_household_member(household_id));

create policy documents_insert on documents
  for insert to authenticated
  with check (is_household_member(household_id) and created_by = auth.uid());

create policy documents_update on documents
  for update to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy documents_delete on documents
  for delete to authenticated
  using (is_household_member(household_id));

create policy warranties_all on warranties
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy reminders_all on reminders
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

create policy consents_select on consents
  for select to authenticated
  using (user_id = auth.uid());

create policy consents_insert on consents
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_select on push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy push_write on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on households to authenticated;
grant select on household_members to authenticated;
grant select, insert, update, delete on documents, warranties, reminders to authenticated;
grant select, insert on consents to authenticated;
grant select, insert, update, delete on push_subscriptions to authenticated;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy documents_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy documents_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and is_household_member(((storage.foldername(name))[1])::uuid)
  );
