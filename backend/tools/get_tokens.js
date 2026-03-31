import { google } from 'googleapis';
import readline from 'readline';

// Instructions:
// 1. You must have GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from Google Cloud.
// 2. Run this script: node tools/get_tokens.js
// 3. Follow the instructions in the terminal.

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function getTokens() {
  console.log('\n--- AutoSDR Gmail Token Helper ---');
  
  const clientId = await new Promise((resolve) => rl.question('Enter your CLIENT_ID: ', resolve));
  const clientSecret = await new Promise((resolve) => rl.question('Enter your CLIENT_SECRET: ', resolve));

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob' // This is for manual copy/paste
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    prompt: 'consent'
  });

  console.log('\n1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Log in with your Gmail and click "Allow".');
  console.log('3. Copy the "authorization code" they give you.');

  const code = await new Promise((resolve) => rl.question('\n4. Paste the authorization code here: ', resolve));

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n--- SUCCESS! ---');
    console.log('\nAdd these to your Render environment variables:');
    console.log('GMAIL_CLIENT_ID:', clientId);
    console.log('GMAIL_CLIENT_SECRET:', clientSecret);
    console.log('GMAIL_REFRESH_TOKEN:', tokens.refresh_token);
    console.log('\nKeep these tokens safe! Only your Refresh Token is needed for the agent.');
  } catch (err) {
    console.error('\nError retrieving tokens:', err.message);
  } finally {
    rl.close();
  }
}

getTokens();
