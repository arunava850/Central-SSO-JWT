# Quick Fix: Google OAuth "username" Parameter Error

## The Problem

You're getting this error when trying to login:
```
Error 400: invalid_request
Parameter not allowed for this message type: username
```

This is a **Google OAuth error**, which means Google OAuth is being triggered when it shouldn't be.

## Immediate Solution

### Option 1: Use Microsoft Login Only (Recommended if not using Google)

1. **Make sure you click "Login with Microsoft"** button (not Google)
2. **Clear browser cookies** for localhost
3. **Try in incognito/private mode**

### Option 2: Disable Google Button (If Not Using Google)

If you're not using Google OAuth, you can hide the Google button by updating `examples/spoke-app-redirect.html`:

```html
<!-- Hide Google button if not using Google OAuth -->
<button id="loginGoogleBtn" style="display: none;">Login with Google</button>
```

### Option 3: Verify Service is Using Latest Code

The service has been restarted with fixes. Verify:

1. **Check service logs** - You should see:
   ```
   [INIT] Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set)
   ```

2. **Test Microsoft login directly**:
   ```bash
   curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I
   ```
   
   Should redirect to `login.microsoftonline.com` (NOT `accounts.google.com`)

## Why This Happens

The error occurs because:
1. **Google OAuth is being triggered** (even though credentials aren't set)
2. **Browser might have old session data** pointing to Google
3. **You might be clicking the Google button** by mistake
4. **Browser extension or cache** might be interfering

## Step-by-Step Fix

### Step 1: Clear Browser State

1. Open browser DevTools (F12)
2. Go to **Application** tab → **Storage**
3. Click **Clear site data**
4. Or manually:
   - Clear cookies for `localhost:3000`
   - Clear localStorage
   - Clear sessionStorage

### Step 2: Verify Login URL

When you click "Login with Microsoft", check the URL in the address bar:

**✅ Correct** (Microsoft):
```
https://login.microsoftonline.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a/oauth2/v2.0/authorize?...
```

**❌ Wrong** (Google):
```
https://accounts.google.com/o/oauth2/v2/auth?...
```

### Step 3: Check Service Logs

When you click login, check the service console output:

**✅ Correct**:
```
[LOGIN] Provider: Microsoft, State: xxxxxxxx...
[LOGIN] Redirecting to: https://login.microsoftonline.com/...
```

**❌ Wrong**:
```
[LOGIN] Provider: Google, State: xxxxxxxx...
```

### Step 4: Test Directly

Test the login endpoint directly:

```bash
# Should redirect to Microsoft (not Google)
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -L -I | grep -i location
```

## Most Likely Causes

1. **Clicking Google button**: Make sure you click "Login with Microsoft"
2. **Browser cache**: Clear cookies and cache
3. **Old session**: Browser has old state cookie pointing to Google
4. **Service not restarted**: Old code still running (should be fixed now)

## Verification

After applying fixes:

1. ✅ Service logs show Microsoft provider
2. ✅ Browser redirects to `login.microsoftonline.com`
3. ✅ No Google OAuth errors
4. ✅ Microsoft login completes successfully

## If Still Not Working

1. **Check which button you're clicking** - Make sure it's "Login with Microsoft"
2. **Check browser console** - Look for JavaScript errors
3. **Check service logs** - Look for provider information
4. **Try different browser** - Rule out browser-specific issues
5. **Check network tab** - See where the redirect is actually going

The service has been updated and restarted. The error should be resolved if you:
- Click "Login with Microsoft" (not Google)
- Clear browser cookies
- Use the updated code
