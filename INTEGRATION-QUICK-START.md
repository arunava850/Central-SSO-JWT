# Quick Start: Integrate Your App with Central Auth

**5-minute integration guide for developers**

## Step 1: Register Your App

Contact your admin to add your callback URL:
```
https://your-app.com/auth/callback
```

## Step 2: Redirect to Login

When user needs to authenticate:

```javascript
const loginUrl = `https://auth.ainsemble.com/auth/login?` +
  `client_id=your-app&` +
  `redirect_uri=${encodeURIComponent('https://your-app.com/auth/callback')}&` +
  `provider=microsoft`;

window.location.href = loginUrl;
```

## Step 3: Handle Callback

On your callback page (`/auth/callback`):

```javascript
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
  // Store token
  localStorage.setItem('auth_token', token);
  // Validate and use token
}
```

## Step 4: Validate JWT

Install dependencies:
```bash
npm install jsonwebtoken jwks-rsa
```

Validate token:
```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: 'https://auth.ainsemble.com/.well-known/jwks.json',
  cache: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    callback(null, key.getPublicKey());
  });
}

jwt.verify(token, getKey, {
  algorithms: ['RS256'],
  issuer: 'https://auth.ainsemble.com',
  audience: 'spoke-applications',
}, (err, decoded) => {
  if (err) {
    // Invalid token
  } else {
    // Token valid, use decoded.user
    console.log('User:', decoded.email);
    console.log('Roles:', decoded.roles);
  }
});
```

## That's It! 🎉

Your app is now integrated with Central Auth.

## Password reset (Entra native)

For apps using Entra External ID native auth (email/password), password reset is a 3-step flow:

1. **POST /auth/password-reset/start** – body `{ "email": "user@example.com" }` → sends OTP to email.
2. **POST /auth/password-reset/verify-otp** – body `{ "email", "code" }` → verifies OTP.
3. **POST /auth/password-reset/submit-password** – body `{ "email", "new_password" }` → updates password and returns the same token response as sign-in (`access_token`, `refresh_token`, `journey_status`, `person_id`, `refresh_expiry_time`) so the user stays logged in.

See `docs/AUTHENTICATION-FLOWS.md` § 2.3 for details.

## Next Steps

- See [Complete Integration Guide](./docs/INTEGRATION-GUIDE.md) for detailed examples
- Check [Example Spoke App](./examples/) for working code
- Review [Testing Guide](./docs/TESTING-AUTHENTICATION.md) to verify integration

## Need Help?

- **Integration Guide:** `docs/INTEGRATION-GUIDE.md`
- **Examples:** `examples/` folder
- **Troubleshooting:** `docs/` folder
