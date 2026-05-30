#!/usr/bin/env bash
# Comic Reader launcher for macOS / Linux.
# Closes when you Ctrl+C this terminal.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies (one-time)..."
  npm install
fi

exec node server.js
