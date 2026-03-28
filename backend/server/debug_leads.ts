/**
 * Debug script to inspect lead search tags in Neon DB
 * Run: npx ts-node server/debug_leads.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        select: {
            id: true,
            companyName: true,
            industry: true,
            address: true,
            searchNiche: true,
            searchLocation: true,
            score: true
        }
    });

    console.log(`Total leads in DB: ${leads.length}\n`);
    leads.forEach(l => {
        console.log(`  [${l.companyName}]`);
        console.log(`    industry: "${l.industry}" | address: "${l.address}"`);
        console.log(`    searchNiche: "${l.searchNiche}" | searchLocation: "${l.searchLocation}"\n`);
    });

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
