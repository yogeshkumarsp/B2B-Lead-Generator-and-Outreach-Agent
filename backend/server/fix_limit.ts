import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    await prisma.userSettings.updateMany({
        data: { hourlyThrottleLimit: 100 }
    });

    // reset Grofast to pending
    await prisma.lead.updateMany({
        where: { companyName: 'Grofast' },
        data: { outreachStatus: 'PENDING', outreachMessage: null, currentStep: 0, lastContactedAt: null }
    });

    console.log("Updated limits and reset Grofast.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
