import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const venvPath = path.join(__dirname, '.venv');
const isWin = os.platform() === 'win32';

// Identify the system python command to create the venv
let pythonCmd = 'python3';
try {
    // Check if python3 exists
    execSync('python3 --version', { stdio: 'ignore' });
} catch (e) {
    // Fallback to python or py
    try {
        execSync('python --version', { stdio: 'ignore' });
        pythonCmd = 'python';
    } catch (e2) {
        pythonCmd = 'py';
    }
}

const venvPython = isWin ? path.join(venvPath, 'Scripts', 'python.exe') : path.join(venvPath, 'bin', 'python');

console.log(`[Setup] Using system python: ${pythonCmd}`);
console.log(`[Setup] Target venv python: ${venvPython}`);

try {
    if (!fs.existsSync(venvPath)) {
        console.log(`[Setup] Creating Python virtual environment at ${venvPath}...`);
        execSync(`${pythonCmd} -m venv .venv`, { stdio: 'inherit', cwd: __dirname });
    } else {
        console.log(`[Setup] Virtual environment already exists at ${venvPath}.`);
    }
    
    console.log('[Setup] Upgrading pip...');
    execSync(`"${venvPython}" -m pip install --upgrade pip`, { stdio: 'inherit', cwd: __dirname });
    
    console.log('[Setup] Installing requirements...');
    execSync(`"${venvPython}" -m pip install -r server/python/requirements.txt`, { stdio: 'inherit', cwd: __dirname });
    
    console.log('[Setup] Installing Playwright browsers...');
    execSync(`"${venvPython}" -m playwright install chromium`, { stdio: 'inherit', cwd: __dirname });
    
    console.log('[Setup] Python setup complete.');
} catch (error) {
    console.error('[Setup] Error during Python setup:', error.message);
    process.exit(1);
}
