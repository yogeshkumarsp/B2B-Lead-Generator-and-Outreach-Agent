import axios from 'axios';

const BREVO_API_KEY = process.env.BREVO_API_KEY || process.env.SENDGRID_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.SENDGRID_SENDER_EMAIL || '';

export const sendOutreachEmail = async (
    to: string, 
    subject: string, 
    body: string, 
    fromName?: string, 
    fromEmail?: string
): Promise<{ success: boolean; error?: any }> => {
    if (!BREVO_API_KEY) {
        console.warn('[Email] Skipping send: BREVO_API_KEY not found in environment.');
        return { success: false, error: 'No API Key' };
    }

    const senderEmail = fromEmail || BREVO_SENDER_EMAIL;
    if (!senderEmail) {
        console.warn('[Email] Skipping send: No sender email provided.');
        return { success: false, error: 'No Sender Email' };
    }

    console.log(`[Email] Preparing to send via Brevo to: ${to} from: ${senderEmail}`);

    try {
        const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: {
                name: fromName || 'AutoSDR Outreach',
                email: senderEmail
            },
            to: [
                {
                    email: to
                }
            ],
            subject: subject,
            htmlContent: body
        }, {
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[Email] Successfully sent via Brevo to ${to}`);
        return { success: true };
    } catch (err: any) {
        const errorData = err.response?.data || err.message;
        console.error('[Email] Failed to send email via Brevo:', JSON.stringify(errorData, null, 2));
        return { success: false, error: errorData };
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
