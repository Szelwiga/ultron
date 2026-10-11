#!/usr/bin/env bash
# Runs the Doki server daemon.
# Builds the JAR if it does not exist, then starts the HTTPS server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${SCRIPT_DIR}"

PORT="${1:-5000}"
JAR_FILE="run/build/doki.jar"

if [[ ! -f "${JAR_FILE}" ]]; then
  echo "Building Doki JAR..."
  make jar
fi

echo "Starting Doki server on HTTPS port ${PORT}..."
exec java -jar "${JAR_FILE}" "${PORT}"
