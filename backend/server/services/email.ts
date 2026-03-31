import axios from 'axios';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const SENDGRID_SENDER_EMAIL = process.env.SENDGRID_SENDER_EMAIL || process.env.RESEND_API_KEY || ''; // Fallback for transition

export const sendOutreachEmail = async (
    to: string, 
    subject: string, 
    body: string, 
    fromName?: string, 
    fromEmail?: string
): Promise<{ success: boolean; error?: any }> => {
    if (!SENDGRID_API_KEY) {
        console.warn('[Email] Skipping send: SENDGRID_API_KEY not found in environment.');
        return { success: false, error: 'No API Key' };
    }

    const sender = fromEmail || SENDGRID_SENDER_EMAIL;
    if (!sender) {
        console.warn('[Email] Skipping send: No sender email provided.');
        return { success: false, error: 'No Sender Email' };
    }

    console.log(`[Email] Preparing to send via SendGrid to: ${to} from: ${sender}`);

    try {
        const response = await axios.post('https://api.sendgrid.com/v3/mail/send', {
            personalizations: [
                {
                    to: [{ email: to }]
                }
            ],
            from: {
                email: sender,
                name: fromName || 'AutoSDR Outreach'
            },
            subject: subject,
            content: [
                {
                    type: 'text/html',
                    value: body
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[Email] Successfully sent via SendGrid to ${to}`);
        return { success: true };
    } catch (err: any) {
        const errorData = err.response?.data || err.message;
        console.error('[Email] Failed to send email via SendGrid:', JSON.stringify(errorData, null, 2));
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
