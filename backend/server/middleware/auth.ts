import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

export interface AuthRequest extends Request {
    userId?: string;
    userEmail?: string;
    userRole?: string;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized – missing token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
        req.userId = decoded.id;
        req.userEmail = decoded.email;
        req.userRole = decoded.role;
        next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized – invalid or expired token' });
    }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
        if (req.userRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Forbidden – Admin access required' });
        }
        next();
    });
};
