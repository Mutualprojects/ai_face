#!/bin/bash

echo "Starting Facial Recognition System..."

# Start go2rtc
echo "Starting go2rtc..."
cd "/home/btl/facial_recognistion/Backend"
./go2rtc -config go2rtc.yaml &
GO2RTC_PID=$!

# Start Flask Backend
echo "Starting Flask Backend..."
cd "/home/btl/facial_recognistion/Backend"
source venv/bin/activate
python app.py &
BACKEND_PID=$!

# Start Next.js Frontend
echo "Starting Next.js Frontend..."
cd "/home/btl/facial_recognistion/front_end"
npm run dev &
FRONTEND_PID=$!

echo "All services started!"
echo "go2rtc PID: $GO2RTC_PID"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

# Wait for all background processes
wait
