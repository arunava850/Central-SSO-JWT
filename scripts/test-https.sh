#!/bin/bash

# Test script for Central Auth Service HTTPS endpoints
# Usage: bash scripts/test-https.sh

BASE_URL="${1:-https://localhost:3000}"

echo "=========================================="
echo "Testing Central Auth Service (HTTPS)"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Test Health Endpoint
echo "1. Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "   ✅ Health endpoint: OK (HTTP $HEALTH_RESPONSE)"
    echo "   Response:"
    curl -k -s "$BASE_URL/health" | python3 -m json.tool 2>/dev/null || curl -k -s "$BASE_URL/health"
    echo ""
else
    echo "   ❌ Health endpoint: Failed (HTTP $HEALTH_RESPONSE)"
fi
echo ""

# Test JWKS Endpoint
echo "2. Testing /.well-known/jwks.json endpoint..."
JWKS_RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" "$BASE_URL/.well-known/jwks.json")
if [ "$JWKS_RESPONSE" = "200" ]; then
    echo "   ✅ JWKS endpoint: OK (HTTP $JWKS_RESPONSE)"
    echo "   Response:"
    curl -k -s "$BASE_URL/.well-known/jwks.json" | python3 -m json.tool 2>/dev/null | head -10
    echo ""
else
    echo "   ❌ JWKS endpoint: Failed (HTTP $JWKS_RESPONSE)"
fi
echo ""

# Test Login Endpoint
echo "3. Testing /auth/login endpoint..."
LOGIN_RESPONSE=$(curl -k -s -o /dev/null -w "%{http_code}" -L "$BASE_URL/auth/login?client_id=test&redirect_uri=http://localhost:3001/callback")
if [ "$LOGIN_RESPONSE" = "302" ] || [ "$LOGIN_RESPONSE" = "301" ]; then
    echo "   ✅ Login endpoint: Redirecting (HTTP $LOGIN_RESPONSE) - Expected behavior"
elif [ "$LOGIN_RESPONSE" = "400" ]; then
    echo "   ✅ Login endpoint: Responding (HTTP $LOGIN_RESPONSE) - Validation working"
else
    echo "   ⚠️  Login endpoint: HTTP $LOGIN_RESPONSE"
fi
echo ""

# Test SSL Certificate
echo "4. Testing SSL Certificate..."
if echo | openssl s_client -connect localhost:3000 -servername localhost 2>/dev/null | grep -q "Verify return code: 0"; then
    echo "   ✅ SSL Certificate: Valid"
elif echo | openssl s_client -connect localhost:3000 -servername localhost 2>/dev/null | grep -q "self signed certificate"; then
    echo "   ⚠️  SSL Certificate: Self-signed (expected for development)"
    echo "   Certificate details:"
    echo | openssl s_client -connect localhost:3000 -servername localhost 2>/dev/null | grep -E "(subject=|issuer=)" | head -2
else
    echo "   ❌ SSL Certificate: Error"
fi
echo ""

# Check if server is listening
echo "5. Checking if server is listening on port 3000..."
if lsof -ti:3000 > /dev/null 2>&1; then
    PID=$(lsof -ti:3000)
    echo "   ✅ Server is running (PID: $PID)"
    
    # Check if it's HTTPS
    if netstat -an | grep -q "\.3000.*LISTEN"; then
        echo "   ✅ Server is listening on port 3000"
    fi
else
    echo "   ❌ Server is not running on port 3000"
fi
echo ""

echo "=========================================="
echo "HTTPS Test Complete"
echo "=========================================="
echo ""
echo "Note: Self-signed certificates will show security warnings in browsers."
echo "This is expected for local development. In production, use valid SSL certificates."
