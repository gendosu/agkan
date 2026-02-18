#!/bin/bash
set -e

# Fix ownership of node_modules if not owned by node
if [ -d /workspace/node_modules ] && [ "$(stat -c '%U' /workspace/node_modules)" != "node" ]; then
  sudo chown -R node:node /workspace/node_modules
fi

npm install
sudo npm link

# Execute CMD (passed as arguments from docker-compose command)
exec "$@"
