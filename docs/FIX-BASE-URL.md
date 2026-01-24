# Fix: BASE_URL Configuration Issue

## Problem

After authorization, the redirect is going to `https://localhost:3000/auth/callback` instead of the spoke app's callback URL.

## Root Cause

The `BASE_URL` in `.env` is incorrectly configured with a path:

```env
BASE_URL=https://auth.ainsemble.com/api/me  # ❌ WRONG - includes path
```

This causes:
1. Microsoft Entra ID callback URL to be wrong: `https://auth.ainsemble.com/api/me/auth/callback`
2. The callback endpoint might not be accessible
3. Session data might be lost

## Solution

**`BASE_URL` should be just the base domain without any path:**

```env
# For production
BASE_URL=https://auth.ainsemble.com  # ✅ CORRECT - no path

# For local development
BASE_URL=https://localhost:3000  # ✅ CORRECT
```

## Steps to Fix

### 1. Update `.env` file

On your VM:
```bash
cd ~/central-auth
nano .env
```

Change:
```env
# Before (WRONG)
BASE_URL=https://auth.ainsemble.com/api/me

# After (CORRECT)
BASE_URL=https://auth.ainsemble.com
```

### 2. Verify Microsoft Entra ID Redirect URI

In Azure Portal, ensure the redirect URI is:
```
https://auth.ainsemble.com/auth/callback
```

**NOT:**
```
https://auth.ainsemble.com/api/me/auth/callback  # ❌ WRONG
```

### 3. Restart the Service

```bash
pm2 restart central-auth
pm2 logs central-auth
```

### 4. Test the Flow

1. Call login: `https://auth.ainsemble.com/auth/login?client_id=spoke-app&redirect_uri=http://localhost:3001/auth/callback`
2. After Microsoft authentication, it should redirect to: `https://auth.ainsemble.com/auth/callback?code=...`
3. Central Auth processes the code and redirects to: `http://localhost:3001/auth/callback?token=...`

## How It Works

1. **Login Request**: Spoke app calls `/auth/login` with `redirect_uri=http://localhost:3001/auth/callback`
2. **Central Auth**: Stores `redirect_uri` in session and redirects to Microsoft with callback: `${BASE_URL}/auth/callback`
3. **Microsoft**: After auth, redirects to: `https://auth.ainsemble.com/auth/callback?code=...`
4. **Central Auth Callback**: Processes code, generates JWT, redirects to stored `redirect_uri` (spoke app)

## Verification

Check the logs after fixing:

```bash
pm2 logs central-auth --lines 50
```

You should see:
```
[LOGIN] Valid redirect_uri: http://localhost:3001/auth/callback
[LOGIN] Redirecting to: https://login.microsoftonline.com/...
[CALLBACK] Preparing redirect to spoke app: http://localhost:3001/auth/callback
[CALLBACK] Redirecting to spoke app: http://localhost:3001/auth/callback?token=...
```

## Common Mistakes

❌ **Wrong:**
```env
BASE_URL=https://auth.ainsemble.com/api/me
BASE_URL=https://auth.ainsemble.com/auth
BASE_URL=http://localhost:3000/api
```

✅ **Correct:**
```env
BASE_URL=https://auth.ainsemble.com
BASE_URL=http://localhost:3000
```

## Why This Matters

- `BASE_URL` is used to construct the callback URL for Microsoft Entra ID
- Microsoft must redirect to: `${BASE_URL}/auth/callback`
- If `BASE_URL` includes a path, the callback URL becomes invalid
- The Central Auth callback endpoint is always at `/auth/callback` (no `/api/me` prefix)
