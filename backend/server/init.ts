console.log('[BOOT] Initializing system diagnostics...');

process.on('uncaughtException', (err) => {
    console.error('[BOOT] FATAL CRASH (uncaught):', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('[BOOT] FATAL CRASH (rejection):', reason);
    process.exit(1);
});

console.log('[BOOT] Node Version:', process.version);
console.log('[BOOT] Working Directory:', process.cwd());
console.log('[BOOT] Env Keys:', Object.keys(process.env).filter(k => !k.includes('KEY') && !k.includes('SECRET')));

export {};
