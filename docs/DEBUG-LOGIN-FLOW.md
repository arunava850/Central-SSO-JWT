# Debug: Login Flow Verification

## Current Status

✅ **Service Running**: Central Auth Service is running on port 3000  
✅ **Google Credentials**: NOT configured (Google OAuth disabled)  
✅ **Microsoft Login**: Should work correctly  

## How to Verify Login is Working

### Step 1: Check Service Logs

When you click login, you should see in the service console:

```
[INIT] Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set)
[LOGIN] Provider: Microsoft, State: xxxxxxxx...
[LOGIN] Redirecting to: https://login.microsoftonline.com/...
```

### Step 2: Test Login Endpoint

```bash
# Test Microsoft login
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I

# Should redirect to login.microsoftonline.com (NOT accounts.google.com)
```

### Step 3: Check Browser Redirect

1. Open `http://localhost:3001` in browser
2. Click **"Login with Microsoft"** (Google button should be hidden)
3. Check the URL in address bar:
   - ✅ Should go to: `login.microsoftonline.com`
   - ❌ Should NOT go to: `accounts.google.com`

### Step 4: Clear Browser State

If you're still getting Google errors:

1. **Clear cookies**:
   - Open DevTools (F12)
   - Application → Cookies → Clear all
   
2. **Clear localStorage**:
   - Console → Run: `localStorage.clear()`
   
3. **Try incognito mode**:
   - Open new incognito/private window
   - Navigate to `http://localhost:3001`

## Common Issues

### Issue 1: Clicking Wrong Button

**Problem**: Accidentally clicking "Login with Google" button

**Solution**: 
- The Google button is now **hidden by default**
- Only "Login with Microsoft" button is visible
- Make sure you click the Microsoft button

### Issue 2: Old Browser State

**Problem**: Browser has old cookies/session pointing to Google

**Solution**:
- Clear all cookies for localhost
- Clear browser cache
- Use incognito mode

### Issue 3: Service Not Restarted

**Problem**: Old code still running

**Solution**:
- Service has been restarted with latest code
- Check logs to verify: `[INIT] Google OAuth not configured`

## Expected Behavior

### When Clicking "Login with Microsoft":

1. ✅ Redirects to `login.microsoftonline.com`
2. ✅ Shows Microsoft login page
3. ✅ After login, redirects back to Central Auth
4. ✅ Central Auth generates JWT
5. ✅ Redirects to spoke app with JWT token
6. ✅ Spoke app displays user info

### When Clicking "Login with Google" (if configured):

1. ❌ Should show error: "Google OAuth is not configured"
2. ❌ Should NOT redirect to Google
3. ✅ Google button is hidden by default

## Verification Checklist

- [ ] Service is running (check: `curl https://localhost:3000/health`)
- [ ] Google credentials are NOT set in `.env`
- [ ] Service logs show: `[INIT] Google OAuth not configured`
- [ ] Only Microsoft button is visible in spoke app
- [ ] Clicking Microsoft button redirects to `login.microsoftonline.com`
- [ ] Browser cookies cleared
- [ ] No Google OAuth errors

## If Error Persists

1. **Check which URL you're being redirected to**:
   - Open browser DevTools → Network tab
   - Click login button
   - Check first redirect URL

2. **Check service logs**:
   - Look for `[LOGIN] Provider: ...` messages
   - Verify it says "Microsoft" not "Google"

3. **Test directly**:
   ```bash
   curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -v
   ```
   - Check the Location header in response

4. **Verify .env file**:
   ```bash
   grep -i GOOGLE .env
   ```
   - Should return nothing (or only commented lines)

The service has been updated to:
- ✅ Default to Microsoft if provider is invalid
- ✅ Hide Google button if Google OAuth not configured
- ✅ Use session data (not query params) for provider
- ✅ Add better logging

Try logging in again with a cleared browser state.
