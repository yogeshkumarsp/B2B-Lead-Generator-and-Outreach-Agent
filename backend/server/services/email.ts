import nodemailer from 'nodemailer';
import dns from 'dns';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER || 'yogeshkumarsp03@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'lrlr hkaz uvmt lxxo';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // SSL for 465, TLS for 587
    pool: true, // Use connection pooling for speed
    maxConnections: 1,
    maxMessages: 100,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    // Force direct IPv4 and set aggressive timeouts (10s) to avoid long hangs
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    lookup: (hostname: string, options: any, callback: any) => {
        dns.lookup(hostname, { family: 4 }, callback);
    }
} as any);

// Re-enforce options for compatibility
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
