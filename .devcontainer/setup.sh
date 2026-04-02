#!/bin/bash
set -e

# Fix ownership of node_modules if not owned by node
if [ -d /workspace/node_modules ] && [ "$(stat -c '%U' /workspace/node_modules)" != "node" ]; then
  sudo chown -R node:node /workspace/node_modules
fi

# Create directories that would otherwise be created as root-owned
mkdir -p /workspace/dist /workspace/tmp
touch /workspace/.eslintcache

mkdir -p "$PNPM_HOME"
pnpm install
pnpm link --global

# Execute CMD (passed as arguments from docker-compose command)
exec "$@"
