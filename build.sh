#!/bin/bash
set -e

# Install Chromium on Render (Ubuntu-based)
if [ "$NODE_ENV" = "production" ]; then
  echo "Installing Chromium for production..."
  apt-get update
  apt-get install -y chromium-browser
  echo "Chromium installation complete"
fi

echo "Build script completed"
