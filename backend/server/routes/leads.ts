import express from 'express';
import { searchBusinesses } from '../services/maps';
import { prisma } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { GoogleGenAI } from '@google/genai';
import { backendAgent } from '../services/agent';
import { executeWithRetry } from '../../../frontend/src/services/gemini.js';
import { jobManager } from '../services/jobManager';

const router = express.Router();

// All leads routes require auth
router.use(requireAuth);

const localSafetyFilter = (business: any, niche: string): boolean => {
    const name = (business.name || "").toLowerCase();
    const type = (business.types?.[0] || "").toLowerCase();
    const allTypes = (business.types || []).join(", ").toLowerCase();
    const nicheTarget = niche.toLowerCase();

    // If searching for pharmacy/medicine, don't block based on 'retail' or 'store' keywords
    const isMedicalSearch = nicheTarget.includes("pharmacy") || nicheTarget.includes("medical") || nicheTarget.includes("medicine") || nicheTarget.includes("hospital");

    // Determine if beauty/salon search
    const isBeautySearch = nicheTarget.includes("beauty") || nicheTarget.includes("salon") || nicheTarget.includes("parlour") || nicheTarget.includes("spa");
    
    // Determine if educational search
    const isEducationSearch = nicheTarget.includes("school") || nicheTarget.includes("college") || nicheTarget.includes("university") || nicheTarget.includes("institute") || nicheTarget.includes("education") || nicheTarget.includes("academy");

    // Global obvious B2C blacklists
    let globalBlacklist = [
        "restaurant", "cafe", "food", "grocery", "supermarket", "furniture",
        "clothing", "boutique", "salon", "temple", "church", "mosque", "residential", "apartment",
        "school", "college", "university", "institute", "academy"
    ];

    // Remove blacklist items if specifically searching for them
    if (isBeautySearch) {
        globalBlacklist = globalBlacklist.filter(term => !["salon", "boutique"].includes(term));
    }
    if (isEducationSearch) {
        globalBlacklist = globalBlacklist.filter(term => !["school", "college", "university", "institute", "academy"].includes(term));
    }

    // Only add retail/store to blacklist if it's NOT a medical search
    if (!isMedicalSearch && !nicheTarget.includes("retail") && !nicheTarget.includes("shop") && !nicheTarget.includes("store")) {
        globalBlacklist.push("retail", "showroom", "store", "shop", "mall");
    }

    if (globalBlacklist.some(term => name.includes(term) || type.includes(term) || allTypes.includes(term))) {
        console.log(`[Filter] Local Reject: "${business.name}" matches blacklist (Type: ${type}, All: ${allTypes})`);
        return true;
    }

    // Niche specific exclusion logic
    if (nicheTarget.includes("it company") || nicheTarget.includes("software") || nicheTarget.includes("agency") || nicheTarget.includes("marketing")) {
        const itExclusions = [
            "security system", "cctv", "camera", "appliance", "home automation",
            "electronics", "hardware shop", "repair shop", "mobile store"
        ];
        if (itExclusions.some(term => name.includes(term) || type.includes(term))) return true;
    }

    return false;
};

const filterBusinessesByNiche = async (businesses: any[], niche: string): Promise<any[]> => {
    // 1. First Pass: Local Safety Filter (Immediate removal of obvious B2C)
    let filtered = businesses.filter(b => !localSafetyFilter(b, niche));

    if (filtered.length === 0) return filtered;

    try {
        const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.API_KEY;
        const keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];
        
        if (keys.length === 0) {
            console.log(`[AI Filter] No API key, using local filtered results (${filtered.length})`);
            return filtered;
        }

        const isBeautySearch = niche.toLowerCase().includes("beauty") || niche.toLowerCase().includes("salon") || niche.toLowerCase().includes("parlour") || niche.toLowerCase().includes("spa");
        const isEducationSearch = niche.toLowerCase().includes("school") || niche.toLowerCase().includes("college") || niche.toLowerCase().includes("university") || niche.toLowerCase().includes("institute") || niche.toLowerCase().includes("education") || niche.toLowerCase().includes("academy");

        const prompt = `
You are a B2B lead evaluator. I am searching for B2B leads for the niche: "${niche}".
Your goal is to filter out any that are clearly NOT B2B professional services or relevant business entities.

REJECT:
- Mass retail (Furniture, Clothing, General stores)
- Food & Beverage (Restaurants, Cafes)
${!isBeautySearch ? '- Personal services (Salons, Gyms, Temples)' : '- Temples, Churches, Mosques'}
${!isEducationSearch ? '- Education (Schools, Colleges)' : ''}

ACCEPT:
- Information Technology / Software / agencies
- ${niche} related service providers
- B2B Professional Services
- Corporate offices

Return ONLY a valid JSON array of the indices (0-based numbers) of the accepted businesses. 
Businesses:
${JSON.stringify(filtered.map((b, i) => ({ index: i, name: b.name, types: b.types })), null, 2)}
`;

        const filteredIndices = await executeWithRetry(async (client) => {
            const response = await client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: prompt
            });
            const text = response.text?.replace(/```json|```/g, '').trim() || "[]";
            return JSON.parse(text) as number[];
        });

        console.log(`[AI Filter] Evaluated ${filtered.length} businesses. Accepted ${filteredIndices.length} for niche "${niche}".`);
        return filtered.filter((_, i) => filteredIndices.includes(i));
    } catch (err: any) {
        console.error("[AI Filter] AI Filter failed, falling back to all local results:", err?.message || err);
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

                const normalizeName = (name: string) => {
                    return name.toLowerCase()
                        .replace(/pvt\.?\s*ltd\.?|private limited|llp|inc|corp|co\.?|ltd\.?/gi, '')
                        .replace(/[^a-z0-9]/g, '');
                };

                const finalResultsMap = new Map();
                cachedLeads.forEach(l => {
                    const key = `${normalizeName(l.companyName)}_${normalizeName(l.address || "")}`;
                    finalResultsMap.set(key, l);
                });

                const uniqueTasks = businesses.filter((business: any) => {
                    const normName = normalizeName(business.name);
                    const normAddr = normalizeName(business.address || "");
                    const uniqueKey = `${normName}_${normAddr}`;
                    if (finalResultsMap.has(uniqueKey)) return false;
                    
                    finalResultsMap.set(uniqueKey, { pending: true });
                    return true;
                });

                await Promise.all(uniqueTasks.map(async (business: any) => {
                    const hasPhone = !!business.phone;
                    const hasEmail = !!business.email;
                    const intent = (hasPhone || hasEmail) ? 'HIGH' : 'LOW';

                    const normName = normalizeName(business.name);
                    const normAddr = normalizeName(business.address || "");
                    const uniqueKey = `${normName}_${normAddr}`;

                    let existing: any = await prisma.lead.findFirst({
                        where: {
                            userId,
                            companyName: { equals: business.name, mode: 'insensitive' },
                            address: { equals: business.address, mode: 'insensitive' }
                        }
                    });

                    if (!existing) {
                        const created = await prisma.lead.create({
                            data: {
                                userId,
                                companyName: business.name,
                                industry: niche,
                                phone: business.phone || '',
                                email: business.email || '',
                                website: business.website || '',
                                address: business.address || location,
                                intent,
                                status: intent === 'HIGH' ? 'QUALIFIED' : 'NEW',
                                searchNiche: nicheKey,
                                searchLocation: locationKey
                            }
                        });
                        finalResultsMap.set(uniqueKey, created);
                    } else {
                        finalResultsMap.set(uniqueKey, existing);
                    }
                }));

                const finalLeads = Array.from(finalResultsMap.values()).filter(l => !l.pending);
                
                // Trigger agent
                backendAgent.forceProcessUser(userId).catch(e => console.error('[API] Agent trigger error:', e));

                jobManager.updateJob(jobId, { status: 'COMPLETED', results: finalLeads });
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
