import express from 'express';
import { prisma } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/settings
router.get('/', async (req: AuthRequest, res) => {
    try {
        let settings = await prisma.userSettings.findUnique({ where: { userId: req.userId! } });
        if (!settings) {
            settings = await prisma.userSettings.create({ data: { userId: req.userId! } });
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

// PATCH /api/settings
router.patch('/', async (req: AuthRequest, res) => {
    try {
        const {
            agentPersona,
            dailySendLimit,
            hourlyThrottleLimit,
            replyDetectionIntervalMinutes,
            isAgentEnabled,
            senderName,
            senderEmail
        } = req.body;

        const settings = await prisma.userSettings.upsert({
            where: { userId: req.userId! },
            update: {
                agentPersona,
                dailySendLimit,
                hourlyThrottleLimit,
                replyDetectionIntervalMinutes,
                isAgentEnabled,
                senderName,
                senderEmail
            },
            create: {
                userId: req.userId!,
                agentPersona,
                dailySendLimit,
                hourlyThrottleLimit,
                replyDetectionIntervalMinutes,
                isAgentEnabled,
                senderName,
                senderEmail
            }
        });
        res.json(settings);
    } catch (err) {
        console.error('[API] Update settings error:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

export default router;
