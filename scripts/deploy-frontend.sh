#!/bin/bash
set -e

echo "[Deploy] Building frontend..."
cd frontend
docker build --no-cache -t vutler-frontend:latest .

echo "[Deploy] Stopping old container..."
docker stop vutler-frontend 2>/dev/null || true
docker rm vutler-frontend 2>/dev/null || true

echo "[Deploy] Starting new container..."
docker run -d --name vutler-frontend --restart unless-stopped \
  --network host \
  -e API_URL=http://localhost:3001 \
  -e WS_URL=http://localhost:3001 \
  vutler-frontend:latest

echo "[Deploy] Frontend running on :3000"
