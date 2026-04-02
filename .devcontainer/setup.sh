#!/bin/bash
set -e

# Fix ownership of node_modules if not owned by node
if [ -d /workspace/node_modules ] && [ "$(stat -c '%U' /workspace/node_modules)" != "node" ]; then
  sudo chown -R node:node /workspace/node_modules
fi

# Create directories that would otherwise be created as root-owned
mkdir -p /workspace/dist /workspace/tmp

# Fix .eslintcache: ensure it exists as a file owned by node
if [ -e /workspace/.eslintcache ] && [ "$(stat -c '%U' /workspace/.eslintcache)" != "node" ]; then
  sudo rm -rf /workspace/.eslintcache
fi
if [ ! -f /workspace/.eslintcache ]; then
  touch /workspace/.eslintcache
fi

mkdir -p "$PNPM_HOME"
pnpm install
pnpm link --global

# Execute CMD (passed as arguments from docker-compose command)
exec "$@"
