-- Amounts are rounded to one decimal place in the form, so the payment items accept decimals
-- (they used to be cast to bigint, which rejected values like 33633.8).
create or replace function public.nob_clean_pay(p jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'v',          case when p->>'v' = '5' then 5 end,
    'check',      nullif(greatest(round(coalesce(nullif(p->>'check','')::numeric, 0), 1), 0), 0),
    'completion', nullif(greatest(round(coalesce(nullif(p->>'completion','')::numeric, 0), 1), 0), 0),
    'completion_paid', case when p->>'completion_paid' = 'true' then true end,
    'completion_due',  nullif(substring(p->>'completion_due' from '^[0-9]{4}-[0-9]{2}$'), ''),
    'received',   nullif(substring(p->>'received' from '^[0-9]{4}-[0-9]{2}$'), ''),
    'waiver',     nullif(greatest(round(coalesce(nullif(p->>'waiver','')::numeric, 0), 1), 0), 0),
    'inst', case when jsonb_typeof(p->'inst') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'value', nullif(greatest(round(coalesce(nullif(p->'inst'->>'value','')::numeric, 0), 1), 0), 0),
        'count', nullif(greatest(coalesce(nullif(p->'inst'->>'count','')::int, 0), 0), 0),
        'left_count', nullif(greatest(coalesce(nullif(p->'inst'->>'left_count','')::int, 0), 0), 0),
        'left',  nullif(greatest(round(coalesce(nullif(p->'inst'->>'left','')::numeric, 0), 1), 0), 0),
        'first', nullif(substring(p->'inst'->>'first' from '^[0-9]{4}-[0-9]{2}$'), ''),
        'last',  nullif(substring(p->'inst'->>'last' from '^[0-9]{4}-[0-9]{2}$'), ''))) end))
$function$;

-- The over amount may also carry a decimal; the bigint column keeps it rounded.
create or replace function public.nob_write_listing(p_id bigint, p jsonb, p_status text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id bigint := p_id;
  v_price bigint := round((p->>'price')::numeric);
  v_paid bigint := round(coalesce(nullif(p->>'paid','')::numeric, 0));
  v_over bigint := round(coalesce(nullif(p->>'over_amount','')::numeric, 0));
  v_orig numeric := nullif(p->>'area_orig','')::numeric;
  v_final numeric := nullif(p->>'area_final','')::numeric;
  v_photo text := nullif(p->>'photo','');
begin
  perform public.nob_validate_listing(p);
  if v_photo is not null and v_photo !~ '^pending/[0-9a-f-]{36}\.jpg$' then raise exception 'invalid_photo' using errcode = '22023'; end if;
  v_orig := coalesce(v_orig, v_final); v_final := coalesce(v_final, v_orig);
  if v_id is null then
    insert into public.nob_listings (zone, area, price, paid, remaining, description, status, reviewed_at,
      district, neighborhood, area_orig, area_final, land_status, facade, view_type, over_amount, pay, photo)
    values (nullif(p->>'zone',''), v_final, v_price, v_paid, greatest(v_price - v_paid, 0), btrim(coalesce(p->>'description','')),
      p_status, case when p_status = 'approved' then now() end,
      nullif(btrim(coalesce(p->>'district','')),''), nullif(btrim(coalesce(p->>'neighborhood','')),''), v_orig, v_final,
      (p->>'land_status')::smallint, nullif(p->>'facade',''), nullif(p->>'view_type',''),
      v_over, public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)), v_photo)
    returning id into v_id;
  else
    update public.nob_listings set zone = nullif(p->>'zone',''), area = v_final, price = v_price, paid = v_paid,
      remaining = greatest(v_price - v_paid, 0), description = btrim(coalesce(p->>'description','')),
      district = nullif(btrim(coalesce(p->>'district','')),''), neighborhood = nullif(btrim(coalesce(p->>'neighborhood','')),''),
      area_orig = v_orig, area_final = v_final, land_status = (p->>'land_status')::smallint,
      facade = nullif(p->>'facade',''), view_type = nullif(p->>'view_type',''),
      over_amount = v_over, pay = public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)),
      photo = v_photo
    where id = v_id;
    if not found then raise exception 'listing_not_found' using errcode = '22023'; end if;
  end if;
  insert into public.nob_listing_private (listing_id, plot_number, block, contact_phone, owner_name)
  values (v_id, nullif(btrim(coalesce(p->>'plot_number','')),''), nullif(btrim(coalesce(p->>'block','')),''),
          p->>'contact_phone', btrim(p->>'owner_name'))
  on conflict (listing_id) do update set plot_number = excluded.plot_number, block = excluded.block,
    contact_phone = excluded.contact_phone, owner_name = excluded.owner_name;
  return v_id;
end $function$;
