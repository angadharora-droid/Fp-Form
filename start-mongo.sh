#!/usr/bin/env bash
# Start a local MongoDB instance for the Amravti FP project.
# Data is stored in ./.mongodb-data and served on 127.0.0.1:27017.
set -e

MONGOD="/Users/apple/mongodb-macos-aarch64--8.3.4/bin/mongod"
DIR="$(cd "$(dirname "$0")" && pwd)"
DATA="$DIR/.mongodb-data"

mkdir -p "$DATA"
echo "Starting MongoDB on mongodb://127.0.0.1:27017 (Ctrl+C to stop)…"
exec "$MONGOD" --dbpath "$DATA" --bind_ip 127.0.0.1 --port 27017
