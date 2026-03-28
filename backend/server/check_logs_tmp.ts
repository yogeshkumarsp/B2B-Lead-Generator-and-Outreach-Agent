import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const logs = await prisma.agentLog.findMany({
        where: { module: 'OUTREACH' },
        orderBy: { timestamp: 'desc' },
        take: 15
    });
    fs.writeFileSync('server/logs_clean.json', JSON.stringify(logs, null, 2), 'utf8');
}
main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
