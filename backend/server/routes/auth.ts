import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── 1. REGISTER (Create Account) ────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, passwordHash }
        });

        // Auto-create default settings for new user
        await prisma.userSettings.create({ data: { userId: user.id } });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 2. LOGIN ─────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 3. FORGOT PASSWORD ──────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
            await prisma.authToken.create({ data: { token, expiresAt, type: 'RESET_PASSWORD', userId: user.id } });
            // In production: send email. For now log it.
            console.log(`[AUTH] Password reset link: ${FRONTEND_URL}?token=${token}&mode=reset-password`);
        }

        res.json({ message: 'If that email is registered, we have sent a password reset link.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 4. RESET PASSWORD ───────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });

        const authToken = await prisma.authToken.findUnique({ where: { token }, include: { user: true } });
        if (!authToken || authToken.type !== 'RESET_PASSWORD' || authToken.expiresAt < new Date()) {
            return res.status(401).json({ error: 'Invalid or expired reset link' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: authToken.userId }, data: { passwordHash } });
        await prisma.authToken.delete({ where: { id: authToken.id } });

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 5. REQUEST ACCESS ───────────────────────────────────────────────────────
router.post('/request-access', async (req, res) => {
    try {
        const { name, email, companyName, role, gender, password, reason } = req.body;
        if (!name || !email || !companyName || !role || !password || !reason) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const accessRequest = await prisma.accessRequest.create({
            data: { name, email, companyName, role, gender: gender || null, passwordHash, reason }
        });
        res.status(201).json({ message: 'Access request submitted successfully', id: accessRequest.id });
    } catch (err: any) {
        console.error('Request access error:', err);
        if (err.code === 'P2002') {
            return res.status(400).json({ error: 'An access request has already been submitted for this email.' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 6. GET CURRENT USER (protected) ─────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── 7. SSO (Mocked) ─────────────────────────────────────────────────────────
router.get('/:provider', (req, res) => {
    const { provider } = req.params;
    if (!['google', 'microsoft'].includes(provider)) {
        return res.status(404).json({ error: 'Unknown provider' });
    }
    const mockToken = jwt.sign({ id: `sso-${provider}-user`, email: `sso@${provider}.com`, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    const mockUser = encodeURIComponent(JSON.stringify({ id: `sso-${provider}-user`, email: `sso@${provider}.com`, name: `${provider} User`, role: 'user' }));
    res.redirect(`${FRONTEND_URL}?sso_success=true&token=${mockToken}&user=${mockUser}`);
});

export default router;
