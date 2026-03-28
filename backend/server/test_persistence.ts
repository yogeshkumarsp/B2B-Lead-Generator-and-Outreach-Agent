import './env';
import { prisma } from './db';

async function simulate() {
    console.log('[SIMULATE] Starting...');

    // 1. Create a dummy lead
    const dummy = await prisma.lead.create({
        data: {
            companyName: "Persistence Test Ltd",
            searchNiche: "test",
            searchLocation: "test",
            status: "NEW"
        }
    });
    console.log('[SIMULATE] Saved lead:', dummy.id);

    // 2. Count immediately
    const count1 = await prisma.lead.count();
    console.log('[SIMULATE] Count after save:', count1);

    await prisma.$disconnect();

    // 3. Wait 5 seconds
    console.log('[SIMULATE] Waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));

    // 4. Connect again and count
    const prisma2 = new (await import('@prisma/client')).PrismaClient();
    const count2 = await prisma2.lead.count();
    console.log('[SIMULATE] Count after reconnection:', count2);

    await prisma2.$disconnect();
}

simulate();
