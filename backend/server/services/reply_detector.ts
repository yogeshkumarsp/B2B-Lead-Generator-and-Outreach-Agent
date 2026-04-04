import { google } from 'googleapis';
import { prisma } from '../db.js';
import { analyzeReplySentiment, generateConversationalReply } from './ai.js';
import { sendOutreachEmail } from './email.js';
import { getOAuth2Client } from './google_auth.js';

export class ReplyDetector {
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor() { }

    private async tryAcquireLock(): Promise<boolean> {
        try {
            const lock = await prisma.systemLock.findUnique({
                where: { id: 'REPLY_LOCK' }
            });

            const now = new Date();
            if (lock) {
                const diffMs = now.getTime() - new Date(lock.updatedAt).getTime();
                if (diffMs < 5 * 60000) { // 5 minute lock
                    return false;
                }
            }

            await prisma.systemLock.upsert({
                where: { id: 'REPLY_LOCK' },
                update: { updatedAt: now },
                create: { id: 'REPLY_LOCK' }
            });
            return true;
        } catch (err) {
            return true;
        }
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[ReplyDetector] Starting Gmail API reply detection...');

        if (!getOAuth2Client()) {
            console.warn('[ReplyDetector] GMAIL tokens missing. Detector will idle.');
            return;
        }

        // Check every 10 minutes (API friendly)
        this.checkReplies();
        this.intervalId = setInterval(async () => {
            await this.checkReplies();
        }, 10 * 60 * 1000);
    }

    async stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
    }

    private async checkReplies() {
        const oauth2Client = getOAuth2Client();
        if (!oauth2Client) return;
        if (!(await this.tryAcquireLock())) return;

        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            
            // Search for unread messages (is:unread)
            const res = await gmail.users.messages.list({
                userId: 'me',
                q: 'is:unread',
                maxResults: 20
            });

            const messages = res.data.messages || [];
            if (messages.length === 0) {
                console.log('[ReplyDetector] No new unread replies found.');
                return;
            }

            for (const msg of messages) {
                const fullMsg = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id!
                });

                const headers = fullMsg.data.payload?.headers || [];
                const fromHeader = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || '';
                const subjectHeader = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
                
                // Extract clean email from "Name <email@domain.com>"
                const fromMatch = fromHeader.match(/<(.+)>|(\S+@\S+)/);
                const fromEmail = (fromMatch ? (fromMatch[1] || fromMatch[2]) : '').toLowerCase();

                if (!fromEmail) continue;

                // Match against leads in DB who are in "SENT" or "FOLLOWING_UP" status
                const lead = await prisma.lead.findFirst({
                    where: {
                        email: { equals: fromEmail, mode: 'insensitive' },
                        outreachStatus: { in: ['SENT', 'FOLLOWING_UP'] }
                    }
                });

                if (lead) {
                    console.log(`[ReplyDetector] Found reply from lead: ${lead.companyName} (${fromEmail})`);
                    
                    const snippet = fullMsg.data.snippet || "No text content found.";
                    
                    // Mark as Read immediately so we don't process it twice
                    await gmail.users.messages.batchModify({
                        userId: 'me',
                        ids: [msg.id!],
                        removeLabelIds: ['UNREAD']
                    });

                    // Analyze sentiment with AI
                    const { sentiment, summary } = await analyzeReplySentiment(snippet);
                    console.log(`[ReplyDetector] AI classified reply as ${sentiment}: ${summary}`);

                    // Update lead status
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: {
                            outreachStatus: 'REPLIED',
                            replyContent: snippet,
                            replySentiment: sentiment,
                            lastContactedAt: new Date()
                        }
                    });

                    // Log the event
                    await prisma.agentLog.create({
                        data: {
                            userId: lead.userId,
                            level: 'INFO',
                            module: 'OUTREACH',
                            message: `Lead "${lead.companyName}" replied (${sentiment}). AI Summary: ${summary}`,
                            leadId: lead.id
                        }
                    });

                    // Automatically Draft and Send AI Follow-up response via SENDGRID
                    const settings = await prisma.userSettings.findUnique({ where: { userId: lead.userId } });
                    if (settings && sentiment !== 'OUT_OF_OFFICE' && sentiment !== 'NOT_INTERESTED') {
                        try {
                            const { subject, body } = await generateConversationalReply(lead, snippet, sentiment, settings);
                            
                            const emailRes = await sendOutreachEmail(
                                fromEmail,
                                subject,
                                body,
                                settings.senderName || undefined,
                                settings.senderEmail || undefined
                            );

                            if (emailRes.success) {
                                await prisma.agentLog.create({
                                    data: {
                                        userId: lead.userId,
                                        level: 'INFO',
                                        module: 'OUTREACH',
                                        message: `Autonomous AI Response sent to ${lead.companyName}. Subject: ${subject}`,
                                        leadId: lead.id
                                    }
                                });
                            }
                        } catch (error) {
                            console.error('[ReplyDetector] Error generating or sending AI follow-up:', error);
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error('[ReplyDetector] Error checking replies via Gmail API:', err.message);
        }
    }
}

export const replyDetector = new ReplyDetector();
