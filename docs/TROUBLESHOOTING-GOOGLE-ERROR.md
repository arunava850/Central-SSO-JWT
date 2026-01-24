# Troubleshooting: Google OAuth "username" Parameter Error

## Error Message

```
Error 400: invalid_request
Parameter not allowed for this message type: username
```

## Root Cause

This error occurs when Google OAuth is being triggered, but a `username` parameter is being sent that Google doesn't accept. This can happen if:

1. **Google OAuth is being triggered when Microsoft login is requested**
2. **Browser is redirecting to Google instead of Microsoft**
3. **Old session data is causing provider confusion**
4. **Google OAuth credentials are set but invalid**

## Quick Fixes

### Fix 1: Ensure No Google Credentials (If Not Using Google)

If you're **only using Microsoft Entra ID**, make sure Google OAuth is NOT configured:

1. Check your `.env` file:
   ```bash
   # Make sure these are NOT set (or commented out):
   # GOOGLE_CLIENT_ID=...
   # GOOGLE_CLIENT_SECRET=...
   ```

2. If they're set, remove or comment them out:
   ```env
   # Google OAuth Configuration (commented out - not using Google)
   # GOOGLE_CLIENT_ID=...
   # GOOGLE_CLIENT_SECRET=...
   ```

3. Restart the service:
   ```bash
   npm run build
   npm start
   ```

### Fix 2: Clear Browser State

1. **Clear cookies** for `localhost:3000`
2. **Clear browser cache**
3. **Try incognito/private mode**
4. **Clear localStorage** in browser console:
   ```javascript
   localStorage.clear();
   ```

### Fix 3: Verify You're Using Microsoft Login

When testing, make sure you're using the **Microsoft login button**, not Google:

- ✅ **Correct**: Click "Login with Microsoft"
- ❌ **Wrong**: Click "Login with Google" (if Google is not configured)

### Fix 4: Check Service Logs

After restarting, check the logs when you click login:

```bash
# You should see:
[INIT] Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set)
[LOGIN] Provider: Microsoft, State: xxxxxxxx...
[LOGIN] Redirecting to: https://login.microsoftonline.com/...
```

If you see "Provider: Google" when clicking Microsoft, there's a bug.

## Step-by-Step Debugging

### Step 1: Check Current Configuration

```bash
# Check if Google credentials are set
grep -i GOOGLE .env

# Should return nothing (or commented lines)
```

### Step 2: Verify Service is Running Latest Code

```bash
# Stop service
lsof -ti:3000 | xargs kill -9

# Rebuild
npm run build

# Start
npm start
```

### Step 3: Test Login URL Directly

```bash
# Test Microsoft login (should redirect to Microsoft, not Google)
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I

# Should see Location header pointing to login.microsoftonline.com
# NOT accounts.google.com
```

### Step 4: Check Browser Network Tab

1. Open browser DevTools → Network tab
2. Click "Login with Microsoft"
3. Check the first redirect:
   - ✅ Should go to: `login.microsoftonline.com`
   - ❌ Should NOT go to: `accounts.google.com`

## Common Scenarios

### Scenario 1: Google Button Clicked by Mistake

**Problem**: User clicks "Login with Google" but Google OAuth is not configured.

**Solution**: 
- The code now defaults to Microsoft if Google is not configured
- But if Google credentials are set (even invalid ones), it will try Google

### Scenario 2: Old Session Data

**Problem**: Browser has old session/cookie data causing provider confusion.

**Solution**:
1. Clear all cookies for localhost
2. Clear browser cache
3. Try in incognito mode

### Scenario 3: Google Credentials Set But Invalid

**Problem**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env` but are invalid or the redirect URI is wrong.

**Solution**:
1. Either remove Google credentials from `.env`
2. Or properly configure Google OAuth in Google Cloud Console

## Prevention

To prevent this error:

1. **If not using Google OAuth**: Don't set `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` in `.env`
2. **Always specify provider**: Use `provider=microsoft` explicitly in login URLs
3. **Check logs**: Monitor console logs to see which provider is being used
4. **Clear state**: Clear browser state between tests

## Verification

After applying fixes, verify:

1. ✅ Service logs show: `[INIT] Google OAuth not configured`
2. ✅ Login redirects to `login.microsoftonline.com` (not Google)
3. ✅ No Google OAuth errors in browser
4. ✅ Microsoft login completes successfully

## Still Having Issues?

If the error persists:

1. **Check the exact URL** you're being redirected to
2. **Check browser console** for JavaScript errors
3. **Check service logs** for provider information
4. **Verify .env file** doesn't have Google credentials set
5. **Try a different browser** to rule out browser-specific issues
