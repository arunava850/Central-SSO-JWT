#!/bin/bash

# Script to help verify Entra ID configuration
# This checks your local configuration against common issues

echo "=========================================="
echo "Entra ID Configuration Checker"
echo "=========================================="
echo ""

# Load .env file if it exists
if [ -f .env ]; then
    source .env
    echo "✅ Found .env file"
else
    echo "❌ .env file not found"
    exit 1
fi

echo ""
echo "1. Checking Environment Variables..."
echo ""

# Check TENANT_ID
if [ -z "$TENANT_ID" ]; then
    echo "   ❌ TENANT_ID: Not set"
else
    echo "   ✅ TENANT_ID: $TENANT_ID"
    # Validate format (should be UUID)
    if [[ $TENANT_ID =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        echo "      Format: Valid UUID"
    else
        echo "      ⚠️  Format: May not be valid UUID"
    fi
fi

# Check CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
    echo "   ❌ CLIENT_ID: Not set"
else
    echo "   ✅ CLIENT_ID: $CLIENT_ID"
    # Validate format (should be UUID)
    if [[ $CLIENT_ID =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        echo "      Format: Valid UUID"
    else
        echo "      ⚠️  Format: May not be valid UUID"
    fi
fi

# Check CLIENT_SECRET
if [ -z "$CLIENT_SECRET" ]; then
    echo "   ❌ CLIENT_SECRET: Not set"
else
    echo "   ✅ CLIENT_SECRET: Set (hidden)"
    if [ ${#CLIENT_SECRET} -lt 20 ]; then
        echo "      ⚠️  Length: May be too short"
    else
        echo "      Length: OK"
    fi
fi

# Check REDIRECT_URIS
if [ -z "$REDIRECT_URIS" ]; then
    echo "   ❌ REDIRECT_URIS: Not set"
else
    echo "   ✅ REDIRECT_URIS: Configured"
    echo "      URIs:"
    IFS=',' read -ra URIS <<< "$REDIRECT_URIS"
    for uri in "${URIS[@]}"; do
        echo "        - $uri"
    done
fi

echo ""
echo "2. Checking Application Configuration..."
echo ""

# Check if Central Auth is running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "   ✅ Central Auth Service: Running"
    
    # Test health endpoint
    HEALTH=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:3000/health 2>/dev/null)
    if [ "$HEALTH" = "200" ]; then
        echo "   ✅ Health endpoint: Accessible"
    fi
else
    echo "   ⚠️  Central Auth Service: Not running"
    echo "      Start it with: npm start"
fi

echo ""
echo "3. Entra ID App Registration Checklist"
echo ""
echo "   Please verify in Azure Portal:"
echo ""
echo "   [ ] App Registration exists with Client ID: $CLIENT_ID"
echo "   [ ] Supported account types configured correctly"
echo "   [ ] Redirect URIs match your REDIRECT_URIS"
echo "   [ ] API permissions granted (with admin consent)"
echo "   [ ] Client secret is valid and not expired"
echo "   [ ] Tenant ID matches: $TENANT_ID"
echo ""

echo "4. Common Issues to Check"
echo ""
echo "   Issue: AADSTS500208 - Domain not valid for account type"
echo "   Solutions:"
echo "   1. Check 'Supported account types' in App Registration → Authentication"
echo "   2. Ensure you're using the correct account type (org vs personal)"
echo "   3. Verify tenant ID matches your Azure AD tenant"
echo "   4. Check if domain is verified in Azure AD"
echo ""

echo "5. Quick Fix Recommendations"
echo ""
echo "   For local development, set account type to:"
echo "   'Accounts in any organizational directory and personal Microsoft accounts'"
echo ""
echo "   This allows testing with both:"
echo "   - Organizational accounts (@yourcompany.com)"
echo "   - Personal Microsoft accounts (@outlook.com, @hotmail.com)"
echo ""

echo "=========================================="
echo "Configuration Check Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review the checklist above"
echo "2. Update App Registration in Azure Portal if needed"
echo "3. See ENTRA-ID-CONFIGURATION.md for detailed instructions"
echo ""
