import express from 'express';
import { prisma } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = express.Router();
router.use(requireAuth);

// GET /api/logs
router.get('/', async (req: AuthRequest, res) => {
    try {
        const logs = await prisma.agentLog.findMany({
            where: { userId: req.userId! },
            orderBy: { timestamp: 'desc' },
            take: 500
        });
        // Map to frontend format
        const mapped = logs.map(l => ({
            id: l.id,
            timestamp: l.timestamp.getTime(),
            level: l.level,
            module: l.module,
            message: l.message,
            leadId: l.leadId,
            campaignId: l.campaignId
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get logs' });
    }
});

// POST /api/logs
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { level, module, message, leadId, campaignId } = req.body;
        const log = await prisma.agentLog.create({
            data: { userId: req.userId!, level, module, message, leadId, campaignId }
        });
        res.json({ ...log, timestamp: log.timestamp.getTime() });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create log' });
    }
});

// DELETE /api/logs (clear all logs for user)
router.delete('/', async (req: AuthRequest, res) => {
    try {
        await prisma.agentLog.deleteMany({ where: { userId: req.userId! } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

export default router;
