import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
expand(config({ path: '.env.local' }));

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({ select: { id: true, companyName: true, outreachStatus: true, userId: true } });
    fs.writeFileSync('all_leads.json', JSON.stringify(leads, null, 2), 'utf-8');
    console.log('Done. Found', leads.length, 'leads');
}

main().catch(console.error).finally(() => prisma.$disconnect());
