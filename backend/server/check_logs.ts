import { prisma } from './db';

async function checkLogs() {
    const logs = await prisma.agentLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 20
    });
    console.log('--- LATEST AGENT LOGS ---');
    logs.forEach(l => {
        const time = new Date(l.timestamp).toLocaleTimeString();
        console.log(`[${time}] [${l.module}] [${l.level}] ${l.message}`);
    });
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOutreachCount = await prisma.agentLog.count({
        where: {
            module: 'OUTREACH',
            message: { contains: 'ready' },
            timestamp: { gte: oneHourAgo }
        }
    });
    console.log(`--- HOURLY THROTTLE CHECK ---`);
    console.log(`Outreach emails sent in last hour: ${recentOutreachCount}`);
    
    const settings = await prisma.userSettings.findFirst({
        where: { isAgentEnabled: true }
    });
    console.log('--- AGENT SETTINGS ---');
    console.log(JSON.stringify(settings, null, 2));

    const leads = await prisma.lead.findMany({
        where: { companyName: { contains: 'Hotel' } },
        take: 5
    });
    console.log('--- SAMPLE HOTEL LEADS ---');
    leads.forEach(l => {
        console.log(`ID: ${l.id}, Name: ${l.companyName}, Status: ${l.status}, Outreach: ${l.outreachStatus}, Score: ${l.score}`);
    });
}

checkLogs().catch(console.error);
