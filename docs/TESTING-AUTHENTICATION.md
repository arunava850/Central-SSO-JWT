# How to Test Authentication

This guide shows you how to verify that the Central SSO JWT authentication service is working correctly.

## Quick Health Check

### 1. Check Service Status

```bash
# On your VM
pm2 status
pm2 logs central-auth --lines 20

# Or test the health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 2. Check JWKS Endpoint

```bash
# Test JWKS endpoint (public key for JWT verification)
curl http://localhost:3000/.well-known/jwks.json

# Should return JSON with keys array
```

## Testing the Full Authentication Flow

### Option 1: Using the Example Spoke App (Recommended)

**1. Start the example spoke app:**
```bash
cd ~/central-auth/examples
node spoke-app-server.js
```

**2. Open in browser:**
```
http://localhost:3001
```

**3. Click "Login with Microsoft"**

**4. Expected flow:**
- Redirects to Microsoft login
- After login, redirects to Central Auth callback
- Central Auth processes and redirects back to spoke app with JWT
- Spoke app displays user info

**5. Check browser console (F12):**
- Should see logs like `[SPOKE-APP] Token received from callback`
- Should see user information displayed

### Option 2: Manual Testing with cURL

**1. Initiate login:**
```bash
# Get the login URL (replace with your actual redirect_uri)
curl -v "http://localhost:3000/auth/login?client_id=test-app&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft"
```

This will return a redirect. Follow the redirect URL in your browser.

**2. After authentication, check the callback:**
The callback should redirect to your `redirect_uri` with a `token` parameter.

## Verification Checklist

### ✅ Service is Running

```bash
pm2 status
# Should show: central-auth | online
```

### ✅ Health Endpoint Works

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2026-01-24T..."}
```

### ✅ JWKS Endpoint is Accessible

```bash
curl http://localhost:3000/.well-known/jwks.json | jq
# Expected: JSON with "keys" array containing public key
```

### ✅ Login Endpoint Responds

```bash
curl -v "http://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/callback&provider=microsoft" 2>&1 | grep -i location
# Should show redirect to Microsoft login
```

### ✅ JWT Token is Valid

After successful authentication, decode the JWT:

```bash
# If you have the token, decode it (replace YOUR_TOKEN)
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq
```

Or use online tool: https://jwt.io

**Expected JWT claims:**
```json
{
  "sub": "user-object-id",
  "email": "user@example.com",
  "name": "User Name",
  "roles": ["Admin"],
  "groups": ["Finance"],
  "tenant": "tenant-id",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## Monitoring Logs

### Real-time Log Monitoring

```bash
# Watch logs in real-time
pm2 logs central-auth

# Or with line limit
pm2 logs central-auth --lines 50
```

### What to Look For in Logs

**Successful Login Flow:**
```
[LOGIN] Valid redirect_uri: http://localhost:3001/auth/callback
[LOGIN] Provider: Microsoft, State: xxxxxxxx...
[LOGIN] Redirecting to: https://raise4artext.ciamlogin.com/...
[CALLBACK] Provider: microsoft, State: xxxxxxxx...
[CALLBACK] Exchanging Microsoft authorization code for tokens...
[CALLBACK] Microsoft tokens acquired successfully
[CALLBACK] Fetching user info from Microsoft Graph...
[CALLBACK] Microsoft user info retrieved: { email: '...', name: '...' }
[CALLBACK] Generating JWT token...
[CALLBACK] JWT token generated successfully
[CALLBACK] Preparing redirect to spoke app: http://localhost:3001/auth/callback
[CALLBACK] Redirecting to spoke app: http://localhost:3001/auth/callback?token=...
```

**Error Indicators:**
- `[CALLBACK] Error in callback handler:` - Something failed
- `Session expired or invalid` - Session store issue
- `Failed to acquire access token` - Token exchange failed
- `Invalid redirect_uri` - Redirect URI not configured

## Testing with Postman or Browser

### Step-by-Step Browser Test

1. **Open browser and go to:**
   ```
   http://localhost:3000/auth/login?client_id=test-app&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft
   ```

2. **You should be redirected to Microsoft login**

3. **After login, you should be redirected to:**
   ```
   http://localhost:3001/auth/callback?token=eyJhbGc...&state=...
   ```

4. **Check the token:**
   - Copy the token from URL
   - Go to https://jwt.io
   - Paste token
   - Verify claims match your user

## Common Issues and Solutions

### Issue: "Invalid redirect_uri"

**Check:**
```bash
# Verify redirect URI is in .env
grep REDIRECT_URIS ~/central-auth/.env

# Should include your test URI
```

**Fix:** Add your redirect URI to `.env`:
```env
REDIRECT_URIS=http://localhost:3001/auth/callback,https://your-domain.com/auth/callback
```

### Issue: "Session expired or invalid"

**Check logs:**
```bash
pm2 logs central-auth | grep -i session
```

**Possible causes:**
- Service was restarted (sessions are in-memory)
- More than 10 minutes between login and callback
- State parameter mismatch

**Fix:** Try login again immediately after clicking

### Issue: "Failed to acquire access token"

**Check:**
- CLIENT_SECRET is correct and not expired
- TENANT_ID and CLIENT_ID are correct
- Redirect URI matches in Azure Portal

**Verify in Azure Portal:**
- App registration → Authentication
- Ensure redirect URI matches: `https://auth.ainsemble.com/auth/callback`

### Issue: Infinite Loop

**Symptoms:** Keeps redirecting to login

**Check logs for:**
- Callback errors
- Token acquisition failures
- User info fetch failures

**Fix:** Check the detailed error in logs and fix the root cause

## Automated Testing Script

Create a test script:

```bash
#!/bin/bash
# test-auth.sh

BASE_URL="http://localhost:3000"
SPOKE_CALLBACK="http://localhost:3001/auth/callback"

echo "Testing Central Auth Service..."
echo ""

# Test 1: Health check
echo "1. Health Check:"
curl -s "$BASE_URL/health" | jq
echo ""

# Test 2: JWKS endpoint
echo "2. JWKS Endpoint:"
curl -s "$BASE_URL/.well-known/jwks.json" | jq '.keys | length'
echo " keys found"
echo ""

# Test 3: Login endpoint (should redirect)
echo "3. Login Endpoint:"
LOGIN_URL="$BASE_URL/auth/login?client_id=test&redirect_uri=$SPOKE_CALLBACK&provider=microsoft"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$LOGIN_URL")
echo "HTTP Status: $HTTP_CODE (should be 302 redirect)"
echo ""

echo "Tests complete!"
```

Run it:
```bash
chmod +x test-auth.sh
./test-auth.sh
```

## Production Testing

For production (`https://auth.ainsemble.com`):

**1. Test health:**
```bash
curl https://auth.ainsemble.com/health
```

**2. Test JWKS:**
```bash
curl https://auth.ainsemble.com/.well-known/jwks.json
```

**3. Test login (in browser):**
```
https://auth.ainsemble.com/auth/login?client_id=your-app&redirect_uri=https://your-spoke-app.com/auth/callback&provider=microsoft
```

## Verification Summary

✅ **Service Running:** `pm2 status` shows online  
✅ **Health OK:** `/health` returns 200  
✅ **JWKS Accessible:** `/.well-known/jwks.json` returns keys  
✅ **Login Redirects:** `/auth/login` redirects to Microsoft  
✅ **Callback Works:** After auth, redirects to spoke app with token  
✅ **JWT Valid:** Token can be decoded and verified  
✅ **User Info Correct:** JWT contains expected claims  

If all checks pass, authentication is working! 🎉
