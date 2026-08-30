@echo off
REM מריץ את worker הפוסטים המתוזמנים (כל כמה דקות)
cd /d "%~dp0"
node --env-file=.env post_worker.mjs
