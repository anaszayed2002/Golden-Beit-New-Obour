-- New Obour v3: customers no longer sign up. Offers and purchase requests carry the person's name and phone,
-- the listing form gains the full plot/payment details, and the admin gets full control.

-- ---------- listings: new fields ----------
alter table public.nob_listings
  alter column owner_id drop not null,
  alter column ownership drop not null,
  add column governorate text not null default 'العبور',
  add column district text check (char_length(district) <= 60),
  add column neighborhood text check (char_length(neighborhood) <= 60),
  add column area_orig numeric(10,2) check (area_orig > 0 and area_orig < 100000),
  add column area_final numeric(10,2) check (area_final > 0 and area_final < 100000),
  add column land_status smallint check (land_status between 1 and 6),
  add column facade text check (facade in ('بحري','قبلي','شرقي','غربي','ناصية')),
  add column view_type text check (view_type in ('شارع رئيسي','حديقة','خدمات','داخلي')),
  add column over_amount bigint not null default 0 check (over_amount >= 0),
  add column pay jsonb not null default '{}'::jsonb check (jsonb_typeof(pay) = 'object');

update public.nob_listings set area_orig = area, area_final = area where area_orig is null;

alter table public.nob_listing_private
  alter column account_phone drop not null,
  add column block text check (char_length(block) <= 40);

-- Purchase requests come from visitors without accounts now.
alter table public.nob_plot_requests alter column user_id drop not null;
create unique index nob_plot_requests_listing_phone_key on public.nob_plot_requests (listing_id, phone);

grant select (governorate, district, neighborhood, area_orig, area_final, land_status, facade, view_type, over_amount, pay)
  on public.nob_listings to anon, authenticated;

-- ---------- associations (التقسيم) ----------
create table public.nob_zones (
  name text primary key check (name in ('القادسية','الأمل')),
  location text not null default '' check (char_length(location) <= 1000),
  axes text not null default '' check (char_length(axes) <= 1000),
  services text not null default '' check (char_length(services) <= 1000),
  updated_at timestamptz not null default now()
);
insert into public.nob_zones (name) values ('القادسية'), ('الأمل');
alter table public.nob_zones enable row level security;
revoke all on public.nob_zones from anon, authenticated;
grant select on public.nob_zones to anon, authenticated;
create policy "nob zones are public" on public.nob_zones for select to anon, authenticated using (true);

-- ---------- retire the account-based pieces ----------
drop trigger if exists nob_listings_mark_customer on public.nob_listings;
drop trigger if exists nob_requests_mark_customer on public.nob_plot_requests;
drop function if exists public.nob_mark_customer();
drop function if exists public.nob_mark_requester();
drop function if exists public.nob_touch();
drop function if exists public.nob_my_listings();
drop function if exists public.nob_submit_listing(text,text,numeric,text,boolean,bigint,bigint,bigint,text,text);
drop function if exists public.nob_request_plot(bigint);
drop table if exists public.nob_customers;

-- ---------- shared validation ----------
create or replace function public.nob_validate_listing(p jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid_payload' using errcode = '22023'; end if;
  if coalesce(p->>'zone','') not in ('القادسية','الأمل') then raise exception 'invalid_zone' using errcode = '22023'; end if;
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

-- Keeps only the known payment items, as non-negative numbers (dates as YYYY-MM).
create or replace function public.nob_clean_pay(p jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'check',      nullif(greatest(coalesce(nullif(p->>'check','')::bigint, 0), 0), 0),
    'completion', nullif(greatest(coalesce(nullif(p->>'completion','')::bigint, 0), 0), 0),
    'waiver',     nullif(greatest(coalesce(nullif(p->>'waiver','')::bigint, 0), 0), 0),
    'inst', case when jsonb_typeof(p->'inst') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'value', nullif(greatest(coalesce(nullif(p->'inst'->>'value','')::bigint, 0), 0), 0),
        'count', nullif(greatest(coalesce(nullif(p->'inst'->>'count','')::int, 0), 0), 0),
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
    values (p->>'zone', v_final, v_price, v_paid, greatest(v_price - v_paid, 0), btrim(coalesce(p->>'description','')),
      p_status, case when p_status = 'approved' then now() end,
      nullif(btrim(coalesce(p->>'district','')),''), nullif(btrim(coalesce(p->>'neighborhood','')),''), v_orig, v_final,
      (p->>'land_status')::smallint, nullif(p->>'facade',''), nullif(p->>'view_type',''),
      coalesce(nullif(p->>'over_amount','')::bigint, 0), public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)))
    returning id into v_id;
  else
    update public.nob_listings set zone = p->>'zone', area = v_final, price = v_price, paid = v_paid,
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

-- ---------- public (no account) ----------
create or replace function public.nob_submit_offer(p jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.nob_listing_private pr join public.nob_listings l on l.id = pr.listing_id
      where pr.contact_phone = p->>'contact_phone' and l.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_offers' using errcode = '22023';
  end if;
  if (select count(*) from public.nob_listings where status = 'pending' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'busy' using errcode = '22023';
  end if;
  return public.nob_write_listing(null, p, 'pending');
end $$;

create or replace function public.nob_request_purchase(p_listing_id bigint, p_name text, p_phone text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_phone,'') !~ '^01(0|1|2|5)[0-9]{8}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if not exists (select 1 from public.nob_listings where id = p_listing_id and status = 'approved') then
    raise exception 'listing_not_found' using errcode = '22023';
  end if;
  if (select count(*) from public.nob_plot_requests where phone = p_phone and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_requests' using errcode = '22023';
  end if;
  insert into public.nob_plot_requests (listing_id, name, phone)
  values (p_listing_id, btrim(p_name), p_phone)
  on conflict (listing_id, phone) do update set name = excluded.name, created_at = now(), handled = false;
end $$;

-- ---------- admin ----------
drop function if exists public.nob_admin_listings();
create function public.nob_admin_listings()
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select to_jsonb(l) - 'owner_id' || jsonb_build_object(
      'plot_number', p.plot_number, 'block', p.block, 'owner_name', p.owner_name, 'contact_phone', p.contact_phone,
      'request_count', (select count(*) from public.nob_plot_requests r where r.listing_id = l.id))
    from public.nob_listings l left join public.nob_listing_private p on p.listing_id = l.id
    order by l.created_at desc;
end $$;

drop function if exists public.nob_admin_requests();
create function public.nob_admin_requests()
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select jsonb_build_object('id', r.id, 'listing_id', r.listing_id, 'name', r.name, 'phone', r.phone,
      'handled', r.handled, 'created_at', r.created_at, 'zone', l.zone, 'district', l.district,
      'area', coalesce(l.area_final, l.area), 'price', l.price, 'status', l.status,
      'plot_number', p.plot_number, 'block', p.block, 'owner_name', p.owner_name, 'contact_phone', p.contact_phone)
    from public.nob_plot_requests r
    join public.nob_listings l on l.id = r.listing_id
    left join public.nob_listing_private p on p.listing_id = l.id
    order by r.handled, r.created_at desc;
end $$;

drop function if exists public.nob_admin_customers();
create function public.nob_admin_customers()
returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    with people as (
      select p.contact_phone as phone, p.owner_name as name, l.created_at as at, 1 as offers, 0 as reqs
      from public.nob_listing_private p join public.nob_listings l on l.id = p.listing_id
      union all
      select r.phone, r.name, r.created_at, 0, 1 from public.nob_plot_requests r
    )
    select jsonb_build_object('phone', phone, 'name', (array_agg(name order by at desc))[1],
      'offers', sum(offers), 'requests', sum(reqs), 'first_seen', min(at), 'last_seen', max(at))
    from people where coalesce(phone,'') <> ''
    group by phone order by max(at) desc;
end $$;

create or replace function public.nob_admin_save_listing(p_id bigint, p jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return public.nob_write_listing(p_id, p, 'approved');
end $$;

create or replace function public.nob_admin_delete_listing(p_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  delete from public.nob_listings where id = p_id;
end $$;

create or replace function public.nob_admin_save_zone(p_name text, p_location text, p_axes text, p_services text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.nob_is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.nob_zones set location = btrim(coalesce(p_location,'')), axes = btrim(coalesce(p_axes,'')),
    services = btrim(coalesce(p_services,'')), updated_at = now() where name = p_name;
  if not found then raise exception 'zone_not_found' using errcode = '22023'; end if;
end $$;

-- ---------- permissions ----------
revoke execute on function public.nob_validate_listing(jsonb), public.nob_clean_pay(jsonb),
  public.nob_write_listing(bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function public.nob_submit_offer(jsonb), public.nob_request_purchase(bigint, text, text),
  public.nob_admin_listings(), public.nob_admin_requests(), public.nob_admin_customers(),
  public.nob_admin_save_listing(bigint, jsonb), public.nob_admin_delete_listing(bigint),
  public.nob_admin_save_zone(text, text, text, text) from public;
grant execute on function public.nob_submit_offer(jsonb), public.nob_request_purchase(bigint, text, text) to anon, authenticated;
revoke execute on function public.nob_admin_listings(), public.nob_admin_requests(), public.nob_admin_customers(),
  public.nob_admin_save_listing(bigint, jsonb), public.nob_admin_delete_listing(bigint),
  public.nob_admin_save_zone(text, text, text, text) from anon;
grant execute on function public.nob_admin_listings(), public.nob_admin_requests(), public.nob_admin_customers(),
  public.nob_admin_save_listing(bigint, jsonb), public.nob_admin_delete_listing(bigint),
  public.nob_admin_save_zone(text, text, text, text) to authenticated;
