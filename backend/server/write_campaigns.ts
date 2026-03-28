import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
    const campaigns = await prisma.campaign.findMany({
        include: { steps: true }
    });
    fs.writeFileSync('campaigns_clean.json', JSON.stringify(campaigns, null, 2), 'utf-8');
}

main().catch(console.error).finally(() => prisma.$disconnect());
