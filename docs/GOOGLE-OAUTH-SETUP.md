# Google OAuth Setup Guide

This guide explains how to configure Google OAuth as an additional identity provider alongside Microsoft Entra ID.

## Overview

The Central Auth Service now supports **multi-provider authentication**:
- ✅ Microsoft Entra ID (Azure AD)
- ✅ Google OAuth

Both providers issue the same JWT format, so spoke applications don't need to know which provider was used.

## Google Cloud Console Setup

### Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**

### Step 2: Configure OAuth Consent Screen

If you haven't already:

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (for testing) or **Internal** (for Google Workspace)
3. Fill in required information:
   - App name: `Central Auth Service`
   - User support email: Your email
   - Developer contact: Your email
4. Click **Save and Continue**
5. Add scopes (if needed):
   - `openid`
   - `profile`
   - `email`
6. Click **Save and Continue**
7. Add test users (if External) or click **Save and Continue**

### Step 3: Create OAuth Client ID

1. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Name: `Central Auth Service`
4. Authorized redirect URIs:
   ```
   https://localhost:3000/auth/callback?provider=google
   https://your-domain.com/auth/callback?provider=google
   ```
5. Click **Create**
6. **Copy the Client ID and Client Secret** (you'll need these)

### Step 4: Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Enable these APIs (if not already enabled):
   - ✅ Google+ API (for user info)
   - ✅ People API (optional, for additional user data)

## Environment Configuration

Add Google OAuth credentials to your `.env` file:

```env
# Google OAuth Configuration (optional)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Example `.env` with both providers:

```env
# Microsoft Entra ID Configuration
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Server Configuration
BASE_URL=https://localhost:3000
# ... rest of configuration
```

## Usage

### Login with Microsoft (default)

```javascript
// Default behavior - uses Microsoft Entra ID
const loginUrl = `https://central-auth.com/auth/login?client_id=spoke-app&redirect_uri=${encodeURIComponent('https://spoke-app.com/auth/callback')}`;
```

### Login with Google

```javascript
// Specify provider=google
const loginUrl = `https://central-auth.com/auth/login?client_id=spoke-app&redirect_uri=${encodeURIComponent('https://spoke-app.com/auth/callback')}&provider=google`;
```

### Spoke App Example

Update your spoke app to allow users to choose a provider:

```html
<button onclick="loginWithMicrosoft()">Login with Microsoft</button>
<button onclick="loginWithGoogle()">Login with Google</button>

<script>
function loginWithMicrosoft() {
  const loginUrl = `${CENTRAL_AUTH_URL}/auth/login?client_id=spoke-app&redirect_uri=${encodeURIComponent(SPOKE_APP_CALLBACK)}&provider=microsoft`;
  window.location.href = loginUrl;
}

function loginWithGoogle() {
  const loginUrl = `${CENTRAL_AUTH_URL}/auth/login?client_id=spoke-app&redirect_uri=${encodeURIComponent(SPOKE_APP_CALLBACK)}&provider=google`;
  window.location.href = loginUrl;
}
</script>
```

## API Endpoints

### Login Endpoint

```
GET /auth/login?client_id=xxx&redirect_uri=xxx&provider=microsoft|google
```

**Parameters:**
- `client_id` (required): Spoke app identifier
- `redirect_uri` (required): Where to redirect after authentication
- `provider` (optional): `microsoft` (default) or `google`

### Callback Endpoint

```
GET /auth/callback?code=xxx&state=xxx&provider=microsoft|google
```

The callback automatically detects the provider from the session or query parameter.

## JWT Claims

Both providers generate JWTs with the same structure:

```json
{
  "sub": "user_object_id",
  "email": "user@email.com",
  "name": "User Name",
  "roles": ["Admin", "Editor"],  // Empty for Google, populated for Microsoft
  "groups": ["Finance", "HR"],    // Empty for Google, populated for Microsoft
  "tenant": "entra-tenant-id" or "google",
  "iat": 1234567890,
  "exp": 1234568790,
  "iss": "https://your-domain.com",
  "aud": "spoke-applications"
}
```

### Differences

- **Microsoft Entra ID**: Includes `roles` and `groups` from Azure AD
- **Google OAuth**: `roles` and `groups` are empty arrays (can be populated from Google Workspace if needed)

## Testing

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Add Google OAuth credentials to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Restart Service

```bash
npm run build
npm start
```

### 4. Test Login

```bash
# Test Microsoft login (default)
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback"

# Test Google login
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=google"
```

## Troubleshooting

### Error: "Google OAuth is not configured"

**Solution**: Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your `.env` file.

### Error: "redirect_uri_mismatch"

**Solution**: Ensure the redirect URI in Google Cloud Console matches exactly:
```
https://localhost:3000/auth/callback?provider=google
```

Note: The `?provider=google` query parameter is part of the redirect URI.

### Error: "invalid_client"

**Solution**: 
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that OAuth consent screen is configured
- Ensure the OAuth client is not deleted or disabled

### Google Sign-in Shows Error 400

**Common causes:**
1. Redirect URI mismatch
2. OAuth consent screen not configured
3. Test user not added (for External apps)
4. Required APIs not enabled

**Solution**: Follow the setup steps above carefully.

## Security Considerations

1. **Client Secret**: Keep `GOOGLE_CLIENT_SECRET` secure, never commit to git
2. **Redirect URIs**: Only add trusted redirect URIs
3. **HTTPS**: Always use HTTPS in production
4. **State Parameter**: Always validate the state parameter (already implemented)
5. **PKCE**: PKCE is used for both providers (already implemented)

## Production Deployment

For production:

1. **Update Redirect URIs** in Google Cloud Console:
   ```
   https://your-domain.com/auth/callback?provider=google
   ```

2. **Update BASE_URL** in `.env`:
   ```env
   BASE_URL=https://your-domain.com
   ```

3. **Use Valid SSL Certificates**: Replace self-signed certificates

4. **Review OAuth Consent Screen**: 
   - Change from "Testing" to "In production"
   - Complete verification if needed

## Optional: Google Workspace Groups

To populate `groups` in the JWT for Google users:

1. Enable **Admin SDK API** in Google Cloud Console
2. Request additional scopes:
   ```typescript
   'https://www.googleapis.com/auth/admin.directory.group.readonly'
   ```
3. Use Google Workspace Admin SDK to fetch user groups
4. Update `google.service.ts` to fetch and include groups

## Support

For issues:
1. Check Google Cloud Console for error details
2. Review OAuth consent screen configuration
3. Verify redirect URIs match exactly
4. Check application logs for detailed error messages
