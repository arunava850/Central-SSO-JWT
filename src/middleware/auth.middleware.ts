import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../jwt/jwt.service';
import type { JWTPayload } from '../jwt/jwt.service';

const jwtService = new JWTService();

/**
 * Middleware to verify JWT token from Authorization header
 */
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwtService.verify(token);

    (req as any).user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Collect all roles from payload.apps (all apps) */
function getAllRoles(user: JWTPayload): string[] {
  if (!user.apps) return [];
  return Object.values(user.apps).flatMap((a) => a.roles || []);
}

/**
 * Middleware to check if user has required role in any app
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload | undefined;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRoles = getAllRoles(user);
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user has required role in a specific app
 */
export function requireAppRole(appName: string, ...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload | undefined;

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const appClaims = user.apps?.[appName];
    const userRoles = appClaims?.roles ?? [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user is in required group (optional; payload may not include groups)
 */
export function requireGroup(...groups: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JWTPayload & { groups?: string[] };

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userGroups = (user as any).groups || [];
    const hasGroup = groups.some((group) => userGroups.includes(group));

    if (!hasGroup) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
