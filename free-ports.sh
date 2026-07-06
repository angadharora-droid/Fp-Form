#!/usr/bin/env bash
# Free the given port(s) before starting, so a leftover process never blocks a
# new run with EADDRINUSE. Runs automatically via npm's prestart / predev.
#
# Usage:
#   bash free-ports.sh            # frees both app ports (3001 and 5173)
#   bash free-ports.sh 3001       # frees only 3001
ports=("$@")
if [ ${#ports[@]} -eq 0 ]; then
  ports=(3001 5173)
fi
for port in "${ports[@]}"; do
  pids=$(lsof -ti :"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null
    echo "freed port $port"
  fi
done
exit 0
