@echo off
title Comic Reader
cd /d "%~dp0"

rem First run on a new machine: install dependencies.
if not exist "node_modules" (
  echo Installing dependencies, this only happens once...
  call npm install
)

rem Starts the server, which opens your browser automatically.
rem Closing this window stops the reader.
node server.js
