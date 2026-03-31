import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const campaign = await prisma.campaign.findUnique({
        where: { id: '857ae251-acdf-40ba-a5b4-bee9f84c8c85' },
        include: { steps: true }
    });
    
    if (campaign) {
        console.log(`Campaign: ${campaign.name}`);
        console.log(`Steps count: ${campaign.steps.length}`);
        campaign.steps.forEach(s => {
            console.log(`Step ${s.step}: Subject: ${s.subject}`);
        });
    } else {
        console.log("Campaign not found.");
    }
}

run().finally(() => prisma.$disconnect());
