
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        include: {
            campaign: true
        }
    });

    console.log('--- LEAD DIAGNOSTICS ---');
    console.log(`Total Leads: ${leads.length}`);

    leads.forEach(l => {
        console.log(`- ${l.companyName} (${l.id})`);
        console.log(`  Status: ${l.status}`);
        console.log(`  Outreach: ${l.outreachStatus}`);
        console.log(`  Email: ${l.email || 'MISSING'}`);
        console.log(`  Campaign: ${l.campaign?.name || 'NONE'}`);
        console.log(`  SearchLocation: ${l.searchLocation || 'NONE'}`);
        console.log('---');
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
