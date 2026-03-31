import nodemailer from 'nodemailer';

// Use Ethereal for testing, or real credentials if available
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: {
        user: process.env.SMTP_USER || 'bernadette.reilly46@ethereal.email',
        pass: process.env.SMTP_PASS || 'GZkR872B5wR9e1WbC3'
    },
    tls: {
        rejectUnauthorized: false
    },
    // Force Node.js to use IPv4 instead of IPv6 to avoid ENETUNREACH if network lacks v6 route
    // (See: https://nodemailer.com/smtp/#general-options)
    // TypeScript might complain if family isn't on PoolOptions so we cast as any if needed, but standard socket options are usually supported
    // Actually, setting `localAddress: '0.0.0.0'` also forces IPv4 but `family: 4` is cleaner.
} as any);

// Specifically override the custom internal options for Node 18+ to definitely use IPv4
(transporter as any).options.host = process.env.SMTP_HOST || 'smtp.ethereal.email';
(transporter as any).options.family = 4;


// We can auto-generate ethereal accounts on startup if needed:
// let testAccount = await nodemailer.createTestAccount();

export const sendMagicLinkEmail = async (to: string, link: string) => {
    try {
        const info = await transporter.sendMail({
            from: '"AutoSDR" <noreply@autosdr.com>',
            to,
            subject: 'Your Magic Login Link for AutoSDR',
            text: `Click this link to log in: ${link}\n\nThis link will expire in 1 hour.`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4f46e5;">AutoSDR Login</h2>
                    <p>You requested a magic link to sign in to AutoSDR.</p>
                    <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Sign In</a>
                    <p style="font-size: 12px; color: #6b7280;">This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('Error sending magic link email:', error);
    }
};

export const sendPasswordResetEmail = async (to: string, link: string) => {
    try {
        const info = await transporter.sendMail({
            from: '"AutoSDR" <noreply@autosdr.com>',
            to,
            subject: 'Reset your AutoSDR Password',
            text: `Click this link to reset your password: ${link}\n\nThis link will expire in 1 hour.`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4f46e5;">AutoSDR Password Reset</h2>
                    <p>You requested to reset your password for AutoSDR.</p>
                    <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
                    <p style="font-size: 12px; color: #6b7280;">This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });
        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('Error sending password reset email:', error);
    }
};

export const sendApprovalEmail = async (to: string, name: string) => {
    try {
        const _FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
        const info = await transporter.sendMail({
            from: '"AutoSDR Team" <support@autosdr.com>',
            to,
            subject: 'Welcome to AutoSDR! Your account has been approved 🎉',
            text: `Hi ${name},\n\nGreat news! Your request to access AutoSDR has been approved.\n\nYou can now log in using your email and the password you created during signup.\n\nLogin URL: ${_FRONTEND_URL}\n\nWelcome to autonomous outreach!`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                    <div style="background-color: #2563eb; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h2 style="color: white; margin: 0;">AutoSDR Access Granted</h2>
                    </div>
                    <div style="padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background-color: #f8fafc;">
                        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                        <p style="font-size: 16px; line-height: 1.5;">Great news! Your request to access AutoSDR has been approved by our administrators.</p>
                        <p style="font-size: 16px; line-height: 1.5;">You can now log in using your email and the password you created when requesting access.</p>
                        
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${_FRONTEND_URL}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Log in to AutoSDR</a>
                        </div>
                        
                        <p style="font-size: 14px; color: #64748b;">Welcome to the next generation of autonomous outreach!<br/>— The AutoSDR Team</p>
                    </div>
                </div>
            `
        });
        console.log('--- EMAIL SENT ---');
        console.log('To:', to);
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
        console.log('------------------');
    } catch (error) {
        console.error('Error sending approval email:', error);
    }
};
export const sendOutreachEmail = async (to: string, subject: string, body: string, senderName?: string, senderEmail?: string) => {
    try {
        const from = senderName && senderEmail
            ? `"${senderName}" <${senderEmail}>`
            : '"AutoSDR Agent" <outreach@autosdr.com>';

        const info = await transporter.sendMail({
            from,
            to,
            subject,
            text: body,
            html: body.replace(/\n/g, '<br/>')
        });

        console.log(`[Email] Outreach sent to ${to}. MessageId: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('[Email] Failed to send outreach email:', error);
        return { success: false, error };
    }
};
