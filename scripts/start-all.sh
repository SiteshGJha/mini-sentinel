#!/bin/bash
# Mini-Sentinel Local Services Runner

# Terminate all background processes on Ctrl+C
cleanup() {
  echo -e "\n\033[1;31mStopping all services...\033[0m"
  kill "$PYTHON_PID" "$API_PID" "$WEB_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Load environment variables if .env exists
if [ -f .env ]; then
  # export variables from .env, ignoring comments and empty lines
  export $(grep -v '^#' .env | xargs)
fi

echo -e "\033[1;32mStarting Mini-Sentinel Ecosystem...\033[0m"

# 1. Start Python service
PORT_TO_USE=${PII_SERVICE_PORT:-50051}
echo -e "\033[1;34m[1/3] Starting Python PII microservice on port $PORT_TO_USE...\033[0m"
pii-service/venv/bin/python3 pii-service/server.py &
PYTHON_PID=$!

# 2. Start NestJS API
echo -e "\033[1;34m[2/3] Starting NestJS API Gateway on port 3000...\033[0m"
npm run api:dev &
API_PID=$!

# 3. Start Next.js Web Dashboard
echo -e "\033[1;34m[3/3] Starting Next.js Web Dashboard on http://localhost:3001...\033[0m"
npm run web:dev &
WEB_PID=$!

echo -e "\033[1;32mAll services running! Press Ctrl+C to shut down.\033[0m"
wait
