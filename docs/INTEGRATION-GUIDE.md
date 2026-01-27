# Central Auth Integration Guide

This guide helps developers integrate their applications with the Central Authorization Service (Central SSO JWT).

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Quick Start](#quick-start)
4. [Integration Steps](#integration-steps)
5. [Code Examples](#code-examples)
6. [Configuration](#configuration)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Central Authorization Service provides:
- **Single Sign-On (SSO)** for multiple applications
- **JWT tokens** signed with RS256
- **Multi-provider support** (Microsoft Entra ID, Google OAuth)
- **User identity, roles, and groups** in JWT claims
- **JWKS endpoint** for token verification

### Benefits

✅ **Centralized Authentication** - One login for all applications  
✅ **Secure** - RS256 signed JWTs, PKCE, state/nonce validation  
✅ **Scalable** - Stateless tokens, no shared sessions  
✅ **Flexible** - Works with any language/framework  
✅ **Multi-Provider** - Microsoft Entra ID and Google OAuth  

---

## How It Works

### Authentication Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Your App    │────────▶│ Central Auth  │────────▶│ Entra ID    │
│ (Spoke App) │         │              │         │ or Google   │
└─────────────┘         └──────────────┘         └─────────────┘
      │                        │                        │
      │  1. Redirect to login  │                        │
      │───────────────────────▶│                        │
      │                        │  2. Redirect to IdP    │
      │                        │───────────────────────▶│
      │                        │                        │
      │                        │  3. User authenticates │
      │                        │◀───────────────────────│
      │                        │                        │
      │                        │  4. Process callback   │
      │                        │  5. Generate JWT       │
      │  6. Redirect with JWT  │                        │
      │◀───────────────────────│                        │
      │                        │                        │
      │  7. Validate JWT      │                        │
      │  8. Access protected   │                        │
      │     resources          │                        │
      │                        │                        │
```

### Step-by-Step Flow

1. **User visits your app** → Not authenticated
2. **Your app redirects** → `https://auth.ainsemble.com/auth/login?client_id=your-app&redirect_uri=...`
3. **Central Auth redirects** → Microsoft/Google login
4. **User authenticates** → Microsoft/Google validates credentials
5. **Microsoft/Google redirects back** → `https://auth.ainsemble.com/auth/callback?code=...`
6. **Central Auth processes** → Exchanges code, fetches user info, generates JWT
7. **Central Auth redirects to your app** → `https://your-app.com/auth/callback?token=JWT_TOKEN`
8. **Your app validates JWT** → Using JWKS endpoint
9. **User is authenticated** → Access granted

---

## Quick Start

### Prerequisites

- Your application (any language/framework)
- Central Auth Service URL: `https://auth.ainsemble.com`
- JWKS endpoint: `https://auth.ainsemble.com/.well-known/jwks.json`

### 5-Minute Integration

**1. Add redirect URI to Central Auth:**
Contact your admin to add your callback URL to the allowlist:
```
https://your-app.com/auth/callback
```

**2. Redirect unauthenticated users:**
```javascript
// When user needs to login
const loginUrl = `https://auth.ainsemble.com/auth/login?` +
  `client_id=your-app-id&` +
  `redirect_uri=${encodeURIComponent('https://your-app.com/auth/callback')}&` +
  `provider=microsoft`;

window.location.href = loginUrl;
```

**3. Handle callback:**
```javascript
// On your callback page
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
  // Store token and validate it
  localStorage.setItem('auth_token', token);
  // Validate JWT using JWKS endpoint
}
```

**4. Validate JWT:**
Use the JWKS endpoint to verify the token signature.

---

## Integration Steps

### Step 1: Register Your Application

**Contact your administrator to:**
1. Add your callback URL to the allowlist
2. Get your `client_id` (if using multi-tenant features)
3. Confirm Central Auth URL: `https://auth.ainsemble.com`

**Required information:**
- Application name
- Callback URL(s): `https://your-app.com/auth/callback`
- Environment: Production/Staging/Development

### Step 2: Implement Login Redirect

When a user needs to authenticate, redirect them to Central Auth:

**JavaScript/TypeScript:**
```javascript
function redirectToLogin() {
  const clientId = 'your-app-id'; // Optional, can be any identifier
  const redirectUri = encodeURIComponent('https://your-app.com/auth/callback');
  const provider = 'microsoft'; // or 'google'
  
  const loginUrl = `https://auth.ainsemble.com/auth/login?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `provider=${provider}`;
  
  window.location.href = loginUrl;
}
```

**Python (Flask):**
```python
from flask import redirect, url_for
from urllib.parse import urlencode

def login():
    params = {
        'client_id': 'your-app-id',
        'redirect_uri': url_for('callback', _external=True),
        'provider': 'microsoft'
    }
    login_url = f"https://auth.ainsemble.com/auth/login?{urlencode(params)}"
    return redirect(login_url)
```

**Node.js/Express:**
```javascript
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: 'your-app-id',
    redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
    provider: 'microsoft'
  });
  res.redirect(`https://auth.ainsemble.com/auth/login?${params}`);
});
```

### Step 3: Handle OAuth Callback

Create a callback endpoint that receives the JWT token:

**JavaScript/TypeScript:**
```javascript
// Callback page handler
function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const state = urlParams.get('state');
  
  if (!token) {
    console.error('No token received');
    // Redirect to login or show error
    return;
  }
  
  // Store token securely
  localStorage.setItem('auth_token', token);
  
  // Validate token (see Step 4)
  validateToken(token).then(user => {
    // User is authenticated
    console.log('Authenticated user:', user);
    // Redirect to your app's main page
    window.location.href = '/dashboard';
  });
}
```

**Python (Flask):**
```python
from flask import request, redirect, url_for
import jwt
import requests

@app.route('/auth/callback')
def callback():
    token = request.args.get('token')
    state = request.args.get('state')
    
    if not token:
        return redirect(url_for('login'))
    
    # Validate token (see Step 4)
    user = validate_token(token)
    
    if user:
        # Store token in session
        session['auth_token'] = token
        session['user'] = user
        return redirect(url_for('dashboard'))
    else:
        return redirect(url_for('login'))
```

**Node.js/Express:**
```javascript
app.get('/auth/callback', async (req, res) => {
  const { token, state } = req.query;
  
  if (!token) {
    return res.redirect('/login');
  }
  
  try {
    // Validate token (see Step 4)
    const user = await validateToken(token);
    
    // Store token in session or cookie
    req.session.authToken = token;
    req.session.user = user;
    
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Token validation failed:', error);
    res.redirect('/login');
  }
});
```

### Step 4: Validate JWT Token

Validate the JWT token using the JWKS endpoint:

**JavaScript/TypeScript (using `jwks-rsa` and `jsonwebtoken`):**
```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: 'https://auth.ainsemble.com/.well-known/jwks.json',
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

async function validateToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://auth.ainsemble.com',
        audience: 'spoke-applications',
      },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded);
      }
    );
  });
}
```

**Python (using `PyJWT` and `cryptography`):**
```python
import jwt
import requests
from jwt import PyJWKClient

JWKS_URL = "https://auth.ainsemble.com/.well-known/jwks.json"

def validate_token(token):
    try:
        # Get JWKS
        jwks_client = PyJWKClient(JWKS_URL)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Verify token
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer="https://auth.ainsemble.com",
            audience="spoke-applications"
        )
        return decoded
    except jwt.ExpiredSignatureError:
        raise Exception("Token has expired")
    except jwt.InvalidTokenError as e:
        raise Exception(f"Invalid token: {str(e)}")
```

**C# (.NET):**
```csharp
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

public class JwtValidator
{
    private readonly string _jwksUrl = "https://auth.ainsemble.com/.well-known/jwks.json";
    
    public ClaimsPrincipal ValidateToken(string token)
    {
        var handler = new JwtSecurityTokenHandler();
        var jwks = GetJwks();
        
        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKeys = jwks,
            ValidateIssuer = true,
            ValidIssuer = "https://auth.ainsemble.com",
            ValidateAudience = true,
            ValidAudience = "spoke-applications",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
        
        return handler.ValidateToken(token, validationParameters, out _);
    }
    
    private IEnumerable<SecurityKey> GetJwks()
    {
        // Fetch and parse JWKS
        // Implementation depends on your JWKS client library
    }
}
```

### Step 5: Protect Your Routes

Use the validated JWT to protect your application routes:

**JavaScript/Express Middleware:**
```javascript
async function authenticateJWT(req, res, next) {
  // Get token from header or query
  const token = req.headers.authorization?.split(' ')[1] || 
                req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const user = await validateToken(token);
    req.user = user; // Attach user to request
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Use middleware
app.get('/api/protected', authenticateJWT, (req, res) => {
  res.json({ 
    message: 'Protected resource',
    user: req.user 
  });
});
```

**Python/Flask Decorator:**
```python
from functools import wraps
from flask import request, jsonify

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        try:
            user = validate_token(token)
            request.user = user
        except Exception as e:
            return jsonify({'error': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated

@app.route('/api/protected')
@token_required
def protected():
    return jsonify({
        'message': 'Protected resource',
        'user': request.user
    })
```

### Step 6: Access User Information

The JWT contains user information:

```javascript
// After validating token
const user = {
  sub: decoded.sub,           // User ID
  email: decoded.email,       // Email address
  name: decoded.name,         // Display name
  roles: decoded.roles,       // Array of roles: ['Admin', 'Editor']
  groups: decoded.groups,     // Array of groups: ['Finance', 'HR']
  tenant: decoded.tenant,     // Tenant ID or 'google'
  iat: decoded.iat,          // Issued at (timestamp)
  exp: decoded.exp           // Expires at (timestamp)
};
```

**Check user roles:**
```javascript
function hasRole(user, role) {
  return user.roles && user.roles.includes(role);
}

// Usage
if (hasRole(user, 'Admin')) {
  // Show admin features
}
```

**Check user groups:**
```javascript
function hasGroup(user, group) {
  return user.groups && user.groups.includes(group);
}

// Usage
if (hasGroup(user, 'Finance')) {
  // Show finance features
}
```

---

## Code Examples

### Complete Example: React Application

```javascript
// AuthService.js
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const CENTRAL_AUTH_URL = 'https://auth.ainsemble.com';
const JWKS_URL = `${CENTRAL_AUTH_URL}/.well-known/jwks.json`;

const client = jwksClient({
  jwksUri: JWKS_URL,
  cache: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

export async function validateToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: CENTRAL_AUTH_URL,
        audience: 'spoke-applications',
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });
}

export function redirectToLogin(returnUrl) {
  const params = new URLSearchParams({
    client_id: 'my-react-app',
    redirect_uri: `${window.location.origin}/auth/callback`,
    provider: 'microsoft',
  });
  
  if (returnUrl) {
    params.append('return_url', returnUrl);
  }
  
  window.location.href = `${CENTRAL_AUTH_URL}/auth/login?${params}`;
}

// CallbackPage.jsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { validateToken } from './AuthService';

export function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const token = searchParams.get('token');
    const returnUrl = searchParams.get('return_url') || '/dashboard';
    
    if (!token) {
      setError('No token received');
      return;
    }
    
    validateToken(token)
      .then(user => {
        // Store token and user info
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Redirect to return URL or dashboard
        navigate(returnUrl);
      })
      .catch(err => {
        console.error('Token validation failed:', err);
        setError('Authentication failed');
      });
  }, [searchParams, navigate]);
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  return <div>Authenticating...</div>;
}

// ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { validateToken } from './AuthService';

export function ProtectedRoute({ children }) {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    return <Navigate to="/login" />;
  }
  
  // Validate token on mount
  const [isValid, setIsValid] = useState(null);
  
  useEffect(() => {
    validateToken(token)
      .then(() => setIsValid(true))
      .catch(() => {
        localStorage.removeItem('auth_token');
        setIsValid(false);
      });
  }, [token]);
  
  if (isValid === null) return <div>Loading...</div>;
  if (isValid === false) return <Navigate to="/login" />;
  
  return children;
}
```

### Complete Example: Node.js/Express Backend

```javascript
// auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const CENTRAL_AUTH_URL = 'https://auth.ainsemble.com';
const JWKS_URL = `${CENTRAL_AUTH_URL}/.well-known/jwks.json`;

const client = jwksClient({
  jwksUri: JWKS_URL,
  cache: true,
  cacheMaxAge: 3600000,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function validateToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: CENTRAL_AUTH_URL,
        audience: 'spoke-applications',
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });
}

// Middleware
async function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || 
                req.query.token;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const user = await validateToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Routes
app.get('/auth/login', (req, res) => {
  const params = new URLSearchParams({
    client_id: 'my-express-app',
    redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
    provider: 'microsoft',
  });
  res.redirect(`${CENTRAL_AUTH_URL}/auth/login?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.redirect('/login?error=no_token');
  }
  
  try {
    const user = await validateToken(token);
    // Set token in HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.redirect('/dashboard');
  } catch (error) {
    res.redirect('/login?error=invalid_token');
  }
});

app.get('/api/me', authenticateJWT, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      roles: req.user.roles,
      groups: req.user.groups,
    }
  });
});

app.get('/api/admin', authenticateJWT, (req, res) => {
  if (!req.user.roles?.includes('Admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json({ message: 'Admin resource' });
});
```

---

## Configuration

### Required Configuration

**1. Central Auth URL:**
```
Production: https://auth.ainsemble.com
Staging: https://auth-staging.ainsemble.com
Development: http://localhost:3000
```

**2. JWKS Endpoint:**
```
https://auth.ainsemble.com/.well-known/jwks.json
```

**3. JWT Validation Settings:**
```javascript
{
  issuer: 'https://auth.ainsemble.com',
  audience: 'spoke-applications',
  algorithms: ['RS256']
}
```

### Optional Configuration

**Token Storage:**
- **Browser:** `localStorage` (simple) or `httpOnly` cookies (more secure)
- **Mobile:** Secure storage (Keychain/Keystore)
- **Backend:** Session storage or database

**Token Refresh:**
- Tokens expire after 15 minutes (configurable)
- Implement token refresh logic if needed
- Or redirect to login when token expires

---

## Testing

### Test Your Integration

**1. Test Login Flow:**
```bash
# Open in browser
https://auth.ainsemble.com/auth/login?client_id=test&redirect_uri=https://your-app.com/callback&provider=microsoft
```

**2. Verify JWT:**
```bash
# After receiving token, decode it
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq
```

**3. Test Protected Endpoints:**
```bash
# With token in header
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-app.com/api/protected

# Or with token in query
curl "https://your-app.com/api/protected?token=YOUR_TOKEN"
```

### Use Example Spoke App

The repository includes a complete example:
```bash
cd examples
node spoke-app-server.js
# Open http://localhost:3001
```

---

## Troubleshooting

### Common Issues

**1. "Invalid redirect_uri"**
- **Cause:** Your callback URL is not in the allowlist
- **Fix:** Contact admin to add your callback URL

**2. "Token validation failed"**
- **Cause:** Token expired, invalid signature, or wrong issuer/audience
- **Fix:** Check token expiration, verify JWKS endpoint is accessible

**3. "Session expired or invalid"**
- **Cause:** More than 10 minutes between login and callback
- **Fix:** Complete authentication flow quickly, or implement session refresh

**4. "CORS error"**
- **Cause:** Your origin is not in the allowlist
- **Fix:** Contact admin to add your origin to `ALLOWED_ORIGINS`

### Debug Checklist

- [ ] Central Auth service is running
- [ ] Your callback URL is registered
- [ ] JWKS endpoint is accessible
- [ ] Token is being received in callback
- [ ] JWT validation is working
- [ ] User info is extracted correctly

### Get Help

- Check logs: `pm2 logs central-auth` (on server)
- Review documentation: `docs/` folder
- Contact: Your team's DevOps/admin

---

## Security Best Practices

### ✅ Do

- **Validate tokens** on every request
- **Use HTTPS** in production
- **Store tokens securely** (httpOnly cookies preferred)
- **Check token expiration** before using
- **Verify issuer and audience** in validation
- **Implement role/group checks** for authorization

### ❌ Don't

- **Don't trust client-side validation only** - Always validate on backend
- **Don't store tokens in localStorage** for sensitive apps (use httpOnly cookies)
- **Don't skip signature verification** - Always verify with JWKS
- **Don't expose private keys** - JWKS provides public keys automatically
- **Don't ignore token expiration** - Check `exp` claim

---

## API Reference

### Login Endpoint

**URL:** `GET /auth/login`

**Query Parameters:**
- `client_id` (required): Your application identifier
- `redirect_uri` (required): Your callback URL (must be in allowlist)
- `provider` (optional): `microsoft` or `google` (default: `microsoft`)

**Response:** Redirects to identity provider

**Example:**
```
https://auth.ainsemble.com/auth/login?client_id=my-app&redirect_uri=https://my-app.com/callback&provider=microsoft
```

### Callback Endpoint

**URL:** `GET /auth/callback`

**Query Parameters (from IdP):**
- `code`: Authorization code
- `state`: State parameter for CSRF protection

**Response:** Redirects to your `redirect_uri` with:
- `token`: JWT token
- `state`: Echoed state parameter

**Example:**
```
https://my-app.com/callback?token=eyJhbGc...&state=xyz123
```

### JWKS Endpoint

**URL:** `GET /.well-known/jwks.json`

**Response:** JSON Web Key Set for JWT verification

**Example:**
```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-id",
      "use": "sig",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

---

## Logout Implementation

### Overview

Since Central Auth uses **stateless JWTs**, logout is primarily handled by removing the token on the client side. Central Auth provides logout endpoints to optionally clear the IdP session.

### Simple Logout (Client-Side Only)

```javascript
function logout() {
  // Remove token
  localStorage.removeItem('auth_token');
  // Redirect to login
  window.location.href = '/login';
}
```

### Full Logout (with IdP Session Clearing)

```javascript
function logout() {
  // Remove token
  localStorage.removeItem('auth_token');
  
  // Redirect to Central Auth logout
  const postLogoutUrl = encodeURIComponent(window.location.origin + '/login');
  window.location.href = `https://auth.ainsemble.com/auth/logout?` +
    `post_logout_redirect_uri=${postLogoutUrl}&` +
    `provider=microsoft`;
}
```

**Logout Endpoints:**
- **Full logout:** `GET /auth/logout?post_logout_redirect_uri=xxx&provider=microsoft`
- **Simple logout:** `GET /auth/logout/simple?post_logout_redirect_uri=xxx`

For detailed logout implementation, see [Logout Implementation Guide](./LOGOUT-IMPLEMENTATION.md).

## Support

For integration help:
1. Check this guide first
2. Review example code in `examples/` folder
3. Check troubleshooting docs in `docs/` folder
4. Contact your team's DevOps/admin

---

## Quick Reference

**Central Auth URL:** `https://auth.ainsemble.com`  
**JWKS Endpoint:** `https://auth.ainsemble.com/.well-known/jwks.json`  
**Issuer:** `https://auth.ainsemble.com`  
**Audience:** `spoke-applications`  
**Algorithm:** `RS256`  
**Token Expiration:** 15 minutes  

**Example Login URL:**
```
https://auth.ainsemble.com/auth/login?client_id=your-app&redirect_uri=https://your-app.com/callback&provider=microsoft
```

**JWT Claims:**
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "name": "User Name",
  "roles": ["Admin"],
  "groups": ["Finance"],
  "tenant": "tenant-id",
  "iat": 1234567890,
  "exp": 1234567890
}
```
