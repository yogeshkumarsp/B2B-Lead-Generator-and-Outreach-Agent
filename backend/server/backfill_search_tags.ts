/**
 * One-time script to backfill existing leads with searchNiche and searchLocation
 * based on their existing `industry` (niche) and `address` (location) fields.
 * Run with: npx ts-node server/backfill_search_tags.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Get all leads with no searchNiche set
    const leadsToUpdate = await prisma.lead.findMany({
        where: { searchNiche: null }
    });

    console.log(`Found ${leadsToUpdate.length} leads without search tags. Backfilling...`);

    for (const lead of leadsToUpdate) {
        if (!lead.industry && !lead.address) continue;

        // Derive the searchNiche from industry, searchLocation from address
        const searchNiche = lead.industry?.toLowerCase().trim() || null;
        // For address, try to extract the city/location part
        const searchLocation = lead.address?.toLowerCase().trim() || null;

        await prisma.lead.update({
            where: { id: lead.id },
            data: { searchNiche, searchLocation }
        });

        console.log(`  Updated: ${lead.companyName} → niche: "${searchNiche}", location: "${searchLocation}"`);
    }

    console.log('✅ Backfill complete!');
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
