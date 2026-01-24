# Spoke App Updates for Multi-Provider Support

## Changes Made

The spoke app examples have been updated to support **multi-provider authentication** (Microsoft Entra ID and Google OAuth).

## Updated Files

### 1. `spoke-app-redirect.html`

**Changes:**
- ✅ Added two separate login buttons: "Login with Microsoft" and "Login with Google"
- ✅ Added provider selection UI
- ✅ Displays which provider was used for authentication
- ✅ Shows tenant information in user details
- ✅ Added styling for better UX

**New Features:**
- Users can choose between Microsoft and Google login
- UI clearly shows which provider authenticated the user
- Better visual design with styled buttons

### 2. `spoke-app-server.js`

**Changes:**
- ✅ Updated `/api/me` endpoint to include provider information
- ✅ Automatically detects provider from JWT `tenant` claim
- ✅ Returns provider name in API response

## Usage

### Frontend (HTML)

The HTML page now shows two login buttons:

```html
<button id="loginMicrosoftBtn">Login with Microsoft</button>
<button id="loginGoogleBtn">Login with Google</button>
```

When a user clicks either button, they're redirected to the Central Auth Service with the appropriate `provider` parameter.

### Backend (Server)

The server automatically detects the provider from the JWT token:

```javascript
// JWT contains tenant field: "entra-tenant-id" or "google"
const provider = req.user.tenant === 'google' ? 'Google' : 'Microsoft';
```

## API Response

The `/api/me` endpoint now includes provider information:

```json
{
  "message": "Protected resource accessed successfully",
  "provider": "Microsoft",  // or "Google"
  "user": {
    "id": "user_object_id",
    "email": "user@email.com",
    "name": "User Name",
    "roles": [],
    "groups": [],
    "tenant": "google"  // or "entra-tenant-id"
  },
  "tokenInfo": {
    "issuedAt": "2026-01-24T...",
    "expiresAt": "2026-01-24T..."
  }
}
```

## Testing

### 1. Start Spoke App Server

```bash
cd examples
node spoke-app-server.js
```

### 2. Open in Browser

Navigate to `http://localhost:3001`

### 3. Test Both Providers

1. **Test Microsoft Login**:
   - Click "Login with Microsoft"
   - Complete Microsoft Entra ID authentication
   - Verify user info shows "Provider: Microsoft"

2. **Test Google Login**:
   - Click "Login with Google"
   - Complete Google OAuth authentication
   - Verify user info shows "Provider: Google"

### 4. Test API Endpoint

```bash
# After getting a token, test the API
curl "http://localhost:3001/api/me?token=YOUR_JWT_TOKEN"
```

The response will include the `provider` field indicating which provider was used.

## JWT Token Structure

Both providers generate JWTs with the same structure, but the `tenant` field differs:

**Microsoft:**
```json
{
  "tenant": "87cf83c8-a5e2-4162-b4c8-e661eb92362a",
  ...
}
```

**Google:**
```json
{
  "tenant": "google",
  ...
}
```

The spoke app can use the `tenant` field to determine which provider was used.

## Backward Compatibility

✅ **Fully backward compatible**:
- If no `provider` parameter is specified, defaults to Microsoft
- Existing integrations continue to work
- JWT validation works the same for both providers

## UI Improvements

- ✅ Styled buttons with provider-specific colors
- ✅ Microsoft button: Blue (#0078d4)
- ✅ Google button: Google Blue (#4285f4)
- ✅ Better visual hierarchy
- ✅ Responsive design

## Next Steps

1. **Test both providers** to ensure they work correctly
2. **Customize styling** if needed for your brand
3. **Add error handling** for cases where Google OAuth is not configured
4. **Consider adding** a provider selection preference (remember user's choice)
