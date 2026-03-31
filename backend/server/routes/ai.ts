import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { generatePersonalizedEmail, generateNicheSequence } from '../services/ai.js';
import { prisma } from '../db.js';

const router = express.Router();
router.use(requireAuth);

// POST /api/ai/personalize
router.post('/personalize', async (req: AuthRequest, res) => {
    try {
        const { lead, template, subjectTemplate } = req.body;
        const userId = req.userId!;

        // Fetch user settings for persona
        const settings = await prisma.userSettings.findUnique({ where: { userId } });
        
        const result = await generatePersonalizedEmail(lead, template, subjectTemplate, settings);
        res.json(result);
    } catch (err) {
        console.error('[API] Personalization error:', err);
        res.status(500).json({ error: 'Failed to personalize email' });
    }
});

// POST /api/ai/sequence
router.post('/sequence', async (req: AuthRequest, res) => {
    try {
        const { niche, location } = req.body;
        const result = await generateNicheSequence(niche, location);
        res.json(result);
    } catch (err) {
        console.error('[API] Sequence generation error:', err);
        res.status(500).json({ error: 'Failed to generate sequence' });
    }
});

export default router;
