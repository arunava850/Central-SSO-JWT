# Logout Implementation Guide

## Overview

Since Central Auth uses **stateless JWTs**, logout is primarily handled by removing the token on the client side. However, Central Auth provides logout endpoints to optionally clear the IdP (Identity Provider) session.

## Logout Scenarios

### Scenario 1: Client-Side Only (Simple)

**When to use:** When you only need to remove the JWT token from your application.

**Implementation:**
```javascript
function logout() {
  // Remove token from storage
  localStorage.removeItem('auth_token');
  // Or remove from cookie/session
  // Redirect to login or home page
  window.location.href = '/login';
}
```

**Pros:**
- Simple and fast
- No server call needed
- Works immediately

**Cons:**
- IdP session remains active (user stays logged in at Microsoft/Google)
- User can get a new token without re-entering credentials

### Scenario 2: IdP Session Clearing (Recommended)

**When to use:** When you want to completely log the user out, including their IdP session.

**Implementation:**
```javascript
function logout() {
  const postLogoutUrl = encodeURIComponent(window.location.origin + '/login');
  const provider = 'microsoft'; // or 'google'
  
  // Redirect to Central Auth logout endpoint
  window.location.href = `https://auth.ainsemble.com/auth/logout?` +
    `post_logout_redirect_uri=${postLogoutUrl}&` +
    `provider=${provider}`;
}
```

**Flow:**
1. Your app redirects to Central Auth logout
2. Central Auth redirects to IdP logout endpoint
3. IdP clears its session
4. IdP redirects back to your `post_logout_redirect_uri`

**Pros:**
- Complete logout (IdP session cleared)
- User must re-authenticate to get new token
- Better security

**Cons:**
- Requires redirect through IdP
- Slightly slower

## Central Auth Logout Endpoints

### Full Logout (with IdP Session Clearing)

**Endpoint:** `GET /auth/logout`

**Query Parameters:**
- `post_logout_redirect_uri` (optional): Where to redirect after logout
- `provider` (optional): `microsoft` or `google` (default: `microsoft`)

**Example:**
```
https://auth.ainsemble.com/auth/logout?post_logout_redirect_uri=https://your-app.com/login&provider=microsoft
```

**Behavior:**
- Redirects to Microsoft/Google logout endpoint
- Clears IdP session
- Redirects back to `post_logout_redirect_uri`

### Simple Logout (No IdP Session Clearing)

**Endpoint:** `GET /auth/logout/simple`

**Query Parameters:**
- `post_logout_redirect_uri` (optional): Where to redirect after logout

**Example:**
```
https://auth.ainsemble.com/auth/logout/simple?post_logout_redirect_uri=https://your-app.com/login
```

**Behavior:**
- Immediately redirects to `post_logout_redirect_uri`
- Does NOT clear IdP session
- Use when you only need to remove the JWT token

## Integration Examples

### React Application

```javascript
// AuthService.js
export function logout(clearIdPSession = true) {
  // Remove token from storage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  
  if (clearIdPSession) {
    // Redirect to Central Auth logout (clears IdP session)
    const postLogoutUrl = encodeURIComponent(window.location.origin + '/login');
    const provider = localStorage.getItem('auth_provider') || 'microsoft';
    
    window.location.href = `https://auth.ainsemble.com/auth/logout?` +
      `post_logout_redirect_uri=${postLogoutUrl}&` +
      `provider=${provider}`;
  } else {
    // Simple logout - just redirect to login
    window.location.href = '/login';
  }
}

// Usage in component
function LogoutButton() {
  const handleLogout = () => {
    logout(true); // true = clear IdP session
  };
  
  return <button onClick={handleLogout}>Logout</button>;
}
```

### Node.js/Express

```javascript
// Logout route
app.get('/logout', (req, res) => {
  // Clear session/cookie
  req.session.destroy();
  res.clearCookie('auth_token');
  
  // Option 1: Simple logout (no IdP session clearing)
  res.redirect('/login');
  
  // Option 2: Full logout (clear IdP session)
  // const postLogoutUrl = encodeURIComponent(`${req.protocol}://${req.get('host')}/login`);
  // const provider = req.session?.provider || 'microsoft';
  // res.redirect(`https://auth.ainsemble.com/auth/logout?post_logout_redirect_uri=${postLogoutUrl}&provider=${provider}`);
});

// Or handle logout via Central Auth endpoint
app.get('/auth/logout', (req, res) => {
  // Clear local session
  req.session.destroy();
  res.clearCookie('auth_token');
  
  // Redirect to Central Auth logout
  const postLogoutUrl = encodeURIComponent(`${req.protocol}://${req.get('host')}/login`);
  const provider = req.query.provider || 'microsoft';
  
  res.redirect(`https://auth.ainsemble.com/auth/logout?post_logout_redirect_uri=${postLogoutUrl}&provider=${provider}`);
});
```

### Python/Flask

```python
from flask import session, redirect, url_for, request
from urllib.parse import urlencode

@app.route('/logout')
def logout():
    # Clear session
    session.clear()
    
    # Option 1: Simple logout
    return redirect(url_for('login'))
    
    # Option 2: Full logout (clear IdP session)
    # post_logout_url = url_for('login', _external=True)
    # provider = session.get('provider', 'microsoft')
    # logout_url = f"https://auth.ainsemble.com/auth/logout?{urlencode({
    #     'post_logout_redirect_uri': post_logout_url,
    #     'provider': provider
    # })}"
    # return redirect(logout_url)
```

## Important Considerations

### Stateless JWTs

**Key Point:** JWTs are stateless - once issued, they cannot be "revoked" server-side until they expire.

**Implications:**
- Removing the token from the client is the primary logout mechanism
- IdP logout clears the IdP session, preventing new tokens without re-authentication
- Existing tokens remain valid until expiration (15 minutes by default)

### Token Expiration

Tokens expire after **15 minutes** (configurable). After expiration:
- Token validation will fail
- User must re-authenticate
- This provides automatic "logout" after inactivity

### Security Best Practices

1. **Always remove token on logout** - Don't rely only on IdP logout
2. **Use httpOnly cookies** - More secure than localStorage
3. **Validate token expiration** - Check `exp` claim before using token
4. **Clear IdP session for sensitive apps** - Use full logout endpoint
5. **Handle token expiration** - Redirect to login when token expires

## Logout Flow Diagrams

### Simple Logout Flow

```
User clicks logout
    ↓
Remove JWT token (localStorage/cookie)
    ↓
Redirect to login page
```

### Full Logout Flow (with IdP)

```
User clicks logout
    ↓
Remove JWT token (localStorage/cookie)
    ↓
Redirect to: https://auth.ainsemble.com/auth/logout?post_logout_redirect_uri=...
    ↓
Central Auth redirects to: Microsoft/Google logout endpoint
    ↓
IdP clears session
    ↓
IdP redirects to: post_logout_redirect_uri
    ↓
User is on your login page (fully logged out)
```

## Testing Logout

### Test Simple Logout

```javascript
// 1. User is authenticated (has token)
// 2. Call logout function
logout(false); // false = simple logout
// 3. Verify token is removed
// 4. Verify user is redirected to login
// 5. Try to access protected resource - should fail
```

### Test Full Logout

```javascript
// 1. User is authenticated (has token)
// 2. Call logout function
logout(true); // true = full logout
// 3. Verify redirect to Central Auth
// 4. Verify redirect to IdP logout
// 5. Verify redirect back to your app
// 6. Try to login again - should require credentials
```

## Troubleshooting

### Issue: User can still access after logout

**Cause:** Token still in storage or not removed properly

**Fix:**
```javascript
// Ensure token is removed from all storage locations
localStorage.removeItem('auth_token');
sessionStorage.removeItem('auth_token');
// Clear cookies
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
```

### Issue: IdP logout not working

**Cause:** Wrong provider parameter or IdP endpoint issue

**Fix:**
- Verify `provider` parameter matches the provider used for login
- Check Central Auth logs for logout redirect URL
- Verify `post_logout_redirect_uri` is properly encoded

### Issue: Redirect loop after logout

**Cause:** `post_logout_redirect_uri` points to a protected route

**Fix:**
- Ensure `post_logout_redirect_uri` points to a public route (login page)
- Don't redirect to routes that require authentication

## Recommendations

### For Most Applications

**Use simple logout** (client-side only):
- Faster user experience
- Sufficient for most use cases
- Tokens expire in 15 minutes anyway

### For High-Security Applications

**Use full logout** (with IdP session clearing):
- Banking, healthcare, government apps
- When you need to ensure complete logout
- When compliance requires IdP session termination

### Hybrid Approach

**Use both based on context:**
```javascript
function logout(forceFullLogout = false) {
  // Always remove token
  localStorage.removeItem('auth_token');
  
  // Full logout for sensitive operations
  if (forceFullLogout || isSensitiveOperation()) {
    redirectToCentralAuthLogout();
  } else {
    // Simple logout for regular use
    window.location.href = '/login';
  }
}
```

## Summary

- ✅ **Logout is implemented** in Central Auth
- ✅ **Two endpoints available**: `/auth/logout` (full) and `/auth/logout/simple` (simple)
- ✅ **Client-side token removal** is the primary mechanism
- ✅ **IdP session clearing** is optional but recommended for security
- ✅ **Tokens expire automatically** after 15 minutes

Choose the logout method that best fits your security requirements!
