/**
 * Shared Session Store
 * 
 * This module provides a shared in-memory session store for OAuth flows.
 * In production, replace this with Redis or another persistent store.
 */

export interface SessionData {
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
  provider: 'microsoft' | 'google';
  createdAt: number;
}

// Shared session store (use Redis in production)
const sessionStore = new Map<string, SessionData>();

// Session expiration time (10 minutes)
const SESSION_EXPIRATION_MS = 10 * 60 * 1000;

/**
 * Store session data
 */
export function setSession(state: string, data: Omit<SessionData, 'createdAt'>): void {
  sessionStore.set(state, {
    ...data,
    createdAt: Date.now(),
  });
  
  console.log(`[SESSION] Stored session for state: ${state.substring(0, 8)}..., provider: ${data.provider}`);
}

/**
 * Get session data
 */
export function getSession(state: string): SessionData | undefined {
  const session = sessionStore.get(state);
  
  if (!session) {
    console.warn(`[SESSION] Session not found for state: ${state.substring(0, 8)}...`);
    return undefined;
  }
  
  // Check if session has expired
  const now = Date.now();
  const age = now - session.createdAt;
  
  if (age > SESSION_EXPIRATION_MS) {
    console.warn(`[SESSION] Session expired for state: ${state.substring(0, 8)}... (age: ${Math.floor(age / 1000)}s)`);
    sessionStore.delete(state);
    return undefined;
  }
  
  console.log(`[SESSION] Retrieved session for state: ${state.substring(0, 8)}..., provider: ${session.provider}`);
  return session;
}

/**
 * Delete session data
 */
export function deleteSession(state: string): void {
  const deleted = sessionStore.delete(state);
  if (deleted) {
    console.log(`[SESSION] Deleted session for state: ${state.substring(0, 8)}...`);
  }
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [state, session] of sessionStore.entries()) {
    if (now - session.createdAt > SESSION_EXPIRATION_MS) {
      sessionStore.delete(state);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[SESSION] Cleaned up ${cleaned} expired sessions`);
  }
}

/**
 * Get session store size (for debugging)
 */
export function getSessionCount(): number {
  return sessionStore.size;
}

// Clean up expired sessions every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
