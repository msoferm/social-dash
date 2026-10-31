-- מחזיר את המצב שהיה לפני 0004_viewer_readonly.sql (הוגדר כך במסד החי ב-2026-10-31).

drop policy if exists "calendar insert" on public.calendar_items;
drop policy if exists "calendar update" on public.calendar_items;
drop policy if exists "calendar delete" on public.calendar_items;
create policy "calendar insert" on public.calendar_items for insert with check (auth.role() = 'authenticated');
create policy "calendar update" on public.calendar_items for update using (auth.role() = 'authenticated');
create policy "calendar delete" on public.calendar_items for delete using (auth.role() = 'authenticated' and (created_by = auth.uid() or public.is_admin()));

drop policy if exists "sp_insert" on public.scheduled_posts;
drop policy if exists "sp_update" on public.scheduled_posts;
drop policy if exists "sp_delete" on public.scheduled_posts;
create policy "sp_insert" on public.scheduled_posts for insert with check (auth.role() = 'authenticated');
create policy "sp_update" on public.scheduled_posts for update using (auth.role() = 'authenticated');
create policy "sp_delete" on public.scheduled_posts for delete using (created_by = auth.uid() or public.is_admin());

drop policy if exists "post-media upload" on storage.objects;
create policy "post-media upload" on storage.objects for insert with check (bucket_id = 'post-media');

drop trigger if exists profiles_prevent_role_change on public.profiles;
drop function if exists public.prevent_role_change();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          coalesce(new.raw_user_meta_data->>'role', 'member'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop function if exists public.can_write();
