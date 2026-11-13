@echo off
rem Status page wizard: double-click to add, close or delete status page incidents.
cd /d "%~dp0"
node scripts\status-wizard.mjs
pause
