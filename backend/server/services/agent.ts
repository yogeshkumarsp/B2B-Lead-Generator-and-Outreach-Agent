import { prisma } from '../db.js';
import { sendOutreachEmail } from './email.js';
import { generatePersonalizedEmail } from './ai.js';

export class BackendAutoSDRAgent {
    private intervalId: NodeJS.Timeout | null = null;
    private heartbeatId: NodeJS.Timeout | null = null;
    private isProcessing = false;

    start() {
        if (this.intervalId) return;
        
        // Start the heartbeat (to let other processes know this one is active)
        this.startHeartbeat();

        // Start the interval
        this.intervalId = setInterval(() => {
            this.process();
        }, 900000); // 15 minutes
        
        console.log('[BackendAgent] Started continuous SDR loop (15min interval).');
        
        // Trigger immediate process on startup
        this.process().then(() => {
            console.log('[BackendAgent] Initial startup process cycle complete.');
        });
    }

    private startHeartbeat() {
        if (this.heartbeatId) clearInterval(this.heartbeatId);
        this.heartbeatId = setInterval(async () => {
            try {
                // If we are currently processing, update the lock to keep it
                if (this.isProcessing) {
                    await prisma.systemLock.upsert({
                        where: { id: 'AGENT_LOCK' },
                        update: { updatedAt: new Date() },
                        create: { id: 'AGENT_LOCK' }
                    });
                }
            } catch (err) {
                // Silent fail for heartbeat
            }
        }, 30000); // 30 seconds
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.heartbeatId) {
            clearInterval(this.heartbeatId);
            this.heartbeatId = null;
        }
        console.log('[BackendAgent] Stopped.');
    }

    private async tryAcquireLock(): Promise<boolean> {
        try {
            const lock = await prisma.systemLock.findUnique({
                where: { id: 'AGENT_LOCK' }
            });

            const now = new Date();
            if (lock) {
                const diffMs = now.getTime() - new Date(lock.updatedAt).getTime();
                // If the lock is less than 60 seconds old, another process is likely active
                if (diffMs < 60000) {
                    return false;
                }
            }

            // Take the lock
            await prisma.systemLock.upsert({
                where: { id: 'AGENT_LOCK' },
                update: { updatedAt: now },
                create: { id: 'AGENT_LOCK' }
            });
            return true;
        } catch (err) {
            console.error('[BackendAgent] Error acquiring lock:', err);
            return true; // Fallback to allow processing if DB has issues
        }
    }

    async forceProcessUser(userId: string) {
        if (this.isProcessing) return;
        if (!(await this.tryAcquireLock())) {
            const msg = '[BackendAgent] Another server instance is already processing. Skipping.';
            console.log(msg);
            await prisma.agentLog.create({
                data: { userId, level: 'INFO', module: 'AGENT', message: msg }
            });
            return;
        }

        await prisma.agentLog.create({
            data: {
                userId,
                level: 'INFO',
                module: 'AGENT',
                message: 'Outreach cycle triggered manually.'
            }
        });

        this.isProcessing = true;
        try {
            const settings = await prisma.userSettings.findUnique({ where: { userId } });
            if (!settings) return;
            await this.processUser(userId, settings);
        } finally {
            this.isProcessing = false;
        }
    }

    async process() {
        if (this.isProcessing) return;
        if (!(await this.tryAcquireLock())) {
            return; // Silently skip if another instance is active
        }

        this.isProcessing = true;

        try {
            // Find all users who have the agent enabled
            const enabledUsers = await prisma.userSettings.findMany({
                where: { isAgentEnabled: true }
            });

            if (enabledUsers.length === 0) {
                 // Even if no users, periodic log to keep lock alive if needed
            }

            for (const settings of enabledUsers) {
                await this.processUser(settings.userId, settings);
            }
        } catch (error) {
            console.error('[BackendAgent] Process error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processUser(userId: string, settings: any) {
        const campaigns = await prisma.campaign.findMany({
            where: { userId, status: 'ACTIVE' },
            include: { steps: { orderBy: { step: 'asc' } } }
        });

        const allLeads = await prisma.lead.findMany({
            where: { userId }
        });

        const mappedLeads = allLeads.map(l => ({ ...l, company: l.companyName }));

        // Leads are passed in full to maintain IDs, Emails, and Campaign assignments
        await this.runCampaignOutreach(userId, mappedLeads, campaigns, settings);
    }

    private async runCampaignOutreach(userId: string, leads: any[], campaigns: any[], settings: any) {
        // Check hourly throttle
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentLogs = await prisma.agentLog.count({
            where: {
                userId,
                module: 'OUTREACH',
                timestamp: { gte: oneHourAgo },
                message: { contains: 'ready' }
            }
        });

        // AI Cooldown check removed (Migration to Groq)

        await prisma.agentLog.create({
            data: { userId, level: 'INFO', module: 'OUTREACH', message: `Checking ${campaigns.length} campaigns for ${leads.length} leads...` }
        });

        let currentlySent = 0;
        if (recentLogs >= (settings.hourlyThrottleLimit || 10)) {
            await prisma.agentLog.create({
                data: { userId, level: 'INFO', module: 'OUTREACH', message: `Hourly throttle reached (${recentLogs}/${settings.hourlyThrottleLimit}). Pausing outreach for 15 mins.` }
            });
            return;
        }

        console.log(`[BackendAgent] Starting outreach for ${campaigns.length} active campaigns. Evaluated ${leads.length} total leads.`);
        
        for (const campaign of campaigns) {
            const campaignLeads = leads.filter(l =>
                l.campaignId === campaign.id &&
                this.canSendOutreach(l, campaign)
            );

            if (campaignLeads.length > 0) {
                await prisma.agentLog.create({
                    data: { userId, level: 'INFO', module: 'OUTREACH', message: `Found ${campaignLeads.length} leads ready for ${campaign.name}.`, campaignId: campaign.id }
                });
            } else {
                 await prisma.agentLog.create({
                    data: { userId, level: 'INFO', module: 'OUTREACH', message: `No leads ready for outreach in "${campaign.name}".`, campaignId: campaign.id }
                });
            }
            
            for (const lead of campaignLeads) {
                try {
                    await prisma.agentLog.create({
                        data: { userId, level: 'INFO', module: 'OUTREACH', message: `Processing lead: ${lead.company} (${lead.email})`, leadId: lead.id, campaignId: campaign.id }
                    });
                    if (!lead.email || !lead.email.includes('@')) continue;

                    const nextStepIndex = lead.outreachStatus === 'SENT' ? lead.currentStep : 0;
                    const steps = campaign.steps || [];
                    const currentStepObj = steps.find((s: any) => s.step === (nextStepIndex + 1)) || steps[0];

                    if (!currentStepObj) continue;

                    await prisma.agentLog.create({
                        data: {
                            userId,
                            level: 'ACTION',
                            module: 'OUTREACH',
                            message: `Drafting Sequence Step ${currentStepObj.step} for ${lead.company}...`,
                            leadId: lead.id,
                            campaignId: campaign.id
                        }
                    });

                    // Generate Email
                    const { subject, body } = await generatePersonalizedEmail(
                        lead,
                        currentStepObj.body,
                        currentStepObj.subject,
                        settings
                    );

                    // Send Email
                    const emailRes = await sendOutreachEmail(
                        lead.email,
                        subject,
                        body,
                        settings?.senderName || undefined,
                        settings?.senderEmail || undefined
                    );

                    if (!emailRes.success) {
                        throw new Error(`Email provider error: ${emailRes.error || 'Unknown error'}`);
                    }

                    await prisma.agentLog.create({
                        data: {
                            userId,
                            level: 'ACTION',
                            module: 'OUTREACH',
                            message: `Successfully sent email to ${lead.email}`,
                            leadId: lead.id,
                            campaignId: campaign.id
                        }
                    });

                    // Update Lead Status
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: {
                            outreachStatus: 'SENT',
                            outreachMessage: body,
                            lastContactedAt: new Date(),
                            followUpCount: { increment: 1 },
                            currentStep: currentStepObj.step
                        }
                    });

                    await prisma.agentLog.create({
                        data: {
                            userId,
                            level: 'INFO',
                            module: 'OUTREACH',
                            message: `Step ${currentStepObj.step} ready and sent for ${lead.company}.`,
                            leadId: lead.id,
                            campaignId: campaign.id
                        }
                    });

                    currentlySent++;
                    if (recentLogs + currentlySent >= settings.hourlyThrottleLimit) break;
                    
                    // Mandatory 6-second delay to protect API quota between sends
                    await new Promise(resolve => setTimeout(resolve, 6000));
                } catch (err: any) {
                    console.error(`[BackendAgent] Failed to process lead ${lead.id}:`, err);
                    await prisma.agentLog.create({
                        data: {
                            userId,
                            level: 'ERROR',
                            module: 'OUTREACH',
                            message: `Failed to draft for ${lead.company}: ${err?.message || 'Unknown error'}`
                        }
                    });
                }
            } // end lead loop

            if (recentLogs + currentlySent >= settings.hourlyThrottleLimit) break;
        } // end campaign loop
    }

    private canSendOutreach(lead: any, campaign: any): boolean {
        if (lead.outreachStatus === 'REPLIED' || lead.outreachStatus === 'STOPPED') return false;

        // Send outreach if they have an email (this is more resilient than just status check)
        const hasEmail = lead.email && lead.email.includes('@');
        if (!hasEmail) return false;

        // Still block if manually REJECTED
        if (lead.status === 'REJECTED') return false;

        if (lead.outreachStatus === 'PENDING' || !lead.lastContactedAt) return true;

        if (lead.outreachStatus === 'SENT') {
            const steps = campaign.steps || [];
            const nextStep = steps.find((s: any) => s.step === (lead.currentStep + 1));

            if (!nextStep) return false;

            const currentStepObj = steps.find((s: any) => s.step === lead.currentStep);
            const dayGap = nextStep.dayDelay - (currentStepObj?.dayDelay || 0);
            const waitTime = Math.max(1, dayGap) * 24 * 60 * 60 * 1000;

            const lastContact = new Date(lead.lastContactedAt).getTime();
            return Date.now() - lastContact > waitTime;
        }

        return false;
    }
}

export const backendAgent = new BackendAutoSDRAgent();
