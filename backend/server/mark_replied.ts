import './env';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        select: { id: true, companyName: true, outreachStatus: true, userId: true }
    });
    fs.writeFileSync('all_leads.json', JSON.stringify(leads, null, 2), 'utf-8');
    console.log('Done. Found', leads.length, 'leads');

    // Find and update S-Tech
    const stech = leads.find(l => l.companyName.toLowerCase().includes('s-tech') || l.companyName.toLowerCase().includes('stech'));
    if (stech) {
        await prisma.lead.update({
            where: { id: stech.id },
            data: { outreachStatus: 'REPLIED', status: 'QUALIFIED' }
        });
        console.log(`✅ Marked ${stech.companyName} as REPLIED`);
    } else {
        console.log('S-Tech not found. Available leads:', leads.map(l => l.companyName).join(', '));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
