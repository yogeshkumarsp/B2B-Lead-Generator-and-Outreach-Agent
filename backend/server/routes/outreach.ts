import express from 'express';
import { prisma } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { sendOutreachEmail } from '../services/email.js';
import { backendAgent } from '../services/agent.js';

const router = express.Router();
router.use(requireAuth);

// POST /api/outreach/run-now
router.post('/run-now', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;
        // Fire and forget so we don't timeout the request
        backendAgent.forceProcessUser(userId).catch(e => console.error('[API] Force process error', e));
        res.json({ success: true, message: 'Agent triggered in background.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to trigger agent' });
    }
});

// POST /api/outreach/send
router.post('/send', async (req: AuthRequest, res) => {
    try {
        const { leadId, subject, body, currentStep } = req.body;
        const userId = req.userId!;

        if (!leadId || !subject || !body) {
            return res.status(400).json({ error: 'LeadId, subject, and body are required' });
        }

        // 1. Fetch lead and user settings
        const [lead, settings] = await Promise.all([
            prisma.lead.findUnique({ where: { id: leadId } }),
            prisma.userSettings.findUnique({ where: { userId } })
        ]);

        if (!lead || lead.userId !== userId) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        if (!lead.email) {
            return res.status(400).json({ error: 'Lead has no email address' });
        }

        // 2. Send the email
        const emailRes = await sendOutreachEmail(
            lead.email,
            subject,
            body,
            settings?.senderName || undefined,
            settings?.senderEmail || undefined
        );

        if (!emailRes.success) {
            return res.status(500).json({ error: 'Failed to send email via SMTP', details: emailRes.error });
        }

        // 3. Update lead status in DB
        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data: {
                outreachStatus: 'SENT',
                outreachMessage: body,
                lastContactedAt: new Date(),
                followUpCount: { increment: 1 },
                currentStep: currentStep !== undefined ? currentStep : undefined
            }
        });

        res.json({ success: true, messageId: emailRes.messageId, lead: updatedLead });
    } catch (err) {
        console.error('[Outreach API] Error:', err);
        res.status(500).json({ error: 'Internal server error during outreach' });
    }
});

export default router;
