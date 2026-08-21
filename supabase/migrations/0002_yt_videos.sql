-- רשימת כל הסרטונים/שורטים מיוטיוב + פילוח אורגני/ממומן
create table if not exists public.yt_videos (
  video_id        text primary key,
  title           text,
  published_at    date,
  duration_seconds int,
  is_short        boolean not null default false,
  views           bigint default 0,
  likes           bigint default 0,
  comments        bigint default 0,
  organic_views   bigint,
  paid_views      bigint,
  updated_at      timestamptz not null default now()
);
alter table public.yt_videos enable row level security;
create policy "ytv read"  on public.yt_videos for select using (auth.role() = 'authenticated');
create policy "ytv admin" on public.yt_videos for all using (public.is_admin()) with check (public.is_admin());
