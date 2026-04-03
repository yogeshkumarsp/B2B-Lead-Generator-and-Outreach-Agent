import './server/env.js';
import { sendOutreachEmail } from './server/services/email.js';

async function testSmtp() {
    console.log('Testing SMTP settings...');
    console.log(`SMTP_USER: ${process.env.SMTP_USER}`);
    console.log(`SMTP_HOST: ${process.env.SMTP_HOST}`);

    const testEmail = process.env.SMTP_USER; // Send to self
    if (!testEmail) {
        console.error('SMTP_USER not found in .env');
        return;
    }

    const res = await sendOutreachEmail(
        testEmail,
        'Test Outreach Email',
        '<h1>Success!</h1><p>This is a test email from AutoSDR outreach agent.</p>',
        'AutoSDR Tester'
    );

    if (res.success) {
        console.log('✅ SMTP Test Successful! Check your inbox.');
    } else {
        console.error('❌ SMTP Test Failed:', res.error);
    }
}

testSmtp().catch(console.error);
