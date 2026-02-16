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

// Exchange code: short-lived, one-time use (5 minutes)
const EXCHANGE_CODE_TTL_MS = 5 * 60 * 1000;
// Signup continuation token: 10 minutes TTL
const SIGNUP_TOKEN_TTL_MS = 10 * 60 * 1000;
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
 * Clean up expired exchange codes, refresh tokens, and signup tokens.
 */
export function cleanupExpiredTokens(): void {
  const now = Date.now();
  let exchangeCleaned = 0;
  let refreshCleaned = 0;
  let signupCleaned = 0;

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

  if (exchangeCleaned > 0 || refreshCleaned > 0 || signupCleaned > 0) {
    console.log(`[TOKEN_STORE] Cleaned ${exchangeCleaned} exchange codes, ${refreshCleaned} refresh tokens, ${signupCleaned} signup tokens`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredTokens, 5 * 60 * 1000);
