-- =====================================================================
-- Udhaar and Bajaj Finance:
--   v_customer_dues            every customer with what they still owe
--   receive_payment(jsonb)     money from a customer, applied to their oldest unpaid bills first
--   settle_finance(jsonb)      Bajaj Finance has paid the shop for a loan
-- =====================================================================

create view public.v_customer_dues with (security_invoker = true) as
select
  c.id, c.name, c.phone, c.area, c.customer_type,
  coalesce(sum(b.balance) filter (where b.status = 'saved' and b.doc_type = 'bill'), 0) as dues,
  count(b.id) filter (where b.status = 'saved' and b.doc_type = 'bill') as bill_count,
  min(b.bill_date) filter (where b.status = 'saved' and b.doc_type = 'bill' and b.balance > 0) as oldest_due,
  max(b.bill_date) filter (where b.status = 'saved' and b.doc_type = 'bill') as last_bill
from public.customers c
left join public.bills b on b.customer_id = c.id
where c.active
group by c.id;

-- p = { customer_id, amount, mode, reference }
create or replace function public.receive_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_customer public.customers;
  v_amount numeric := (p ->> 'amount')::numeric;
  v_mode text := p ->> 'mode';
  v_left numeric;
  v_part numeric;
  v_bill record;
  v_dues numeric;
  v_applied jsonb := '[]'::jsonb;
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  select * into v_customer from public.customers where id = nullif(p ->> 'customer_id', '')::uuid;
  if v_customer.id is null then
    perform public.bill_error('customer_not_found');
  end if;
  if v_amount is null or v_amount <= 0 or v_mode not in ('cash', 'upi', 'debit_card', 'credit_card', 'bank') then
    perform public.bill_error('bad_payment');
  end if;

  select coalesce(sum(balance), 0) into v_dues
  from public.bills where customer_id = v_customer.id and doc_type = 'bill' and status = 'saved';
  if v_amount > v_dues then
    perform public.bill_error('more_than_dues', jsonb_build_object('dues', v_dues));
  end if;

  -- Oldest unpaid bills first.
  v_left := v_amount;
  for v_bill in
    select id, number, balance from public.bills
    where customer_id = v_customer.id and doc_type = 'bill' and status = 'saved' and balance > 0
    order by bill_date, seq
    for update
  loop
    exit when v_left <= 0;
    v_part := least(v_left, v_bill.balance);
    insert into public.payments (direction, customer_id, bill_id, mode, amount, reference, paid_on)
    values ('in', v_customer.id, v_bill.id, v_mode, v_part, coalesce(p ->> 'reference', ''), public.today_ist());
    update public.bills set paid = paid + v_part, balance = balance - v_part where id = v_bill.id;
    v_applied := v_applied || jsonb_build_object('bill', v_bill.number, 'amount', v_part);
    v_left := v_left - v_part;
  end loop;

  return jsonb_build_object('applied', v_applied, 'dues_left', v_dues - v_amount);
end;
$$;

-- p = { finance_id, received_amount, received_on }
create or replace function public.settle_finance(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_deal public.finance_deals;
  v_amount numeric := (p ->> 'received_amount')::numeric;
  v_date date := coalesce(nullif(p ->> 'received_on', '')::date, public.today_ist());
begin
  if not public.is_active_person() then
    perform public.bill_error('not_logged_in');
  end if;
  select * into v_deal from public.finance_deals where id = nullif(p ->> 'finance_id', '')::uuid for update;
  if v_deal.id is null then
    perform public.bill_error('bill_not_found');
  end if;
  if v_deal.status <> 'pending' then
    perform public.bill_error('already_settled');
  end if;
  if v_amount is null or v_amount <= 0 then
    perform public.bill_error('bad_payment');
  end if;
  if v_date > public.today_ist() then
    perform public.bill_error('future_date');
  end if;
  update public.finance_deals
  set status = 'received', received_amount = v_amount, received_on = v_date
  where id = v_deal.id;
end;
$$;

-- Permissions (functions are closed by default; see *_api_grants.sql).
grant select on public.v_customer_dues to authenticated;
revoke execute on function public.receive_payment(jsonb) from public, anon;
revoke execute on function public.settle_finance(jsonb) from public, anon;
grant execute on function public.receive_payment(jsonb) to authenticated, service_role;
grant execute on function public.settle_finance(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
