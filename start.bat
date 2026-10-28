@echo off
rem Examer - open the web locally (Dashboard + teacher app + real model)
rem Double-click this file. Close this window to stop the server.  [claude/gelatin 2026-10-28]
cd /d "%~dp0public"
set PORT=8080
where python >nul 2>nul && (set PY=python) || (where py >nul 2>nul && (set PY=py) || goto nopython)
echo Examer: http://localhost:%PORT%   (teacher app: http://localhost:%PORT%/app/)
echo Close this window to stop.
start "" "http://localhost:%PORT%"
%PY% -m http.server %PORT%
pause
goto :eof
:nopython
echo Python not found. Install it: winget install -e --id Python.Python.3.12
pause
