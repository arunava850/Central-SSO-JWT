#!/bin/bash

# Test Authentication Flow
# This script helps verify the authentication service is working

BASE_URL="${1:-http://localhost:3000}"
SPOKE_CALLBACK="${2:-http://localhost:3001/auth/callback}"

echo "=========================================="
echo "Central Auth Service - Authentication Test"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo "Spoke Callback: $SPOKE_CALLBACK"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "1. Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health" 2>/dev/null)
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "$HEALTH_RESPONSE"
fi
echo ""

# Test 2: JWKS Endpoint
echo "2. Testing JWKS Endpoint..."
JWKS_RESPONSE=$(curl -s "$BASE_URL/.well-known/jwks.json" 2>/dev/null)
KEY_COUNT=$(echo "$JWKS_RESPONSE" | jq '.keys | length' 2>/dev/null)
if [ "$KEY_COUNT" -gt 0 ] 2>/dev/null; then
    echo -e "${GREEN}✓ JWKS endpoint accessible${NC}"
    echo "Found $KEY_COUNT key(s)"
    echo "$JWKS_RESPONSE" | jq '.keys[0].kid' 2>/dev/null
else
    echo -e "${RED}✗ JWKS endpoint failed${NC}"
    echo "$JWKS_RESPONSE"
fi
echo ""

# Test 3: Login Endpoint (should redirect)
echo "3. Testing Login Endpoint..."
LOGIN_URL="$BASE_URL/auth/login?client_id=test-app&redirect_uri=$(echo -n $SPOKE_CALLBACK | jq -sRr @uri)&provider=microsoft"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$LOGIN_URL" 2>/dev/null)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "301" ]; then
    echo -e "${GREEN}✓ Login endpoint accessible${NC}"
    echo "HTTP Status: $HTTP_CODE"
    echo "Login URL: $LOGIN_URL"
    echo ""
    echo -e "${YELLOW}Note: To complete authentication, open this URL in a browser:${NC}"
    echo "$LOGIN_URL"
else
    echo -e "${RED}✗ Login endpoint failed${NC}"
    echo "HTTP Status: $HTTP_CODE"
fi
echo ""

# Test 4: Check Configuration
echo "4. Configuration Check..."
echo "To verify configuration, check:"
echo "  - .env file has correct TENANT_ID, CLIENT_ID, CLIENT_SECRET"
echo "  - REDIRECT_URIS includes your spoke app callback"
echo "  - BASE_URL is set correctly (no path, just domain)"
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. If health check passed, service is running"
echo "2. If JWKS returned keys, JWT signing is configured"
echo "3. Open the login URL in a browser to test full flow"
echo "4. Check PM2 logs: pm2 logs central-auth"
echo ""
echo "For detailed testing guide, see: docs/TESTING-AUTHENTICATION.md"
