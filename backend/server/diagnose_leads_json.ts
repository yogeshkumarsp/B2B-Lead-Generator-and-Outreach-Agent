
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        include: {
            campaign: true
        }
    });

    const report = leads.map(l => ({
        company: l.companyName,
        id: l.id,
        status: l.status,
        outreachStatus: l.outreachStatus,
        email: l.email,
        message: l.outreachMessage, // Check if this contains "undefined"
        campaign: l.campaign?.name,
        searchLocation: l.searchLocation
    }));

    fs.writeFileSync('server/lead_diagnostics.json', JSON.stringify(report, null, 2));
    console.log(`Generated report with messages for ${leads.length} leads.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
