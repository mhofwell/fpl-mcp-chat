#!/bin/bash

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "Redis is not installed. Please install Redis first."
    echo "MacOS: brew install redis"
    echo "Ubuntu: sudo apt install redis-server"
    exit 1
fi

# Check if Redis is already running
if pgrep redis-server > /dev/null; then
    echo "Redis is already running"
else
    echo "Starting Redis server..."
    redis-server &
    echo "Redis started"
fi

# Start Next.js development server
echo "Starting Next.js development server..."
npm run dev