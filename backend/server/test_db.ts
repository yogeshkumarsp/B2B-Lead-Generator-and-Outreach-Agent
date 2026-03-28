import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const leadsCount = await prisma.lead.count();
        console.log(`Database reached! Total leads: ${leadsCount}`);
    } catch (error) {
        console.error('Database connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
