import express from 'express';
import { prisma } from '../db';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { sendApprovalEmail } from '../services/email';

const router = express.Router();

// GET /api/admin/requests — list all access requests (ADMIN only)
router.get('/requests', requireAdmin, async (_req, res) => {
    try {
        const requests = await prisma.accessRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch access requests' });
    }
});

// PATCH /api/admin/requests/:id — approve or reject (ADMIN only)
router.patch('/requests/:id', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        const updated = await prisma.accessRequest.update({
            where: { id: req.params.id as string },
            data: { status }
        });

        if (status === 'APPROVED') {
            const existingUser = await prisma.user.findUnique({ where: { email: updated.email } });
            if (!existingUser) {
                const newUser = await prisma.user.create({
                    data: {
                        name: updated.name,
                        email: updated.email,
                        role: 'USER',
                        passwordHash: updated.passwordHash,
                    }
                });
                await prisma.userSettings.create({ data: { userId: newUser.id } });

                // Send approval email
                await sendApprovalEmail(newUser.email, newUser.name || 'User');
            }
        }

        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update request' });
    }
});

// DELETE /api/admin/requests/:id (ADMIN only)
router.delete('/requests/:id', requireAdmin, async (req, res) => {
    try {
        await prisma.accessRequest.delete({ where: { id: req.params.id as string } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete request' });
    }
});

export default router;
