-- הרחבת לוח התוכן: אירועים (ראיונות/ישיבות) + קישורי יוטיוב/פייסבוק
alter table public.calendar_items
  add column if not exists entry_type   text not null default 'item' check (entry_type in ('item','event')),
  add column if not exists youtube_url  text,
  add column if not exists facebook_url text,
  add column if not exists interviewer  text,
  add column if not exists interviewee  text;
