import './env';
import { prisma } from './db';

async function diagnose() {
    console.log('[DIAGNOSE] Database URL in process.env:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');

    try {
        const count = await prisma.lead.count();
        console.log('[DIAGNOSE] Total leads in DB via shared prisma instance:', count);

        const samples = await prisma.lead.findMany({
            take: 3,
            select: { companyName: true, searchNiche: true, searchLocation: true }
        });
        console.log('[DIAGNOSE] Sample leads:', JSON.stringify(samples));

        // Also check if there's any other leads table?
    } catch (err) {
        console.error('[DIAGNOSE] Error connecting to DB:', err);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
