import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const campaigns = await prisma.campaign.findMany({
        include: { steps: true }
    });
    fs.writeFileSync('server/campaigns_clean.json', JSON.stringify(campaigns, null, 2), 'utf8');
}
main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
