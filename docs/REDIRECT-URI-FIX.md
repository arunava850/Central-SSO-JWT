# Fix: Redirect URI Mismatch Error (AADSTS50011)

## Problem

The error `AADSTS50011` occurs because the redirect URI sent to Entra ID doesn't match what's configured in your app registration.

**Error URI**: `https://auth.ainsemble.com/api/me/auth/callback`  
**Issue**: This URI is not registered in Azure Portal

## Solution

You need to add the callback URI to your Entra ID app registration. The callback URI is constructed as:
```
${BASE_URL}/auth/callback
```

### For Local Development

1. **Update `.env`** (already done):
   ```env
   BASE_URL=https://localhost:3000
   ```

2. **Add to Azure Portal**:
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to **Azure Active Directory** → **App registrations**
   - Find your app: **Client ID: `763f00e6-98b8-4305-95b6-c70c74362b5a`**
   - Click **Authentication** (left sidebar)
   - Under **Web** → **Redirect URIs**, click **Add URI**
   - Add: `https://localhost:3000/auth/callback`
   - Click **Save**

### For Production

If you're deploying to production with `BASE_URL=https://auth.ainsemble.com/api/me`:

1. **Add to Azure Portal**:
   - Go to **Authentication** in your app registration
   - Add redirect URI: `https://auth.ainsemble.com/api/me/auth/callback`
   - Click **Save**

## Complete List of Redirect URIs to Add

Add ALL of these to your Azure Portal app registration:

### Local Development URIs:
- ✅ `https://localhost:3000/auth/callback` (Central Auth callback)
- ✅ `http://localhost:3001/auth/callback` (Spoke app callback)

### Production URIs (if applicable):
- ✅ `https://auth.ainsemble.com/api/me/auth/callback` (Central Auth callback)
- ✅ `https://spoke-app1.com/auth/callback` (Spoke app 1)
- ✅ `https://spoke-app2.com/auth/callback` (Spoke app 2)

## Step-by-Step: Adding Redirect URI in Azure Portal

1. **Navigate to App Registration**:
   - Go to https://portal.azure.com
   - Search for "Azure Active Directory" or "Microsoft Entra ID"
   - Click **App registrations** (left sidebar)
   - Find and click your app: **Client ID: `763f00e6-98b8-4305-95b6-c70c74362b5a`**

2. **Go to Authentication**:
   - Click **Authentication** in the left menu

3. **Add Redirect URI**:
   - Scroll to **Web** section
   - Click **Add URI** button
   - Enter: `https://localhost:3000/auth/callback`
   - Click **Save**

4. **Verify**:
   - The URI should now appear in the list
   - Make sure it's saved (you may need to wait a few seconds)

## Important Notes

### Two Types of Redirect URIs

1. **Central Auth Callback** (`${BASE_URL}/auth/callback`):
   - This is where Entra ID redirects AFTER authentication
   - Must match: `https://localhost:3000/auth/callback` (for local dev)
   - This is what's causing the current error

2. **Spoke App Callbacks** (in `REDIRECT_URIS`):
   - These are where Central Auth redirects AFTER generating JWT
   - Example: `http://localhost:3001/auth/callback`
   - These are validated by Central Auth, not Entra ID

### Current Configuration

After the fix:
- **BASE_URL**: `https://localhost:3000`
- **Central Auth Callback**: `https://localhost:3000/auth/callback` ← **Add this to Azure Portal**
- **Spoke App Callback**: `http://localhost:3001/auth/callback` ← Already in REDIRECT_URIS

## After Making Changes

1. **Wait 1-2 minutes** for Azure Portal changes to propagate
2. **Restart Central Auth Service**:
   ```bash
   # Stop current process
   lsof -ti:3000 | xargs kill -9
   
   # Start again
   npm start
   ```
3. **Test the login flow**:
   - Open `http://localhost:3001`
   - Click "Login with Central Auth"
   - The error should be resolved

## Verification

To verify the redirect URI is correct:

1. **Check what's being sent**:
   - Look at the browser URL when redirected to Entra ID
   - The `redirect_uri` parameter should match what's in Azure Portal

2. **Test the endpoint**:
   ```bash
   curl -k "https://localhost:3000/auth/login?client_id=spoke-app&redirect_uri=http://localhost:3001/auth/callback" -I
   ```
   - Should redirect to Entra ID without errors

## Troubleshooting

### Still Getting Error?

1. **Double-check the URI**:
   - Make sure there are no trailing slashes
   - Ensure it matches exactly (case-sensitive)
   - Check for typos

2. **Verify BASE_URL**:
   ```bash
   # Check your .env file
   grep BASE_URL .env
   ```

3. **Clear browser cache**:
   - Sometimes browsers cache redirect URIs
   - Try incognito/private mode

4. **Check Azure Portal**:
   - Verify the URI is actually saved
   - Refresh the page and check again

### Multiple Environments

If you need to support both local and production:

1. **Add both URIs to Azure Portal**:
   - `https://localhost:3000/auth/callback` (for local dev)
   - `https://auth.ainsemble.com/api/me/auth/callback` (for production)

2. **Update BASE_URL** based on environment:
   ```env
   # Local development
   BASE_URL=https://localhost:3000
   
   # Production
   BASE_URL=https://auth.ainsemble.com/api/me
   ```

## Summary

✅ **Fixed**: Updated `BASE_URL` to `https://localhost:3000` for local development  
✅ **Action Required**: Add `https://localhost:3000/auth/callback` to Azure Portal app registration  
✅ **After Fix**: Restart the service and test again
