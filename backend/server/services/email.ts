import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || SMTP_USER || '';

// Create SMTP Transporter
const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // Use SSL for 465
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

export const sendOutreachEmail = async (
    to: string, 
    subject: string, 
    body: string, 
    fromName?: string, 
    fromEmail?: string
): Promise<{ success: boolean; error?: any }> => {
    if (!SMTP_USER || !SMTP_PASS) {
        console.warn('[Email] Skipping send: SMTP_USER or SMTP_PASS not found in environment.');
        return { success: false, error: 'No SMTP credentials' };
    }

    const senderEmail = fromEmail || BREVO_SENDER_EMAIL;
    if (!senderEmail) {
        console.warn('[Email] Skipping send: No sender email provided.');
        return { success: false, error: 'No Sender Email' };
    }

    console.log(`[Email] Preparing to send via SMTP to: ${to} from: ${senderEmail}`);

    try {
        const info = await transporter.sendMail({
            from: {
                name: fromName || 'AutoSDR Outreach',
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
