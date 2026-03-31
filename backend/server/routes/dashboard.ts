import express from 'express';
import { prisma } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;
        const twoDaysAgo = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000));

        // Concurrent aggregations
        const [
            highIntentCount,
            lowIntentCount,
            sentCount,
            repliesCount,
            interestedCount,
            pendingCount,
            activeCampaignsCount,
            hotLeads,
            activeCampaigns,
            recentLogs
        ] = await Promise.all([
            prisma.lead.count({ where: { userId, intent: 'HIGH' } }),
            prisma.lead.count({ where: { userId, intent: 'LOW' } }),
            prisma.lead.count({ where: { userId, outreachStatus: 'SENT' } }),
            prisma.lead.count({ where: { userId, outreachStatus: { in: ['REPLIED', 'REPLIED_POSITIVE'] } } }),
            prisma.lead.count({ where: { userId, outreachStatus: 'REPLIED_POSITIVE' } }),
            prisma.lead.count({ where: { userId, outreachStatus: 'SENT', lastContactedAt: { lt: twoDaysAgo } } }),
            prisma.campaign.count({ where: { userId, status: 'ACTIVE' } }),
            
            // Top 5 Hot Leads
            prisma.lead.findMany({
                where: { userId, OR: [{ status: 'QUALIFIED' }, { intent: 'HIGH' }] },
                take: 5,
                orderBy: { createdAt: 'desc' }
            }),

            // Top 3 Active Campaigns
            prisma.campaign.findMany({
                where: { userId, status: 'ACTIVE' },
                take: 3,
                orderBy: { createdAt: 'desc' }
            }),

            // Recent Logs for Activity Feed
            prisma.agentLog.findMany({
                where: { userId },
                take: 10,
                orderBy: { timestamp: 'desc' }
            })
        ]);

        res.json({
            metrics: {
                highIntent: highIntentCount,
                lowIntent: lowIntentCount,
                sent: sentCount,
                replies: repliesCount,
                interested: interestedCount,
                pending: pendingCount,
                activeCampaigns: activeCampaignsCount
            },
            hotLeads,
            activeCampaigns,
            recentLogs: recentLogs.map(l => ({
                id: l.id,
                timestamp: l.timestamp.getTime(),
                level: l.level.toLowerCase(),
                module: l.module.toLowerCase(),
                message: l.message,
                leadId: l.leadId,
                campaignId: l.campaignId
            }))
        });
    } catch (err) {
        console.error('[API] Dashboard fetch error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

export default router;
