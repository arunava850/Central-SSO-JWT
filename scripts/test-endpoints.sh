#!/bin/bash

# Test Authentication Service Endpoints
# Usage: bash scripts/test-endpoints.sh [BASE_URL]
# Example: bash scripts/test-endpoints.sh http://localhost:3000

# Test script for Central Auth Service endpoints
# Usage: bash scripts/test-endpoints.sh

BASE_URL="${1:-http://localhost:3000}"

echo "=========================================="
echo "Testing Central Auth Service Endpoints"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Test Health Endpoint
echo "1. Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "   ✅ Health endpoint: OK (HTTP $HEALTH_RESPONSE)"
    curl -s "$BASE_URL/health" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/health"
elif [ "$HEALTH_RESPONSE" = "301" ] || [ "$HEALTH_RESPONSE" = "302" ]; then
    echo "   ⚠️  Health endpoint: Redirecting to HTTPS (HTTP $HEALTH_RESPONSE)"
    echo "   Note: Application is running but requires HTTPS"
else
    echo "   ❌ Health endpoint: Failed (HTTP $HEALTH_RESPONSE)"
fi
echo ""

# Test JWKS Endpoint
echo "2. Testing /.well-known/jwks.json endpoint..."
JWKS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/.well-known/jwks.json")
if [ "$JWKS_RESPONSE" = "200" ]; then
    echo "   ✅ JWKS endpoint: OK (HTTP $JWKS_RESPONSE)"
    curl -s "$BASE_URL/.well-known/jwks.json" | python3 -m json.tool 2>/dev/null || curl -s "$BASE_URL/.well-known/jwks.json"
elif [ "$JWKS_RESPONSE" = "301" ] || [ "$JWKS_RESPONSE" = "302" ]; then
    echo "   ⚠️  JWKS endpoint: Redirecting to HTTPS (HTTP $JWKS_RESPONSE)"
    echo "   Note: Application is running but requires HTTPS"
else
    echo "   ❌ JWKS endpoint: Failed (HTTP $JWKS_RESPONSE)"
fi
echo ""

# Test Login Endpoint (should redirect)
echo "3. Testing /auth/login endpoint..."
LOGIN_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/login")
if [ "$LOGIN_RESPONSE" = "302" ] || [ "$LOGIN_RESPONSE" = "301" ]; then
    echo "   ✅ Login endpoint: Redirecting (HTTP $LOGIN_RESPONSE) - Expected behavior"
elif [ "$LOGIN_RESPONSE" = "400" ]; then
    echo "   ✅ Login endpoint: Responding (HTTP $LOGIN_RESPONSE) - Missing query params (expected)"
else
    echo "   ⚠️  Login endpoint: HTTP $LOGIN_RESPONSE"
fi
echo ""

# Check if server is listening
echo "4. Checking if server is listening on port 3000..."
if lsof -ti:3000 > /dev/null 2>&1; then
    PID=$(lsof -ti:3000)
    echo "   ✅ Server is running (PID: $PID)"
else
    echo "   ❌ Server is not running on port 3000"
fi
echo ""

echo "=========================================="
echo "Test Complete"
echo "=========================================="
