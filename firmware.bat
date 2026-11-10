@echo off
rem Firmware release wizard: double-click to release, send or revert calendar firmware.
cd /d "%~dp0"
node scripts\firmware-wizard.mjs
pause
