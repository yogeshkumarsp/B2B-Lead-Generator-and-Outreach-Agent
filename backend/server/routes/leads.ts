import express from 'express';
import axios from 'axios';
import { searchBusinesses } from '../services/maps.js';
import { prisma } from '../db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { backendAgent } from '../services/agent.js';
import { jobManager } from '../services/jobManager.js';

const router = express.Router();

// All leads routes require auth
router.use(requireAuth);

const localSafetyFilter = (business: any, niche: string): boolean => {
    const name = (business.name || "").toLowerCase();
    const type = (business.types?.[0] || "").toLowerCase();
    const allTypes = (business.types || []).join(", ").toLowerCase();
    
    // Only block the absolute most obvious non-B2B entities (Restaurants, Cafes, Temples)
    const absoluteBlacklist = ["restaurant", "cafe", "food", "grocery", "salon", "temple", "church", "mosque"];
    
    if (absoluteBlacklist.some(term => name.includes(term) || type.includes(term) || allTypes.includes(term))) {
        return true;
    }
    return false;
};

const filterBusinessesByNiche = async (businesses: any[], niche: string): Promise<any[]> => {
    // 1. Basic Safety Pass
    let filtered = businesses.filter(b => !localSafetyFilter(b, niche));
    if (filtered.length === 0) return filtered;

    try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return filtered;

        const prompt = `
You are a B2B lead evaluator. I am searching for leads for the niche: "${niche}".
Your goal is to identify if the business is a relevant professional service or business entity for this niche.

Evaluate these businesses. Reject only if they are completely unrelated (e.g. personal services, mass retail, or irrelevant institutions).
ACCEPT: Professional services, agencies, B2B companies, or entities that match the niche "${niche}".

Return ONLY a valid JSON object with a key 'accepted_indices' containing the indices (0-based) of the businesses you accept.
Businesses:
${JSON.stringify(filtered.map((b, i) => ({ index: i, name: b.name, types: b.types })), null, 2)}
`;

        const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "You are a professional business lead evaluator. You must respond ONLY with a valid JSON object." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        }, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });

        const text = response.data.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(text);
        const filteredIndices = parsed.accepted_indices || [];
        
        console.log(`[AI Filter] Processed ${filtered.length}. Accepted ${filteredIndices.length} for niche "${niche}".`);
        return filtered.filter((_, i) => filteredIndices.includes(i));
    } catch (err: any) {
        console.error("[AI Filter] Groq evaluation failed, falling back to all results:", err?.message || err);
        return filtered;
    }
};

// POST /api/leads/discover — starts background job
router.post('/discover', async (req: AuthRequest, res) => {
    try {
        const { niche, location } = req.body;
        const userId = req.userId!;

        if (!niche || !location) {
            return res.status(400).json({ error: 'Niche and location are required' });
        }

        const jobId = jobManager.createJob(userId);

        // Start discovery in background
        (async () => {
            try {
                jobManager.updateJob(jobId, { status: 'RUNNING' });
                
                const nicheKey = niche.trim().toLowerCase();
                const locationKey = location.trim().toLowerCase();

                // 1. Existing Leads
                const cachedLeads = await prisma.lead.findMany({
                    where: {
                        userId,
                        AND: [
                            { OR: [{ searchNiche: { contains: nicheKey, mode: 'insensitive' } }, { industry: { contains: nicheKey, mode: 'insensitive' } }] },
                            { OR: [{ searchLocation: { contains: locationKey, mode: 'insensitive' } }, { address: { contains: locationKey, mode: 'insensitive' } }] }
                        ]
                    }
                });

                // 2. Scrape
                let businesses = await searchBusinesses(niche, location);
                
                // 3. AI Filter
                businesses = await filterBusinessesByNiche(businesses, niche);
                
                // 4. Find Matching Campaign to Auto-Assign
                const matchingCampaign = await prisma.campaign.findFirst({
                    where: {
                        userId,
                        status: 'ACTIVE',
                        OR: [
                            { name: { contains: niche, mode: 'insensitive' } },
                            { description: { contains: niche, mode: 'insensitive' } }
                        ]
                    },
                    orderBy: { createdAt: 'desc' }
                });

                if (matchingCampaign) {
                    console.log(`[Discovery] Found matching campaign: ${matchingCampaign.name}. Auto-assigning.`);
                }

                const normalizeName = (name: string) => {
                    return name.toLowerCase()
                        .replace(/pvt\.?\s*ltd\.?|private limited|llp|inc|corp|co\.?|ltd\.?/gi, '')
                        .replace(/[^a-z0-9]/g, '');
                };

                // 5. Intelligent Sifter: Prioritize QUALIFIED leads (with emails). 
                // Goal: Deliver at least 10 with emails if available, otherwise fill with unqualified.
                const qualified = businesses.filter(b => b.email);
                const unqualified = businesses.filter(b => !b.email);
                
                // If we have 10+ qualified, take up to 15 of them.
                // If we have fewer than 10 qualified, take all of them and fill with unqualified up to total 15.
                let businessesToProcess: any[] = [];
                if (qualified.length >= 10) {
                    businessesToProcess = qualified.slice(0, 15);
                } else {
                    businessesToProcess = [...qualified, ...unqualified.slice(0, 15 - qualified.length)];
                }

                // Ensure we return exactly what we processed
                console.log(`[Discovery] Sifting complete: ${qualified.length} qualified found. Processing ${businessesToProcess.length} total.`);

                // 6. Process only these 10 (Create or Update)
                const resultsInThisRun = await Promise.all(businessesToProcess.map(async (business: any) => {
                    const normName = normalizeName(business.name);
                    const normAddr = normalizeName(business.address || "");
                    const uniqueKey = `${normName}_${normAddr}`;

                    let leadRecord: any = await prisma.lead.findFirst({
                        where: {
                            userId,
                            companyName: { equals: business.name, mode: 'insensitive' },
                            address: { equals: business.address, mode: 'insensitive' }
                        }
                    });

                    if (!leadRecord) {
                        leadRecord = await prisma.lead.create({
                            data: {
                                userId,
                                companyName: business.name,
                                industry: niche,
                                phone: business.phone || '',
                                email: business.email || '',
                                website: business.website || '',
                                address: business.address || location,
                                intent: (business.phone && business.email) ? 'HIGH' : 'LOW',
                                status: business.email ? 'QUALIFIED' : 'UNQUALIFIED',
                                campaignId: matchingCampaign?.id,
                                searchNiche: nicheKey,
                                searchLocation: locationKey
                            }
                        });
                        console.log(`[Discovery] Created new lead: ${business.name}`);
                    } else if (!leadRecord.campaignId && matchingCampaign) {
                        leadRecord = await prisma.lead.update({
                            where: { id: leadRecord.id },
                            data: { campaignId: matchingCampaign.id }
                        });
                        console.log(`[Discovery] Updated existing lead: ${business.name}`);
                    }

                    return leadRecord;
                }));

                jobManager.updateJob(jobId, { status: 'COMPLETED', results: resultsInThisRun });
                
                // Trigger agent for these specific leads
                backendAgent.forceProcessUser(userId).catch(e => console.error('[API] Agent trigger error:', e));
            } catch (err: any) {
                console.error('[Discovery Job] Background error:', err);
                jobManager.updateJob(jobId, { status: 'FAILED', error: err?.message || 'Unknown discovery error' });
            }
        })();

        res.status(202).json({ jobId });
    } catch (error) {
        console.error('[API] Discovery initiation error:', error);
        res.status(500).json({ error: 'Failed to initiate discovery' });
    }
});

// GET /api/leads/discover/status/:jobId — poll status
router.get('/discover/status/:jobId', (req: AuthRequest, res) => {
    const job = jobManager.getJob(req.params.jobId as string);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    
    res.json({
        status: job.status,
        results: job.status === 'COMPLETED' ? job.results : [],
        error: job.error
    });
});

// GET /api/leads
router.get('/', async (req: AuthRequest, res) => {
    try {
        const { metricType, campaignId, limit } = req.query;
        let whereClause: any = { userId: req.userId! };

        if (metricType === 'high-intent') whereClause.intent = 'HIGH';
        else if (metricType === 'low-intent') whereClause.intent = 'LOW';
        else if (metricType === 'sent') whereClause.outreachStatus = 'SENT';
        else if (metricType === 'replies') whereClause.outreachStatus = { in: ['REPLIED', 'REPLIED_POSITIVE'] };
        else if (metricType === 'interested') whereClause.outreachStatus = 'REPLIED_POSITIVE';
        else if (metricType === 'pending') {
            const twoDaysAgo = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000));
            whereClause.outreachStatus = 'SENT';
            whereClause.lastContactedAt = { lt: twoDaysAgo };
        } else if (metricType === 'active-campaigns') {
             // For active campaigns metric, we only need leads that belong to an active campaign
             whereClause.campaign = { status: 'ACTIVE' };
        }

        if (campaignId) {
            whereClause.campaignId = campaignId === 'unassigned' ? null : String(campaignId);
        }

        const maxTake = limit === 'all' ? undefined : (Number(limit) || 300);

        const leads = await prisma.lead.findMany({
            where: whereClause,
            take: maxTake,
            orderBy: { createdAt: 'desc' },
            include: { campaign: { select: { name: true } } } // Useful for frontend to show campaign names
        });
        res.json(leads);
    } catch (err) {
        console.error('[API] Fetch leads error:', err);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

// GET /api/leads/search
router.get('/search', async (req: AuthRequest, res) => {
    try {
        const { niche, location } = req.query;
        if (!niche || !location) return res.status(400).json({ error: 'niche and location are required' });
        const leads = await prisma.lead.findMany({
            where: {
                userId: req.userId!,
                searchNiche: { equals: String(niche), mode: 'insensitive' },
                searchLocation: { equals: String(location), mode: 'insensitive' }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(leads);
    } catch (err) {
        res.status(500).json({ error: 'Failed to search leads' });
    }
});

// PATCH /api/leads/:id
router.patch('/:id', async (req: AuthRequest, res) => {
    try {
        const id = req.params.id as string;
        const updates = req.body;

        // Verify lead belongs to this user
        const lead = await prisma.lead.findFirst({ where: { id, userId: req.userId! } });
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const updated = await prisma.lead.update({ where: { id }, data: updates });
        res.json(updated);
    } catch (err) {
        console.error('[API] Update lead error:', err);
        res.status(500).json({ error: 'Failed to update lead' });
    }
});

// DELETE /api/leads/bulk
router.delete('/bulk', async (req: AuthRequest, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'No lead IDs provided' });
        }
        await prisma.lead.deleteMany({
            where: { 
                id: { in: ids },
                userId: req.userId! 
            }
        });
        res.json({ success: true, deletedCount: ids.length });
    } catch (err) {
        console.error('[API] Bulk delete error:', err);
        res.status(500).json({ error: 'Failed to delete leads' });
    }
});

// DELETE /api/leads (clear all leads for user)
router.delete('/', async (req: AuthRequest, res) => {
    try {
        await prisma.lead.deleteMany({ where: { userId: req.userId! } });
        res.json({ success: true, message: 'All leads cleared.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear leads' });
    }
});

export default router;
