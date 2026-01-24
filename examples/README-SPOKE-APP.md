# Spoke App Integration Testing

This directory contains a complete test spoke application that demonstrates integration with the Central Authorization Service.

## Files

- **`spoke-app-server.js`** - Express server implementing JWT validation
- **`spoke-app-redirect.html`** - Frontend HTML page for login flow
- **`spoke-app-validation.js`** - JWT validation utilities
- **`test-spoke-app.sh`** - Automated test script

## Quick Start

### 1. Start Central Auth Service

```bash
# In the project root
npm start
```

The Central Auth Service should be running on `https://localhost:3000`

### 2. Start Spoke App Server

```bash
# In the examples directory
node spoke-app-server.js
```

The Spoke App will run on `http://localhost:3001`

### 3. Test the Integration

#### Option A: Browser Testing

1. Open `http://localhost:3001` in your browser
2. Click "Login with Central Auth"
3. You'll be redirected to Microsoft Entra ID login
4. After authentication, you'll be redirected back with a JWT token
5. The page will display your user information

#### Option B: Automated Testing

```bash
bash test-spoke-app.sh
```

## Configuration

### Central Auth Service URLs

Update these in the spoke app files if your Central Auth Service is running on a different URL:

- **`spoke-app-server.js`**: 
  ```javascript
  const CENTRAL_AUTH_URL = 'https://localhost:3000';
  const CENTRAL_AUTH_JWKS_URL = 'https://localhost:3000/.well-known/jwks.json';
  ```

- **`spoke-app-redirect.html`**:
  ```javascript
  const CENTRAL_AUTH_URL = 'https://localhost:3000';
  ```

### Redirect URI Configuration

Make sure the redirect URI is configured in:

1. **Central Auth `.env` file**:
   ```env
   REDIRECT_URIS=...,http://localhost:3001/auth/callback
   ```

2. **Microsoft Entra ID App Registration**:
   - Go to Azure Portal → App Registrations
   - Add redirect URI: `http://localhost:3001/auth/callback`

## API Endpoints

### Spoke App Endpoints

- `GET /` - Main page with login button
- `GET /auth/callback` - OAuth callback handler
- `GET /api/me?token=xxx` - Get current user info (requires JWT)
- `GET /api/admin?token=xxx` - Admin-only endpoint (requires Admin role)
- `GET /api/finance?token=xxx` - Finance group endpoint (requires Finance group)
- `GET /health` - Health check

### Example API Calls

```bash
# Get user info (replace TOKEN with actual JWT)
curl "http://localhost:3001/api/me?token=YOUR_JWT_TOKEN"

# Or use Authorization header
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/me
```

## Authentication Flow

1. **User clicks "Login"** → Redirects to `https://localhost:3000/auth/login?client_id=spoke-app&redirect_uri=http://localhost:3001/auth/callback`

2. **Central Auth redirects to Entra ID** → User authenticates with Microsoft

3. **Entra ID redirects back** → `https://localhost:3000/auth/callback?code=xxx&state=xxx`

4. **Central Auth exchanges code for token** → Fetches user info from Microsoft Graph

5. **Central Auth generates JWT** → Signs JWT with RS256

6. **Central Auth redirects to Spoke App** → `http://localhost:3001/auth/callback?token=JWT_TOKEN&state=xxx`

7. **Spoke App validates JWT** → Uses JWKS endpoint to verify signature

8. **Spoke App displays user info** → Shows decoded JWT claims

## JWT Validation

The spoke app validates JWTs using:

1. **JWKS endpoint**: `https://localhost:3000/.well-known/jwks.json`
2. **Issuer validation**: Must match `https://localhost:3000`
3. **Audience validation**: Must match `spoke-applications`
4. **Algorithm validation**: Must be `RS256`
5. **Expiration check**: Token must not be expired

## Troubleshooting

### "Invalid redirect_uri" Error

- Check that `http://localhost:3001/auth/callback` is in Central Auth's `REDIRECT_URIS`
- Check that it's also configured in Microsoft Entra ID app registration

### "Token verification failed" Error

- Verify Central Auth is running and accessible
- Check JWKS endpoint: `curl -k https://localhost:3000/.well-known/jwks.json`
- Verify issuer and audience match in validation code

### CORS Errors

- Add `http://localhost:3001` to Central Auth's `ALLOWED_ORIGINS` in `.env`

### SSL Certificate Warnings

- For localhost testing, browsers will show warnings for self-signed certificates
- Click "Advanced" → "Proceed to localhost" (or similar)
- This is expected for development

## Production Deployment

For production:

1. Replace `localhost` URLs with your actual domain
2. Use valid SSL certificates (not self-signed)
3. Update redirect URIs in both Central Auth and Entra ID
4. Use secure token storage (not localStorage)
5. Implement proper error handling
6. Add logging and monitoring

## Security Notes

⚠️ **Development Only**: This test app uses:
- HTTP (not HTTPS) for the spoke app
- localStorage for token storage
- Self-signed SSL certificates

For production, use:
- HTTPS everywhere
- Secure token storage (httpOnly cookies, secure storage)
- Valid SSL certificates
- Proper CORS configuration
