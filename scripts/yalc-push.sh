#!/bin/bash

# Check if nvm is loaded, if not then load it
if ! type nvm &>/dev/null; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  if ! type nvm &>/dev/null; then
    echo "Could not load nvm"
    exit 1
  fi
fi

# Use nvm
nvm use

# Push yalc
./node_modules/.bin/yalc push --changed

DOCKER_COMPOSE_PATH="/home/dennis/Code/pxl/pxl-vx/docker/docker-compose.yml"

# Re-install NPM dependencies
ROOT_DIR=".."

DIRS=(
  "tester"
  "suite"
)

# Parallel npm install
for dir in "${DIRS[@]}"; do
  npm install --prefix "$ROOT_DIR/$dir" &
done

# Wait for all npm installs to finish
wait

# Restart suite-controller-api (which depends on suite which depends on nengi)
docker-compose -f "$DOCKER_COMPOSE_PATH" restart pxl_vx_suite_controller_api

echo "Done"
