-- Kredyty czytnika dokumentów. Jedna analiza = 1, start = 3, pakiet testowy = 5.
-- Pakiet testowy nie jest płatnością. Stripe nie jest podłączony.
-- Zapis idzie wyłącznie przez funkcje. Członek gospodarstwa może saldo odczytać.

create table credit_accounts (
  household_id uuid primary key references households (id) on delete cascade,
  balance integer not null check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('welcome', 'analysis', 'test-pack', 'refund')),
  created_at timestamptz not null default now()
);

create index credit_ledger_household_idx on credit_ledger (household_id, created_at desc);

-- Trzy kredyty tylko przy pierwszym wierszu. Kolejne wywołanie zwraca saldo jak jest.
create or replace function ensure_credit_account(hid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  inserted uuid;
begin
  if auth.uid() is null or not is_household_member(hid) then
    raise exception 'forbidden';
  end if;
  insert into credit_accounts (household_id, balance)
  values (hid, 3)
  on conflict (household_id) do nothing
  returning household_id into inserted;
  if inserted is not null then
    insert into credit_ledger (household_id, delta, reason)
    values (hid, 3, 'welcome');
  end if;
  select balance into current_balance from credit_accounts where household_id = hid;
  return current_balance;
end;
$$;

create or replace function spend_analysis_credit(hid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if auth.uid() is null or not is_household_member(hid) then
    raise exception 'forbidden';
  end if;
  select balance into current_balance
  from credit_accounts
  where household_id = hid
  for update;
  if current_balance is null or current_balance < 1 then
    return jsonb_build_object('ok', false, 'balance', coalesce(current_balance, 0));
  end if;
  update credit_accounts
  set balance = balance - 1, updated_at = now()
  where household_id = hid
  returning balance into current_balance;
  insert into credit_ledger (household_id, delta, reason)
  values (hid, -1, 'analysis');
  return jsonb_build_object('ok', true, 'balance', current_balance);
end;
$$;

-- Dopisuje 5. To pakiet testowy w demo, nie pobranie pieniędzy.
create or replace function grant_test_pack(hid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if auth.uid() is null or not is_household_member(hid) then
    raise exception 'forbidden';
  end if;
  insert into credit_accounts (household_id, balance)
  values (hid, 0)
  on conflict (household_id) do nothing;
  update credit_accounts
  set balance = balance + 5, updated_at = now()
  where household_id = hid
  returning balance into current_balance;
  insert into credit_ledger (household_id, delta, reason)
  values (hid, 5, 'test-pack');
  return current_balance;
end;
$$;

-- Zwrot tylko gdy ostatni ruch to pobranie za analizę. Drugi zwrot nic nie dodaje.
create or replace function refund_analysis_credit(hid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
  last_reason text;
  last_delta integer;
begin
  if auth.uid() is null or not is_household_member(hid) then
    raise exception 'forbidden';
  end if;
  select reason, delta into last_reason, last_delta
  from credit_ledger
  where household_id = hid
  order by created_at desc
  limit 1;
  select balance into current_balance from credit_accounts where household_id = hid for update;
  if last_reason is distinct from 'analysis' or last_delta >= 0 or current_balance is null then
    return coalesce(current_balance, 0);
  end if;
  update credit_accounts
  set balance = balance + 1, updated_at = now()
  where household_id = hid
  returning balance into current_balance;
  insert into credit_ledger (household_id, delta, reason)
  values (hid, 1, 'refund');
  return current_balance;
end;
$$;

revoke all on function ensure_credit_account(uuid) from public;
revoke all on function spend_analysis_credit(uuid) from public;
revoke all on function grant_test_pack(uuid) from public;
revoke all on function refund_analysis_credit(uuid) from public;
grant execute on function ensure_credit_account(uuid) to authenticated;
grant execute on function spend_analysis_credit(uuid) to authenticated;
grant execute on function grant_test_pack(uuid) to authenticated;
grant execute on function refund_analysis_credit(uuid) to authenticated;

alter table credit_accounts enable row level security;
alter table credit_ledger enable row level security;

create policy credit_accounts_select on credit_accounts
  for select to authenticated
  using (is_household_member(household_id));

create policy credit_ledger_select on credit_ledger
  for select to authenticated
  using (is_household_member(household_id));
