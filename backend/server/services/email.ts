import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { getOAuth2Client } from './google_auth.js';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || SMTP_USER || '';

// Create SMTP Transporter (Fallback)
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

/**
 * Encodes a message in Base64URL (required by Gmail API)
 */
function encodeMessage(message: string) {
    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export const sendOutreachEmail = async (
    to: string, 
    subject: string, 
    body: string, 
    fromName?: string, 
    fromEmail?: string
): Promise<{ success: boolean; error?: any }> => {
    const senderEmail = fromEmail || BREVO_SENDER_EMAIL;
    const senderName = fromName || 'AutoSDR Outreach';

    // 1. Try Gmail API first (most reliable on cloud platforms)
    const oauth2Client = getOAuth2Client();
    if (oauth2Client) {
        console.log(`[Email] Using GMAIL API to send to: ${to}`);
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            
            // Construct MIME message
            const str = [
                `Content-Type: text/html; charset="UTF-8"\n`,
                `MIME-Version: 1.0\n`,
                `Content-Transfer-Encoding: 7bit\n`,
                `to: ${to}\n`,
                `from: ${senderName} <${senderEmail}>\n`,
                `subject: ${subject}\n\n`,
                body
            ].join('');

            const encodedMessage = encodeMessage(str);
            
            await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            console.log(`[Email] Successfully sent via GMAIL API to ${to}.`);
            return { success: true };
        } catch (err: any) {
            console.error('[Email] GMAIL API send failed. Falling back to SMTP...', err?.message || err);
            // Fall through to SMTP
        }
    }

    // 2. Fallback to SMTP
    if (!SMTP_USER || !SMTP_PASS) {
        console.warn('[Email] Skipping send: No SMTP credentials and Gmail API not configured.');
        return { success: false, error: 'No Email Provider Configured' };
    }

    console.log(`[Email] Preparing to send via SMTP to: ${to} from: ${senderEmail}`);

    try {
        const info = await transporter.sendMail({
            from: {
                name: senderName,
                address: senderEmail
            },
            to: to,
            subject: subject,
            html: body
        });

        console.log(`[Email] Successfully sent via SMTP to ${to}. MessageId: ${info.messageId}`);
        return { success: true };
    } catch (err: any) {
        console.error('[Email] Failed to send email via SMTP:', err?.message || err);
        return { success: false, error: err?.message || 'Unknown SMTP error' };
    }
};

export const sendApprovalEmail = async (userEmail: string, loginUrl: string) => {
    return sendOutreachEmail(
        userEmail,
        'Confirm your Lead Outreach',
        `<p>Your outreach campaign is ready. Please <a href="${loginUrl}">login to the dashboard</a> to approve the leads.</p>`,
        'AutoSDR System'
    );
};
