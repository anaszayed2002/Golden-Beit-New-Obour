-- v5: the zone (القادسية / الأمل) is optional; payment items carry the delivery date, completion due date
-- and the installment schedule. The site works out paid / remaining from these and the land status.
alter table public.nob_listings alter column zone drop not null;

create or replace function public.nob_validate_listing(p jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid_payload' using errcode = '22023'; end if;
  if coalesce(p->>'zone','') not in ('','القادسية','الأمل') then raise exception 'invalid_zone' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'land_status','')::int, 0) not between 1 and 6 then raise exception 'invalid_status' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'price','')::numeric, 0) <= 0 then raise exception 'invalid_price' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'area_final','')::numeric, nullif(p->>'area_orig','')::numeric, 0) <= 0 then raise exception 'invalid_area' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'paid','')::numeric, 0) < 0 or coalesce(nullif(p->>'over_amount','')::numeric, 0) < 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'paid','')::numeric, 0) > (p->>'price')::numeric then raise exception 'paid_over_price' using errcode = '22023'; end if;
  if coalesce(p->>'facade','') not in ('','بحري','قبلي','شرقي','غربي','ناصية') then raise exception 'invalid_facade' using errcode = '22023'; end if;
  if coalesce(p->>'view_type','') not in ('','شارع رئيسي','حديقة','خدمات','داخلي') then raise exception 'invalid_view' using errcode = '22023'; end if;
  foreach k in array array['district','neighborhood','block','plot_number'] loop
    if char_length(coalesce(p->>k,'')) > 40 then raise exception 'field_too_long' using errcode = '22023'; end if;
  end loop;
  if char_length(coalesce(p->>'description','')) > 2000 then raise exception 'field_too_long' using errcode = '22023'; end if;
  if coalesce(p->>'contact_phone','') !~ '^01(0|1|2|5)[0-9]{8}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p->>'owner_name',''))) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
end $$;

create or replace function public.nob_clean_pay(p jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'v',          case when p->>'v' = '5' then 5 end,
    'check',      nullif(greatest(coalesce(nullif(p->>'check','')::bigint, 0), 0), 0),
    'completion', nullif(greatest(coalesce(nullif(p->>'completion','')::bigint, 0), 0), 0),
    'completion_paid', case when p->>'completion_paid' = 'true' then true end,
    'completion_due',  nullif(substring(p->>'completion_due' from '^[0-9]{4}-[0-9]{2}$'), ''),
    'received',   nullif(substring(p->>'received' from '^[0-9]{4}-[0-9]{2}$'), ''),
    'waiver',     nullif(greatest(coalesce(nullif(p->>'waiver','')::bigint, 0), 0), 0),
    'inst', case when jsonb_typeof(p->'inst') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'value', nullif(greatest(coalesce(nullif(p->'inst'->>'value','')::bigint, 0), 0), 0),
        'count', nullif(greatest(coalesce(nullif(p->'inst'->>'count','')::int, 0), 0), 0),
        'left_count', nullif(greatest(coalesce(nullif(p->'inst'->>'left_count','')::int, 0), 0), 0),
        'left',  nullif(greatest(coalesce(nullif(p->'inst'->>'left','')::bigint, 0), 0), 0),
        'first', nullif(substring(p->'inst'->>'first' from '^[0-9]{4}-[0-9]{2}$'), ''),
        'last',  nullif(substring(p->'inst'->>'last' from '^[0-9]{4}-[0-9]{2}$'), ''))) end))
$$;

create or replace function public.nob_write_listing(p_id bigint, p jsonb, p_status text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint := p_id;
  v_price bigint := (p->>'price')::numeric;
  v_paid bigint := coalesce(nullif(p->>'paid','')::numeric, 0);
  v_orig numeric := nullif(p->>'area_orig','')::numeric;
  v_final numeric := nullif(p->>'area_final','')::numeric;
begin
  perform public.nob_validate_listing(p);
  v_orig := coalesce(v_orig, v_final); v_final := coalesce(v_final, v_orig);
  if v_id is null then
    insert into public.nob_listings (zone, area, price, paid, remaining, description, status, reviewed_at,
      district, neighborhood, area_orig, area_final, land_status, facade, view_type, over_amount, pay)
    values (nullif(p->>'zone',''), v_final, v_price, v_paid, greatest(v_price - v_paid, 0), btrim(coalesce(p->>'description','')),
      p_status, case when p_status = 'approved' then now() end,
      nullif(btrim(coalesce(p->>'district','')),''), nullif(btrim(coalesce(p->>'neighborhood','')),''), v_orig, v_final,
      (p->>'land_status')::smallint, nullif(p->>'facade',''), nullif(p->>'view_type',''),
      coalesce(nullif(p->>'over_amount','')::bigint, 0), public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)))
    returning id into v_id;
  else
    update public.nob_listings set zone = nullif(p->>'zone',''), area = v_final, price = v_price, paid = v_paid,
      remaining = greatest(v_price - v_paid, 0), description = btrim(coalesce(p->>'description','')),
      district = nullif(btrim(coalesce(p->>'district','')),''), neighborhood = nullif(btrim(coalesce(p->>'neighborhood','')),''),
      area_orig = v_orig, area_final = v_final, land_status = (p->>'land_status')::smallint,
      facade = nullif(p->>'facade',''), view_type = nullif(p->>'view_type',''),
      over_amount = coalesce(nullif(p->>'over_amount','')::bigint, 0), pay = public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb))
    where id = v_id;
    if not found then raise exception 'listing_not_found' using errcode = '22023'; end if;
  end if;
  insert into public.nob_listing_private (listing_id, plot_number, block, contact_phone, owner_name)
  values (v_id, nullif(btrim(coalesce(p->>'plot_number','')),''), nullif(btrim(coalesce(p->>'block','')),''),
          p->>'contact_phone', btrim(p->>'owner_name'))
  on conflict (listing_id) do update set plot_number = excluded.plot_number, block = excluded.block,
    contact_phone = excluded.contact_phone, owner_name = excluded.owner_name;
  return v_id;
end $$;

revoke execute on function public.nob_validate_listing(jsonb), public.nob_clean_pay(jsonb),
  public.nob_write_listing(bigint, jsonb, text) from public, anon, authenticated;
