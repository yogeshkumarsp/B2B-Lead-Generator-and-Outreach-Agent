import { ImapFlow } from 'imapflow';
import { prisma } from '../db';
import { simpleParser } from 'mailparser';
import { analyzeReplySentiment, generateConversationalReply } from './ai';
import { sendOutreachEmail } from './email';

export class ReplyDetector {
    private client: ImapFlow | null = null;
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {
        const host = process.env.IMAP_HOST || process.env.SMTP_HOST?.replace('smtp', 'imap') || 'imap.ethereal.email';
        const port = parseInt(process.env.IMAP_PORT || '993');
        const user = process.env.SMTP_USER || 'bernadette.reilly46@ethereal.email';
        const pass = process.env.SMTP_PASS || 'GZkR872B5wR9e1WbC3';

        this.client = new ImapFlow({
            host,
            port,
            secure: port === 993,
            auth: {
                user,
                pass
            },
            tls: {
                rejectUnauthorized: false
            },
            logger: false
        });
    }

    private async tryAcquireLock(): Promise<boolean> {
        try {
            const lock = await prisma.systemLock.findUnique({
                where: { id: 'REPLY_LOCK' }
            });

            const now = new Date();
            if (lock) {
                const diffMs = now.getTime() - new Date(lock.updatedAt).getTime();
                if (diffMs < 5 * 60000) { // 5 minute lock for replies
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
        console.log('[ReplyDetector] Starting automated reply detection...');

        // Initial check
        await this.checkReplies();

        // Check every 30 minutes
        this.intervalId = setInterval(async () => {
            await this.checkReplies();
        }, 30 * 60 * 1000);
    }

    async stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.isRunning = false;
        if (this.client) await this.client.logout();
    }

    private async checkReplies() {
        if (!this.client) return;
        if (!(await this.tryAcquireLock())) {
            console.log('[ReplyDetector] Another instance is already checking replies. Skipping.');
            return;
        }

        try {
            await this.client.connect();
            let lock = await this.client.getMailboxLock('INBOX');
            
            // Update lock to show we are actively processing
            await prisma.systemLock.update({
                where: { id: 'REPLY_LOCK' },
                data: { updatedAt: new Date() }
            });

            try {
                // Search and fetch unread messages
                const messages = this.client.fetch({ seen: false }, { envelope: true, source: true });

                for await (let message of messages) {
                    const fromEmail = message.envelope.from[0]?.address?.toLowerCase();
                    if (!fromEmail) continue;

                    // Match against leads in DB
                    const lead = await prisma.lead.findFirst({
                        where: {
                            email: { equals: fromEmail, mode: 'insensitive' },
                            outreachStatus: { in: ['SENT', 'FOLLOWING_UP'] }
                        }
                    });

                    if (lead) {
                        console.log(`[ReplyDetector] Found reply from lead: ${lead.companyName} (${fromEmail})`);

                        // Parse the email body
                        const parsed = await simpleParser(message.source);
                        const replyText = parsed.text || "No text content found in reply.";

                        // Analyze sentiment with AI
                        const { sentiment, summary } = await analyzeReplySentiment(replyText);
                        console.log(`[ReplyDetector] AI classified reply as ${sentiment}: ${summary}`);

                        // Update lead status and store sentiment
                        await (prisma.lead as any).update({
                            where: { id: lead.id },
                            data: {
                                outreachStatus: 'REPLIED',
                                replyContent: replyText,
                                replySentiment: sentiment
                            }
                        });

                        // Log the event with AI summary
                        await prisma.agentLog.create({
                            data: {
                                userId: lead.userId,
                                level: 'INFO',
                                module: 'OUTREACH',
                                message: `Lead "${lead.companyName}" replied (${sentiment}). AI Summary: ${summary}`,
                                leadId: lead.id
                            }
                        });

                        // Automatically Draft and Send AI Response
                        const settings = await prisma.userSettings.findUnique({ where: { userId: lead.userId } });
                        if (settings && sentiment !== 'OUT_OF_OFFICE') {
                            try {
                                console.log(`[ReplyDetector] Generating AI response for ${lead.companyName}...`);
                                const { subject, body } = await generateConversationalReply(lead, replyText, sentiment, settings);
                                
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
                                } else {
                                    console.error('[ReplyDetector] Failed to send AI response:', emailRes.error);
                                }
                            } catch (error) {
                                console.error('[ReplyDetector] Error generating or sending AI response', error);
                            }
                        }

                        // Mark email as read (SEEN)
                        await this.client.messageFlagsAdd(message.uid, ['\\Seen']);
                    }
                }
            } finally {
                lock.release();
            }

            await this.client.logout();
        } catch (err) {
            console.error('[ReplyDetector] Error checking replies:', err);
            try { await this.client.logout(); } catch (e) { }
        }
    }
}

export const replyDetector = new ReplyDetector();
