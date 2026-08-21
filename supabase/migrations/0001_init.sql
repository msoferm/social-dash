-- ============================================================
--  Social Dash — סכימה ראשונית
--  Postgres / Supabase. הרצה: supabase db push  (או הדבקה ב-SQL Editor)
-- ============================================================

-- ---------- profiles: הרחבת auth.users עם תפקיד ושם ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'member' check (role in ('admin','member','viewer')),
  created_at  timestamptz not null default now()
);

-- יצירת פרופיל אוטומטית לכל משתמש חדש שנוצר ב-Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper: האם המשתמש הנוכחי אדמין
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- channels: הגדרת ערוצים ----------
create table if not exists public.channels (
  key        text primary key,                 -- googleAds / youtube / facebook ...
  name       text not null,
  color      text not null default '#888',
  kind       text not null default 'organic' check (kind in ('paid','organic')),
  enabled    boolean not null default true,
  is_demo    boolean not null default true,
  sort_order int not null default 0
);

-- ---------- metrics_daily: נתון יומי לכל ערוץ ----------
create table if not exists public.metrics_daily (
  channel_key text not null references public.channels(key) on delete cascade,
  date        date not null,
  -- אורגני
  reach       bigint,
  likes       bigint,
  comments    bigint,
  shares      bigint,
  followers   bigint,
  -- ממומן
  spend       numeric(12,2),
  impressions bigint,
  clicks      bigint,
  conversions bigint,
  primary key (channel_key, date)
);
create index if not exists metrics_daily_date_idx on public.metrics_daily(date);

-- ---------- posts: פוסטים/סרטונים מובילים ----------
create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  platform    text not null,
  external_id text,
  title       text,
  date        date,
  type        text default 'organic',
  reach       bigint default 0,
  likes       bigint default 0,
  comments    bigint default 0,
  shares      bigint default 0,
  unique (platform, external_id)
);
create index if not exists posts_platform_date_idx on public.posts(platform, date desc);

-- ---------- calendar_items: לוח התוכן ----------
-- כל שורה = אייטם שמתוכנן לעלות ביום/שעה מסוימים
create table if not exists public.calendar_items (
  id            bigint generated always as identity primary key,
  publish_date  date not null,
  publish_time  time,                            -- באיזו שעה עולה
  title         text not null,                   -- כותרת האייטם
  item_type     text,                            -- וידאו / פוסט / רילס / סטורי ...
  channel_key   text references public.channels(key) on delete set null,
  status        text not null default 'idea'
                check (status in ('idea','in_editing','edited','scheduled','published')),
  assignee      text,                            -- מי אחראי / מי בעריכה
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists calendar_items_date_idx on public.calendar_items(publish_date);

-- עדכון updated_at אוטומטי
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists calendar_items_touch on public.calendar_items;
create trigger calendar_items_touch
  before update on public.calendar_items
  for each row execute function public.touch_updated_at();

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.channels       enable row level security;
alter table public.metrics_daily  enable row level security;
alter table public.posts          enable row level security;
alter table public.calendar_items enable row level security;

-- profiles: כל אחד רואה את עצמו; אדמין רואה/עורך הכול
create policy "profiles self read"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update using (id = auth.uid() or public.is_admin());
create policy "profiles admin write" on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- channels / metrics / posts: קריאה לכל מחובר, כתיבה לאדמין (המשיכה משתמשת ב-service role שעוקף RLS)
create policy "channels read"  on public.channels      for select using (auth.role() = 'authenticated');
create policy "channels admin" on public.channels      for all    using (public.is_admin()) with check (public.is_admin());
create policy "metrics read"   on public.metrics_daily for select using (auth.role() = 'authenticated');
create policy "metrics admin"  on public.metrics_daily for all    using (public.is_admin()) with check (public.is_admin());
create policy "posts read"     on public.posts         for select using (auth.role() = 'authenticated');
create policy "posts admin"    on public.posts         for all    using (public.is_admin()) with check (public.is_admin());

-- calendar_items: כל מחובר יכול לקרוא ולערוך (עבודת צוות)
create policy "calendar read"   on public.calendar_items for select using (auth.role() = 'authenticated');
create policy "calendar insert" on public.calendar_items for insert with check (auth.role() = 'authenticated');
create policy "calendar update" on public.calendar_items for update using (auth.role() = 'authenticated');
create policy "calendar delete" on public.calendar_items for delete using (auth.role() = 'authenticated' and (created_by = auth.uid() or public.is_admin()));
