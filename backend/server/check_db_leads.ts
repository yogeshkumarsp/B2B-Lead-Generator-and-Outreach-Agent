import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        where: { campaignId: { not: null } },
        select: { companyName: true, email: true, outreachStatus: true, currentStep: true }
    });
    console.log(JSON.stringify(leads, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
