import express from 'express';
import { prisma } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All campaign routes require auth
router.use(requireAuth);

// GET /api/campaigns
router.get('/', async (req: AuthRequest, res) => {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { userId: req.userId! },
            include: {
                steps: { orderBy: { step: 'asc' } },
                _count: { select: { leads: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(campaigns);
    } catch (err) {
        console.error('[API] Fetch campaigns error:', err);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

// GET /api/campaigns/:id
router.get('/:id', async (req: AuthRequest, res) => {
    try {
        const campaign = await prisma.campaign.findFirst({
            where: { id: req.params.id as string, userId: req.userId! },
            include: { leads: true, steps: { orderBy: { step: 'asc' } } }
        });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        res.json(campaign);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch campaign details' });
    }
});

// POST /api/campaigns
router.post('/', async (req: AuthRequest, res) => {
    try {
        const { name, description, scoreThreshold, maxDailySends, followUpDelayDays, steps } = req.body;
        const campaign = await prisma.campaign.create({
            data: {
                userId: req.userId!,
                name,
                description,
                scoreThreshold: scoreThreshold ?? 70,
                maxDailySends: maxDailySends ?? 50,
                followUpDelayDays: followUpDelayDays ?? 2,
                steps: steps ? {
                    create: steps.map((s: any) => ({
                        step: s.step,
                        dayDelay: s.day_delay ?? s.dayDelay ?? 0,
                        templateName: s.template_name ?? s.templateName,
                        subject: s.subject,
                        body: s.body
                    }))
                } : undefined
            },
            include: { steps: true }
        });
        res.json(campaign);
    } catch (err) {
        console.error('[API] Create campaign error:', err);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

// PATCH /api/campaigns/:id
router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id as string, userId: req.userId! } });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        const updated = await prisma.campaign.update({ where: { id: req.params.id as string }, data: req.body });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update campaign' });
    }
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id as string, userId: req.userId! } });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        await prisma.$transaction([
            prisma.lead.deleteMany({ where: { campaignId: req.params.id as string } }),
            prisma.campaign.delete({ where: { id: req.params.id as string } })
        ]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

// POST /api/campaigns/:id/auto-assign
router.post('/:id/auto-assign', async (req: AuthRequest, res) => {
    try {
        const id = req.params.id as string;
        const campaign = await prisma.campaign.findFirst({ where: { id, userId: req.userId! } });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        // Extract expected niche from campaign name (e.g. "software companies - krishnagiri" -> "software")
        const campaignNameLower = campaign.name.toLowerCase();
        const baseNicheKeyword = campaignNameLower.split(' - ')[0].split(' ')[0].trim(); // Get the first main word of the campaign name

        const result = await prisma.lead.updateMany({
            where: { 
                userId: req.userId!, 
                campaignId: null, 
                intent: 'HIGH',
                OR: [
                    { searchNiche: { contains: baseNicheKeyword, mode: 'insensitive' } },
                    { industry: { contains: baseNicheKeyword, mode: 'insensitive' } }
                ]
            },
            data: { campaignId: id }
        });
        res.json({ assignedCount: result.count });
    } catch (err) {
        console.error('[API] Auto-assign error:', err);
        res.status(500).json({ error: 'Failed to auto-assign leads' });
    }
});

export default router;
