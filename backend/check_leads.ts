import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { searchNiche: true, searchLocation: true, companyName: true, email: true, industry: true, website: true }
    });
    console.log(JSON.stringify(leads, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
