-- A photo of the plot (or its map with an arrow), required on public offers.
-- Files live in their own public bucket; visitors may only add new JPEGs named pending/<uuid>.jpg (no list, update or delete).
alter table public.nob_listings add column if not exists photo text
  check (photo ~ '^pending/[0-9a-f-]{36}\.jpg$');
grant select (photo) on public.nob_listings to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nob_photos', 'nob_photos', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

drop policy if exists "nob_photos upload" on storage.objects;
create policy "nob_photos upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'nob_photos' and name ~ '^pending/[0-9a-f-]{36}\.jpg$');

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
      coalesce(nullif(p->>'over_amount','')::bigint, 0), public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)), v_photo)
    returning id into v_id;
  else
    update public.nob_listings set zone = nullif(p->>'zone',''), area = v_final, price = v_price, paid = v_paid,
      remaining = greatest(v_price - v_paid, 0), description = btrim(coalesce(p->>'description','')),
      district = nullif(btrim(coalesce(p->>'district','')),''), neighborhood = nullif(btrim(coalesce(p->>'neighborhood','')),''),
      area_orig = v_orig, area_final = v_final, land_status = (p->>'land_status')::smallint,
      facade = nullif(p->>'facade',''), view_type = nullif(p->>'view_type',''),
      over_amount = coalesce(nullif(p->>'over_amount','')::bigint, 0), pay = public.nob_clean_pay(coalesce(p->'pay','{}'::jsonb)),
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
end $$;
revoke execute on function public.nob_write_listing(bigint, jsonb, text) from public, anon, authenticated;

create or replace function public.nob_submit_offer(p jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p->>'photo','') = '' then raise exception 'photo_required' using errcode = '22023'; end if;
  if (select count(*) from public.nob_listing_private pr join public.nob_listings l on l.id = pr.listing_id
      where pr.contact_phone = p->>'contact_phone' and l.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_offers' using errcode = '22023';
  end if;
  if (select count(*) from public.nob_listings where status = 'pending' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'busy' using errcode = '22023';
  end if;
  return public.nob_write_listing(null, p, 'pending');
end $$;
revoke execute on function public.nob_submit_offer(jsonb) from public;
grant execute on function public.nob_submit_offer(jsonb) to anon, authenticated;
