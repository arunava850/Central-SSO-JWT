#!/bin/bash

# Test script for Spoke App integration
# This script tests the complete authentication flow

set -e

echo "=========================================="
echo "Testing Spoke App Integration"
echo "=========================================="
echo ""

# Check if Central Auth is running
echo "1. Checking Central Auth Service..."
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "   ✅ Central Auth is running on port 3000"
else
    echo "   ❌ Central Auth is not running!"
    echo "   Please start it first: npm start"
    exit 1
fi

# Test Central Auth endpoints
echo ""
echo "2. Testing Central Auth endpoints..."
HEALTH=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:3000/health)
if [ "$HEALTH" = "200" ]; then
    echo "   ✅ Health endpoint: OK"
else
    echo "   ❌ Health endpoint: Failed (HTTP $HEALTH)"
    exit 1
fi

JWKS=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:3000/.well-known/jwks.json)
if [ "$JWKS" = "200" ]; then
    echo "   ✅ JWKS endpoint: OK"
else
    echo "   ❌ JWKS endpoint: Failed (HTTP $JWKS)"
    exit 1
fi

# Check if Spoke App is running
echo ""
echo "3. Checking Spoke App Server..."
if lsof -ti:3001 > /dev/null 2>&1; then
    echo "   ✅ Spoke App is running on port 3001"
else
    echo "   ⚠️  Spoke App is not running"
    echo "   Starting Spoke App server..."
    cd "$(dirname "$0")"
    node spoke-app-server.js &
    SPOKE_PID=$!
    sleep 2
    echo "   ✅ Spoke App started (PID: $SPOKE_PID)"
fi

# Test Spoke App endpoints
echo ""
echo "4. Testing Spoke App endpoints..."
SPOKE_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
if [ "$SPOKE_HEALTH" = "200" ]; then
    echo "   ✅ Spoke App health: OK"
    curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
else
    echo "   ❌ Spoke App health: Failed (HTTP $SPOKE_HEALTH)"
fi

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3001 in your browser"
echo "2. Click 'Login with Central Auth'"
echo "3. Complete the Microsoft Entra ID authentication"
echo "4. You should be redirected back with a JWT token"
echo ""
echo "To test API endpoints:"
echo "  curl 'http://localhost:3001/api/me?token=YOUR_TOKEN'"
echo ""
