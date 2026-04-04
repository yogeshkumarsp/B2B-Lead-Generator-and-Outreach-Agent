import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting global address cleanup...');
    const leads = await prisma.lead.findMany();
    let count = 0;

    for (const lead of leads) {
        if (!lead.address) continue;

        const parts = lead.address.split(',').map(p => p.trim()).filter(p => p.length > 0);
        const unique = Array.from(new Set(parts));
        const cleaned = unique.join(', ');

        if (cleaned !== lead.address) {
            await prisma.lead.update({
                where: { id: lead.id },
                data: { address: cleaned }
            });
            console.log(`[Cleaned] ${lead.companyName}: ${lead.address} -> ${cleaned}`);
            count++;
        }
    }

    console.log(`Address cleanup complete. Fixed ${count} records.`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
