import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.userSettings.findFirst();
    const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, email: true, outreachStatus: true, currentStep: true, score: true } });
    fs.writeFileSync('db_dump.json', JSON.stringify({ settings, leads }, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
