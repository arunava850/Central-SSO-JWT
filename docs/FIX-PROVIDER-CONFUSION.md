# Fix: Provider Confusion Error (Google OAuth Triggered for Microsoft)

## Problem

When trying to login with Microsoft Entra ID, you were getting:
```
Error 400: invalid_request
Request details: flowName=GeneralOAuthFlow
```

This is a **Google OAuth error**, which means Google OAuth was being triggered when it shouldn't be.

## Root Cause

The callback controller was using the `provider` query parameter from the URL, which could be:
1. **Manipulated** by users
2. **Incorrect** if the redirect URL was wrong
3. **Missing** or **confused** between providers

This caused the system to sometimes route Microsoft callbacks to Google OAuth handling, triggering the Google error.

## Solution

### Changes Made

1. **Callback Controller** - Now uses **session data as source of truth**:
   ```typescript
   // OLD (unreliable):
   const authProvider = (provider as string || sessionData.provider || 'microsoft').toLowerCase();
   
   // NEW (reliable):
   const authProvider = (sessionData.provider || 'microsoft').toLowerCase();
   ```

2. **Removed Query Parameters from Redirect URIs**:
   - Microsoft callback: `${config.baseUrl}/auth/callback` (removed `?provider=microsoft`)
   - Google callback: `${config.baseUrl}/auth/callback` (removed `?provider=google`)
   - Provider is now determined from session data, not URL parameters

3. **Added Logging** for debugging:
   - Logs which provider is being used
   - Helps identify issues in production

4. **Better Error Handling**:
   - Clearer error messages
   - Validates Google service before use

## Important: Update Google Cloud Console

Since we removed the query parameter from the Google redirect URI, you need to update it in Google Cloud Console:

### Before (with query parameter):
```
https://localhost:3000/auth/callback?provider=google
```

### After (without query parameter):
```
https://localhost:3000/auth/callback
```

### Steps to Update:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID
4. Click **Edit**
5. Under **Authorized redirect URIs**, update:
   - Remove: `https://localhost:3000/auth/callback?provider=google`
   - Add: `https://localhost:3000/auth/callback`
6. Click **Save**

### For Production:

Update the redirect URI to:
```
https://your-domain.com/auth/callback
```

(Without any query parameters)

## How It Works Now

1. **Login Request**:
   ```
   GET /auth/login?client_id=xxx&redirect_uri=xxx&provider=microsoft
   ```
   - Provider is stored in session data
   - User is redirected to Microsoft Entra ID

2. **Microsoft Callback**:
   ```
   GET /auth/callback?code=xxx&state=xxx
   ```
   - Provider is determined from **session data** (not URL)
   - System knows it's Microsoft from the session

3. **Google Login** (if configured):
   ```
   GET /auth/login?client_id=xxx&redirect_uri=xxx&provider=google
   ```
   - Provider is stored in session data
   - User is redirected to Google OAuth

4. **Google Callback**:
   ```
   GET /auth/callback?code=xxx&state=xxx
   ```
   - Provider is determined from **session data** (not URL)
   - System knows it's Google from the session

## Testing

### 1. Restart the Service

```bash
# Stop current process
lsof -ti:3000 | xargs kill -9

# Rebuild
npm run build

# Start
npm start
```

### 2. Test Microsoft Login

```bash
# Should work without Google errors
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I
```

### 3. Check Logs

You should see logs like:
```
Redirecting to Microsoft Entra ID for state: xxx
Processing Microsoft Entra ID callback for state: xxx
```

## Verification Checklist

- [ ] Updated Google Cloud Console redirect URI (removed `?provider=google`)
- [ ] Rebuilt the application (`npm run build`)
- [ ] Restarted the service
- [ ] Tested Microsoft login (should work)
- [ ] Tested Google login (if configured, should work)
- [ ] Checked logs for provider information

## Why This Fix Works

1. **Session Data is Secure**: The provider is stored in server-side session data, which can't be manipulated by users
2. **Single Callback URL**: Both providers use the same callback URL, simplifying configuration
3. **Provider from Session**: The callback determines the provider from the session, which was set during login
4. **No URL Manipulation**: Users can't change the provider by modifying the callback URL

## Additional Notes

- The callback URL is now simpler: `/auth/callback` (no query parameters)
- Provider selection happens at login time and is stored in the session
- This is more secure and less error-prone
- Both Microsoft and Google use the same callback endpoint

## If Issues Persist

1. **Clear browser cookies** - Old state cookies might cause issues
2. **Check session storage** - Ensure sessions aren't expiring too quickly
3. **Verify Google credentials** - If Google OAuth is not configured, ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are NOT set in `.env`
4. **Check logs** - Look for provider information in console logs
