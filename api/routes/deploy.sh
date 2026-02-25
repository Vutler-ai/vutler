#!/bin/bash
# deploy.sh - Deploy Vutler API routes to VPS container

set -e

echo "🚀 Vutler API Deployment"
echo "========================"

CONTAINER_NAME="vutler-api"
REMOTE_PATH="/home/ubuntu/vutler/app"
ROUTES_PATH="${REMOTE_PATH}/routes"

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Error: Container ${CONTAINER_NAME} not found"
    exit 1
fi

echo "📦 Creating routes directory in container..."
docker exec ${CONTAINER_NAME} mkdir -p ${ROUTES_PATH}

echo "📤 Copying route modules..."
docker cp email.js ${CONTAINER_NAME}:${ROUTES_PATH}/
docker cp tasks.js ${CONTAINER_NAME}:${ROUTES_PATH}/
docker cp calendar.js ${CONTAINER_NAME}:${ROUTES_PATH}/
docker cp drive.js ${CONTAINER_NAME}:${ROUTES_PATH}/

echo "📋 Installing npm dependencies..."
docker exec ${CONTAINER_NAME} npm install \
    pg \
    node-imap \
    nodemailer \
    mailparser \
    node-fetch@2 \
    multer \
    form-data \
    cors

echo "✅ Files deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Update ${REMOTE_PATH}/index.js with route imports (see index.example.js)"
echo "2. Restart container: docker restart ${CONTAINER_NAME}"
echo ""
echo "Or run the full integration:"
echo "  docker cp index.example.js ${CONTAINER_NAME}:${REMOTE_PATH}/index.js"
echo "  docker restart ${CONTAINER_NAME}"
echo ""
echo "Test endpoints:"
echo "  curl http://localhost:3001/health"
echo "  curl http://localhost:3001/api/v1/email/inbox"
echo "  curl http://localhost:3001/api/v1/tasks"
