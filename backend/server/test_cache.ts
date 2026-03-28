import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCache() {
    const niche = "it companies";
    const location = "krishnagiri";

    const nicheKey = niche.trim().toLowerCase();
    const locationKey = location.trim().toLowerCase();

    console.log(`Testing cache for: niche="${nicheKey}", location="${locationKey}"`);

    const cachedLeads = await prisma.lead.findMany({
        where: {
            AND: [
                {
                    OR: [
                        { searchNiche: { contains: nicheKey, mode: 'insensitive' } },
                        { searchNiche: { equals: nicheKey, mode: 'insensitive' } },
                        { industry: { contains: nicheKey, mode: 'insensitive' } }
                    ]
                },
                {
                    OR: [
                        { searchLocation: { contains: locationKey, mode: 'insensitive' } },
                        { searchLocation: { equals: locationKey, mode: 'insensitive' } },
                        { address: { contains: locationKey, mode: 'insensitive' } }
                    ]
                }
            ]
        }
    });

    console.log(`Found ${cachedLeads.length} leads.`);
    if (cachedLeads.length > 0) {
        console.log('Sample Lead:', {
            companyName: cachedLeads[0].companyName,
            searchNiche: cachedLeads[0].searchNiche,
            searchLocation: cachedLeads[0].searchLocation
        });
    }

    await prisma.$disconnect();
}

testCache().catch(console.error);