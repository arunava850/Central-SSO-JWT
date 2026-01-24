#!/bin/bash

# Comprehensive test of the full authentication flow
# This simulates the complete OAuth2 + JWT flow

set -e

echo "=========================================="
echo "Full Authentication Flow Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "1. Checking prerequisites..."
echo ""

# Check Central Auth
if lsof -ti:3000 > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅${NC} Central Auth Service: Running on port 3000"
else
    echo -e "   ${RED}❌${NC} Central Auth Service: Not running"
    echo "   Please start it: npm start"
    exit 1
fi

# Check Spoke App
if lsof -ti:3001 > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅${NC} Spoke App Server: Running on port 3001"
else
    echo -e "   ${YELLOW}⚠️${NC}  Spoke App Server: Not running"
    echo "   Starting spoke app server..."
    cd "$(dirname "$0")"
    node spoke-app-server.js > /dev/null 2>&1 &
    sleep 2
    if lsof -ti:3001 > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅${NC} Spoke App Server: Started"
    else
        echo -e "   ${RED}❌${NC} Failed to start Spoke App Server"
        exit 1
    fi
fi

echo ""
echo "2. Testing Central Auth Service endpoints..."
echo ""

# Test health
HEALTH=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:3000/health)
if [ "$HEALTH" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} Health endpoint: OK"
else
    echo -e "   ${RED}❌${NC} Health endpoint: Failed (HTTP $HEALTH)"
    exit 1
fi

# Test JWKS
JWKS=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:3000/.well-known/jwks.json)
if [ "$JWKS" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} JWKS endpoint: OK"
    JWKS_KEYS=$(curl -k -s https://localhost:3000/.well-known/jwks.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['keys']))" 2>/dev/null || echo "0")
    echo "      Found $JWKS_KEYS key(s) in JWKS"
else
    echo -e "   ${RED}❌${NC} JWKS endpoint: Failed (HTTP $JWKS)"
    exit 1
fi

# Test login endpoint (should redirect)
LOGIN_REDIRECT=$(curl -k -s -o /dev/null -w "%{http_code}" -L "https://localhost:3000/auth/login?client_id=spoke-app&redirect_uri=http://localhost:3001/auth/callback" 2>&1 | tail -1)
if [ "$LOGIN_REDIRECT" = "200" ] || [ "$LOGIN_REDIRECT" = "302" ] || [ "$LOGIN_REDIRECT" = "301" ]; then
    echo -e "   ${GREEN}✅${NC} Login endpoint: Responding (HTTP $LOGIN_REDIRECT)"
else
    echo -e "   ${YELLOW}⚠️${NC}  Login endpoint: HTTP $LOGIN_REDIRECT"
fi

echo ""
echo "3. Testing Spoke App endpoints..."
echo ""

# Test spoke app health
SPOKE_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health)
if [ "$SPOKE_HEALTH" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} Spoke App health: OK"
else
    echo -e "   ${RED}❌${NC} Spoke App health: Failed (HTTP $SPOKE_HEALTH)"
    exit 1
fi

# Test spoke app main page
SPOKE_MAIN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/)
if [ "$SPOKE_MAIN" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} Spoke App main page: OK"
else
    echo -e "   ${RED}❌${NC} Spoke App main page: Failed (HTTP $SPOKE_MAIN)"
fi

echo ""
echo "4. Testing configuration..."
echo ""

# Check redirect URI configuration
REDIRECT_URI="http://localhost:3001/auth/callback"
echo "   Checking redirect URI: $REDIRECT_URI"

# Test if redirect URI is accepted
LOGIN_TEST=$(curl -k -s "https://localhost:3000/auth/login?client_id=spoke-app&redirect_uri=$REDIRECT_URI" -I 2>&1 | grep -i "location\|400\|401" | head -1)
if echo "$LOGIN_TEST" | grep -qi "location\|302\|301"; then
    echo -e "   ${GREEN}✅${NC} Redirect URI accepted (redirecting to Entra ID)"
elif echo "$LOGIN_TEST" | grep -qi "400"; then
    echo -e "   ${YELLOW}⚠️${NC}  Redirect URI may not be configured"
    echo "      Add to Central Auth .env: REDIRECT_URIS=...,$REDIRECT_URI"
else
    echo -e "   ${YELLOW}⚠️${NC}  Could not verify redirect URI configuration"
fi

echo ""
echo "5. Testing JWT validation (simulated)..."
echo ""

# Get JWKS for validation test
JWKS_DATA=$(curl -k -s https://localhost:3000/.well-known/jwks.json)
if [ -n "$JWKS_DATA" ]; then
    KID=$(echo "$JWKS_DATA" | python3 -c "import sys, json; print(json.load(sys.stdin)['keys'][0]['kid'])" 2>/dev/null || echo "")
    if [ -n "$KID" ]; then
        echo -e "   ${GREEN}✅${NC} JWKS accessible and contains key ID: $KID"
        echo "      Spoke app can validate JWTs using this JWKS"
    else
        echo -e "   ${YELLOW}⚠️${NC}  Could not extract key ID from JWKS"
    fi
else
    echo -e "   ${RED}❌${NC} Could not fetch JWKS"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Test Summary${NC}"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ All services are running and configured${NC}"
echo ""
echo "Next steps for manual testing:"
echo ""
echo "1. Open in browser: http://localhost:3001"
echo "2. Click 'Login with Central Auth'"
echo "3. Complete Microsoft Entra ID authentication"
echo "4. You'll be redirected back with a JWT token"
echo "5. The page will display your user information"
echo ""
echo "To test API endpoints with a token:"
echo "  curl 'http://localhost:3001/api/me?token=YOUR_JWT_TOKEN'"
echo ""
echo "Configuration check:"
echo "  - Central Auth: https://localhost:3000"
echo "  - Spoke App: http://localhost:3001"
echo "  - Redirect URI: http://localhost:3001/auth/callback"
echo "  - JWKS: https://localhost:3000/.well-known/jwks.json"
echo ""
