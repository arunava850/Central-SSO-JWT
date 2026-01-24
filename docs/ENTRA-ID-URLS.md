# Microsoft Entra ID Authentication URLs

## Authorization URL

When you initiate login with Microsoft Entra ID, the following URL is called:

### Base URL
```
https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize
```

### Your Configuration
```
https://login.microsoftonline.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a/oauth2/v2.0/authorize
```

## Query Parameters

The authorization URL includes these parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `client_id` | `763f00e6-98b8-4305-95b6-c70c74362b5a` | Your Entra ID App Registration Client ID |
| `scope` | `openid profile email User.Read GroupMember.Read.All Directory.Read.All offline_access` | Requested permissions |
| `redirect_uri` | `https://localhost:3000/auth/callback` | Where Entra ID redirects after authentication |
| `response_mode` | `query` | Return authorization code as query parameter |
| `response_type` | `code` | Authorization Code Flow |
| `code_challenge` | `{generated}` | PKCE code challenge (SHA256 hash) |
| `code_challenge_method` | `S256` | PKCE method (SHA256) |
| `nonce` | `{generated}` | Random nonce for ID token validation |
| `state` | `{generated}` | CSRF protection state parameter |
| `client_info` | `1` | Request client info in token response |

## Complete Example URL

```
https://login.microsoftonline.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a/oauth2/v2.0/authorize?
  client_id=763f00e6-98b8-4305-95b6-c70c74362b5a
  &scope=openid%20profile%20email%20User.Read%20GroupMember.Read.All%20Directory.Read.All%20offline_access
  &redirect_uri=https%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback
  &response_mode=query
  &response_type=code
  &code_challenge={PKCE_CHALLENGE}
  &code_challenge_method=S256
  &nonce={RANDOM_NONCE}
  &state={RANDOM_STATE}
  &client_info=1
```

## Callback URL

After user authenticates, Entra ID redirects to:

```
https://localhost:3000/auth/callback?code={AUTHORIZATION_CODE}&state={STATE}
```

## Token Exchange URL

After receiving the authorization code, the service exchanges it for tokens at:

```
https://login.microsoftonline.com/87cf83c8-a5e2-4162-b4c8-e661eb92362a/oauth2/v2.0/token
```

This is handled internally by the MSAL library.

## Microsoft Graph API URLs

After getting access token, user info is fetched from:

### User Profile
```
GET https://graph.microsoft.com/v1.0/me
```

### User Roles
```
GET https://graph.microsoft.com/v1.0/me/appRoleAssignments
```

### User Groups
```
GET https://graph.microsoft.com/v1.0/me/memberOf
```

## Configuration Values

From your `.env` file:

- **Tenant ID**: `87cf83c8-a5e2-4162-b4c8-e661eb92362a`
- **Client ID**: `763f00e6-98b8-4305-95b6-c70c74362b5a`
- **Redirect URI**: `https://localhost:3000/auth/callback`
- **Base URL**: `https://login.microsoftonline.com`

## Flow Summary

1. **User clicks login** → Central Auth `/auth/login?provider=microsoft`
2. **Central Auth redirects** → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?...`
3. **User authenticates** → Entra ID login page
4. **Entra ID redirects** → `https://localhost:3000/auth/callback?code=xxx&state=xxx`
5. **Central Auth exchanges code** → `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token`
6. **Central Auth fetches user info** → `https://graph.microsoft.com/v1.0/me`
7. **Central Auth generates JWT** → Issues JWT token
8. **Central Auth redirects** → `http://localhost:3001/auth/callback?token=JWT_TOKEN`

## Testing

To see the exact URL being called:

```bash
curl -k "https://localhost:3000/auth/login?client_id=test&redirect_uri=http://localhost:3001/auth/callback&provider=microsoft" -I | grep Location
```

Or check the service logs - they show the redirect URL.
