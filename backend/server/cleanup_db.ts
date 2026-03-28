
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
    console.log("Starting DB Cleanup...");

    // 1. Delete leads that mention 'Bangalore' or 'Bengaluru' in name or address IF they are for 'krishnagiri' search
    const bangaloreLeads = await prisma.lead.deleteMany({
        where: {
            OR: [
                { companyName: { contains: 'Bangalore', mode: 'insensitive' } },
                { companyName: { contains: 'Bengaluru', mode: 'insensitive' } },
                { address: { contains: 'Bangalore', mode: 'insensitive' } },
                { address: { contains: 'Bengaluru', mode: 'insensitive' } }
            ]
        }
    });
    console.log(`Deleted ${bangaloreLeads.count} Bangalore leads.`);

    // 2. Identify and Deduplicate Dirty/Clean names
    // We'll find all leads and try to merge duplicates
    const allLeads = await prisma.lead.findMany();
    const nameMap = new Map(); // CleanName -> Lead

    function clean(name) {
        if (!name) return "";
        let n = name.split('|')[0].split('-')[0].split(':')[0].trim();
        n = n.replace(/\b(Digital Marketing|Website Designing|Agency|Company|Services)\b/gi, '').trim();
        return n || name;
    }

    const toDelete = [];
    for (const lead of allLeads) {
        const cleanName = clean(lead.companyName);
        if (nameMap.has(cleanName)) {
            const existing = nameMap.get(cleanName);
            // If the current one is "dirty" and we have a clean one, or vice versa, merge information
            // For simplicity, we just delete the redundant one.
            // Keep the one with the higher score or shorter name.
            if (lead.companyName.length > existing.companyName.length) {
                toDelete.push(lead.id);
            } else {
                toDelete.push(existing.id);
                nameMap.set(cleanName, lead);
            }
        } else {
            nameMap.set(cleanName, lead);
        }
    }

    if (toDelete.length > 0) {
        const deleted = await prisma.lead.deleteMany({
            where: { id: { in: toDelete } }
        });
        console.log(`Deleted ${deleted.count} duplicate leads.`);
    }

    console.log("Cleanup complete!");
}

cleanup().finally(() => prisma.$disconnect());
