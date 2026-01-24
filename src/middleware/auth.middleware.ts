import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../jwt/jwt.service';

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

    // Attach user info to request
    (req as any).user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware to check if user has required role
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userRoles = user.roles || [];
    const hasRole = roles.some(role => userRoles.includes(role));

    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user is in required group
 */
export function requireGroup(...groups: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const userGroups = user.groups || [];
    const hasGroup = groups.some(group => userGroups.includes(group));

    if (!hasGroup) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
