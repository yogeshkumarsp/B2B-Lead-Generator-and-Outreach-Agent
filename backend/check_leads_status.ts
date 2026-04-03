
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkLeads() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            status: 'ACTIVE'
        },
        include: {
            steps: true
        }
    });
    console.log(`Active Campaigns: ${campaigns.length}`);
    for (const c of campaigns) {
        console.log(`- Campaign: ${c.name}, ID: ${c.id}, Steps: ${c.steps.length}, User: ${c.userId}`);
        for (const s of c.steps) {
            console.log(`  - Step ${s.step}: ${s.subject}`);
        }
    }

    const allLeads = await prisma.lead.findMany();
    console.log(`Total leads in DB: ${allLeads.length}`);
    const pendingLeads = allLeads.filter(l => l.outreachStatus === 'PENDING');
    console.log(`Pending leads: ${pendingLeads.length}`);
    
    for (const lead of pendingLeads) {
        const hasEmail = lead.email && lead.email.includes('@');
        console.log(`- Lead: ${lead.companyName}, Email: ${lead.email}, CampaignId: ${lead.campaignId}, Status: ${lead.status}`);
    }

    const settings = await prisma.userSettings.findFirst();
    console.log(`User Settings: `, JSON.stringify(settings, null, 2));

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLogs = await prisma.agentLog.count({
        where: {
            module: 'OUTREACH',
            timestamp: { gte: oneHourAgo },
            message: { contains: 'ready' }
        }
    });
    console.log(`Recent outreach logs (last hour): ${recentLogs}`);
}

checkLeads().catch(console.error).finally(() => prisma.$disconnect());
