import { prisma } from '../db';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
// Default to onboarding if no sender email provided
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

export async function sendOutreachEmail(
    to: string,
    subject: string,
    body: string,
    senderName?: string,
    fromEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: any }> {
    try {
        console.log(`[Email] Preparing to send via Resend API to: ${to}`);

        if (!RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured. Please add it to environment variables.');
        }

        const from = senderName 
            ? `${senderName} <${fromEmail || SENDER_EMAIL}>`
            : fromEmail || SENDER_EMAIL;

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from,
                to: [to],
                subject,
                html: body.replace(/\n/g, '<br/>') // Basic text to HTML conversion
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[Email] Resend API Error:', JSON.stringify(data));
            throw new Error(data.message || 'Failed to send email via Resend');
        }

        console.log(`[Email] Successfully sent via Resend. ID: ${data.id}`);
        return { success: true, messageId: data.id };
    } catch (err: any) {
        console.error('[Email] Failed to send email:', err);
        return { success: false, error: err?.message || err };
    }
}

export async function checkReplies() {
    // Note: Resend is a sender API. For reply detection, we typically use webhooks 
    // or keep the existing IMAP logic if you have one. 
    // For now, we will leave the reply detection as-is or stub it if it was SMTP-based.
    console.log('[ReplyDetector] Resend migration bypasses traditional reply polling. Recommendation: Use Webhooks.');
}
