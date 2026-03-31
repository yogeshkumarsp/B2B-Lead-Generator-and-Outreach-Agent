import axios from 'axios';
import { prisma } from '../db.js';

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
            const errorMsg = 'RESEND_API_KEY is not configured. Email will not be sent.';
            console.error(`[Email] ${errorMsg}`);
            return { success: false, error: errorMsg };
        }

        const from = senderName 
            ? `${senderName} <${fromEmail || SENDER_EMAIL}>`
            : fromEmail || SENDER_EMAIL;

        const response = await axios.post('https://api.resend.com/emails', {
            from,
            to: [to],
            subject,
            html: body.replace(/\n/g, '<br/>') // Basic text to HTML conversion
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            }
        });

        const data = response.data;
        console.log(`[Email] Successfully sent via Resend. ID: ${data.id}`);
        return { success: true, messageId: data.id };
    } catch (err: any) {
        const errorData = err.response?.data || err.message;
        console.error('[Email] Failed to send email:', errorData);
        return { success: false, error: errorData };
    }
}

export async function sendApprovalEmail(to: string, name: string) {
    const subject = 'Your AutoSDR Access Request has been Approved!';
    const body = `Hi ${name},\n\nYour request for access to AutoSDR has been approved. You can now log in using your credentials.\n\nBest,\nThe AutoSDR Team`;
    return sendOutreachEmail(to, subject, body, 'AutoSDR Support');
}

export async function checkReplies() {
    // Note: Resend is a sender API. For reply detection, we typically use webhooks 
    // or keep the existing IMAP logic if you have one. 
    // For now, we will leave the reply detection as-is or stub it if it was SMTP-based.
    console.log('[ReplyDetector] Resend migration bypasses traditional reply polling. Recommendation: Use Webhooks.');
}
