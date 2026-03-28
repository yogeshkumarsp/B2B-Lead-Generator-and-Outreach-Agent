import { prisma } from './db';

async function searchErrors() {
    const errorLogs = await prisma.agentLog.findMany({
        where: {
            OR: [
                { message: { contains: 'cool-down' } },
                { message: { contains: 'Failed to draft' } },
                { message: { contains: 'throttle' } },
                { level: 'ERROR' }
            ]
        },
        orderBy: { timestamp: 'desc' },
        take: 10
    });
    
    console.log('--- RECENT TARGETED LOGS ---');
    errorLogs.forEach(l => {
        console.log(`[${l.timestamp.toISOString()}] [${l.module}] ${l.message}`);
    });
}

searchErrors().catch(console.error);
