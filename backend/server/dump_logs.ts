import { prisma } from './db';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function dumpLogs() {
    const logs = await prisma.agentLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOutreachCount = await prisma.agentLog.count({
        where: {
            module: 'OUTREACH',
            message: { contains: 'ready' },
            timestamp: { gte: oneHourAgo }
        }
    });

    const settings = await prisma.userSettings.findFirst({
        where: { isAgentEnabled: true }
    });

    const leads = await prisma.lead.findMany({
        where: { companyName: { contains: 'Hotel' } },
        take: 10
    });

    const data = {
        currentTime: new Date().toISOString(),
        recentOutreachCount,
        settings,
        logs: logs.map(l => ({
            time: l.timestamp.toISOString(),
            module: l.module,
            level: l.level,
            message: l.message
        })),
        hotelLeads: leads.map(l => ({
            id: l.id,
            name: l.companyName,
            status: l.status,
            outreach: l.outreachStatus,
            score: l.score,
            campaignId: l.campaignId
        }))
    };

    const dumpPath = path.join(__dirname, 'debug_dump.json');
    fs.writeFileSync(dumpPath, JSON.stringify(data, null, 2));
    console.log(`Dumped to ${dumpPath}`);
}

dumpLogs().catch(console.error);
