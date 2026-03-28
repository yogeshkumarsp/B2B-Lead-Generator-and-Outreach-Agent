import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // List all leads to find the right name
    const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, outreachStatus: true } });
    console.log(JSON.stringify(leads, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
