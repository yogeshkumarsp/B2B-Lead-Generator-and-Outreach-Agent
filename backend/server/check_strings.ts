import './env';
import { prisma } from './db';

async function checkStrings() {
    const leads = await prisma.lead.findMany({
        take: 5,
        select: {
            id: true,
            companyName: true,
            searchNiche: true,
            searchLocation: true
        }
    });

    console.log(`Leads found for string inspection: ${leads.length}`);
    leads.forEach(l => {
        console.log(`--- [${l.companyName}] ---`);
        console.log(`searchNiche: "${l.searchNiche}" (length: ${l.searchNiche?.length})`);
        if (l.searchNiche) {
            console.log(`Chars: ${[...l.searchNiche].map(c => c.charCodeAt(0)).join(',')}`);
        }
        console.log(`searchLocation: "${l.searchLocation}" (length: ${l.searchLocation?.length})`);
        if (l.searchLocation) {
            console.log(`Chars: ${[...l.searchLocation].map(c => c.charCodeAt(0)).join(',')}`);
        }
    });

    await prisma.$disconnect();
}

checkStrings();
