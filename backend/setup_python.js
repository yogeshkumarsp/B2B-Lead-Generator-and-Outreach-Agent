import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = os.platform() === 'win32';

// Identify the system python command based on OS
let pythonCmd = 'python3';
if (isWin) {
    try {
        execSync('py --version', { stdio: 'ignore' });
        pythonCmd = 'py';
    } catch (e) {
        pythonCmd = 'python';
    }
} else {
    try {
        execSync('python3 --version', { stdio: 'ignore' });
    } catch (e) {
        pythonCmd = 'python';
    }
}

const targetDir = path.join(__dirname, '.python_packages');

console.log('==================================================');
console.log(`[Setup] System python command selected: ${pythonCmd}`);
console.log(`[Setup] Target packages directory: ${targetDir}`);
console.log('==================================================');

try {
    // Ensure python environment is ready and we install packages correctly.
    // We use --target so packages go into a local directory and bypass any venv/system permission issues.
    console.log('[Setup] STEP 1/2: Installing python requirements...');
    
    // Attempt pip installation directly.
    execSync(`${pythonCmd} -m pip install --target .python_packages -r server/python/requirements.txt`, { stdio: 'inherit', cwd: __dirname });
    
    console.log('[Setup] STEP 1/2: Complete!');
    console.log('--------------------------------------------------');
    
    console.log('[Setup] STEP 2/2: Installing Playwright chromium...');
    
    // We must pass PYTHONPATH so python can locate the 'playwright' module we just installed in '.python_packages'
    const env = { ...process.env, PYTHONPATH: targetDir };
    execSync(`${pythonCmd} -m playwright install chromium`, { stdio: 'inherit', cwd: __dirname, env: env });
    
    console.log('[Setup] STEP 2/2: Complete!');
    console.log('==================================================');
    console.log('[Setup] Python setup fully successful! 🎉');
    
} catch (error) {
    console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('           [Setup] ERROR OCCURRED!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('Message:', error.message);
    
    if (error.stdout) {
        console.error('\n--- STDOUT ---');
        console.error(error.stdout.toString());
    }
    if (error.stderr) {
        console.error('\n--- STDERR ---');
        console.error(error.stderr.toString());
    }
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
    process.exit(1);
}
