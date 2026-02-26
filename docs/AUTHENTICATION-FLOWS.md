# Central Auth – Authentication Flows

This document describes how authentication works in this codebase: the **redirect (OAuth) flow** and the **Entra Native API** flows (password login and sign-up).

---

## 1. Redirect (OAuth) Flow

Used when a **spoke app** sends the user to Central Auth in the browser. The user signs in at Entra ID or Google and is sent back with a one-time code that the spoke app exchanges for a JWT.

### 1.1 Entry Point

- **Route:** `GET /auth/login`
- **Query:** `client_id`, `redirect_uri`, optional `provider=microsoft|google`
- **Handler:** `src/auth/login.controller.ts` → `login()`

### 1.2 Flow Steps

1. **Validate and store session**
   - Validate `client_id` and `redirect_uri` (must be in `config.redirectUris`).
   - Generate PKCE: `code_verifier`, `code_challenge` (base64url random).
   - Generate `state` (CSRF) and `nonce` (ID token).
   - Call `setSession(state, { codeVerifier, nonce, redirectUri, provider, clientId })`  
     (`src/auth/session.store.ts`). Session TTL 10 minutes.
   - Set cookie `auth_state=state` (httpOnly, secure if HTTPS, sameSite: lax).

2. **Redirect to IdP**
   - **Microsoft:** `msalService.getAuthCodeUrl(baseUrl/auth/callback, state, codeVerifier, nonce)`  
     → redirect to Entra ID consent/login.
   - **Google:** `googleService.getAuthUrl(state, codeVerifier)`  
     → redirect to Google consent/login.
   - User signs in at the IdP; IdP redirects back to Central Auth.

3. **Callback**
   - **Route:** `GET /auth/callback?code=...&state=...`
   - **Handler:** `src/auth/callback.controller.ts` → `callback()`
   - Validate `state` (cookie `auth_state` must match query `state`).
   - Load session with `getSession(state)`; if missing/expired → 400 “Session expired or invalid”.
   - `deleteSession(state)` and clear `auth_state` cookie.
   - **Provider from session** (not from query):
     - **Google:** exchange `code` for tokens via Google, get user info.
     - **Microsoft:** `msalService.acquireTokenByCode(code, callbackUrl, sessionData.codeVerifier)`; then user info from Graph (or ID token claims if Graph fails).
   - Build `userInfo`: objectId, email, name, roles, groups (and persona from ID token for Microsoft).

4. **DB and JWT**
   - `getClaimsByEmail(userInfo.email)`.
   - If null → `syncPersonFromEntra(objectId, email, name, personaCode)`  
     (insert `subject.person` + `subject.persona_assignment`), then `getClaimsByEmail` again.
   - `buildUserClaims(idpUser, apiClaims)` → JWT payload.
   - `jwtService.sign(jwtPayload)` → platform access token.
   - `createRefreshToken(jwtPayload)`.
   - `createExchangeCode(accessToken, clientId, expiresIn, refreshToken)` → one-time `exchange_code` (5 min TTL).

5. **Redirect to spoke app**
   - Redirect to `sessionData.redirectUri?code=<exchange_code>&state=<state>`.
   - Spoke app must not use the code in the URL for sensitive operations; it should exchange it server-side.

6. **Spoke app gets tokens**
   - **Route:** `POST /auth/token/exchange`
   - **Body:** `{ exchange_code, client_id }`
   - **Handler:** `src/auth/token.controller.ts` → `exchangeToken()`
   - `consumeExchangeCode(code, clientId)` (one-time use); return `access_token`, `expires_in`, optional `refresh_token`.

### 1.3 Relevant Files

- `src/auth/login.controller.ts` – login, session storage, redirect to IdP
- `src/auth/session.store.ts` – session by state
- `src/auth/callback.controller.ts` – code exchange, user resolution, DB sync, JWT, exchange code, redirect
- `src/auth/token.controller.ts` – exchange code → access_token
- `src/auth/msal.service.ts` / `src/auth/google.service.ts` – IdP URLs and token exchange

---

## 2. Entra Native API Flows

Used with **Entra External ID (CIAM)** (`*.ciamlogin.com`). No browser redirect to Entra; the app sends username/password or sign-up data to Central Auth, which talks to Entra’s native APIs and then issues the same platform JWT. Requires `ENTRA_TENANT_NAME` in config.

### 2.1 Password Login (Existing Users)

- **Route:** `POST /auth/token/password`
- **Body:** `username`, `password`
- **Handler:** `src/auth/password.controller.ts` → `passwordToken()`

**Flow:**

1. Validate `username` and `password`; ensure `getCiamBaseUrl()` is set (tenant name).
2. **Entra Native Auth (3 steps):**
   - **Initiate:** `POST {ciam}/oauth2/v2.0/initiate` with `challenge_type: 'password redirect'`, `username` → get `continuation_token`.
   - **Challenge:** `POST {ciam}/oauth2/v2.0/challenge` with that token → get new `continuation_token`.
   - **Token:** `POST {ciam}/oauth2/v2.0/token` with `grant_type: 'password'`, `password`, `continuation_token`, `scope: 'openid offline_access'` → get `id_token` (and optionally access/refresh).
3. Decode `id_token` → `userFromIdToken()`: objectId, email, name, persona. If email empty and `username` looks like email → use `username` as email.
4. `getClaimsByEmail(email)`; if null → `syncPersonFromEntra(...)`, then `getClaimsByEmail` again.
5. `buildUserClaims(idpUser, apiClaims)` → `jwtService.sign()` + `createRefreshToken()`.
6. Respond with `access_token`, `token_type: 'Bearer'`, `expires_in`, `refresh_token` (and `journey_status` if added).

**Relevant:** `src/auth/password.controller.ts`, `getCiamBaseUrl()` in that file (CIAM base URL from tenant name).

---

### 2.2 Sign-Up (New Users)

Two ways: **one-shot** (`/auth/signup/complete`) or **split** (`/auth/signup/verify-otp` then `/auth/signup/submit-password`).

#### 2.2.1 Start Sign-Up (Both Flows)

- **Route:** `POST /auth/signup/start`
- **Body:** `email`
- **Handler:** `src/auth/signup.controller.ts` → `signupStart()`

**Flow:**

1. Validate email; get CIAM base URL.
2. **Entra:** `POST {ciam}/signup/v1.0/start` with `challenge_type: 'oob password redirect'`, `username: email` → `continuation_token`.
3. **Entra:** `POST {ciam}/signup/v1.0/challenge` with that token → sends OTP to email; get new `continuation_token`.
4. `storeSignupContinuationToken(email, continuationToken)` (10 min TTL, keyed by email).
5. Respond with `message`, `email` (redacted), `journey_status`.

#### 2.2.2 One-Shot Complete

- **Route:** `POST /auth/signup/complete`
- **Body:** `email`, `code` (OTP), `password`, `displayName`, `role`
- **Handler:** `signupComplete()`

**Flow:**

1. Get continuation token: `getSignupContinuationToken(email)` (consumed).
2. **Entra:** `POST {ciam}/signup/v1.0/continue` with `grant_type: 'oob'`, `oob: code` → OTP verified; often `credential_required` with new token.
3. **Entra:** `POST .../continue` with `grant_type: 'password'`, `password` → may get `attributes_required` with token.
4. **Entra:** `POST .../continue` with `grant_type: 'attributes'`, `attributes: { displayName, Role }` (Role from config extension attribute).
5. **Entra:** `POST {ciam}/oauth2/v2.0/token` with `grant_type: 'continuation_token'`, `scope: 'openid offline_access'`, `username: email` → get `id_token`.
6. Decode `id_token` → user info; email/name fallback from body if needed.
7. `getClaimsByEmail` → if null `syncPersonFromEntra` then re-fetch.
8. `buildUserClaims` → `jwtService.sign` + `createRefreshToken`; respond with `access_token`, `expires_in`, `refresh_token`, `journey_status`.

#### 2.2.3 Split Flow: Verify OTP

- **Route:** `POST /auth/signup/verify-otp`
- **Body:** `email`, `code`
- **Handler:** `signupVerifyOtp()`

**Flow:**

1. `getSignupContinuationToken(email)` (consumed).
2. **Entra:** `POST {ciam}/signup/v1.0/continue` with `grant_type: 'oob'`, `oob: code`.
3. On success (or `credential_required` with new token): `storePostOtpContinuationToken(email, newContinuationToken)` (10 min TTL).
4. Respond with `ok: true`, `message: 'OTP verified. Proceed to submit password.'`, `journey_status`.

#### 2.2.4 Split Flow: Submit Password

- **Route:** `POST /auth/signup/submit-password`
- **Body:** `email`, `password`, `displayName`, `role`
- **Handler:** `signupSubmitPassword()`

**Flow:**

1. `getPostOtpContinuationToken(email)` (consumed).
2. Same as “one-shot complete” from step 3 onward: password → attributes → oauth2/token → decode id_token → DB sync → build claims → sign JWT + refresh token → respond with `access_token`, `expires_in`, `refresh_token`, `journey_status`.

**Relevant:** `src/auth/signup.controller.ts`, `src/auth/token.store.ts` (signup and post-OTP continuation tokens).

---

### 2.3 Password Reset (SSPR)

Self-service password reset using Entra External ID native SSPR API. Flow is split into three endpoints (same pattern as sign-up). **SSPR must be enabled** for customer users in the Entra External ID tenant.

#### 2.3.1 Start Password Reset

- **Route:** `POST /auth/password-reset/start`
- **Body:** `email`
- **Handler:** `src/auth/password-reset.controller.ts` → `passwordResetStart()`

**Flow:**

1. Validate email; get CIAM base URL.
2. **Entra:** `POST {ciam}/resetpassword/v1.0/start` with `challenge_type: 'oob redirect'`, `username: email` → `continuation_token`.
3. **Entra:** `POST {ciam}/resetpassword/v1.0/challenge` with that token → sends OTP to email; get new `continuation_token`.
4. `storeResetPasswordStartToken(email, continuationToken)` (10 min TTL).
5. Respond with `message`, `email` (redacted). On `user_not_found` or `challenge_type: 'redirect'` return 400.

#### 2.3.2 Verify OTP

- **Route:** `POST /auth/password-reset/verify-otp`
- **Body:** `email`, `code`
- **Handler:** `passwordResetVerifyOtp()`

**Flow:**

1. `getResetPasswordStartToken(email)` (consumed). If missing/expired → 401.
2. **Entra:** `POST {ciam}/resetpassword/v1.0/continue` with `grant_type: 'oob'`, `oob: code`.
3. On success: `storeResetPasswordPostOtpToken(email, newContinuationToken)` (10 min TTL).
4. Respond with `message: 'Code verified. Proceed to set new password.'`.

#### 2.3.3 Submit New Password

- **Route:** `POST /auth/password-reset/submit-password`
- **Body:** `email`, `new_password`
- **Handler:** `passwordResetSubmitPassword()`

**Flow:**

1. `getResetPasswordPostOtpToken(email)` (consumed). If missing/expired → 401.
2. **Entra:** `POST {ciam}/resetpassword/v1.0/submit` with `continuation_token`, `client_id`, `new_password` → password updated in Entra.
3. Sign user in with new password: same as `POST /auth/token/password` (initiate → challenge → token), then `getClaimsByEmail` / `syncPersonFromEntra`, `buildUserClaims`, `jwtService.sign`, `createRefreshToken`.
4. Respond with **the same structure as sign-up submit-password and sign-in:** `access_token`, `token_type`, `expires_in`, `refresh_token`, `journey_status`, `person_id`, `refresh_expiry_time`. The client can stay logged in after reset.

On Entra password policy errors (e.g. `password_too_weak`), return 400 with `error` / `suberror` / `error_description`.

**Relevant:** `src/auth/password-reset.controller.ts`, `src/auth/token.store.ts` (reset start and post-OTP tokens), `src/auth/password.controller.ts` (exports `nativeAuthSignIn`, `userFromIdToken` for sign-in after reset).

---

## 3. Shared Pieces (Both Options)

- **JWT:** `src/jwt/jwt.service.ts` – RS256, `config.jwtPrivateKey`, `config.jwtExpirationMinutes`, issuer/audience from config.
- **Claims:** `src/auth/claims.helper.ts` – `buildUserClaims(idpUser, apiClaims)` → payload for JWT (sub, identity, apps, aud).
- **DB claims:** `src/db/get-claims-by-email.ts` – load person/app/persona by `primary_email`.
- **DB sync:** `src/db/sync-person-from-entra.ts` – insert `subject.person` (ON CONFLICT entra_id DO NOTHING) and `subject.persona_assignment` by persona.
- **Refresh:** `POST /auth/token/refresh` – body `refresh_token`; consume and rotate, return new access_token + refresh_token (`src/auth/token.controller.ts`).
- **JWKS:** `GET /.well-known/jwks.json` – public keys for JWT verification (`src/jwt/jwks.controller.ts`).

---

## 4. Quick Comparison

| Aspect            | Redirect (OAuth)              | Entra Native (password/sign-up)   |
|------------------|--------------------------------|-----------------------------------|
| Entry             | GET /auth/login (browser)      | POST /auth/token/password or signup APIs |
| IdP               | Entra ID or Google (browser)   | Entra External ID only (CIAM)     |
| Config            | TENANT_ID, CLIENT_ID, etc.     | ENTRA_TENANT_NAME (CIAM)          |
| Session           | state + session store + cookie| No session; tokens in token store |
| Token to client   | Via exchange_code then /token/exchange | Direct in response body   |
| Person in DB      | On callback when no claims    | On password/signup when no claims |
