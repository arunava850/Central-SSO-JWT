/**
 * Token Store for exchange codes and refresh tokens.
 * In production, replace with Redis or a persistent store.
 */

import { randomBytes } from 'crypto';
import { config } from '../config';
import type { JWTPayloadInput } from '../jwt/jwt.service';

/** Data stored for a one-time exchange code */
export interface ExchangeCodeData {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  clientId: string;
  createdAt: number;
}

/** Payload used to re-issue JWT from refresh token (same shape as JWT custom claims) */
export type RefreshTokenPayload = JWTPayloadInput;

/** Stored refresh token entry */
export interface RefreshTokenData {
  payload: RefreshTokenPayload;
  createdAt: number;
}

const exchangeStore = new Map<string, ExchangeCodeData>();
const refreshStore = new Map<string, RefreshTokenData>();
const signupStore = new Map<string, { continuationToken: string; createdAt: number }>();
const postOtpStore = new Map<string, { continuationToken: string; createdAt: number }>();
const resetPasswordStartStore = new Map<string, { continuationToken: string; createdAt: number }>();
const resetPasswordPostOtpStore = new Map<string, { continuationToken: string; createdAt: number }>();

// Exchange code: short-lived, one-time use (5 minutes)
const EXCHANGE_CODE_TTL_MS = 5 * 60 * 1000;
// Signup continuation token: 10 minutes TTL
const SIGNUP_TOKEN_TTL_MS = 10 * 60 * 1000;
// Password reset: 10 minutes for start token, 10 minutes for post-OTP token (Entra submit)
const RESET_PASSWORD_TOKEN_TTL_MS = 10 * 60 * 1000;
function getRefreshTokenTTL(): number {
  return config.refreshTokenExpirationDays * 24 * 60 * 60 * 1000;
}

function generateOpaqueToken(prefix: string, bytes = 32): string {
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`;
}

/**
 * Create an exchange code and store access token + optional refresh token.
 * Returns the one-time code to return in the redirect.
 */
export function createExchangeCode(
  accessToken: string,
  clientId: string,
  expiresInSeconds: number,
  refreshToken: string | null
): string {
  const code = generateOpaqueToken('ec');
  exchangeStore.set(code, {
    accessToken,
    refreshToken,
    expiresIn: expiresInSeconds,
    clientId,
    createdAt: Date.now(),
  });
  return code;
}

/**
 * Consume an exchange code and return stored tokens. Code is invalidated after use.
 */
export function consumeExchangeCode(
  code: string,
  clientId: string
): { accessToken: string; refreshToken: string | null; expiresIn: number } | null {
  const data = exchangeStore.get(code);
  exchangeStore.delete(code);

  if (!data) return null;
  if (Date.now() - data.createdAt > EXCHANGE_CODE_TTL_MS) return null;
  if (data.clientId !== clientId) return null;

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  };
}

/**
 * Create a refresh token and store payload for later JWT issuance.
 */
export function createRefreshToken(payload: JWTPayloadInput): string {
  const token = generateOpaqueToken('rt');
  refreshStore.set(token, {
    payload,
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Consume a refresh token and return the payload. Optionally rotate (delete and re-issue).
 */
export function consumeRefreshToken(
  token: string,
  rotate: boolean
): RefreshTokenPayload | null {
  const data = refreshStore.get(token);
  if (rotate) refreshStore.delete(token);

  if (!data) return null;
  const ttl = getRefreshTokenTTL();
  if (Date.now() - data.createdAt > ttl) return null;

  return data.payload;
}

/**
 * Store continuation token for sign-up flow (keyed by email).
 * TTL: 10 minutes.
 */
export function storeSignupContinuationToken(email: string, continuationToken: string): void {
  signupStore.set(email.toLowerCase().trim(), {
    continuationToken,
    createdAt: Date.now(),
  });
}

/**
 * Get and consume sign-up continuation token (one-time use).
 * Returns null if not found or expired.
 */
export function getSignupContinuationToken(email: string): string | null {
  const key = email.toLowerCase().trim();
  const data = signupStore.get(key);
  signupStore.delete(key); // Consume on read

  if (!data) return null;
  if (Date.now() - data.createdAt > SIGNUP_TOKEN_TTL_MS) return null;

  return data.continuationToken;
}

/**
 * Store post-OTP continuation token for signup/submit-password (keyed by email).
 * TTL: 10 minutes (same as signup).
 */
export function storePostOtpContinuationToken(email: string, continuationToken: string): void {
  postOtpStore.set(email.toLowerCase().trim(), {
    continuationToken,
    createdAt: Date.now(),
  });
}

/**
 * Get and consume post-OTP continuation token (one-time use).
 * Returns null if not found or expired.
 */
export function getPostOtpContinuationToken(email: string): string | null {
  const key = email.toLowerCase().trim();
  const data = postOtpStore.get(key);
  postOtpStore.delete(key); // Consume on read

  if (!data) return null;
  if (Date.now() - data.createdAt > SIGNUP_TOKEN_TTL_MS) return null;

  return data.continuationToken;
}

/**
 * Store continuation token for password-reset/start (after challenge). Keyed by email. TTL: 10 minutes.
 */
export function storeResetPasswordStartToken(email: string, continuationToken: string): void {
  resetPasswordStartStore.set(email.toLowerCase().trim(), {
    continuationToken,
    createdAt: Date.now(),
  });
}

/**
 * Get and consume password-reset start continuation token (one-time use). Returns null if not found or expired.
 */
export function getResetPasswordStartToken(email: string): string | null {
  const key = email.toLowerCase().trim();
  const data = resetPasswordStartStore.get(key);
  resetPasswordStartStore.delete(key);

  if (!data) return null;
  if (Date.now() - data.createdAt > RESET_PASSWORD_TOKEN_TTL_MS) return null;

  return data.continuationToken;
}

/**
 * Store continuation token for password-reset/submit-password (after verify-otp /continue). Keyed by email. TTL: 10 minutes.
 */
export function storeResetPasswordPostOtpToken(email: string, continuationToken: string): void {
  resetPasswordPostOtpStore.set(email.toLowerCase().trim(), {
    continuationToken,
    createdAt: Date.now(),
  });
}

/**
 * Get and consume password-reset post-OTP continuation token (one-time use). Returns null if not found or expired.
 */
export function getResetPasswordPostOtpToken(email: string): string | null {
  const key = email.toLowerCase().trim();
  const data = resetPasswordPostOtpStore.get(key);
  resetPasswordPostOtpStore.delete(key);

  if (!data) return null;
  if (Date.now() - data.createdAt > RESET_PASSWORD_TOKEN_TTL_MS) return null;

  return data.continuationToken;
}

/**
 * Clean up expired exchange codes, refresh tokens, signup tokens, post-OTP tokens, and password-reset tokens.
 */
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  let exchangeCleaned = 0;
  let refreshCleaned = 0;
  let signupCleaned = 0;
  let postOtpCleaned = 0;
  let resetStartCleaned = 0;
  let resetPostOtpCleaned = 0;

  for (const [code, data] of exchangeStore.entries()) {
    if (now - data.createdAt > EXCHANGE_CODE_TTL_MS) {
      exchangeStore.delete(code);
      exchangeCleaned++;
    }
  }

  const refreshTtl = getRefreshTokenTTL();
  for (const [token, data] of refreshStore.entries()) {
    if (now - data.createdAt > refreshTtl) {
      refreshStore.delete(token);
      refreshCleaned++;
    }
  }

  for (const [email, data] of signupStore.entries()) {
    if (now - data.createdAt > SIGNUP_TOKEN_TTL_MS) {
      signupStore.delete(email);
      signupCleaned++;
    }
  }

  for (const [email, data] of postOtpStore.entries()) {
    if (now - data.createdAt > SIGNUP_TOKEN_TTL_MS) {
      postOtpStore.delete(email);
      postOtpCleaned++;
    }
  }

  for (const [email, data] of resetPasswordStartStore.entries()) {
    if (now - data.createdAt > RESET_PASSWORD_TOKEN_TTL_MS) {
      resetPasswordStartStore.delete(email);
      resetStartCleaned++;
    }
  }

  for (const [email, data] of resetPasswordPostOtpStore.entries()) {
    if (now - data.createdAt > RESET_PASSWORD_TOKEN_TTL_MS) {
      resetPasswordPostOtpStore.delete(email);
      resetPostOtpCleaned++;
    }
  }

  if (exchangeCleaned > 0 || refreshCleaned > 0 || signupCleaned > 0 || postOtpCleaned > 0 || resetStartCleaned > 0 || resetPostOtpCleaned > 0) {
    console.log(`[TOKEN_STORE] Cleaned ${exchangeCleaned} exchange, ${refreshCleaned} refresh, ${signupCleaned} signup, ${postOtpCleaned} post-OTP, ${resetStartCleaned} reset-start, ${resetPostOtpCleaned} reset-post-OTP`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);
