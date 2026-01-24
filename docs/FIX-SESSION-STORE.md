# Fix: Session Expired or Invalid Error

## Problem

After authentication, you were getting:
```
Session expired or invalid
```

This error occurs when the callback can't find the session data stored during login.

## Root Cause

The issue was that `sessionStore` was defined **separately** in both:
- `login.controller.ts` - stored session data
- `callback.controller.ts` - tried to retrieve session data

Since they were **different Map instances**, the callback couldn't find the session data stored by the login controller.

## Solution

Created a **shared session store module** (`src/auth/session.store.ts`) that both controllers use:

1. ✅ **Shared Storage**: Single Map instance used by both controllers
2. ✅ **Session Expiration**: Automatic cleanup of expired sessions (10 minutes)
3. ✅ **Better Logging**: Detailed logs for debugging
4. ✅ **Error Details**: More informative error messages

## Changes Made

### 1. Created Shared Session Store (`src/auth/session.store.ts`)

- Single shared Map instance
- Automatic expiration (10 minutes)
- Cleanup of expired sessions
- Better logging and debugging

### 2. Updated Login Controller

- Uses `setSession()` from shared module
- Removed local sessionStore definition

### 3. Updated Callback Controller

- Uses `getSession()` and `deleteSession()` from shared module
- Removed local sessionStore definition
- Added better error logging

## How It Works Now

1. **Login**: Stores session in shared store
   ```typescript
   setSession(state, { codeVerifier, nonce, redirectUri, provider });
   ```

2. **Callback**: Retrieves from shared store
   ```typescript
   const sessionData = getSession(state);
   ```

3. **Both use same store**: Session data is accessible from both controllers

## Testing

After restarting the service:

1. **Check logs** when you click login:
   ```
   [SESSION] Stored session for state: xxxxxxxx..., provider: microsoft
   ```

2. **Check logs** when callback is received:
   ```
   [SESSION] Retrieved session for state: xxxxxxxx..., provider: microsoft
   ```

3. **If session not found**, you'll see:
   ```
   [SESSION] Session not found for state: xxxxxxxx...
   [CALLBACK] Available sessions: 0
   ```

## Common Causes of Session Loss

### 1. Service Restart

**Problem**: Service was restarted between login and callback

**Solution**: 
- Sessions are in-memory, so restart clears them
- In production, use Redis for persistent storage

### 2. Session Expiration

**Problem**: More than 10 minutes between login and callback

**Solution**: 
- Sessions expire after 10 minutes
- Complete authentication flow quickly
- Or increase expiration time in `session.store.ts`

### 3. State Mismatch

**Problem**: State parameter doesn't match stored session

**Solution**: 
- Check that state in URL matches cookie
- Clear browser cookies and try again

## Verification

After the fix:

1. ✅ **Service restarted** with new code
2. ✅ **Shared session store** is working
3. ✅ **Better error messages** if session not found
4. ✅ **Logging** shows session operations

## Next Steps

1. **Restart the service** (already done)
2. **Clear browser cookies** (to remove old state)
3. **Test login flow** again
4. **Check service logs** for session operations

## Production Recommendation

For production, replace the in-memory session store with **Redis**:

```typescript
// Example Redis implementation
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function setSession(state: string, data: SessionData): Promise<void> {
  await redis.setex(`session:${state}`, 600, JSON.stringify(data));
}

export async function getSession(state: string): Promise<SessionData | undefined> {
  const data = await redis.get(`session:${state}`);
  return data ? JSON.parse(data) : undefined;
}
```

This ensures sessions persist across service restarts and can be shared across multiple instances.
