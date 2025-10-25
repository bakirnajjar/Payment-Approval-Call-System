#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     Azure Communication Services - Real Calls System             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if backend .env is configured
if [ ! -f "backend/.env" ]; then
    echo "❌ Error: backend/.env not found!"
    echo "   Please configure backend/.env with your Azure credentials"
    exit 1
fi

# Check for required environment variables
if ! grep -q "ACS_PHONE_NUMBER=+" backend/.env; then
    echo "⚠️  Warning: ACS_PHONE_NUMBER not configured in backend/.env"
    echo "   You need to set your ACS phone number for real calls"
    echo ""
fi

if ! grep -q "CALLBACK_BASE_URL=http" backend/.env; then
    echo "⚠️  Warning: CALLBACK_BASE_URL not configured in backend/.env"
    echo "   You need to set a public URL (use ngrok for development)"
    echo ""
    echo "   Setup ngrok:"
    echo "   1. Download: https://ngrok.com/download"
    echo "   2. Run: ngrok http 3000"
    echo "   3. Copy the HTTPS URL"
    echo "   4. Update CALLBACK_BASE_URL in backend/.env"
    echo ""
fi

echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo "   Installing workspace dependencies..."
    npm install --workspaces
fi

echo "✅ Dependencies ready"
echo ""

echo "🚀 Starting services..."
echo ""

# Start backend in background
echo "📞 Starting backend server (http://localhost:3000)..."
npm start --workspace backend &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "🌐 Starting frontend (http://localhost:5001)..."
npm run dev --workspace frontend &
FRONTEND_PID=$!

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                   🎉 Services Running!                           ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Backend:  http://localhost:3000                                 ║"
echo "║  Frontend: http://localhost:5001                                 ║"
echo "║                                                                  ║"
echo "║  📞 Ready to make REAL phone calls!                              ║"
echo "║                                                                  ║"
echo "║  ⚠️  Important:                                                  ║"
echo "║  - Configure ACS_PHONE_NUMBER in backend/.env                   ║"
echo "║  - Set CALLBACK_BASE_URL (use ngrok for local development)      ║"
echo "║                                                                  ║"
echo "║  Press Ctrl+C to stop all services                               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Handle Ctrl+C
trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Wait for processes
wait
