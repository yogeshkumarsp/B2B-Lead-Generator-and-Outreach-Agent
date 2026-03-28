import './env';
import { prisma } from './db';

async function diagnose() {
    console.log('[DIAGNOSE] DATABASE_URL:', process.env.DATABASE_URL);

    try {
        const count = await prisma.lead.count();
        console.log('[DIAGNOSE] Lead count:', count);

        const matches = await prisma.lead.findMany({
            where: {
                searchNiche: 'it companies',
                searchLocation: 'krishnagiri'
            },
            select: { id: true, companyName: true }
        });
        console.log('[DIAGNOSE] Direct match count for "it companies"/"krishnagiri":', matches.length);
        if (matches.length > 0) {
            console.log('[DIAGNOSE] First match:', matches[0]);
        }

    } catch (err) {
        console.error('[DIAGNOSE] Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

diagnose();
