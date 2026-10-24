-- Etap 4. Plan gospodarstwa i zdarzenia Stripe.
-- Limity członków i osób przy zadaniach są te same co w src/lib/plans.ts.
-- Klucz Stripe tu nie występuje. Zapis planu i kredytów idzie przez apply_billing_event.

alter table households
  add column if not exists plan text not null default 'solo'
  check (plan in ('solo', 'family', 'company'));

alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger
  add constraint credit_ledger_reason_check
  check (reason in ('welcome', 'analysis', 'test-pack', 'refund', 'plan', 'pack'));

create table if not exists billing_events (
  id text primary key,
  household_id uuid not null references households (id) on delete cascade,
  plan text,
  credit_delta integer not null default 0,
  created_at timestamptz not null default now()
);

-- Właściciel może zmienić nazwę domu. Planu i klienta Stripe z sesji użytkownika nie ruszy.
-- apply_billing_event idzie rolą service i nie ma auth.uid(), więc plan przechodzi.
create or replace function households_lock_plan()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.plan := old.plan;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists households_lock_plan on households;
create trigger households_lock_plan
  before update on households
  for each row
  execute function households_lock_plan();

-- Druga osoba przy zadaniu przechodzi tylko w planie Firmowym (do 8).
create or replace function ops_tasks_assignee_cap()
returns trigger
language plpgsql
as $$
declare
  current_plan text;
  cap integer;
  others integer;
begin
  if new.person_id is null then
    return new;
  end if;
  select coalesce(plan, 'solo') into current_plan from households where id = new.household_id;
  cap := case current_plan when 'company' then 8 else 1 end;
  select count(distinct person_id) into others
  from ops_tasks
  where household_id = new.household_id
    and person_id is not null
    and person_id <> new.person_id
    and id is distinct from new.id;
  if others >= cap then
    raise exception 'plan';
  end if;
  return new;
end;
$$;

drop trigger if exists ops_tasks_assignee_cap on ops_tasks;
create trigger ops_tasks_assignee_cap
  before insert or update on ops_tasks
  for each row
  execute function ops_tasks_assignee_cap();

create or replace function invite_household_member(hid uuid, invite_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text := lower(trim(invite_email));
  new_id uuid;
  current_plan text;
  members integer;
  cap integer;
begin
  if auth.uid() is null or not is_household_owner(hid) then
    raise exception 'forbidden';
  end if;
  if mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'bad email';
  end if;
  select id into new_id
  from household_members
  where household_id = hid and lower(email) = mail;
  if new_id is not null then
    return new_id;
  end if;
  select coalesce(plan, 'solo') into current_plan from households where id = hid;
  select count(*) into members from household_members where household_id = hid;
  cap := case current_plan when 'family' then 6 when 'company' then 6 else 1 end;
  if members >= cap then
    raise exception 'plan';
  end if;
  insert into household_members (household_id, email, role, invite_status)
  values (hid, mail, 'member', 'pending')
  returning id into new_id;
  return new_id;
end;
$$;

-- Idempotentne. Drugie wywołanie z tym samym event_id nie dopisuje kredytów.
create or replace function apply_billing_event(
  hid uuid,
  next_plan text,
  credit_delta integer,
  event_id text,
  grant_reason text,
  stripe_customer text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  delta integer := greatest(coalesce(credit_delta, 0), 0);
begin
  if hid is null or event_id is null or length(trim(event_id)) = 0 then
    raise exception 'event';
  end if;
  if next_plan is not null and next_plan not in ('solo', 'family', 'company') then
    raise exception 'plan';
  end if;
  if delta > 0 and (grant_reason is null or grant_reason not in ('plan', 'pack')) then
    raise exception 'reason';
  end if;
  if not exists (select 1 from households where id = hid) then
    raise exception 'household';
  end if;
  insert into billing_events (id, household_id, plan, credit_delta)
  values (event_id, hid, next_plan, delta)
  on conflict (id) do nothing;
  if not found then
    select balance into current_balance from credit_accounts where household_id = hid;
    return coalesce(current_balance, 0);
  end if;
  if next_plan is not null then
    update households set plan = next_plan where id = hid;
  end if;
  if stripe_customer is not null and length(trim(stripe_customer)) > 0 then
    update households set stripe_customer_id = stripe_customer where id = hid;
  end if;
  if delta > 0 then
    insert into credit_accounts (household_id, balance)
    values (hid, 0)
    on conflict (household_id) do nothing;
    update credit_accounts
    set balance = balance + delta, updated_at = now()
    where household_id = hid
    returning balance into current_balance;
    insert into credit_ledger (household_id, delta, reason)
    values (hid, delta, grant_reason);
    return current_balance;
  end if;
  select balance into current_balance from credit_accounts where household_id = hid;
  return coalesce(current_balance, 0);
end;
$$;

revoke all on function apply_billing_event(uuid, text, integer, text, text, text) from public;
revoke all on function apply_billing_event(uuid, text, integer, text, text, text) from anon;
revoke all on function apply_billing_event(uuid, text, integer, text, text, text) from authenticated;
grant execute on function apply_billing_event(uuid, text, integer, text, text, text) to service_role;

alter table billing_events enable row level security;

grant select (plan) on households to authenticated;
