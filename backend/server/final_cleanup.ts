
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
    console.log("Final Cleanup Started...");

    // Delete "the auralis" or any Chennai leads
    const deleted = await prisma.lead.deleteMany({
        where: {
            OR: [
                { companyName: { contains: 'auralis', mode: 'insensitive' } },
                { address: { contains: 'Chennai', mode: 'insensitive' } },
                { address: { contains: 'Madras', mode: 'insensitive' } }
            ]
        }
    });

    console.log(`Final Cleanup: Deleted ${deleted.count} invalid leads.`);
}

cleanup().finally(() => prisma.$disconnect());
