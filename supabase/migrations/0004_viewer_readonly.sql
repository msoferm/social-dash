-- תפקיד viewer = צפייה בלבד. כתיבה מותרת רק ל-admin/member.
-- גם: משתמש לא-אדמין לא יכול לשנות לעצמו תפקיד, והרשמה לא יכולה לקבוע תפקיד.
-- Rollback: 0004_viewer_readonly.rollback.sql

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','member'));
$$;

-- ---------- calendar_items ----------
drop policy if exists "calendar insert" on public.calendar_items;
drop policy if exists "calendar update" on public.calendar_items;
drop policy if exists "calendar delete" on public.calendar_items;
create policy "calendar insert" on public.calendar_items for insert with check (public.can_write());
create policy "calendar update" on public.calendar_items for update using (public.can_write()) with check (public.can_write());
create policy "calendar delete" on public.calendar_items for delete using (public.can_write() and (created_by = auth.uid() or public.is_admin()));

-- ---------- scheduled_posts ----------
drop policy if exists "sp_insert" on public.scheduled_posts;
drop policy if exists "sp_update" on public.scheduled_posts;
drop policy if exists "sp_delete" on public.scheduled_posts;
create policy "sp_insert" on public.scheduled_posts for insert with check (public.can_write());
create policy "sp_update" on public.scheduled_posts for update using (public.can_write()) with check (public.can_write());
create policy "sp_delete" on public.scheduled_posts for delete using (public.can_write() and (created_by = auth.uid() or public.is_admin()));

-- ---------- storage: העלאת מדיה לפוסטים ----------
drop policy if exists "post-media upload" on storage.objects;
create policy "post-media upload" on storage.objects for insert
  with check (bucket_id = 'post-media' and public.can_write());

-- ---------- profiles: חסימת שינוי תפקיד עצמי ----------
create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null => service role / SQL editor (מותר)
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change before update on public.profiles
  for each row execute function public.prevent_role_change();

-- ---------- הרשמה: התפקיד לא נקבע מ-metadata של המשתמש ----------
-- create_admin.mjs מעדכן את התפקיד אחר כך עם service role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'member')
  on conflict (id) do nothing;
  return new;
end; $$;
