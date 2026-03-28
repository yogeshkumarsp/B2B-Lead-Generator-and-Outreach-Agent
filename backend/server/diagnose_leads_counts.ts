
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const totalLeads = await prisma.lead.count();
    const nicheMatches = await prisma.lead.findMany({
        where: {
            OR: [
                { searchNiche: { contains: 'digital marketing agencies', mode: 'insensitive' } },
                { industry: { contains: 'digital marketing agencies', mode: 'insensitive' } }
            ]
        },
        select: { id: true, companyName: true, searchNiche: true, searchLocation: true, status: true, score: true }
    });

    console.log('Total Leads:', totalLeads);
    console.log('Niche Matched Leads (Count):', nicheMatches.length);
    console.log('Niche Matched Leads (Details):', JSON.stringify(nicheMatches, null, 2));
}

main().finally(() => prisma.$disconnect());
