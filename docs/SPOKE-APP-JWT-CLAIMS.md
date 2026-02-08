# Spoke App: New JWT Payload and Required Changes

The Central Auth service now issues JWTs with a **new claim structure**. Spoke applications must update validation and claim usage to match.

---

## 1. New JWT payload shape

Decoded tokens now look like this (standard claims plus custom `identity` and `apps`):

```json
{
  "iss": "ains-auth-service",
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "aud": ["key", "pulse", "beam"],
  "iat": 1738900000,
  "exp": 1739000000,
  "identity": {
    "email": "user@example.com",
    "status": "Active",
    "entra_uuid": "<32-char Entra object ID>",
    "Person_uuid": "<32-char person UUID>"
  },
  "apps": {
    "pulse": { "uid": "PULSE_99", "roles": ["PRODUCER"] },
    "key": { "uid": "KEY_UUID_1", "roles": ["ARTIST"] }
  }
}
```

| Claim      | Type     | Description |
|-----------|----------|-------------|
| `iss`     | string   | Issuer (e.g. `ains-auth-service` or `JWT_ISSUER`). |
| `sub`     | string   | Person ID (subject). |
| `aud`     | string[] | Audience list (e.g. `["key", "pulse", "beam"]`). |
| `iat`     | number   | Issued-at time (Unix seconds). |
| `exp`     | number   | Expiry time (Unix seconds). |
| `identity`| object   | User identity (email, status, Entra UUID, Person UUID). |
| `apps`    | object   | Per-app claims: each key is an app name, value is `{ uid, roles }`. |

---

## 2. What to change in the spoke app

### 2.1 Validation (issuer and audience)

- **Issuer**  
  Validate `payload.iss` against the Central Auth issuer (e.g. `ains-auth-service` or the value from your config).  
  Set this in the JWT verification options (e.g. `issuer: 'ains-auth-service'` or from env).

- **Audience**  
  `aud` is now an **array**. Your verification must allow array audience:
  - Either pass an array of allowed audiences so the library checks that the token’s `aud` contains at least one of them.
  - Or verify the token and then check that your app’s name is in `payload.aud`.

Example (Node with `jsonwebtoken` and `jwks-rsa`):

```javascript
const decoded = jwt.verify(token, getKey, {
  algorithms: ['RS256'],
  issuer: 'ains-auth-service',           // or process.env.JWT_ISSUER
  audience: ['key', 'pulse', 'beam'],    // or process.env.JWT_AUDIENCE.split(',')
});
```

### 2.2 Reading user identity

**Before (old payload):**

- `payload.sub` – Entra object ID  
- `payload.email`, `payload.name`  
- `payload.roles`, `payload.groups`, `payload.tenant`

**After (new payload):**

- **Subject:** `payload.sub` – person ID (use this as the stable user id).
- **Identity:** use `payload.identity`:
  - `payload.identity.email`
  - `payload.identity.status`
  - `payload.identity.entra_uuid` – Entra ID
  - `payload.identity.Person_uuid` – person UUID

Do **not** read `payload.email` or `payload.name`; they are no longer top-level. Use `payload.identity.email` (and add `payload.identity` to any TypeScript/interfaces).

### 2.3 Reading roles and app-specific data

**Before:** Top-level `payload.roles` and optionally `payload.groups`.

**After:** Per-app claims under `payload.apps`:

- For a given app (e.g. `pulse`, `key`), use `payload.apps[appName]`:
  - `payload.apps[appName].uid` – app-specific user id
  - `payload.apps[appName].roles` – roles in that app

Example:

```javascript
// Your app is "pulse"
const appName = 'pulse';
const appClaims = decoded.apps?.[appName];
if (!appClaims) {
  return res.status(403).json({ error: 'No access to this app' });
}
const { uid, roles } = appClaims;
// Check role
if (!roles.includes('PRODUCER')) {
  return res.status(403).json({ error: 'Insufficient role' });
}
```

Optional: to allow “any of these roles across any app”, collect all roles:

```javascript
const allRoles = Object.values(decoded.apps || {}).flatMap(a => a.roles || []);
```

### 2.4 Audience check for your app

Ensure the token is intended for your app by checking `aud`:

```javascript
const myAppName = 'pulse'; // or from config
if (!decoded.aud || !decoded.aud.includes(myAppName)) {
  return res.status(403).json({ error: 'Token not intended for this app' });
}
```

---

## 3. Summary checklist

| Area              | Change |
|-------------------|--------|
| **Issuer**        | Use new issuer (e.g. `ains-auth-service`) in verification options. |
| **Audience**      | Treat `aud` as array; pass array of allowed audiences or check `payload.aud.includes(yourApp)`. |
| **User ID**       | Use `payload.sub` as person id; use `payload.identity` for email, status, Entra UUID, Person UUID. |
| **Roles**         | Use `payload.apps[yourApp].roles` (and optionally `payload.apps[yourApp].uid`). |
| **Old claims**    | Stop using top-level `email`, `name`, `roles`, `groups`, `tenant`. |

JWKS URL and RS256 signature verification are unchanged; only the payload shape and the above validation/reading rules change.

---

## 4. Central Auth configuration (reference)

- **JWT_ISSUER** – Issuer value (default `ains-auth-service`). Spoke apps must use this in `iss` validation.
- **JWT_AUDIENCE** – Comma-separated audiences (e.g. `key,pulse,beam`). Spoke apps must validate that their app name is in `aud` or that the token’s `aud` is in the allowed list.
