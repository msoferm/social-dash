@echo off
REM סנכרון יוטיוב → Supabase (רץ ע"י המשימה המתוזמנת)
cd /d "%~dp0"
node --env-file=.env sync_youtube_calendar.mjs
node --env-file=.env fetch_youtube_videos.mjs
node --env-file=.env fetch_youtube_daily.mjs
node --env-file=.env fetch_facebook.mjs
